# Host-delegated moderators

**Location**: `apps/backend/src/moderators` (the data/grant logic; no controller of its own - see below); the authorization primitive itself (`hasChannelCapability`, the `ModeratorGrant` interface) lives in `apps/backend/src/common/permissions` since every feature that checks a capability already depends on `PermissionsService`
**Plan reference**: plan §6.9; task-breakdown Phase 4
**Depends on**: `common/prisma`, `common/permissions`, `common/events`
**Depended on by**: `streams` (owns the `/streams/:id/moderators` routes and the live-only grant check - see below), `chat` (delete/pin capability checks - see docs/features/chat.md), `realtime` (relays `moderator.granted`/`updated`/`revoked` to the moderator's own `user:{id}` room, and who moderates to the whole live), `guests` (`MANAGE_GUEST_REQUESTS`/`REMOVE_GUESTS` checks, plus `listUserIdsWithCapability` for who receives a raised hand)

## What it does

A host can delegate moderation of **one running stream** to trusted
users, without making them a platform Admin (`/admin/*`, Phase 8 - a
completely separate, unrelated role) or handling every report personally.

**A grant is scoped to the stream it was made for - it does not carry
over to the host's future streams** (revised 2026-09-26: originally
specified, and first built, as a persistent per-channel role; changed so
a host can hand a trusted viewer moderation for today's broadcast without
that authority quietly persisting into every stream they ever go live
with again). The `Moderator` row is `(hostId, streamId, userId,
capabilities: ModeratorCapability[], status)`, unique on `(streamId,
userId)` - the same user can be a moderator for one of a host's streams
and an ordinary viewer in their next one, and a moderator for one host is
never anything special to any other host.

**Capabilities** (`ModeratorCapability` enum - the host picks any subset,
never all-or-nothing): `DELETE_MESSAGES`, `PIN_MESSAGES`, `MUTE_CHAT`,
`BAN_USERS`, `MANAGE_GUEST_REQUESTS`, `REMOVE_GUESTS`, `FORCE_MUTE_GUESTS`,
`ARRANGE_GUESTS`.
`DELETE_MESSAGES`, `PIN_MESSAGES` and `BAN_USERS` gate chat delete/pin and
room bans; `MANAGE_GUEST_REQUESTS` and `REMOVE_GUESTS` gate answering raised
hands and taking guests off the stage (Phase 6, docs/features/guests.md);
`MUTE_CHAT` gates room chat mute/unmute (Phase 7, docs/features/moderation.md),
`FORCE_MUTE_GUESTS` locking a guest's mic (Phase 7, docs/features/guests.md)
and `ARRANGE_GUESTS` moving and resizing guests' tiles on the stage
(2026-10, docs/features/guests.md - part of the "Guest manager" preset).
**Presets** ("Chat moderator",
"Guest manager", "Full moderator" from plan §6.9) are a pure mobile-UI
convenience over this same flat capability list - the backend has no
concept of a preset, it only ever sees the resulting `capabilities[]`
array, so a new preset is a mobile-only change.

**Endpoints** live on `StreamsController` (`apps/backend/src/streams`),
not a dedicated controller in this module - moderator management is a
stream-scoped concern, exactly like room bans and the viewer list, so it
sits next to them rather than under its own `/me/*` prefix. All
`JwtAuthGuard`, all delegate straight to `ModeratorsService` after
`StreamsService` checks the requester is the actual host of that stream
(`PermissionsService.canManageModerators`):
- `GET /streams/:id/moderators` - every active moderator **for this one stream** with their capabilities and grant date. Host-only.
- `POST /streams/:id/moderators {userId, capabilities[]}` - grants or reactivates (`ModeratorsService.grant()`); idempotent, upserting on the `(streamId, userId)` unique constraint. Requires the stream to currently be **LIVE** (`StreamsService.grantModerator()` uses `getLiveOrThrow` - appointing a moderator "for" a stream that isn't happening doesn't mean anything). Refuses granting yourself (`BadRequestException`) and an unknown user (404).
- `PATCH /streams/:id/moderators/:userId {capabilities[]}` - replaces an active moderator's capabilities wholesale; 404s if they aren't currently an active moderator for this stream (can't silently resurrect a revoked one through the update route).
- `DELETE /streams/:id/moderators/:userId` - revokes (`status -> REVOKED`); idempotent, no error revoking someone who wasn't (or no longer is) active. Doesn't require the stream to still be live (harmless cleanup either way).

**Authorization shape** (`PermissionsService.hasChannelCapability(requesterId, hostId, grant, capability)`, replacing Phase 0's boolean `canModerateChannel`): the host always passes, full stop, no lookup needed. Otherwise it checks whether the given `ModeratorGrant | null | undefined` (`{capabilities: ModeratorCapability[]}`) contains that one capability. **`PermissionsService` itself never queries the database** - every caller first fetches the requester's grant via `ModeratorsService.findActiveGrant(streamId, userId)` (a single indexed lookup, keyed by the **stream**, not the host - `null` if there's no active grant for this specific stream) and passes the result in. This keeps `PermissionsService` a pure, trivially-testable function and lets each caller decide *when* it's worth paying for that lookup - e.g. `ChatService`/`StreamsService`'s private `canUseCapability()` helpers skip it entirely once `isHost()` already says yes. Because the lookup key is the stream, a grant simply stops resolving to anything the moment the stream it was made for is a different row from whatever the caller is acting on - no separate expiry job needed for "does this stop working once the stream ends", it falls out of the key shape for free.

**Moderators don't act on each other** (client feedback, 2026-09-29): holding a capability isn't enough - `PermissionsService.moderationTargetRefusal(requesterId, hostId, targetId, targetIsModerator)` then says whom it may be used on: the host anyone; a moderator neither the host (`TARGET_IS_HOST`) nor another active moderator of the stream (`TARGET_IS_MODERATOR`). Acting on yourself is left to each action (a moderator may delete their own message; nobody bans or mutes themselves). It applies to deleting a message (`ChatService.delete` -> `NOT_ALLOWED`), banning and unbanning, muting and unmuting in chat, taking a guest off the stage and locking a guest's mic (`StreamsService.assertCanModerateTarget` -> 403 `{code: 'TARGET_IS_HOST' | 'TARGET_IS_MODERATOR'}`). The target's grant is looked up (`ModeratorsService.isActiveModerator`) only when the answer depends on it - never for the host, nor for a target who is yourself or the host. Answering a raised hand and pinning aren't moderation *of* someone, so they're not restricted. Banning also refuses the host and yourself outright (400) - before this, nothing stopped a `BAN_USERS` moderator banning the host from their own live.

**Who moderates is public to the live; what each may do isn't**: `stream:join`'s answer carries `moderatorIds` (`ModeratorsService.listActiveUserIds`), and every grant or revoke also sends the room `stream:moderators {streamId, moderatorIds}` - so every viewer's app badges moderators (docs/features/chat.md), and a moderator's app hides actions it can't take against another.

**Realtime**: every grant/update/revoke emits a domain event (`moderator.granted`/`updated`/`revoked`, `{hostId, streamId, userId, capabilities?}`) that `RealtimeGateway` relays to the affected moderator's own `user:{id}` room as `moderator:granted`/`updated`/`revoked` - their capabilities reach nobody else. `hostId` rides along for audit context; `streamId` is what a listener actually filters on (see Mobile, below). This is what lets a moderator's menu items (delete, pin, ban...) appear or disappear live, without reconnecting, the moment a host changes their capabilities (plan §6.9). A grant or revoke also refreshes the room's `stream:moderators` (above).

## Mobile (`apps/mobile/lib/features/moderation`)

`ModerationRepository` wraps `GET/POST /streams/:id/moderators`, `PATCH/DELETE /streams/:id/moderators/:userId`, and (since a stream's own moderation reads through the same repository) `GET /streams/:id/viewers` and `POST/DELETE /streams/:id/bans/:userId` - every method takes the `streamId` explicitly, there's no "for my own channel" shortcut. `ModeratorCapability` is a Dart enum mirroring the backend's exactly, with `fromWire`/`setFromWire` dropping anything it doesn't recognize (a capability added server-side after this app version) instead of crashing. `ModeratorPreset` (Chat moderator / Guest manager / Full moderator, plan §6.9) is a **mobile-only** concept layered over the flat capability set - the backend has no preset notion at all, so a new preset is a mobile-only change (a new `ModeratorPreset` constant).

`ModeratorsScreen` (`/go-live/moderators`, `extra: streamId` - reachable **only from within an active go-live session**, via a shield icon in the expandable controls row, not from the profile screen - a grant only ever means anything for the stream currently running, so the screen doesn't exist to open outside of one) lists active moderators **for this one stream** with their capabilities as chips; the overflow menu edits (re-opens the capability picker, pre-filled) or revokes. Adding one is a two-step sheet flow: `_PickUserSheet` (debounced `GET /users/search`, reusing the same pattern as `UserSearchScreen`) then `pickModeratorCapabilities()` (presets first, a "Customize" expander reveals the seven individual toggles) - `PATCH`ing to an empty capability set is treated as a revoke rather than sent as an update.

`LiveRoom` learns this device's own capabilities for the room it's in two ways: once from `StreamJoinResult.selfCapabilities` (from `POST /streams/:id/join`, so a moderator sees their own status immediately on joining, not only from the next push) and afterwards live via `SelfCapabilitiesChanged` (from `moderator:granted`/`updated`/`revoked`, filtered to events whose `streamId` matches `LiveRoom.streamId` - the same per-stream filter every other realtime event on this room already uses, since a grant is scoped to the stream, not the host). `ViewerScreen` shows a one-time "You're now a moderator for {host}" snackbar exactly on the empty-to-non-empty transition (not on every subsequent capability tweak, which is already reflected live in the badge/action sheet without a toast). Everywhere a capability gates an action (the message action sheet, the profile card's "..." menu, the guest manager), it goes through `ModerationPolicy` (`domain/moderation_policy.dart`) - the server's rules in one pure object built from the host id, this user's id and capabilities, and the live's `moderatorIds` (`RoomSynced.moderatorIds`, then `ModeratorsChanged`): `canDeleteMessageBy`, `canBan`, `canMuteInChat`, `canRemoveFromStage`, `canLockMic`, `canPin`, `isModerator`. The host never needs to hold a capability itself; a moderator is never offered an action on another moderator. The server enforces the same either way.

**Person menu** (client feedback, 2026-09-29): everything done *to a person* in a live lives in one place - the "..." on their profile card, however the card was opened (a chat name or picture, a mention, the host pill, a guest tile, a viewer-list row). `ModerationPolicy.memberActions(userId, {onStage, micLocked, mutedInChat, stageFull})` lists them, in menu order, as `MemberAction`s (`domain/member_action.dart`): the host gets **Invite on stage** (not on stage, a seat free) and **Make moderator** (`pickModeratorCapabilities`) / **Remove as moderator**; whoever holds the capability gets **Mute their mic** / **Let them unmute** and **Remove from stage** (guests only), **Mute in chat** / **Unmute in chat**, **Ban from this live** and **Ban permanently** - nothing on yourself, and for a moderator nothing on the host or another moderator. `liveMemberActions(ref, LiveMemberScope(streamId, moderation, guests), userId:, name:, onDone:)` (`presentation/live_member_actions.dart`) turns those into the card's `ProfileCardAction`s - each asks first where it should (bans, removals, demotion), says how it went in a snack bar, and tells `onDone` when it went through (the viewer list drops a banned row and re-reads chat mutes that way). It reads `GET /streams/:id/chat/mutes` only when this user could mute the person, to offer Unmute instead. Both live screens build the scope fresh on each open (`_members`), so the menu always matches the current policy and stage. The card itself adds the personal **Block/Unblock** (docs/features/social.md). The message action sheet keeps only what's about the message (docs/features/chat.md).

## How to add to this feature

- **A new capability**: add the value to the Prisma `ModeratorCapability` enum (+ migration), then check it wherever the new ability is enforced via `hasChannelCapability()` - no change needed in this module itself, `grant()`/`updateCapabilities()` already accept an arbitrary `ModeratorCapability[]`.
- **A new preset**: mobile-only - add it to whatever screen/constant lists the presets, mapping a name to a fixed `capabilities[]` array sent to `POST`/`PATCH /streams/:id/moderators`.
- **Letting a moderator manage guest requests** (Phase 6): `MANAGE_GUEST_REQUESTS`/`REMOVE_GUESTS` already exist in the enum - the guest-request accept/reject/remove endpoints just need their own `canUseCapability()`-style check, the same pattern `ChatService`/`StreamsService` already use.

## How to modify this feature

Changing what a host can delegate (adding/removing a capability from the
enum) is a migration plus updating plan §6.9's table and this doc - the
authorization check itself (`hasChannelCapability`) never changes shape,
it's already generic over "does this grant contain this one capability".
Changing the scope back to per-channel (persistent across streams) would
mean dropping `streamId` from the unique constraint/lookup key and putting
it back on `hostId` alone - a real design reversal, not a small tweak;
this exact history is why it's called out explicitly here rather than
just in a migration message.

## How to remove this feature

Remove `ModeratorsModule` from `app.module.ts` (and from `StreamsModule`'s
and `RealtimeModule`'s imports), delete the four `*Moderator*` methods and
routes from `StreamsService`/`StreamsController`, delete
`hasChannelCapability`/`ModeratorGrant` from `PermissionsService`, and
revert every capability check back to a plain `isHost()` check (chat
delete/pin, room bans). The `moderators` table is additive - safe to leave
until a migration drops it.

## Tests

`moderators.service.spec.ts` covers `findActiveGrant` (null with no grant,
null once revoked, the capabilities of an active one, and that it's keyed
by stream - a grant for one stream doesn't answer for a different one),
`list` (active only for one stream, newest first), `grant` (self-grant
rejected, unknown target 404s, idempotent upsert scoped to the stream,
emits `moderator.granted`), `updateCapabilities` (404 when not an active
moderator for that stream, emits `moderator.updated`), and `revoke`
(idempotent/silent when nothing changed, emits `moderator.revoked` only
when it did). `permissions.service.spec.ts` covers `hasChannelCapability`
directly (host always passes; a grant with/without the capability; a
null/undefined grant is refused) - it doesn't need to know about streams
at all, it just checks whatever grant it's handed. `streams.service.spec.ts`
covers the new `grantModerator`/`updateModerator`/`revokeModerator`/`listModerators`
methods (host-only, grant requires the stream to be live, a moderator
can't grant another moderator) and `join()`'s `selfCapabilities` lookup
(keyed by `streamId`, not `hostId` - a real bug caught here once already,
see docs/features/streams.md). `chat.service.spec.ts` covers the
capability checks at their own call sites (delete/pin). `realtime.gateway.spec.ts`
covers the three `moderator:*` relay handlers.

Mobile: `live_room_test.dart`'s "moderation" group covers `SelfCapabilitiesChanged`
directly (granted/updated/revoked, filtered to this room's own **stream**
- a grant for a different stream from the same host is ignored - an empty
set on revoke). `stream_join_result_test.dart` covers parsing
`selfCapabilities` from the join response. `moderation_repository_test.dart`
covers the stream-scoped URLs (`/streams/:id/moderators`, not `/me/moderators`).
`moderation_policy_test.dart` covers `memberActions` per role (host, moderator,
viewer; on stage or not, mic locked, muted, a full stage).
`live_member_actions_test.dart` drives the card's menu end to end (a
moderator's ban: confirm, `POST .../bans/:userId`, snack bar; Unmute offered
to someone already muted; a viewer's menu is only Block and reads nothing).
`message_action_sheet_test.dart` covers the trimmed long-press sheet.
`ModeratorsScreen`/the capability picker/`_PickUserSheet` have no dedicated
widget tests yet - a reasonable next addition.

