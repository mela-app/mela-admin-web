# Domain events (internal event bus)

**Location**: `apps/backend/src/common/events/domain-events.ts` (contracts) + `EventEmitterModule.forRoot()` in `app.module.ts` (the actual bus, from `@nestjs/event-emitter`)
**Plan reference**: plan §4.1
**Depends on**: `@nestjs/event-emitter`
**Depended on by**: any module that wants to react to something happening in another module without being directly imported by it

## What it does

Lets modules publish facts (`user.registered`, `stream.started`, `moderator.granted`, `stream.invite_sent`, ...) without importing and calling
each other directly. A future feature (achievements, gifting, analytics)
can subscribe to an existing event without the emitting module knowing it
exists.

Phase 5 (plan §6.11-6.12) leans on this more than any phase before it:
`NotificationsService` has zero direct dependents and zero dependency from
any emitter - `StreamsService` (`stream.started`), `SocialService`
(`user.followed`), `ModeratorsService` (`moderator.granted`), and
`ShareService` (`stream.invite_sent`) all just emit a plain event and never
import `NotificationsModule`. `NotificationsService` itself also emits one
(`notification.created`), which only `RealtimeGateway` listens for - see
docs/features/notifications.md.

Phase 6 (guest management, plan §6.5-6.6) added six more, all emitted by
`GuestsService` and relayed by `RealtimeGateway`:
`guest_request.created`/`accepted`/`rejected`/`cancelled`, `guest.joined`,
`guest.removed`. `guest_request.created` is also consumed directly by
`NotificationsService` (filtered to `initiatedBy === HOST`, for the
`GUEST_INVITE` notification) - see docs/features/guests.md.

Phase 7 (mute suite, plan §6.7) added two, both relayed by `RealtimeGateway`:
`room_chat_mute.changed` (`RoomChatMutesService` - to the muted user's own
`user:{id}` room only, as `chat:muted`/`chat:unmuted`) and
`guest.mic_force_mute_changed` (`GuestsService` - `presence:audio_state` to
the room, plus a private `force_mute_audio` to the guest on a lock). Both
carry `actorId` for the audit trail, like the Phase 4 moderation events.

`guest.placement_changed` (`GuestsService`, 2026-10): the host or an
`ARRANGE_GUESTS` moderator moved a guest's tile, or put it back in line -
`{streamId, userId, actorId, placement}`. `RealtimeGateway` relays it to the
room as `guest:placed`. Not audited.

`guest.spotlight_changed` (`GuestsService`, 2026-10): the host or an
`ARRANGE_GUESTS` moderator put a guest on the full stage, or gave it back to
the host - `{streamId, userId (null = the host), actorId}`. `RealtimeGateway`
relays it to the room as `guest:spotlight`. Not audited.

`app_release.changed` (`AdminReleasesService`, 2026-10): an app update was
published, edited or withdrawn - `{change, releaseId, actorId, platform,
version, build, required, fields?}`. `RealtimeGateway` relays it to every
socket as `app:update {platform}`, and `AuditEventsListener` records it as
`app.release_<change>` (docs/features/app-updates.md).

`data.cleared` / `data.reset` (`AdminDataService`, 2026-10): a super admin
removed one kind of stored data - `{actorId, dataSet, label, olderThanDays,
removed, signedOut}` - or everything but their own account - `{actorId,
kept, usersRemoved}`. Emitted after the removal, so `AuditEventsListener`'s
entry survives clearing the audit log. `RealtimeGateway` disconnects every
socket but the admin's own on a reset, or when `signedOut` (everyone was
signed out) - docs/features/admin.md.

Reports and account deletion (2026-10, docs/features/moderation.md and
docs/features/auth.md) added three. `report_case.resolved`
(`AdminReportsService`): a case was decided - `{caseId, outcome, actorId,
targetType, label, reporterIds, note}`; `NotificationsService` tells each
reporter, `AuditEventsListener` records `report.actioned` / `.dismissed`.
`direct_message.erased` (`DirectMessagesService.erase`): a reported private
message was removed - `{messageId, senderId, recipientId, actorId,
recipientUnreadCount}`; `RealtimeGateway` sends both people
`message:deleted` and the recipient `message:unread_count`, and it's audited
without the text. `account.deleted` (`AccountDeletionService`): `{userId,
actorId (null when they deleted it themselves), reason}`; `RealtimeGateway`
closes their sockets, `AuditEventsListener` records `account.deleted` or
`user.deleted`.

`recording_permission.changed` (`RecordingPermissionsService`, 2026-09-30):
the host let a viewer record their live or took it back - relayed only to
that viewer's `user:{id}` room as `recording:permission {streamId, allowed}`
(docs/features/streams.md). Carries `actorId`; not audited.

`direct_message.sent` and `direct_message.read` (`DirectMessagesService`,
2026-09-30): a message between friends was stored, or someone read what
their partner sent. `RealtimeGateway` relays them to both people's
`user:{id}` rooms as `message:new` / `message:read`, with
`message:unread_count` (a total) to whoever's badge changed
(docs/features/messages.md). Only the gateway listens - message text never
reaches the audit trail.

`live.access_revoked` (`StreamsService.handleUserBlocked`, 2026-10): a block
between a running live's host and someone in it took that person out -
`{streamId, hostId, userId, removedByHost}`. `RealtimeGateway` takes their
sockets out of the live's room and, when the host was the blocker, sends
them `force_disconnect` (scope `SESSION`). Not audited (`user.blocked` is).

Phase 8 (admin console, plan §6.8) made the bus the audit trail's only
input: `AuditEventsListener` (`src/audit`) turns events from every module
into `audit_logs` rows, so no module imports `audit`. New events:
`user.logged_in`/`logged_out`, `user.profile_updated`,
`user.profile_moderated`, `user.role_changed`, `user.admin_permissions_changed`,
`user.sessions_revoked`,
`user.blocked`/`unblocked`, `user.unfollowed`, `account.password_changed`,
`account.email_changed`, `admin.signed_in`/`sign_in_failed`/`signed_out`,
`admin.staff_created`, `stream.locked`/`unlocked`, `room_ban.lifted`,
`admin_alert.sent`, and
`banned_phrase.created`/`updated`/`deleted`. `RealtimeGateway` relays
`stream.locked`, `stream.unlocked`, `admin_alert.sent` and
`user.sessions_revoked` (see docs/features/realtime.md), and
`BannedPhrasesService` reloads its cache on the phrase events. Payloads
carry the actor and the reason, and older events gained optional fields
only (for example `stream.unlocked`'s `hostId`), so the contract stays
additive.

## How to add to this feature

1. Add the event name to the `DomainEvents` const and a payload interface
   in `domain-events.ts`.
2. Emit it: inject `EventEmitter2`, then
   `this.events.emit(DomainEvents.YourEvent, payload satisfies YourPayload)`.
3. Listen for it anywhere: `@OnEvent(DomainEvents.YourEvent) handle(payload: YourPayload) {}`.

## How to modify this feature

**Never repurpose an existing event's payload shape** - old listeners will
silently break. Add a new event instead (additive-only contract, same rule
as the realtime Socket.IO catalog in plan §9).

## How to remove this feature

Only remove an event once every `@OnEvent(...)` listener for it has been
deleted - search the repo for the event name first.

## Tests

Currently exercised indirectly through the emitting service's own spec
(e.g. `auth.service.spec.ts` asserts `user.registered` on signup,
`streams.service.spec.ts` asserts `stream.started` on go-live,
`notifications.service.spec.ts` asserts every `@OnEvent` handler's effect).
`audit/audit-events.listener.spec.ts` covers every audit handler.
Add a dedicated spec once a listener's side effect becomes non-trivial.
