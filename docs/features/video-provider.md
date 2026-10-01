# Video provider (`VideoProvider`: Agora + self-hosted LiveKit)

**Location**: `apps/backend/src/common/video-provider`, `apps/mobile/lib/features/live_stream/video`, `infra/livekit`
**Plan reference**: plan §3.1, §4.1, §7
**Depends on**: `@nestjs/config` (`VIDEO_PROVIDER`, `AGORA_*`, `LIVEKIT_*`), `agora-token`, `livekit-server-sdk`
**Depended on by**: `streams` (opens/closes channels, mints publisher/audience tokens, feeds the pre-live preview config; `closeChannel` also runs when an administrator locks a live)

## What it does

Two media vendors are wired up side by side, and either one can carry a live:

- **Agora** (managed, pay-per-minute) - `AgoraVideoProvider`.
- **LiveKit** (open source, self-hosted on our own server) - `LiveKitVideoProvider`.

`VIDEO_PROVIDER` (`agora` | `livekit`, default `agora`) decides where **new** lives go. Each stream stores the vendor it started on (`streams.videoProvider`), and joins/ends always use that one - so switching `VIDEO_PROVIDER` never cuts off a live that's already running. The backend refuses to start if `VIDEO_PROVIDER` is unknown, or is `livekit` without `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

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

- **Other publishers** (guests, docs/features/guests.md): both session types implement `RemoteVideoReceiver` - `addRemote(userId, agoraUid:, prominent:)` / `removeRemote` / `hasRemoteVideo` / `isRemoteCameraOn` / `isRemoteMicOn` / `buildRemoteVideo`. The host's session receives its guests; a guest broadcasts through a `HostVideoSession` of their own and receives the host (`prominent`) and the other guests through it. LiveKit keys everything by identity (= userId) and picks up tracks that arrived before `addRemote`; Agora maps its raw uids to userIds. Bandwidth: Agora publishers send a 320x180/15 fps/200 kbps low stream (Agora's default, 160x120 at 5 fps, is too rough for a tile), and receivers take the low stream for small tiles and the full one only for `prominent`; LiveKit's adaptive stream (on viewers and, since Phase 6, on the host's room too) sizes each subscription to its tile.

- **Same video profile on both**: 640x360, 15 fps, 600 kbps; Agora dual stream / LiveKit simulcast + dynacast on the host, LiveKit adaptive stream on viewers (plan §7).
- **Weak-connection badge**: reconnecting on either vendor; on LiveKit also when the server pauses the host's video for a viewer whose downlink can't carry it (audio keeps playing - LiveKit's version of Agora's audio-only fallback).
- **LiveKit camera flip**: before going live the preview track is replaced (LiveKit's `setCameraPosition` needs a published track); once live it's restarted in place. Camera steps (preview, flip, resume, release) run one at a time; flips are blocked while connecting.
- **LiveKit camera after backgrounding**: Android takes the camera from a backgrounded app and `flutter_webrtc` never reopens it, so the go-live screen calls `resumeCamera()` on resume (iOS and Agora recover by themselves). The display is kept on while a live screen is open (`core/keep_screen_on.dart`, `wakelock_plus`), so an auto-lock doesn't do this mid-live.
- **Pause** (`setPaused`, docs/features/realtime.md): the host's pause turns capture off, not just sending - LiveKit `mute()`s both tracks (which stops them) and `unmute()` restarts them; Agora `enableLocalVideo`/`enableLocalAudio(false)` plus `muteLocal*Stream`. A paused LiveKit camera is never reopened by a flip or a return from the background - resuming restarts it. A viewer's pause stops everyone's media reaching them, guests included: LiveKit unsubscribes from every participant's tracks (an explicit `disable()` would override adaptive stream for good), Agora `muteAllRemote*Streams`.
- **LiveKit capture rate**: `flutter_webrtc` on Android only reads a plain `frameRate` number, not LiveKit's `{max: 15}`, so the camera ran at 30 fps for a 15 fps stream; the session's camera options send `15`.
- **LiveKit errors**: `liveKitFailure()` words SDK failures for people (offline, can't connect, camera/mic busy) instead of "Something went wrong". A failed go-live also ends the stream it created, so no LIVE row is left without a broadcast.
- **LiveKit zoom**: `flutter_webrtc` can set the zoom but can't report the range, so the app has a tiny platform channel, `gambling_live/camera` (`video/camera_zoom.dart`, `MainActivity.kt`, `AppDelegate.swift`), returning the exact limit `flutter_webrtc` clamps to - Android: `SCALER_AVAILABLE_MAX_DIGITAL_ZOOM` of the capturing camera; iOS: `videoMaxZoomFactor` of the capture format (found by the size the track reports, since capture starts asynchronously). On the SM A566B the preview shows the same 1/2/4/8 stops as on Agora.
- **Connection loss**: if LiveKit gives up reconnecting, the host keeps their camera preview and sees "Connection lost..."; a viewer is sent back when the room is deleted (live ended), or sees "Connection lost" otherwise.
- **Ending a live**: the host leaves the room *before* calling `POST /streams/:id/end` - if the server deletes the room while `Room.disconnect()` is running, the LiveKit SDK can miss its disconnect event, stall 10 s and throw (the app froze under the debugger). Session `release()` never throws: it caps the disconnect at 2 s and always frees camera, mic and renderer.
- **LiveKit video view**: `VideoTrackRenderer` gets a renderer the session initialized up front (`cachedRenderer`); left to itself it initializes in `build()`, and a rebuild mid-initialize throws.
- **Audio**: LiveKit's automatic audio session is left on (on iOS it picks the audio category from whether the mic is in use; on Android both roles get call-style audio). Worth revisiting with guests (Phase 6).

## Switching providers

1. Set `VIDEO_PROVIDER=livekit` (or back to `agora`) in the backend's `.env`, and restart the backend.
2. That's all: new lives use the new vendor; lives already running finish on the old one. Keep both vendors' credentials configured while any live on the old one might still be running.

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

Backend: `agora-video-provider.service.spec.ts` (channel naming, placeholder vs real tokens, preview config, no-op channel lifecycle); `livekit-video-provider.service.spec.ts` (exact host/viewer grants decoded from real tokens, 15-minute expiry, room timeouts, 503 when unreachable/unconfigured, idempotent close/remove, URL validation); `video-provider.registry.spec.ts` (default, case-insensitive switch, old lives keep their vendor, fail-fast config). Mobile: `video_credentials_test.dart` (both vendors, old backends without `provider`, unknown vendors) and `camera_zoom_test.dart` (exact channel arguments, fallbacks to 1x). Verified live against the dev server: rooms created with the right timeouts and deleted on end, and a phone publishing camera + mic (Samsung SM A566B).
