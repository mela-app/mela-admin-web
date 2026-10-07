# Notifications

**Location**: `apps/backend/src/notifications` (+ `common/push` for the vendor abstraction, `common/events/domain-events.ts` for the contracts) + mobile `lib/features/notifications`
**Plan reference**: plan §6.11
**Depends on**: `common/push` (which vendor sends), `social` (follower fan-out, block checks), `@nestjs/bullmq`/`bullmq` (the push queue)
**Depended on by**: nothing imports this module - it only *reacts* to domain events from `streams` (`stream.started`), `social` (`user.followed`), `moderators` (`moderator.granted`), and `share` (`stream.invite_sent`)

## What it does

One in-app row is **always** written (the inbox and bell badge are never
gated on push settings); a push is queued **separately** and sent if the
recipient allows that notification type. It is sent even when they have a
socket open: a phone keeps its socket for a while after the app goes to the
background, and skipping the push then meant friends missed "X is live"
(first friend test, 2026-09-28). While the app is in the foreground the
push isn't shown - the in-app banner covers it.

- **Types** (`NotificationType`, additive-only like the realtime event
  catalog): `STREAM_STARTED`, `NEW_FOLLOWER`, `STREAM_INVITE`,
  `MODERATOR_GRANTED`, `GUEST_INVITE` (a host's stage invite - emitted
  since Phase 6, `onGuestRequestCreated`; see docs/features/guests.md),
  and the security notices `PASSWORD_ADDED` / `PASSWORD_CHANGED`.
- **Security notices** (`onPasswordAdded` / `onPasswordChanged`, on
  `account.password_added` / `account.password_changed` - the app's
  password settings and the console's own change, see docs/features/auth.md):
  one row for the account itself, with no actor or stream, so a change
  nobody on the account made gets seen. They have **no setting**
  (`SETTING_KEY_BY_TYPE` maps them to `null`) and always push - though a
  change has already signed out the other devices (their push tokens went
  with their sessions), so those see it in the inbox once back in. The app
  shows a lock instead of an avatar and opens Settings > Password on a tap;
  a build from before them shows "You have a new notification".
- **Go-live fan-out** (`onStreamStarted`, `@OnEvent('stream.started')`,
  emitted by `StreamsService.goLive()`): a per-host 5-minute cooldown
  (`SET notif:golive:{hostId} NX EX 300` in Redis) means restarting a live
  after a crash doesn't notify followers twice, while going live again
  later does; then every follower with
  `notifyOnLive` on, minus anyone blocked either way, gets one row
  (chunked 1,000 at a time for a very-followed host).
- **New follower** (`onUserFollowed`, `@OnEvent('user.followed')`, emitted
  by `SocialService.follow()`): one row for the person being followed.
- **Moderator granted** (`onModeratorGranted`, `@OnEvent('moderator.granted')`,
  emitted by `ModeratorsService.grant()`): one row for the newly granted
  moderator, naming the stream (a grant is scoped to one stream - see
  docs/features/moderators.md).
- **Stream invite** (`onStreamInviteSent`, `@OnEvent('stream.invite_sent')`,
  emitted by `ShareService.sendInvites()` - see docs/features/share.md):
  `ShareService` has already filtered the recipient list down to friends,
  under the per-stream cap, and past the rate limit by the time this fires;
  this handler just fans the (already-valid) list out the same way as
  every other type.
- **Realtime**: after the DB row(s) exist, `NotificationsService` emits one
  `notification.created` domain event per recipient; `RealtimeGateway`
  relays it as `notification:new` (the notification, plus the actor's
  `{id, username, displayName, avatarUrl}` and the stream's title where
  relevant - already fetched by the handler for the push text, reused here
  instead of a second lookup, so a client can render "Kebede is live" or
  "Kebede started following you" immediately with no fetch-by-id round
  trip) **and** `notification:unread_count` `{delta: 1}` to that
  recipient's `user:{id}` room. The delta is deliberate, not a bug: a fresh
  notification is always unread, so incrementing a client's already-known
  count by one avoids an extra `COUNT` query per recipient on a fan-out
  that can reach hundreds of followers. `GET /me/notifications/unread-count`
  stays the source of truth a client re-syncs against on open/foreground.
  `GET /me/notifications` hydrates the same way (a Prisma `include`, read
  fresh at request time rather than denormalized onto the row, so a
  display-name change shows up immediately - not from the stored row).
- **Push**: every `fanOut()` call also enqueues one BullMQ job per
  recipient (queue `push`, 5 attempts, exponential backoff) unless that
  recipient turned this specific type off in `NotificationSettings`.
  `PushProcessor` (a `@Processor('push')` worker) runs each job: collects every
  `UserSession.pushToken` for that user and calls `PushProvider.send()`
  (data: `type`, and `streamId`/`actorId` for where a tap opens),
  pruning any token the vendor reports as permanently invalid. A token
  belongs to one session: registering it moves it off any other session
  (someone else signed in on the same phone before).
- **`PushProvider`** (`common/push`, mirrors `common/video-provider`'s
  `VideoProvider` abstraction): `NoopPushProvider` (default, `PUSH_PROVIDER`
  unset/`noop`) just logs.
  `FcmPushProvider` (`PUSH_PROVIDER=fcm`) sends through the real Firebase
  Admin SDK once `FIREBASE_SERVICE_ACCOUNT_JSON` (raw JSON or a path to the
  file) is set - constructing it without that throws at boot, same as
  `VIDEO_PROVIDER=livekit` without LiveKit credentials. Turning it on (Firebase
  project `live-game-de3d4`): Firebase console -> Project settings -> Service
  accounts -> Generate new private key, save it as
  `apps/backend/secrets/firebase-service-account.json` (gitignored, never in
  the image - compose mounts `secrets/` read-only at `/app/secrets`), then in
  `apps/backend/.env` set `PUSH_PROVIDER=fcm` and
  `FIREBASE_SERVICE_ACCOUNT_JSON=./secrets/firebase-service-account.json`, and
  restart the backend.
- **Endpoints**: `GET /me/notifications` (cursor, newest first),
  `GET /me/notifications/unread-count`, `POST /me/notifications/read`
  `{all} | {ids}`, `PUT/DELETE /me/push-token` (keyed off the calling
  request's own `sessionId`/`sid` JWT claim - one token per signed-in
  device, matching `UserSession`), `GET/PATCH /me/notification-settings`
  (per-type push booleans, defaulting to on - `NotificationSettings` is
  created lazily on first write).
- **Mobile** (`apps/mobile/lib/features/notifications`): no new socket - the
  app already keeps one persistent, app-wide Socket.IO connection for the
  whole signed-in session (`realtimeClientProvider`), and the backend
  already joins every socket to its `user:{id}` room unconditionally on
  connect (not just while watching a stream). `UnreadNotificationsController`
  (`application/notifications_controller.dart`) listens to that existing
  client's `messages` stream for `notification:unread_count` - but only
  re-fetches the authoritative count from `GET /me/notifications/unread-count`
  on the client's `connected` event, not unconditionally on first build: a
  live socket implies the token/session is already settled, so this never
  races the app's own boot-time token refresh (an earlier version fetched
  eagerly on build and intermittently raced a fresh sign-in's token check -
  caught by `widget_test.dart`'s session-end test, not by `flutter analyze`).
  `newNotificationProvider` is the same client's `notification:new` events,
  consumed by `NotificationBannerListener` (an in-app `SnackBar`, mounted
  once via `MaterialApp.router`'s `builder` - above the Router, so it
  navigates through `routerProvider`'s instance: `GoRouter.of(context)`
  throws there; fixed 2026-09-27, the "View" tap used it. It stays quiet
  about the live already on screen, which shows its own prompts, and clears
  after `NotificationBannerListener.visibleFor` (3 s, client feedback
  2026-09-29) - `persist: false`, since newer Flutter keeps a snack bar with
  an action up until it's dismissed). While this device broadcasts in a live
  (docs/features/streams.md), a live's banner has no View - it wouldn't open. `NotificationBell` (discovery's
  app bar) and `NotificationsScreen` (the inbox, grouped by day) are thin
  UI over `NotificationsRepository` + the two providers above.
  `NotificationSettingsScreen` exercises `GET/PATCH /me/notification-settings`,
  the settings row `PushProcessor` checks. `NotificationsScreen` marks
  everything read as soon as it opens (the badge clears; what was unread
  stays highlighted for that visit). **Push** (`PushNotificationsListener`,
  mounted in `main.dart`'s builder chain): while signed in it asks for the
  notification permission and registers the FCM token
  (`NotificationsRepository.setPushToken()`, again on each token refresh);
  signing out deletes the token. Tapping a push opens the live
  (`streamId`) or the person (`actorId`), from the background or from
  closed. Android: `google-services.json` in `android/app` (gitignored; the
  Google services Gradle plugin is applied only when it's there, so a build
  without it just has no push), channel `mela_activity` ("Lives and
  activity", high importance, created in `MainActivity`), the small icon
  `drawable-*/ic_notification.png` (generated by `branding/build.mjs`). iOS
  push (APNs key, `GoogleService-Info.plist`) isn't set up yet.

## How to add to this feature

1. **A new notification type**: add it to the Prisma `NotificationType`
   enum (+ migration) and to `SETTING_KEY_BY_TYPE` in
   `notifications.service.ts`; add its own boolean column to
   `NotificationSettings` (+ migration) and its default in `DEFAULT_SETTINGS`;
   emit a domain event from whichever module causes it and add an
   `@OnEvent` handler here that calls the private `fanOut()` helper - it
   already handles the DB row, the realtime nudge, and the push queue.
2. **A different push vendor**: implement `PushProvider` (`common/push`),
   register it in `push-provider.module.ts`'s factory alongside `noop`/`fcm`.

## How to modify this feature

The go-live cooldown window (`GOLIVE_COOLDOWN_SECONDS`, 5 minutes) and the
fan-out chunk size (`FOLLOWER_FANOUT_CHUNK_SIZE`, 1,000) are both constants
at the top of `notifications.service.ts`. Retry/backoff for a push job is
set where it's enqueued (`PushQueueService.enqueue()`), not in the
processor.

## How to remove this feature

Remove `NotificationsModule` from `app.module.ts` and the `BullModule.forRootAsync(...)`
registration if nothing else uses BullMQ. Every emitter (`StreamsService`,
`SocialService`, `ModeratorsService`, `ShareService`) keeps working
unmodified - they only ever emit a plain domain event and never import this
module, so there's nothing to unwind on that side. Mobile: the bell icon,
inbox screen, and in-app banner all become dead UI reaching a 404 - remove
them from `discovery_screen.dart`/the router.

## Tests

`notifications.service.spec.ts` covers: the go-live cooldown (blocks a
repeat, still fans out on a fresh window, skips entirely with no followers,
excludes blocked-either-way), one-row fan-outs for a new follower/moderator
grant/stream invite, that a recipient who turned a type off still gets the
in-app row and realtime nudge but no push job, inbox pagination, unread
count, mark-read (`all`, `ids`, and rejecting neither), push-token
set/clear (including the no-`sessionId` and unknown-session cases), and
settings (defaults, partial update). `share.service.spec.ts` covers the
invite path up to the domain event it hands off. `realtime.gateway.spec.ts`
covers the `notification:new`/`notification:unread_count` relay.
`streams.service.spec.ts` covers `goLive()` emitting
`stream.started` outside the response path.

Mobile: `notifications_repository_test.dart` covers every endpoint
(inbox + cursor, unread count, mark-read `all`/`ids`, `PUT/DELETE`
`/me/push-token`, settings get/patch) - this is also what caught a real bug
in `ApiClient`: its method-dispatch `switch` had no `'PUT'` case and
silently fell through to its `POST` default, so `setPushToken()` was
issuing the wrong HTTP verb entirely (the backend route only maps `PUT`) -
found by asserting the exact `request.method` the mock server received, not
just that the call succeeded. `app_notification_test.dart` covers
`NotificationType.fromWire` (including falling back to `unknown` for a type
name this build predates, rather than throwing) and both the REST (nested
`actor`/`stream`) and realtime (flat `actorId`/`streamId`) JSON shapes.
`deep_link_test.dart` covers `parseLiveDeepLink()` for both the custom
scheme and a real https link, percent-decoding, and non-matching links.
