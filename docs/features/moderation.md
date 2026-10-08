# Moderation & block

**Location**: `apps/backend/src/room-chat-mutes` and `apps/backend/src/reports` (this doc's own code), `apps/backend/src/admin/reports` (the console's side), `apps/mobile/lib/features/reports`; the other pieces of "moderation" each live inside the feature they moderate, cross-referenced below rather than duplicated here
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
| User reports | Anyone reports a live, a chat or private message, or an account to Mela's safety team, who decide in the console | here (below); the console side in docs/features/admin.md |

**User reports** (2026-10, for the stores: Apple's guideline 1.2 and
Google Play's user-generated content policy both want a way to report
offensive content and people in the app, and reports acted on - Apple
within 24 hours). The first version was removed after the first friend
test (migration `20260929090000_remove_reports`); this one is migration
`20261009090000_reports`.

- **Reporting** (`ReportsModule`, `src/reports`): `POST /v1/reports
  {targetType, targetId, reason, details?, block?}`, signed in. What:
  `LIVE`, `CHAT_MESSAGE`, `USER` or `DIRECT_MESSAGE`. Why: `SPAM`, `SCAM`,
  `HARASSMENT`, `HATE`, `VIOLENCE`, `SEXUAL_CONTENT`, `CHILD_SAFETY`,
  `SELF_HARM`, `ILLEGAL`, `IMPERSONATION` or `OTHER` - which needs
  `details` (at most 500; `400 DETAILS_REQUIRED`). `block: true` also blocks
  whoever it's about (`SocialService.block`), in the same request.
- **One case per reported thing** (`report_cases`): while a case is open,
  each further report joins it (`reports`, one per reporter - reporting
  again changes nothing), adding to `reportCount` and `lastReportedAt`; once
  decided, a new report opens a new case. A transaction-scoped advisory lock
  per thing keeps two reports at the same moment from opening two cases.
- **A snapshot** of what was reported, as it was then, stays with the case:
  a live's title, category and host; a chat message's text, photo, time and
  live; an account's name and bio; a private message's text and sender. So
  deleting it afterwards doesn't remove the evidence. When an account is
  deleted, `reportedUserId` / `reporterId` become null; the snapshot keeps
  the name.
- **Only what the reporter could see**: a private message only by the
  person it was sent to (anyone else gets 404, as if it didn't exist),
  nothing of one's own (`400 CANNOT_REPORT_SELF`), and something already
  gone is a 404 ("That message is no longer available").
- **Urgent**: `CHILD_SAFETY` and `SELF_HARM` mark the case urgent - first in
  the console's list, and its sidebar count turns red.
- **Pace**: 10 reports, then one every 6 minutes, per person
  (`REPORT_RATE_LIMIT`, `429 RATE_LIMITED`).
- **Deciding** (the console's Reports page, `AdminReportsService` - see
  docs/features/admin.md): "Action taken" (`ACTIONED`) or "No violation"
  (`DISMISSED`), with an optional note for the team, once
  (`409` for a second decision). Everyone who reported it gets a
  notification, `REPORT_ACTIONED` / `REPORT_DISMISSED`
  (docs/features/notifications.md), saying what was decided - never what was
  done, or by whom. The tools are the console's usual ones (delete a chat
  message, lock a live, suspend), plus removing a reported private message
  for both people (`DirectMessagesService.erase` - docs/features/messages.md).
  Audited as `report.actioned`, `report.dismissed` and
  `report.private_message_removed` (target `REPORT`, category Moderation).

**Mobile** (`features/reports`): `showReportSheet` (`presentation/report_sheet.dart`)
asks why - each reason with a line under it; "Pretending to be someone else"
only for an account or a live - then for details (needed for "Something
else"), offers "Also block {name}" (`SwitchListTile.adaptive`: an iOS switch
on iPhone), and ends on a thank-you saying reports are reviewed within 24
hours and the outcome arrives as a notification. The urgent reasons first
say to call the local emergency number if someone is in immediate danger; a
private message says Mela's safety team will see it; the person reported is
never told who reported them. Where: hold a chat message in a live ("Report
message" - anyone's but your own, the host's too); a profile card's "..."
and someone's profile "..." ("Report", next to Block); the live's Share
sheet ("Report live", for viewers and guests); hold a friend's message in a
conversation ("Report message" - a report that also blocks goes back to the
inbox, since the conversation is then hidden). A block from a report hides
their chat at once (`ChatFilterController.noteBlocked`) and, for the host,
ends the live for this viewer like any block. `ReportsRepository.submit`,
`domain/report.dart` (`ReportTarget`, `ReportReason`, `ReportOutcome`).

**Still needed for the App Store** (task-breakdown Phase 9): terms of use
that every new account accepts, saying there's no tolerance for
objectionable content or abusive users, and a support contact on the store
listing.

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

Removing reports: the stores require them (see above), so only with
another way to report. Then: `src/reports` and `src/admin/reports` (and
their imports in `app.module.ts` / `admin.module.ts`), the `ReportCase` /
`Report` models and their enums, `VIEW_REPORTS` / `MANAGE_REPORTS` and
`REPORT_ACTIONED` / `REPORT_DISMISSED` (a migration, like
`20260929090000_remove_reports`), `onReportResolved` in
`NotificationsService` and `AuditEventsListener`, the `report.*` audit
actions, and `overview.reports`. Mobile: `features/reports` and its entry
points (message action sheet, profile card, profile screen, share sheet,
conversation). Console: `features/reports`, its route, nav entry and
permissions area.

## Tests

User reports: `reports/reports.service.spec.ts` (a case about a chat
message with its snapshot, a second reporter joining it and marking it
urgent, one report per person, details for "something else", not one's own,
the pace, a live reported as its host's with a block, a private message only
by its recipient, something already gone),
`admin/reports/admin-reports.service.spec.ts` (labels, urgent-then-latest,
a case's detail, deciding once and telling every reporter, removing only a
reported private message), `notifications.service.spec.ts` "report
outcomes", `direct-messages.service.spec.ts` "erase"; mobile
`report_sheet_test.dart` (reason and details sent, a block with it, "Something
else" needing words, back to the reasons, emergency help for the urgent
ones, the private-message note, a refusal), `message_action_sheet_test.dart`
(Report on anyone's message but your own), `conversation_screen_test.dart`
(holding a friend's message); console `features/reports/ReportCase.test.tsx`.

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
