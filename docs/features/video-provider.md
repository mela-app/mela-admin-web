# Video provider (`VideoProvider`: Agora + self-hosted LiveKit)

**Location**: `apps/backend/src/common/video-provider`, `apps/mobile/lib/features/live_stream/video`, `infra/livekit`
**Plan reference**: plan §3.1, §4.1, §7
**Depends on**: `@nestjs/config` (`VIDEO_PROVIDER`, `AGORA_*`, `LIVEKIT_*`), `agora-token`, `livekit-server-sdk`
**Depended on by**: `streams` (opens/closes channels, mints publisher/audience tokens, feeds the pre-live preview config; `closeChannel` also runs when an administrator locks a live)

## What it does

Two media vendors are wired up side by side, and either one can carry a live:

- **Agora** (managed, pay-per-minute) - `AgoraVideoProvider`.
- **LiveKit** (open source, self-hosted on our own server) - `LiveKitVideoProvider`.

`VIDEO_PROVIDER` (`agora` | `livekit`, default `agora`) decides where **new** lives go until a super admin switches it from the console's **Video** page (below); the console's choice is saved in `video_settings` and wins over `.env` from then on. Each stream stores the vendor it started on (`streams.videoProvider`), and joins/ends always use that one - so a switch never cuts off a live that's already running. The backend refuses to start if `VIDEO_PROVIDER` is unknown, or is `livekit` without `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

Everything goes through the `VideoProvider` interface via `VideoProviderRegistry` (`active()` for new lives, `get(kind)` for existing ones) - no other module imports a vendor SDK:

| Method | Agora | LiveKit |
| --- | --- | --- |
| `getClientConfig()` (`GET /v1/streams/config`) | `{provider: 'AGORA', appId}` | `{provider: 'LIVEKIT'}` |
| `openChannel()` - before the stream row is written | no-op | `createRoom` (empty timeout 5 min, departure timeout 90 s = the plan's host-reconnect window, §6.1) |
| `mintToken()` -> `rtcToken` in go-live/join responses | `{provider, appId, token, expiresAt}`, 4 h | `{provider, url, token, expiresAt}`, 15 min |
| `revokeToken()` | logs only | `removeParticipant` |
| `closeChannel()` - on stream end, not awaited | no-op | `deleteRoom` |

LiveKit token grants enforce plan §5's "only the host (or a promoted guest) can publish" on the server: the host may publish **camera and microphone only** (no screen share); viewers get `canPublish: false` and `hidden: true` (not listed as room participants - viewer counts come from Socket.IO, and it spares everyone an event per viewer join/leave). Nobody may publish data messages - chat stays on Socket.IO, where moderation runs. The server runs with `room.auto_create: false`, so a room only exists between go-live and end: a leftover token can't reopen an ended live. The server refreshes a connected client's token by itself, so the 15-minute TTL only has to cover minting-to-connecting - and it caps how long a removed user's token stays usable (self-hosted LiveKit keeps no revocation list; bans must also be checked where tokens are minted). An unreachable LiveKit server turns into a `503` ("Live video is unavailable right now") on go-live/join instead of a stream row nobody can join; ending a stream never waits on it.

**Agora details**: `mintToken()` mints a real RTC token via `RtcTokenBuilder.buildTokenWithUid` once `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` are set - both must be the exact 32-character hex strings from the Agora console; the builder silently returns `''` for malformed values, so `buildRealToken()` throws a clear error instead. Since Phase 6 every token is bound to a deterministic per-user uid, `agoraUidFor(userId)` (a SHA-256-based positive 31-bit int, never `0`), returned as `rtcToken.uid`: with guests a channel has several publishers, and Agora's callbacks only carry a uid, so every client must be able to tell whose video is whose. The app joins with exactly that uid (a token bound to one uid rejects any other); `POST /streams/:id/join` also returns `hostAgoraUid`, and the guest list carries each guest's `agoraUid`. An `rtcToken` without `uid` (an older backend, whose tokens were minted for `0`) makes the app join with `0` and treat the first publisher as the host, as before. With either value unset it falls back to a locally signed placeholder token so the backend still runs end to end (it just won't work against real Agora).

### Mobile

`video/video_session.dart` defines `HostVideoSession` / `ViewerVideoSession`; `agora_video_session.dart` and `livekit_video_session.dart` implement them, and `createHostVideoSession()` / `createViewerVideoSession()` pick one from the provider. The go-live screen asks `GET /streams/config` which camera engine to open for the preview; the viewer screen follows the `rtcToken.provider` of the live it joins. Both SDKs ship in the app (switching needs no app update).

- **Other publishers** (guests, docs/features/guests.md): both session types implement `RemoteVideoReceiver` - `addRemote(userId, agoraUid:, prominent:)` / `removeRemote` / `hasRemoteVideo` / `isRemoteCameraOn` / `isRemoteMicOn` / `buildRemoteVideo`. The host's session receives its guests; a guest broadcasts through a `HostVideoSession` of their own and receives the host (`prominent`) and the other guests through it. LiveKit keys everything by identity (= userId) and picks up tracks that arrived before `addRemote`; Agora maps its raw uids to userIds. Agora's custom 320x180/15 fps/200 kbps low stream replaces its SDK default of 160x120 at 5 fps; receivers use the low layer for small tiles and full quality only for `prominent`. LiveKit adaptive stream (on viewers and, since Phase 6, on the host's room too) sizes each subscription to tile size and visibility.

- **Publisher profile**: both providers capture at 640x360/15 fps. Agora's low layer is 320x180/15 fps/150 kbps, and its encoder keeps the frame rate and lowers resolution when the uplink drops (`DegradationPreference.maintainFramerate` - a softer picture that keeps moving reads better than a sharp one that stutters). LiveKit follows the host's **Live quality** (Settings in the live studio): Standard sends 360p at 400 kbps with simulcast layers 144p/90 kbps and 270p/230 kbps; Data saver 216p at 220 kbps with the 144p layer; HD 540p at 900 kbps with 180p and 360p layers. A viewer on weak data drops to a lower layer instead of freezing, down to 144p at 90 kbps (2026-10-22: the old single 180p/150 kbps layer was too far below 360p and still too heavy for the weakest links). Agora leaves the main encoder bitrate to the SDK so it can adapt to the uplink; Live quality applies to LiveKit only. Agora dual stream and LiveKit simulcast/dynacast provide lower layers; LiveKit adaptive stream also matches subscribed layers to tile size and visibility. Actual delivered quality depends on device, uplink, server capacity and viewer downlink.
- **Unstable-internet badge**: the mobile app and browser player use each provider's local receive/send quality signals. Agora's periodic quality reports use brief hysteresis; LiveKit follows its poor/good quality transitions. Reconnecting, Agora audio-only fallback, and LiveKit pausing the host video for a weak viewer downlink show it immediately. Audio continues when the SDK can preserve it.
- **LiveKit camera flip**: before going live the preview track is replaced (LiveKit's `setCameraPosition` needs a published track); once live it's restarted in place. Camera steps (preview, flip, resume, release) run one at a time; flips are blocked while connecting.
- **LiveKit camera after backgrounding**: Android takes the camera from a backgrounded app and `flutter_webrtc` never reopens it, so the go-live screen calls `resumeCamera()` on resume (iOS and Agora recover by themselves). The display is kept on while a live screen is open (`core/keep_screen_on.dart`, `wakelock_plus`), so an auto-lock doesn't do this mid-live.
- **Pause** (`setPaused`, docs/features/realtime.md): the host's pause turns capture off, not just sending - LiveKit `mute()`s both tracks (which stops them) and `unmute()` restarts them; Agora `enableLocalVideo`/`enableLocalAudio(false)` plus `muteLocal*Stream`. A paused LiveKit camera is never reopened by a flip or a return from the background - resuming restarts it. A viewer's pause stops everyone's media reaching them, guests included: LiveKit unsubscribes from every participant's tracks (an explicit `disable()` would override adaptive stream for good), Agora `muteAllRemote*Streams`.
- **LiveKit capture rate**: `flutter_webrtc` on Android only reads a plain `frameRate` number, not LiveKit's `{max: 15}`, so the camera ran at 30 fps for a 15 fps stream; the session's camera options send `15`.
- **LiveKit errors**: `liveKitFailure()` words SDK failures for people (offline, can't connect, camera/mic busy) instead of "Something went wrong". A failed go-live also ends the stream it created, so no LIVE row is left without a broadcast.
- **Camera zoom**: host pinch and stop controls use the active camera's supported range - the front camera too (it used to be held at 1x, while most hosts stream from it), up to 4x there and 10x on the back camera, past which a 360p live only shows a softer crop. A camera that restarts (turned off and on, a pause, back from the background) gets the host's zoom back instead of reopening at 1x behind a screen still showing the old value. **Tap to focus keeps the zoom** (Android): flutter_webrtc's `setFocusPoint`/`setExposurePoint` each replace the camera's request with one carrying no zoom, so any tap on the preview jumped the camera back to 1x; `CameraZoom.setFocusPoint` (`MainActivity.kt`) sends focus and exposure for the tapped spot together with the zoom in one request (every zoom request keeps the focus spot too), for 5 seconds, then focus goes back to the whole picture. The tap is mapped through the cropped or letterboxed preview, the mirroring and the sensor's rotation (`framePoint`, `toSensorPoint`); a ring shows where. iOS keeps flutter_webrtc's focus, which doesn't touch zoom. Many cameras cannot reach the full range; below 1x requires a logical multi-lens camera or an available wider lens. Digital zoom crops the image and can reduce detail. Pinch writes are serialized and coalesced to at most 30 updates per second. Physical lens changes depend on device behavior and can briefly interrupt the image.
- **Connection loss**: the vendor reconnects by itself first (LiveKit for about 45 s, Agora for up to 20 minutes). If it gives up, the app recovers on its own (`video/media_recovery.dart`, below) - the host keeps their camera preview throughout; a viewer is sent to the ended screen only when the room was deleted (live ended).
- **Ending a live**: the host leaves the room *before* calling `POST /streams/:id/end` - if the server deletes the room while `Room.disconnect()` is running, the LiveKit SDK can miss its disconnect event, stall 10 s and throw (the app froze under the debugger). Session `release()` never throws: it caps the disconnect at 2 s and always frees camera, mic and renderer.
- **LiveKit video view**: `VideoTrackRenderer` gets a renderer the session initialized up front (`cachedRenderer`); left to itself it initializes in `build()`, and a rebuild mid-initialize throws.
- **Audio**: LiveKit's automatic audio session is left on (on iOS it picks the audio category from whether the mic is in use; on Android both roles get call-style audio). Worth revisiting with guests (Phase 6).

## Weak networks (client feedback, 2026-10)

Hosts and viewers on weak mobile data saw lives freeze, and a longer dropout ended the host's broadcast for good. What handles it now:

- **A playout buffer for smooth playback** (LiveKit): `openChannel()` creates each room with `minPlayoutDelay` 400 ms / `maxPlayoutDelay` 2000 ms and `syncStreams` - LiveKit's own preset for one-way broadcasts. Receivers hold video at least 400 ms (growing up to 2 s when the network gets worse), which rides out jitter and gives lost packets time to be resent instead of freezing the picture; `syncStreams` keeps the sound with it (without it, LiveKit plays each track on its own and the picture would trail the voice). It's room-wide - the host and guests watching each other get it too (their talk to each other is up to ~0.4 s later). Tunable per server without an app release: `LIVEKIT_MIN_PLAYOUT_DELAY_MS` / `LIVEKIT_MAX_PLAYOUT_DELAY_MS` in the API's `.env` (blank: 400 / 2000; `MIN=0` turns it off), applied to lives started afterwards. Verify on a phone with LiveKit's receiver stats (`jitterBufferDelay` / `jitterBufferEmittedCount`).
- **Plain viewers on Agora** join at `audienceLatencyLevelLowLatency` (app and web player) instead of the default ultra-low: a deeper buffer, about 1-2 s behind, the same trade. Agora bills that level at its lower audience rate. The host and guests on stage stay real time.
- **Agora's live-show tuning**: both sessions call `setVideoScenario(applicationScenarioLiveshow)` - faster first frame (instant rendering) and better picture and smoothness on weak networks and low-end phones, per the SDK.
- **Recovering a dropped connection** (`MediaRecovery`, `video/media_recovery.dart`): when the vendor gives up (`onConnectionLost` / `VideoEndReason.connectionLost`), the app fetches fresh credentials and connects again - at once, then after 1, 2, 4 and 8 s, then every 8 s - until it works, the server answers 404 (live over) or 403 (no longer allowed), or 3 minutes pass. The live itself stays on throughout: the server ends a live only when the host's realtime heartbeats stop.
  - **Host**: `POST /v1/streams/:id/publisher-token` (host, or a guest on stage; 30 a minute) mints a fresh publisher token for the running live, and `HostVideoSession.reconnect()` goes back on air - LiveKit in a fresh room with the same camera and microphone tracks (what was off or paused stays off; turning it on publishes it), Agora by `renewToken` while still in the channel or a rejoin after it failed. The host sees "Connection dropped - getting you back on air", and after giving up a "tap to try again" note instead of "end the stream and go live again".
  - **Agora tokens** last 4 hours: `onTokenPrivilegeWillExpire` takes the same path, so a longer live renews its token in place.
  - **Guest on stage**: the same endpoint and `reconnect()`, keeping the seat; after a minute without success (or a 403 - removed meanwhile) back to watching, as before.
  - **Viewer**: joins again (`POST /streams/:id/join`) with a new session, keeping their own pause; the stage says "Reconnecting…", chat carries on. After 3 minutes: "Connection lost", as before.
  - **Web player**: `useLive` starts over by itself after 1, 2, 4, 8, 15 and 15 s ("Reconnecting…") before showing the Reconnect button; a reload that fails meanwhile is retried the same way instead of showing the error page.

Not done yet, worth it next: per-viewer quality reports (freezes, packet loss, round-trip time, whether ICE fell back to TCP) to see where the problems are; TURN/TLS on 443 for viewers on networks that block UDP (commented block in `livekit.yaml`); LiveKit's Prometheus metrics to watch the server's bandwidth and CPU.

## Switching providers (console: System > Video, 2026-10)

Agora gives 10,000 free participant-minutes a month; LiveKit runs on our own server with no per-minute charge. The **Video** page (`/video`, super admins only - like Data, not a permission a moderator can be given) lets staff use the free minutes and move to LiveKit before paying:

- **Provider**: which one new lives start on, each provider's lives running now, and whether it's set up (its keys are in the API's `.env`; one that isn't can't be picked). **Switch to …** asks for confirmation and an optional reason, and says how many lives stay on the old provider.
- **What a switch does**: `VideoControlService.switchTo()` saves `video_settings.activeProvider`, records a `video_provider_switches` row and an audit entry (`video.provider_switched`), and sets `VideoProviderRegistry.setActive()`. Other API instances follow within 15 s (`VideoControlJobs.sync`). **Running lives are untouched**: they keep their stream's provider until they end, and viewers always join the provider of the live they open. A host with the preview already open when the switch happens is moved at **Go LIVE**: `goLive` returns the other provider's credentials, the app restarts the camera on it and shows "Mela switched video service for new lives…". Keep both providers' keys set while any live on the old one may still be running.
- **Agora free minutes - Agora's own numbers** (`AgoraUsageClient`): with `AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET` set (Agora console > RESTful API > Add a secret), the API fetches Agora's usage report every 30 minutes (`VideoControlJobs.agoraReport`, one instance at a time) and on the page's **Refresh from Agora**: `GET https://api.agora.io/dev/v1/projects`, then `GET /dev/v3/usage?project_id=…&from_date=<1st of the month>&to_date=<today>&business=default` for each project. The free minutes are the **account's**, so every project's audio and video seconds (`durationAudioAll`, `durationVideoHd`, `…Hdp`, `…1080P`, `…2K`, `…4K`) are added up per UTC day and saved in `video_usage_days.reportedMinutes`. A failed fetch (wrong secret, Agora down) is shown on the page and logged; nothing else stops.
- **Today - Mela's count**: Agora reports a day after it ends, so for days it hasn't finished Mela counts itself, once a minute (`VideoControlJobs.meter`; a Redis key per minute, `SET NX`, so several instances count it once): host + guests on stage + viewers of every LIVE Agora live, added to that day's `countedMinutes`. A day's figure from Agora counts as final once it was fetched at least 6 hours after the day ended; before that the day uses the higher of Mela's count and Agora's partial figure (`periodUsage()` in `video-quota.ts`). Used = Agora's final days + those pending days; the page shows both parts ("From Agora's report (up to <day>)" and "Not reported by Agora yet"). Without the Customer ID/Secret everything is Mela's count, and the page says so.
- **The period** is the calendar month (UTC): Agora clears unused free minutes at the end of each month. The page shows free / used / remaining, a bar, minutes used per minute right now, when they restart (with a countdown) and - when the current pace would use them up before that - when they run out. It refreshes every 30 s.
- **Settings** (`video.settings_changed`): free minutes a month (10,000), and the **automatic switch**: when fewer than N minutes (500) are left, new lives move to LiveKit by themselves (recorded as "Automatic" in the history and the audit log); with **Back to Agora when the free minutes restart on the 1st**, the first minute of the new month moves them back - only after an automatic switch, never after a manual one.
- **API**: `GET /admin/video` (overview), `POST /admin/video/switch` `{provider, reason?}`, `PATCH /admin/video/settings`, `POST /admin/video/agora-report` (fetch Agora's report now) - all `@SuperAdminOnly()`.

Without the console, `VIDEO_PROVIDER` still sets the default for a fresh database (no `video_settings` row yet).

## Local development

`docker compose up -d` also starts a LiveKit dev server (`infra/livekit/livekit.dev.yaml`: rooms not auto-created, same as production; dev-only key pair matching `apps/backend/.env.example`). It advertises `127.0.0.1`: the iOS Simulator reaches it directly, and a USB phone needs `adb reverse tcp:7880 tcp:7880` and `adb reverse tcp:7881 tcp:7881` next to the backend's `tcp:3000` (the VS Code launch configs run all three). On a Wi-Fi network without client isolation the phone may also use UDP to the PC's LAN address directly. To try it: `VIDEO_PROVIDER=livekit` in `apps/backend/.env`, restart the backend. **The phone must be on a network** (Wi-Fi or mobile data) even though everything goes through USB: the LiveKit SDK refuses to connect when Android reports none ("You're offline..."), while plain HTTP to the backend still works.

With a single phone, `node apps/backend/scripts/livekit-fake-host.js` stands in for a host: it goes live as a throwaway user and publishes LiveKit's demo video loop as that host (via the `livekit/livekit-cli` image, inside the dev container's network), so the phone can test the viewer side; Enter switches the layout, `q` ends the live. To check what a broadcast from the phone delivers, join its room as a CLI viewer: `lk room join --identity cli-viewer --auto-subscribe <room>` (room names come from `lk room list`), where `lk` is `docker run --rm --network "container:$(docker compose ps -q livekit)" -e LIVEKIT_URL=ws://127.0.0.1:7880 -e LIVEKIT_API_KEY=devkey -e LIVEKIT_API_SECRET=devsecret-for-local-development-only livekit/livekit-cli:v2.18.8`.

## Self-hosting LiveKit (production)

LiveKit is shared infrastructure on the VPS, not part of the API: it runs from `/usr/src/apps/infra/livekit`, whose files are `infra/livekit/` in mela-backend (see [docs/deployment.md](../deployment.md)). Its config is `infra/livekit/livekit.yaml`, its keys `infra/livekit/.env`. The same folder is what you copy to a server of its own, if LiveKit is ever moved off the VPS.

1. **DNS**: point a subdomain, e.g. `livekit.example.com`, at the server.
2. **Firewall**: open `80/tcp` + `443/tcp` (reverse proxy), `7881/tcp` (media over TCP) and `50000-60000/udp` (media). With ufw: `sudo ufw allow 80,443,7881/tcp && sudo ufw allow 50000:60000/udp`. Cloud providers usually also have a firewall/security group in their console - open the same ports there.
3. **Keys**: `docker run --rm livekit/livekit-server:v1.13.7 generate-keys`, then put the pair in `LIVEKIT_KEYS="<api-key>: <api-secret>"` in `infra/livekit/.env` (from its `.env.example`) and the same two values in the API's `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`. Never commit either file.
4. **Start**: `docker compose up -d` in `/usr/src/apps/infra/livekit`. It uses host networking (LiveKit's recommended setup - WebRTC needs the real UDP ports and public IP, found via STUN); signaling listens on `127.0.0.1:7880` only. That is also why the API reaches it at `http://host.docker.internal:7880` (`LIVEKIT_API_URL`) rather than by container name.
5. **TLS**: LiveKit needs `wss://` with a certificate from a trusted CA (self-signed doesn't work). Proxy the subdomain to `127.0.0.1:7880` from the reverse proxy on that server. Caddy (automatic HTTPS, WebSockets work as-is):
   ```
   livekit.example.com {
       reverse_proxy 127.0.0.1:7880
   }
   ```
   nginx (certificate from certbot):
   ```nginx
   server {
       listen 443 ssl;
       server_name livekit.example.com;
       ssl_certificate     /etc/letsencrypt/live/livekit.example.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/livekit.example.com/privkey.pem;
       location / {
           proxy_pass http://127.0.0.1:7880;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_read_timeout 86400s;
       }
   }
   ```
   Check: `curl https://livekit.example.com` answers `OK`.
6. **Backend `.env`**: `VIDEO_PROVIDER=livekit`, `LIVEKIT_URL=wss://livekit.example.com`, `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` = the pair from step 3. Optional `LIVEKIT_API_URL=http://127.0.0.1:7880` lets the backend skip the proxy - only when the backend runs directly on the host (from inside a container, 127.0.0.1 is the container itself; leave it empty then).

**Capacity**: cost is the server's bandwidth - roughly 0.65 Mbit/s per viewer at our profile (~290 MB per viewer-hour, less for viewers on smaller simulcast layers). CPU and bandwidth are the limits; LiveKit recommends compute-optimized instances.

**Optional next steps**: TURN/TLS on 443 for viewers behind firewalls that only allow HTTPS (needs its own subdomain + certificate - commented block in `livekit.yaml`); `redis:` in `livekit.yaml` to run several LiveKit nodes; webhooks (`participant_left`, `room_finished`) to feed host liveness (Phase 1.5 realtime work).

**Upgrading**: change the `livekit/livekit-server` tag in `infra/livekit/docker-compose.yml` (and the root `docker-compose.yml` for dev), then `docker compose up -d`. Releases: https://github.com/livekit/livekit/releases

## How to add to this feature

- **A third vendor**: add its value to the Prisma `VideoProviderKind` enum (+ migration), implement `VideoProvider`, register it in `video-provider.module.ts` and `VideoProviderRegistry`, then add the mobile side: a `VideoCredentials` subclass, `HostVideoSession`/`ViewerVideoSession` implementations and a case in each `create*VideoSession()`. Older apps reject an unknown `provider` with a clear error rather than joining the wrong vendor.
- **Guests (Phase 6)**: on LiveKit, promote a viewer with `updateParticipant(..., {permission: {canPublish: true, hidden: false, canPublishSources: [...]}})`; demoting unpublishes their tracks automatically.

## How to modify this feature

- Token TTLs: `DEFAULT_TTL_SECONDS` in each provider; `ttlSeconds` per call overrides.
- LiveKit room timeouts: `EMPTY_TIMEOUT_SECONDS` / `DEPARTURE_TIMEOUT_SECONDS` in `livekit-video-provider.service.ts`.
- Video profile: `_videoEncoding` / `_cameraOptions` in `livekit_video_session.dart` and the encoder config in `agora_video_session.dart` - keep them equal so switching vendors doesn't change quality or data use.

## How to remove this feature

Not expected to be removed as a whole. To drop one vendor: make sure no live on it is still running, remove its class from `video-provider.module.ts` / `VideoProviderRegistry`, and its session file, `create*VideoSession()` case and package on mobile. Keep the enum value while old stream rows use it.

## Tests

Backend: `agora-video-provider.service.spec.ts` (channel naming, placeholder vs real tokens, preview config, no-op channel lifecycle); `livekit-video-provider.service.spec.ts` (exact host/viewer grants decoded from real tokens, 15-minute expiry, room timeouts, 503 when unreachable/unconfigured, idempotent close/remove, URL validation); `video-provider.registry.spec.ts` (default, case-insensitive switch, old lives keep their vendor, fail-fast config, `setActive` refusing an unconfigured provider); `video-control.service.spec.ts` (quota periods and run-out time, switching, once-a-minute metering, automatic switch both ways, Agora's report saved per day and its failures, following another instance, Agora's final days vs Mela's count); `agora-usage.client.spec.ts` (all projects summed per day, auth header, refused credentials, date formats). Console: `VideoPage.test.tsx` (quota and its two parts, warnings, switch confirmation, settings, Refresh from Agora, report missing or failing). Mobile: `video_credentials_test.dart` (both vendors, old backends without `provider`, unknown vendors) and `camera_zoom_test.dart` (exact channel arguments, fallbacks to 1x). Verified live against the dev server: rooms created with the right timeouts and deleted on end, and a phone publishing camera + mic (Samsung SM A566B).
