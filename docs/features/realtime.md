# Realtime (Socket.IO gateway, live presence)

**Location**: `apps/backend/src/realtime` (gateway), `apps/backend/src/common/presence` (Redis presence), `apps/backend/src/streams/live-stream.sweeper.ts` (zombie-live sweeper); mobile `apps/mobile/lib/core/realtime` and `lib/features/live_stream/live_room.dart`
**Plan reference**: plan §6.1, §9, task-breakdown Phase 1.5 "Realtime foundation" (chat itself is Phase 2 - not here yet)
**Depends on**: `auth` (`JwtService`, `AuthService.isSessionActive`), `streams` (`StreamsService.findLive`), `common/presence`, `common/events`
**Depended on by**: `streams` reads viewer counts and host liveness from `common/presence` (not from this module); Phase 2 chat will extend this gateway rather than create a second one

## What it does

One Socket.IO gateway (`RealtimeGateway`), and one app-wide connection per signed-in device.

**Connection auth**: the REST access token goes in `handshake.auth.token`. A `server.use` middleware (registered in `afterInit`) verifies it *before* the connection is accepted, and also checks that its session (`sid`) is still active (`AuthService.isSessionActive`) - a logged-out or suspended device is refused even while its 15-minute access token is unexpired; tokens without a `sid` are refused. A refusal reaches the client as `connect_error` `{message: 'unauthorized'}`, which Socket.IO clients do **not** retry by themselves (see Mobile below). Every accepted socket joins its private `user:{id}` room. WebSocket CORS follows `CORS_ORIGIN`, like REST (`RealtimeIoAdapter`, set up in `main.ts`).

**Watch-only sockets** (the share page's web player, docs/features/share.md): instead of a token, `handshake.auth.watchTicket` - the ticket `POST /streams/:id/watch` hands out (`WatchTicketService`: one live, an anonymous `web-<uuid>` viewer id, 4 hours). Such a socket joins no `user:{id}` room, and a `socket.use` middleware lets exactly two events through - `stream:watch` and `stream:leave` - answering anything else `NOT_ALLOWED` without running it (deny by default: an event added to this gateway later is closed to it until it's listed in `WATCH_ONLY_EVENTS`). It still receives everything sent to its live's room. Signed in on the web, the player uses a normal token socket instead.

**Client → server** - every event is acknowledged with `{ok: true, ...}` or `{ok: false, error}`, `error` being `INVALID_PAYLOAD`, `STREAM_NOT_LIVE` or `NOT_HOST`; payloads are validated with the DTOs in `dto/stream-room.dto.ts`:

| Event | Payload | Answer | Notes |
|---|---|---|---|
| `stream:join` | `{streamId}` | `{ok, viewerCount, layout, hostAway, paused, likeCount, moderatorIds, chatMuted, chatMutedUntil, canRecord}` | The stream must be `LIVE`. One live per socket - joining B leaves A. The host watching from another device isn't counted. `moderatorIds`: who moderates the live (docs/features/moderators.md). `chatMuted`/`chatMutedUntil` are the joiner's own room chat mute (plan §6.7), and `canRecord` whether the host lets them record the live (docs/features/streams.md) - both resent on every rejoin so a reconnect catches up. |
| `stream:leave` | `{streamId}` | `{ok}` | Also done on disconnect. |
| `stream:watch` | `{streamId}` | `{ok, viewerCount, layout, hostAway, paused, likeCount, moderatorIds, messages}` | Watch-only sockets only, for the live their ticket names (`NOT_ALLOWED` otherwise; `STREAM_NOT_LIVE` once it's over). Joins the room and counts the viewer - with no arrival notice, and never in the viewer list (`LivePresenceService.viewerIds` leaves out `web-` ids). `messages`: the last 30 chat messages (`WATCH_CHAT_SNAPSHOT`), oldest first. |
| `stream:host_join` | `{streamId, away?, paused?}` | as `stream:join` | The live's host only. Counts as a heartbeat and restores the away and paused flags (a reconnecting app sends its current state; `paused` omitted leaves it as is). |
| `stream:host_heartbeat` | `{streamId}` | `{ok}` | Every 15 s. `STREAM_NOT_LIVE`: the live ended while the host was offline. `NOT_HOST`: this socket hasn't (re)joined as host. |
| `stream:host_away` | `{streamId, away}` | `{ok}` | The host's app left / came back to the foreground. Coming back counts as a heartbeat, and answers `STREAM_NOT_LIVE` if the live ended meanwhile. |
| `stream:host_pause` | `{streamId, paused}` | `{ok}` | The host paused or resumed the live. Counts as a heartbeat (re-armed with the paused grace window); `STREAM_NOT_LIVE` if the live ended meanwhile. |
| `guest:moving` | `{streamId, userId, placement}` | `{ok}` | Where a guest's tile is mid-drag (docs/features/guests.md). The socket must be in that live (`NOT_IN_ROOM`) and its user the host or an `ARRANGE_GUESTS` moderator (`NOT_ALLOWED`; checked once per 10 s). Nothing is stored. |

**Server → client**:

| Event | Payload | Sent to |
|---|---|---|
| `viewer_count_update` | `{streamId, count}` | the `stream:{id}` room, with a leading + trailing throttle (`VIEWER_COUNT_THROTTLE_MS`, 2 s): immediate if the room hasn't had one recently, otherwise exactly one trailing flush - bursts don't spam the room and the final count is never lost |
| `stream:layout_changed` | `{streamId, layout}` | the room - relayed from the `stream.layout_changed` domain event (docs/features/streams.md) |
| `viewer:joined` | `{streamId, user: {id, username, displayName, avatarUrl}, others}` | the room - someone's **first** connection in the live (`LivePresenceService.addViewer` says `arrived`; another device of theirs, or a reconnect while one is still in, doesn't count), and then at most once per person per `ARRIVAL_NOTICE_TTL_SECONDS` (10 min, a Redis `SET NX EX` - flaky connections and swiping back and forth aren't announced again). A burst becomes one notice at a time: a leading + trailing throttle (`ARRIVALS_THROTTLE_MS`, 1.5 s) sends the latest arrival, with `others` counting the rest - a busy live can't flood its room. The app shows "Kebede joined" / "Kebede and 3 others joined" under the chat for 3 s (`ArrivalNotice`), skipping the viewer themselves and anyone they've hidden. |
| `stream:moderators` | `{streamId, moderatorIds}` | the room, when the host appoints or removes a moderator (relayed from `moderator.granted`/`moderator.revoked`) - the whole list, so it's order-safe; what each may do stays on their own `moderator:*` events |
| `stream:host_status` | `{streamId, away}` | the room - only when the flag actually changes |
| `stream:paused` | `{streamId, paused}` | the room - only when the flag actually changes |
| `stream_ended` | `{streamId, reason}` | the room, which is then emptied - relayed from `stream.ended`; `reason` is `HOST_ENDED`, `HOST_DISCONNECTED`, `REPLACED` or `LOCKED` |
| `guest_request:new` | `{streamId, requestId, initiatedBy, user, recipientIds}` | each `user:{id}` in `recipientIds`: the host and `MANAGE_GUEST_REQUESTS` moderators for a raised hand, the invitee for a host's invite (docs/features/guests.md) |
| `guest_request:accepted` | `{streamId, requestId, userId, credentials}` | the new guest's `user:{id}` - `credentials` are their fresh publish token |
| `guest_request:rejected` | `{streamId, requestId, userId}` | the requester's `user:{id}` |
| `guest_request:cancelled` | `{streamId, requestId, initiatedBy, recipientIds}` | the same recipients as the original request/invite |
| `guest:joined` | `{streamId, user, agoraUid}` | the room |
| `guest:removed` | `{streamId, hostId, userId, wasRemovedByHostOrModerator}` | the room |
| `guest:placed` | `{streamId, userId, placement}` - `{x, y, size}`, or null for the automatic column (docs/features/guests.md) | the room |
| `guest:moving` | `{streamId, userId, placement}` - a tile mid-drag, at most every 100 ms per tile, latest only | the room except the dragging socket, volatile |
| `guest:spotlight` | `{streamId, userId}` - who fills the stage; null = the host again | the room |
| `you_were_removed` | `{streamId, hostId}` | the removed guest's `user:{id}` - only when the host or a moderator removed them |
| `chat:muted` | `{streamId, mutedUntil}` | the muted user's `user:{id}` only - the room never learns who is muted (plan §6.7); `mutedUntil` null = until the live ends |
| `chat:unmuted` | `{streamId}` | the same user's `user:{id}` |
| `recording:permission` | `{streamId, allowed}` | that viewer's `user:{id}` only - the host let them record the live, or took it back (docs/features/streams.md) |
| `force_mute_audio` | `{streamId}` | the guest's `user:{id}` - their app turns the mic off and keeps it off (docs/features/guests.md) |
| `presence:audio_state` | `{streamId, userId, forceMuted}` | the room - every tile shows the lock, or its lifting |
| `stream:locked` | `{streamId, reason}` | the room, just before its `stream_ended` (`reason: 'LOCKED'`) - an administrator stopped the live (docs/features/admin.md); the app's ended screen shows the reason |
| `stream:unlocked` | `{streamId}` | the host's `user:{id}` only - the live stays over, so its room is already empty |
| `admin:alert` | `{id, scope, streamId, message, severity, createdAt}` | one live's room (`STREAM`) or every connected socket (`GLOBAL`); shown as a banner over any screen |
| `message:new` | `{message, sender, recipient}` | both people's `user:{id}` - a direct message between friends (docs/features/messages.md); the sender's other devices get it too |
| `message:read` | `{readerId, partnerId, readAt}` | both people's `user:{id}` - the partner's app shows Seen, the reader's other devices clear the conversation |
| `message:unread_count` | `{count}` | the `user:{id}` whose unread total changed - the Inbox badge (a total, not a delta) |
| `app:update` | `{platform}` | every connected socket - an app update for that platform was published, edited or withdrawn; the app asks `GET /v1/app/update` again (docs/features/app-updates.md) |

The `user.suspended` and `user.sessions_revoked` events force-disconnect that user's sockets through `user:{id}`; their sessions were ended too, so the reconnect is refused. `RealtimeGateway.connectedCount(streamId?)` tells the console how many devices an alert would reach.

**Presence** (`LivePresenceService`, Redis; Lua scripts, so every change is atomic and idempotent per socket): `stream:{id}:viewer_sockets` (hash socketId → userId) and `stream:{id}:viewers` (hash userId → open sockets), so counts are **unique users** - two devices of one viewer count once; `stream:{id}:peak_viewers`; `stream:{id}:host_alive` (TTL `HOST_HEARTBEAT_TTL_SECONDS` = 90 s, or `PAUSED_HOST_TTL_SECONDS` = 10 min while paused - one Lua script picks it); `stream:{id}:host_away`; `stream:{id}:paused`. Ending a live persists `peakViewerCount` and deletes them all. Viewer keys are reset on boot, since socket ids from before a restart are dead (this assumes a single instance - see "How to modify").

**Zombie lives**: `LiveStreamSweeper` (`@nestjs/schedule`, every 30 s) calls `StreamsService.endAbandonedLives()`, which ends every `LIVE` stream older than the 90 s grace window whose `host_alive` key has expired, with `HOST_DISCONNECTED` - the same path as the host ending it (`stream.ended` → `stream_ended`, media room closed). A crashed, killed or long-offline host app leaves discovery within ~2 minutes. A host who backgrounds the app pauses their heartbeats (viewers see "The host stepped away") and gets the same window to come back.

**Pause**: the host can pause a live - their app turns the camera and microphone off (`HostVideoSession.setPaused`: LiveKit mutes and stops both tracks, Agora stops capture and sending), viewers see "Live paused", discovery shows the card as PAUSED (`paused` in `GET /streams` and `GET /streams/:id`), and the live and its timer go on. While paused, each heartbeat keeps the host alive for 10 minutes instead of 90 s, so a host who pauses to step away can leave the app for that long; past it the sweeper ends the live as `HOST_DISCONNECTED`. A viewer's own pause is local only (no server event): `ViewerVideoSession.setPaused` stops receiving everyone's media, guests included - LiveKit unsubscribes from every participant's tracks, Agora mutes all remote streams - which saves the data, and resuming rejoins the live as it is now (there's no rewinding a live). A paused viewer is still in the room and still counted; a guest on stage can't pause.

## Mobile (`lib/core/realtime`, `lib/features/live_stream/live_room.dart`)

- **`RealtimeClient`** (`realtimeClientProvider`): the app's one socket, created the first time a live screen needs it and open exactly while signed in (it follows `sessionControllerProvider`). `request(event, payload)` returns the ack body or throws `RealtimeRejected(code)` / `TimeoutException`; `messages` carries server events; `connected` fires on every (re)connect.
- **Auth on reconnect**: `OptionBuilder.setAuthFn` asks `ApiClient.validAccessToken()` before *every* connect, so a reconnect after the 15-minute token expired presents a renewed one. When the server refuses the handshake anyway - or hangs up on purpose (`io server disconnect`, e.g. a suspension), which Socket.IO doesn't retry either - the client renews the token (`ApiClient.renewAccessToken()`) and reopens, backing off while offline (0 s, 2 s, 4 s ... 30 s). A renewal that returns null means the session is over; the app is then already on its way to the login screen. Only a `connect_error` carrying the server's `message` is a refusal - a network failure (`{msg, desc, type: 'TransportError'}`) is retried by Socket.IO itself.
- **`SocketIoTransport`** is the only file touching `socket_io_client` (websocket only, its own manager via `forceNew`, auto-connect off). Tests replace it through the `RealtimeTransport` interface (`realtimeTransportProvider`).
- **Connection banner** (plan §7, Phase 7): `RealtimeClient.status`/`statusChanges` (`stopped` while signed out, `connecting`, `connected`) plus `deviceOfflineProvider` (`connectivity_plus`) feed `connectionIssueProvider` (`core/connectivity/connection_issue.dart`), which `ConnectionBanner` (`core/widgets/connection_banner.dart`, mounted once in `MaterialApp.router`'s `builder`) shows as a strip that pushes the app down rather than covering it: "No internet connection" after 1 s without a network, "Reconnecting…" after 3 s without the socket (a quick handover never flashes it); it hides the moment things recover, and a banner already up just changes its words. Signed out, only a missing network shows.
- **`LiveRoom.viewer` / `LiveRoom.host`**: one live's room on that connection. It (re)joins on every connect and emits `RoomSynced` with the full state, so whatever was missed offline - a layout switch, the host stepping away or pausing - is caught up; then `ViewerCountChanged`, `LayoutChanged`, `HostAwayChanged`, `PausedChanged`, and `RoomEnded(reason)`, once. A host room sends a heartbeat every 15 s, paused while `setAway(true)`, and `setPaused` sends `stream:host_pause` (and every rejoin re-sends the current pause state); `STREAM_NOT_LIVE` ends the room and `NOT_HOST` rejoins. An unanswered join is retried after 5 s.
- Both live screens start the connection as they open (in parallel with the video connect); they show the viewer count (the host also the live timer - viewers don't see how long it's been running, docs/features/streams.md), and switch to `LiveEndedView`, with the reason, when the room ends. The timer is `LiveBadge(clock:)`: `LiveClock` corrects the phone's clock by the server's (`serverTime` in the go-live response), so the duration is right even on a phone whose clock is off, and it keeps counting through sleep. `GoLiveScreen` calls `setAway` from its `AppLifecycleListener` (`onHide` / `onShow`).

## How to add to this feature

- **Chat (Phase 2)**: add `chat:send`/`chat:new` handlers to this gateway (same `stream:{id}` rooms, same ack shape), and on mobile a room class next to `LiveRoom` built on `RealtimeClient.request` / `messages`, rather than standing up a second socket.
- **A new relay**: an `@OnEvent(DomainEvents.X)` method here once the emitting module defines the event - same pattern as `handleStreamEnded` or Phase 8's `handleStreamLocked` - handled on mobile in `LiveRoom._onMessage` (or, for something shown on any screen like `admin:alert`, a controller listening to `RealtimeClient.messages`).
- **Something for one user** (guest invitations, notifications): emit to `user:{id}`.

## How to modify this feature

- Throttle window: `VIEWER_COUNT_THROTTLE_MS` (`realtime.gateway.ts`). Grace windows: `HOST_HEARTBEAT_TTL_SECONDS` and `PAUSED_HOST_TTL_SECONDS` (`live-presence.service.ts`) - keep the first several heartbeats (`LiveRoom.heartbeatInterval`, 15 s) long, and change `LiveRoom.pausedHostGrace` (the host's paused screen quotes it) with the second. Sweep period: `SWEEP_INTERVAL_MS` (`live-stream.sweeper.ts`).
- **More than one backend instance** needs the Socket.IO Redis adapter (`@socket.io/redis-adapter`) in `RealtimeIoAdapter`, and per-instance cleanup instead of the boot-time reset of viewer keys.

## How to remove this feature

Remove `RealtimeModule` from `app.module.ts` **and** `LiveStreamSweeper` from `StreamsModule` - without the gateway nobody records heartbeats, so the sweeper would end every live after 90 s. The mobile live screens would lose the counts, the timer's server sync, the away state and the ended screen.

## Tests

- Backend: `realtime.gateway.spec.ts` (handshake auth incl. ended sessions and watch tickets, join/leave and switching lives, the host not counted, host join/heartbeat/away/pause with the "ended meanwhile" answers, pause restored on rejoin before the heartbeat, relays, suspension disconnect, and watch-only sockets: the allowlist, the ticket's own live only, the chat snapshot), `live-presence.service.spec.ts` (incl. the paused grace window and anonymous viewers left out of the list), and the `endAbandonedLives` cases in `streams.service.spec.ts`.
- End to end: `node scripts/smoke-test-realtime.js` against a running dev server - refused handshakes (bad token, signed-out session), discovery ranked by viewers, unique-user counts, host join/heartbeat, away and pause relayed (and seen by a joining viewer and in discovery; viewers can't pause), `stream_ended` with its reason.
- Mobile: `test/realtime_client_test.dart` (open/close, refusal → renew → reconnect, signed out, backoff), `test/connection_issue_test.dart` (the status stream; the banner's delays, precedence and instant recovery on fake time) and `test/live_room_test.dart` (joins and resyncs, relays only its own live, ends once, heartbeats paused while away, pause sent once and restored on reconnect, "ended meanwhile", the mute-suite events), over the fake transport in `test/support/fake_realtime.dart`.
