# Moderation & block

**Location**: `apps/backend/src/room-chat-mutes` (this module's own code); the other pieces of "moderation" each live inside the feature they moderate, cross-referenced below rather than duplicated here
**Plan reference**: plan §6.3, §6.4, §6.9; task-breakdown Phase 4
**Depends on**: `common/prisma`, `auth` (for `JwtAuthGuard`)
**Depended on by**: nothing

## What it does

"Moderation" spans four independent pieces, deliberately kept in the
module that owns the data they act on rather than centralized here - each
has its own real estate to enforce (chat text, a user relationship, a
stream's participants) and gains nothing from a shared "moderation"
service other than a shared vocabulary. This doc is the map; the actual
behavior is documented where the code lives:

| Piece | What it is | Documented in |
|---|---|---|
| Banned phrases & link policy | Server-side chat filtering - `REJECT`/`MASK` phrases, an allowed-domain link policy | docs/features/chat.md |
| Personal block | Any user can block any other user - hides messages/streams client-side, blocks re-following | docs/features/social.md |
| Room ban | A host (or a delegated moderator) force-disconnects a participant from their stream, `session` or `host_permanent` | docs/features/streams.md |
| Room chat mute | A host (or a `MUTE_CHAT` moderator) stops one participant's messages being accepted in one live, for a while or until it ends | here (below) |
| Personal chat mute | Anyone hides another person's chat messages for themselves only | docs/features/social.md |
| Guest mic lock | A host (or a `FORCE_MUTE_GUESTS` moderator) turns a guest's mic off and keeps it off | docs/features/guests.md |
| Delegated moderators | A host grants trusted users a scoped subset of moderation capabilities | docs/features/moderators.md |

**No user reports.** Reporting (a report button on profiles and chat
messages, and the admin console's reports worklist) was removed entirely
after the first friend test (migration `20260929090000_remove_reports`
dropped the `reports` table and the `VIEW_REPORTS`/`MANAGE_REPORTS`
permissions). Problems are handled with the pieces above and the admin
console's own tools (suspend, lock a live, delete a message).

**Room chat mute** (`RoomChatMutesModule`, plan §6.7, Phase 7): one `room_chat_mutes` row per `(streamId, userId)` - `mutedById`, and `expiresAt` (null: until the live ends). Muting again replaces the expiry; unmuting deletes the row; expired rows are never cleaned up by a job, every read just filters them out (`stillRunning()`), and they cascade away with the stream. Who may mute is `StreamsService`'s call (`muteChat()`/`unmuteChat()`/`listChatMutes()` - the host or a `MUTE_CHAT` moderator via its `canUseCapability()`, never on the host or yourself; muting needs the live running, lifting doesn't), on `StreamsController`: `GET /v1/streams/:id/chat/mutes`, `POST /v1/streams/:id/chat/mutes/:userId {durationSeconds?}` (`MuteChatDto`: 60 s to a day; omitted = until the live ends), `DELETE` the same path. Enforcement is `ChatService.send()` (docs/features/chat.md): a muted sender gets `CHAT_MUTED`, with `retryAfterMs` for a timed mute. Only the muted person is told - `room_chat_mute.changed` -> `chat:muted {streamId, mutedUntil}` / `chat:unmuted {streamId}` to their own `user:{id}` room, and `stream:join` answers `chatMuted`/`chatMutedUntil` on every (re)join so a reconnect catches up (docs/features/realtime.md); the room never learns who is muted. The muted person keeps watching, liking and reading.

Mobile: "Mute in chat" / "Unmute in chat" in a person's profile card "..." menu in a live (`features/moderation/presentation/live_member_actions.dart`, docs/features/moderators.md; the duration sheet is `chat_mute_sheet.dart` - 5 minutes, 1 hour, or the rest of the live; the viewer list shows who's muted until when), `ModerationRepository.muteInChat`/`unmuteInChat`/`listChatMutes`, `domain/room_chat_mute.dart`. The muted user's side is `LiveChatController` (docs/features/chat.md).

## Mobile (`apps/mobile/lib/features/moderation`)

Same "map, not a duplicate" structure as the backend. Block/unblock, room bans, and delegated moderators each live in - and are documented by - the mobile feature that owns them (`social`, `live_stream`/`moderation`'s viewer-list and action sheet, and `moderation`'s `ModeratorsScreen` respectively).

## How to add to this feature

A new moderation tool goes in the module that owns the data it acts on,
with a row in the table above.

## How to remove this feature

The pieces
(banned phrases/link policy, block, room bans) are removed
independently, per their own doc's "How to remove" section.

Removing room chat mute: delete `apps/backend/src/room-chat-mutes`, its
import in `ChatModule`/`StreamsModule`/`RealtimeModule`, the mute check in
`ChatService.send()` (and `CHAT_MUTED`), the three routes + `MuteChatDto`
and `muteChat`/`unmuteChat`/`listChatMutes` in `StreamsService`,
`chatMuted`/`chatMutedUntil` in the gateway's `stream:join` answer, the
`RoomChatMuteChanged` event + `handleRoomChatMuteChanged`, and the
`RoomChatMute` model (new migration). Mobile: `chat_mute_sheet.dart`, the
menu entries, and `LiveChatController`'s mute state (the composer's
`lockedMessage` can stay).

## Tests

Room chat mute:
`room-chat-mutes.service.spec.ts` (upsert replaces the expiry, null expiry,
unmute announces only when something was lifted, `findActive`/`listActive`
ignore expired rows), `streams.service.spec.ts` "room chat mute" (host,
`MUTE_CHAT` moderator, refusals, can't mute the host/yourself),
`chat.service.spec.ts` (refused with and without `retryAfterMs`, a resend
of an earlier message still answers), `realtime.gateway.spec.ts` (the join
answer, private relays); mobile `moderation_repository_test.dart` and
`live_chat_controller_test.dart`'s "mute suite" group. See
docs/features/chat.md, docs/features/social.md, docs/features/streams.md, and
docs/features/moderators.md for the other pieces' test coverage.
