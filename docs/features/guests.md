# Guest management (viewer-to-broadcaster)

**Location**: `apps/backend/src/guests` (the data/request-lifecycle logic; no controller of its own - see below)
**Plan reference**: plan §6.5 (guest requests), §6.6 (removing a guest); task-breakdown Phase 6
**Depends on**: `common/prisma`, `common/events`, `common/video-provider` (mints/revokes the guest's own publish credentials), `moderators` (`listUserIdsWithCapability` - who besides the host is allowed to see/act on a raised hand), `common/redis` (removal cooldown)
**Depended on by**: `streams` (owns the `/streams/:id/guests*` and `/streams/:id/guest-requests*`/`guest-invites` routes and all the live/capability checks - see below), `realtime` (relays all `guest_request:*`/`guest:*`/`you_were_removed` events), `notifications` (`GUEST_INVITE` notification for a host-initiated invite)

## What it does

A viewer watching a live can be brought on stage as a second (or third...)
broadcaster, either by raising their own hand (a **request**) or by the
host directly inviting them (an **invite**) - both directions share one
`GuestRequest` row shape, distinguished only by `initiatedBy:
GuestRequestInitiator` (`VIEWER` | `HOST`), because accepting one works
identically either way (plan §6.5's own wording: "Accepting follows the
same path as an accepted request").

**`GuestRequest`** (`id, streamId, userId, initiatedBy, status:
GuestRequestStatus (PENDING|ACCEPTED|REJECTED|CANCELLED), requestedAt,
resolvedAt`) is a pure history row - a new request is always a new row,
never reused. **`StreamGuest`** (`id, streamId, userId, status:
StreamGuestStatus (ACTIVE|REMOVED), joinedAt, leftAt`) is the actual seat,
unique on `(streamId, userId)` like `Moderator` - upserted and flipped
between ACTIVE/REMOVED rather than creating a new row every time someone
rejoins the stage.

**Cap**: `MAX_ACTIVE_GUESTS = 6` (`guests.service.ts`, plan's "e.g. 6") -
accepting a request or invite when the stream already has this many
active guests is rejected (`ForbiddenException`), checked in
`StreamsService.acceptGuestRequest()` right before minting a token (no
point minting one that can't be used).

**Removal cooldown**: being removed by the host/a moderator sets a 5
minute Redis cooldown (`guest_cooldown:{streamId}:{userId}`) before that
same user can request again for that stream - **only** on a
host/moderator-initiated removal, never on a self-initiated "leave seat"
(per plan §6.6's exact wording; you can hop back up immediately after
leaving on your own).

**`GuestsService`** (`apps/backend/src/guests/guests.service.ts`) is a
pure data/lifecycle layer, deliberately scoped like
`ModeratorsService`/`RoomBansService` - it does **not** touch the video
provider itself. Its public surface: `request`/`invite` (create a
`GuestRequest`, validating not-self/not-already-guest/not-on-cooldown/
not-already-pending), `listPending` (VIEWER-initiated PENDING only,
oldest first - a host's own outstanding invites don't show up in "who's
asking to join"), `findPendingOrThrow`, `accept`/`reject`, `cancel`
(authorization varies by `initiatedBy` - a VIEWER-initiated request can
only be cancelled/retracted by its own requester; a HOST-initiated invite
can only be retracted by the host), `activeGuests`, `remove` (idempotent;
sets the cooldown only when `removedByHostOrModerator=true`),
`removeAllForEndedStream` (bulk, no per-guest events - `stream_ended`
already tears down every client).

**`StreamsService`** owns everything `GuestsService` deliberately doesn't:
the live-only/capability checks, and calling the video provider to mint
(on accept) or revoke (on remove/leave) the guest's own publish
credentials - exactly mirroring how `banFromRoom`/`grantModerator` already
work. Eight new methods: `requestToJoinAsGuest`, `inviteGuest` (host-only),
`cancelGuestRequest`, `listGuestRequests` (host or a moderator with
`MANAGE_GUEST_REQUESTS`), `listActiveGuests`, `acceptGuestRequest` (checks
the `MAX_ACTIVE_GUESTS` cap, mints a fresh publisher-role token),
`rejectGuestRequest`, `removeGuest` (needs `REMOVE_GUESTS`),
`leaveGuestSeat` (always self-serve, no capability needed). A private
`assertCanResolve()` helper picks the right authorization rule for
accept/reject depending on `initiatedBy` (the invitee resolves their own
invite; a viewer's own raised hand needs `MANAGE_GUEST_REQUESTS`).
`StreamsService.join()` also now returns `activeGuests` (mirrors the
`pinnedMessage`/`selfCapabilities` precedent from Phase 4 - a viewer
joining mid-stream needs to see who's already on stage), `selfGuestRequest`
(this viewer's own open request or the host's invite - how a viewer who
arrives from a `GUEST_INVITE` notification gets to answer it) and
`hostAgoraUid`. `endStream()` also cascades
`guests.removeAllForEndedStream()`.

**Freeing a seat** (`removeGuest`, `leaveGuestSeat`, and `join()`) goes
through one private `vacateGuestSeat()`: it does nothing for someone who
isn't seated (a stale "remove" must never kick a plain viewer's media),
then **awaits** the media revoke before flipping the seat. Order matters on
LiveKit, where `revokeToken` removes the participant: once `guest:removed`
goes out the client reconnects as a viewer, and a revoke landing after that
would kick the new connection too. A failed revoke is logged and the seat
is freed anyway. `join()` calls it too: joining as audience means the user
isn't publishing, so a seat they still hold (the app was killed while on
stage) would otherwise be a frozen tile for everyone. Known limit: a guest
who never comes back keeps the seat until the host or a moderator removes
it, or the live ends; Agora's `revokeToken` only logs, so a removed Agora
guest's token stays valid until it expires (real enforcement needs Agora's
REST kicking rules and customer credentials).

**Agora multi-broadcaster uid**: a guest joining means more than one
publisher in the same Agora channel at once, so every `mintToken()` call
now derives a **deterministic per-user uid** via `agoraUidFor(userId)`
(`agora-video-provider.service.ts` - a SHA-256-based hash truncated to a
positive 31-bit int, never `0`, which Agora reserves as its
auto-assign wildcard) instead of always minting `uid: 0`. `uid` is now a
required field on the Agora variant of `VideoCredentials`, so a client
can correlate Agora's `onUserJoined(uid)` callback back to a real
`userId` - previously every session (host or guest) got `uid: 0` and a
second real broadcaster would have been indistinguishable from the first.
LiveKit needed no equivalent change - it already mints with `identity:
userId`.

**Endpoints** (all on the existing `StreamsController`, `JwtAuthGuard`):
- `GET /streams/:id/guests` - active guests for a live stream.
- `POST /streams/:id/guests/:userId/remove` - host/moderator with `REMOVE_GUESTS` kicks a guest (sets cooldown).
- `POST /streams/:id/guests/leave` - a guest leaves their own seat (no cooldown).
- `GET /streams/:id/guest-requests` - pending VIEWER-initiated requests; host or moderator with `MANAGE_GUEST_REQUESTS`.
- `POST /streams/:id/guest-requests` - a viewer raises their hand.
- `POST /streams/:id/guest-invites {userId}` - host invites a specific viewer.
- `DELETE /streams/:id/guest-requests/:requestId` - cancel/retract (viewer their own request, host their own invite).
- `POST /streams/:id/guest-requests/:requestId/accept` - mints fresh publish credentials, flips the `StreamGuest` seat ACTIVE.
- `POST /streams/:id/guest-requests/:requestId/reject`.

**Realtime** (`RealtimeGateway`, all additive new events): `guest_request:new`
(to the host + eligible moderators for a raised hand, or just the invitee
for a host's invite - recipient list computed by `GuestsService` itself,
not the gateway, so the gateway never needs a `ModeratorsService`
dependency), `guest_request:accepted` (private, to the new guest, carries
the fresh `VideoCredentials`), `guest_request:rejected` (private),
`guest_request:cancelled` (to the same recipients as the original
request/invite), `guest:joined`/`guest:removed` (public, to
`stream:{id}` - every viewer's UI adds/drops a tile), and a private
`you_were_removed` (to the removed guest only, **only** when
`wasRemovedByHostOrModerator` - a self-initiated leave already knows).

**Notifications**: a host-initiated invite (`GuestRequestCreated` with
`initiatedBy === HOST`) additionally creates a durable `GUEST_INVITE`
notification for the invitee (`NotificationsService.onGuestRequestCreated`)
- a viewer's own raised hand does not, since that's not a
notification-worthy event about the requester's own action.

**Mic lock** (host forced remote mute, plan §6.7, Phase 7):
`POST /v1/streams/:id/guests/:userId/mute-audio` locks a guest's mic off,
`DELETE` lets them turn it back on - the host or a `FORCE_MUTE_GUESTS`
moderator, live streams only (`StreamsService.setGuestMicForceMuted`). A
moderator on stage may also lift the lock on their **own** mic, whatever
they were granted (client feedback, 2026-09-29 -
`PermissionsService.canLiftOwnMicLock`); locking still takes the capability.
`GuestsService.setMicForceMuted` flips `stream_guests.micForceMuted` with one
conditional `updateMany` (idempotent; 404 for someone not on stage) and
emits `guest.mic_force_mute_changed`; the gateway sends a private
`force_mute_audio` to the guest on a lock and `presence:audio_state
{streamId, userId, forceMuted}` to the room either way. A new seat always
starts unlocked, and `GET .../guests` returns `micForceMuted`, so a rejoin
catches up. The media servers can't silence a participant on their own
here (plan §6.7), so the guest's app enforces it - lifting the lock never
turns anyone's mic on. The escalation for a guest whose app ignores it is
removal.

## Mobile (`apps/mobile/lib/features/guests`)

- **Data**: `Guest`, `GuestRequest` (`isInvite` for the host's direction) and `kMaxGuests` (mirror of `MAX_ACTIVE_GUESTS`, used only to disable Accept on a full stage - the backend enforces the cap) in `domain/guest.dart`; `GuestsRepository` wraps all 9 endpoints (`guestsRepositoryProvider`). `LiveRoom` turns the realtime events into `GuestRequestReceived`/`Accepted`/`Rejected`/`Cancelled`, `GuestJoined`, `GuestLeft` and `SelfRemovedFromStage`.
- **`LiveGuestsController`** (one per live room, both screens): who's on stage (seat order), the raised hands (only for the host or `MANAGE_GUEST_REQUESTS`), and this user's own request or invite; `canManageRequests`/`canRemoveGuests` follow the live `SelfCapabilitiesChanged`. It re-reads the stage (and the queue) on every `RoomSynced`, so anything missed offline is caught up, and re-applies events that arrive while that read is in flight. Answered requests stay answered: a late response can't bring one back.
- **Stage** (client feedback, 2026-09-28 - replaced an equal-share grid): the host keeps the whole stage - or their Split/Floating frame - and `LiveStage.tiles` lines the guests down the right edge, top first, as portrait 3:4 tiles (`guestColumnRects` in `widgets/stage_guest_column.dart`): small by design (client feedback, 2026-09-29 - the host is the show), up to 22% of the screen wide (72-112 dp), shrinking to fit the height; when one column would make them narrower than 56 dp they fill a second column to its left, never more than half the width. On a full stage the column runs from under the top bar to above the rail (measured at rest, so the keyboard doesn't reshuffle it) - or, on a short screen (landscape) where that leaves no height, down beside the rail - and the chat/details column narrows to stay clear of it. Split keeps it inside the video band, Floating inside the window. The host's video keeps its element (so Agora's native view isn't re-created) and each tile is keyed by user id. The host's own Fit/Full choice now holds with guests too (the old grid forced a crop). Quality follows size: the host is the prominent (high) stream, guests the low one (`RemoteVideoReceiver.addRemote(prominent:)`). `GuestTile` shows the video, or the avatar while the camera is off or connecting, with the name and a muted-mic badge (just the badge on a tile under 48 dp). Tapping a guest opens their profile card, for everyone (see Host below).
- **Host** (`GoLiveScreen`): a Guests button with a waiting-count badge next to Pause/End opens `showGuestManagerSheet` (Accept/Decline raised hands, Remove guests - live as it changes); a new raised hand also shows a "wants to join" snack bar; a viewer's profile card (from chat or the viewer list) has "Invite on stage" in its "..." menu. Tapping a guest's tile - for everyone, host included - opens that guest's profile card, whose menu has Mute their mic / Let them unmute and Remove from stage for whoever holds those (docs/features/moderators.md, client feedback 2026-09-29).
- **Answering a raised hand** (redesigned, client feedback 2026-09-29): `GuestRequestCard` on the stage shows the oldest hand - their picture with a gold raised-hand mark, name, "Wants to join the stage" ("The stage is full" in amber when it is), and a "+N" chip when more are waiting - over a full-width **Decline** (outlined) / **Accept** (filled, brand) pair, so both are clear, equal, thumb-sized targets however narrow the space the guests' column leaves. The card and the chip open the manager. `GuestRequestActions` (`guest_buttons.dart`) is that pair, shared with the manager's rows (labels only there, so the name keeps the room); while an answer is on its way a spinner holds their exact place (an invisible copy keeps the size), and Accept greys out on a full stage.
- **Viewer** (`ViewerScreen`): the rail's hand button asks to join (camera and microphone permission is asked first, so an acceptance can go live at once), lowers a pending hand, or answers an invite (`showStageInviteSheet`, also shown when joining with a pending invite - swiping it away keeps the invite open). Moderators holding `MANAGE_GUEST_REQUESTS` or `REMOVE_GUESTS` get the same Guests button as the host.
- **Going on stage**: on `GuestRequestAccepted` (only on the device that raised the hand or accepted the invite - one account, one media identity per room) the viewer connection is released and a `HostVideoSession` publishes with the fresh credentials, receiving the host and the other guests; the guest gets mic, camera, flip and "Leave stage". **A guest comes on heard, with the camera off** (client feedback, 2026-09-29 - first both off, then the mic on by default): `startPreview(camera: false)` + `publish(credentials, camera: false, microphone: true)` opens and sends only the mic - no camera light - and a snack bar says the mic is on and to turn the camera on when ready; their tile shows their picture meanwhile. Agora turns local video off and mutes it before joining the channel (so everyone sees the camera off from the start) and starts the preview the first time the camera is turned on; LiveKit publishes no camera track until `setMedia` opens and publishes it. Others' apps read "doesn't publish a camera" as camera off (LiveKit `_LiveKitRemotes.noteJoined` on `ParticipantConnectedEvent`, `TrackUnpublishedEvent`). A mic lock that's already there on arrival turns it straight off (`_enforceMicLock` on publishing). Coming off (leave, `SelfRemovedFromStage`, or the stage connection dropping) releases it, calls `POST /streams/:id/join` for a fresh audience token and rebuilds the viewer connection - the room, chat and likes carry on. Transitions run one at a time. A seat held without the acceptance ever arriving (offline at that moment) is given back after 3 s. Leaving the live while on stage asks first and gives up the seat; leaving with a hand up lowers it. While on stage, the feed of lives doesn't swipe, and no other live opens on top - from a notification or a link either (`broadcastingProvider`, docs/features/streams.md).
- **Notifications**: a `GUEST_INVITE` tap opens the live, which then shows the invite. The in-app banner stays quiet about the live already open (its own prompt handles it).
- **Mic lock**: `Guest.micLocked` (from `micForceMuted`), `LiveGuestsController.setMicLocked` (optimistic, put back on refusal), `canLockMics`/`canManageGuests`, `selfMicLocked`; `LiveRoom` turns the events into `SelfMicForceMuted`/`GuestMicLockChanged`. The guest manager sheet has a mic toggle and Remove per guest - where `ModerationPolicy` allows it: a moderator never gets them on another moderator (badged MOD there), and the server refuses it anyway (docs/features/moderators.md). On the guest's own device `ViewerScreen` turns the mic off and refuses to turn it back on while locked ("…once the host allows it") - except for a moderator, whose mic button lifts the lock first (`_liftOwnMicLock`: `setMicLocked(self, locked: false)`, then the mic on). `MicLockMonitor` gives a locked guest's app 5 s to comply; after that, audio still arriving flags them - a warning icon on their tile and "Still sending audio after being muted - remove them from the stage" in the sheet (which rebuilds on mic changes while open).

## How to add/modify/remove this feature

- New guest-request field: add to the `GuestRequest` model, migrate, thread through `GuestsService`/the relevant domain event payload.
- Change the cap: `MAX_ACTIVE_GUESTS` in `guests.service.ts`, and `kMaxGuests` in the app's `domain/guest.dart`.
- Change the cooldown length: the TTL passed to `redis.set(...)` in `GuestsService.remove()`.
- New capability gating a guest action: add to `ModeratorCapability` (`FORCE_MUTE_GUESTS` is used by the mic lock since Phase 7), check via `StreamsService`'s `canUseCapability()`.
- Change the tile layout: `guestColumnRects` in `apps/mobile/lib/features/live_stream/widgets/stage_guest_column.dart` (covered by `stage_guest_column_test.dart`), and where each layout puts the column - `_guestRects` in `live_stage.dart` (`live_stage_test.dart`'s "guests on stage" group).
- Removing this feature: backend - delete `apps/backend/src/guests`, the 9 routes + `InviteGuestDto` in `StreamsController`, the guest methods/`vacateGuestSeat` and `join()`'s guest fields in `StreamsService`, the `Guest*` domain events/payloads, the 6 `@OnEvent` relay handlers in `RealtimeGateway`, `NotificationsService.onGuestRequestCreated`, `GuestsModule` from `app.module.ts`, and the `GuestRequest`/`StreamGuest` models + enums (new migration). Mobile - delete `lib/features/guests`, the guest events in `LiveRoom`, `LiveStage.tiles`, and the guest wiring in both live screens (the `RemoteVideoReceiver` API can stay).

## Tests

- `apps/backend/src/guests/guests.service.spec.ts` - every `GuestsService` method (request/invite validation, listPending filtering, findOwnPending, activeGuests' Agora uids, accept/reject, cancel authorization by `initiatedBy`, remove idempotency + cooldown gating, bulk end-of-stream cleanup).
- `apps/backend/src/streams/streams.service.spec.ts` - `describe('guest management (plan §6.5/§6.6)', ...)` covers all the `StreamsService` guest methods, the `MAX_ACTIVE_GUESTS` cap, capability/authorization checks, revoke-before-free ordering, never revoking a plain viewer, `join()`'s guest fields and stale-seat cleanup, and the `endStream()` cascade.
- `apps/backend/src/common/video-provider/agora-video-provider.service.spec.ts` - `agoraUidFor` determinism/never-zero/fits-in-uint32, and `mintToken()` returning a stable per-user `uid`.
- `apps/backend/src/realtime/realtime.gateway.spec.ts` - `describe('guest management')`: who receives each of the 6 relays, including `you_were_removed` only for a removal.
- `apps/backend/src/notifications/notifications.service.spec.ts` - `GUEST_INVITE` for a host's invite, nothing for a viewer's own raised hand.
- Mobile: `live_guests_controller_test.dart` (stage order, refresh merge, invites, raised hands, answering, capabilities, cap; "mic lock": optimistic lock with rollback, the private notice and room audio state, a lock set while offline, `FORCE_MUTE_GUESTS`), `mic_lock_monitor_test.dart` (the 5 s grace on fake time), `live_room_test.dart` groups `guests` and `mute suite`, `guests_repository_test.dart` (exact method + path per call, `micForceMuted`), `stage_grid_test.dart`, `live_stage_test.dart` group `guests on stage` (grid placement; the host's and each guest's element survive guests coming and going), `stream_join_result_test.dart`, `video_credentials_test.dart` (Agora `uid`).
- Backend (Phase 7): `guests.service.spec.ts` `setMicForceMuted` (locks and announces, quiet no-op, 404 off stage), `streams.service.spec.ts` "guest mic mute", `realtime.gateway.spec.ts` "mute suite".
- Not unit-tested: the stage transitions in `ViewerScreen` (they drive the real Agora/LiveKit SDKs) - verify on two devices.
