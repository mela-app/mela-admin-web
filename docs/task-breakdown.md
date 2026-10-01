# Task Breakdown — Live Streaming Platform

Companion to [live-streaming-plan.md](./live-streaming-plan.md). This turns the phased roadmap (plan §13) into concrete, assignable tasks — copy into an issue tracker or check off directly here. Each phase assumes the previous one is functionally complete; within a phase, Backend tasks generally block the matching Mobile/Admin-Web tasks.

**Revised 2026-09-24**: added Profiles & connections, Notifications & sharing, and Release readiness phases, granular moderator abilities, and live-room engagement; a codebase audit added Phase 1.5. Old → new numbering:

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations & architecture skeleton | Done |
| 1 | Core streaming | Done |
| 1.5 | Hardening & app foundations (audit fixes) | Mostly done - a few device-verification/e2e items open |
| 2 | Live chat & live-room engagement | Done |
| 3 | Profiles & connections | Done |
| 4 | Moderation, block & delegated moderators | Done |
| 5 | Notifications & sharing | Done - FCM push and real domain/App Links deferred (needs a Firebase project + app domain from the project owner) |
| 6 | Guest management | Done - verify stage transitions on two real devices (both vendors) |
| 7 | Mute suite, low-bandwidth completion & polish | Done - verify on devices (mic lock and 0.5x lens on both vendors, Data Saver quality drop) |
| 8 | Admin dashboard | Done - verify the lock screen and alert banners on devices; staff 2FA before production |
| 9 | Release readiness | Planned (new) |
| 10 | Stretch — gifting, KYC, VOD, scheduled/private lives, scaling | Not scheduled (was 7) |

## Phase 0 — Foundations & architecture skeleton ✅ done
Goal: nothing user-facing yet, but the scaffolding (plan §4.1) that makes every later phase safe to extend or trim.

Validated: `npx tsc --noEmit`, `npm run lint`, and `npm test` (14/14 passing) all
pass in `apps/backend`; the server was started against a real Postgres
(now via `docker compose up -d postgres redis`, confirmed healthy) and
`GET /health`, `POST /v1/auth/signup`, `POST /v1/auth/login`, and
`GET /v1/users/:id` (404 path) were all exercised successfully end-to-end.
Flutter SDK is now installed (3.47.5); `flutter create .` was run in
`apps/mobile` (platform folders added), `flutter analyze` is clean, and
`flutter test` passes. Per-feature docs for everything below are in
[features/](./features/README.md).

Known gaps to pick up later, not blockers for Phase 1:
- `npm audit` reports 3 high-severity advisories, all the same root cause:
  `deepmerge-ts` (stack exhaustion) pulled in transitively by `@prisma/config`
  → `prisma` — a dev-time CLI dependency, not part of the running server.
  A fix needs Prisma 8.x (currently only an RC), so it's tracked here rather
  than force-upgraded onto a pre-release.
- `UsersService`/`UsersController` have no automated tests yet.

**Repo & tooling**
- [x] Monorepo layout: `apps/mobile`, `apps/backend`, `apps/admin-web`, `docs/` (plan §12)
- [x] Root `.gitignore`, `.editorconfig`, base `README.md`
- [x] `apps/backend`: NestJS project, TypeScript strict mode, ESLint + Prettier
- [x] `apps/mobile`: Flutter project skeleton (`flutter create .` run, `flutter_lints` active, `flutter analyze`/`flutter test` passing)
- [x] `apps/admin-web`: React + Vite + TypeScript skeleton (plan §3.4)
- [x] Docker Compose: Postgres, Redis, backend (dev profile) — `docker compose up -d postgres redis` confirmed healthy
- [x] CI skeleton: lint + typecheck + test on push, for backend, mobile, and admin-web

**Core architecture (plan §4.1)**
- [x] `common/permissions`: `PermissionsService` with `canModerateChannel`, `canManageGuests`, `canStartOrEndStream`, `canLockStream`, `canSendGlobalAlert`, `canSendTargetedAlert`, `canSuspendUser`, `canManageBannedPhrases`, `canManageAdmins` + unit tests (the admin ones were replaced in Phase 8 by per-permission console access, `common/permissions/admin-permissions.ts`)
- [x] `common/events`: internal event bus (`EventEmitter2`) + a typed event-contracts file (`domain-events.ts`)
- [x] `common/video-provider`: `VideoProvider` interface (`getAppId`, `createChannelName`, `mintToken`, `revokeToken`, `lockChannel`) + `AgoraVideoProvider` implementation (real `agora-token` minting since Phase 1 device testing; placeholder tokens only when credentials are unset — see docs/features/video-provider.md) + unit tests
- [x] Prisma schema initialized, baseline migration (`users` table) — applied against a real Postgres
- [x] Global exception filter + request logging middleware
- [x] `/v1` API prefix convention documented and applied (`app.enableVersioning`)

**Auth & users**
- [x] `users` table/migration (plan §8) incl. `platformRole`, `status`
- [x] Signup/login/refresh endpoints, JWT access+refresh, password hashing (argon2) — logout added too (revokes the stored refresh token)
- [x] Auth guard + current-user decorator
- [x] Get/update own profile endpoints
- [x] Rate limiting on auth endpoints (plan §11) — global `ThrottlerGuard` + stricter per-route limits on signup/login

**Feature docs**
- [x] `docs/features/README.md` (index + template for future feature docs)
- [x] `docs/features/permissions.md`, `events.md`, `video-provider.md`, `auth.md`, `users.md`

## Phase 1 — Core streaming ✅ done
Goal: a host can go live, a viewer can watch — built to the low-bandwidth profile from day one (plan §7).

Validated: `npx tsc --noEmit`, `npm run lint`, `npm test` (21/21 passing) all
pass in `apps/backend`. Live end-to-end run via
`apps/backend/scripts/smoke-test-realtime.js` against the real dockerized
Postgres/Redis: signup → go live → list live → Socket.IO connect (JWT
handshake) → join room → `viewer_count_update` received → host ends stream
over REST → `stream_ended` received over the socket (proving the
event-bus-decoupled `StreamsModule` ⇄ `RealtimeModule` design works, not
just compiles). Mobile: `flutter analyze` clean, `flutter test` (2/2)
passing, `flutter pub get` resolved `agora_rtc_engine`/`permission_handler`
cleanly. The redesigned login screen was also visually confirmed by running
`flutter run -d web-server` and screenshotting it in a browser, and later
**the full app was built and run on a real Android phone** (Samsung SM
A566B) via `flutter run` - confirming the whole stack end-to-end, not just
static analysis.

Known gaps:
- `setLocalPublishFallbackOption` doesn't exist in the installed
  `agora_rtc_engine` version (6.6.4) - only `setRemoteSubscribeFallbackOption`
  (viewer side) and `enableDualStreamMode` (publisher side) were used; see
  docs/features/streams.md.
- Room-ban/block enforcement on `join()` was a marked TODO - resolved in Phase 4 (see below).
- Two real-device-only issues were found and fixed after the initial
  static-analysis-only validation (see docs/features/streams.md "Mobile"
  section): a plugin-level `compileSdk` mismatch, and `google_fonts`
  crashing the app when its network font-fetch failed. Both are proof that
  "analyze + widget tests clean" isn't sufficient for anything touching
  native builds or runtime network I/O - test on a real device before
  calling a mobile phase done in the future.

**Backend**
- [x] `streams` table/migration + service
- [x] `POST /streams` (go live) → create row, mint publisher token via `VideoProvider`
- [x] `GET /streams?status=live` (paginated) discovery list
- [x] `POST /streams/:id/join` → mint audience (subscribe-only) token (room-ban check deferred to Phase 4, see gap above)
- [x] `POST /streams/:id/end`
- [x] Viewer count in Redis, throttled `viewer_count_update` broadcast (leading+trailing throttle)
- [x] Socket.IO gateway skeleton, JWT-authenticated handshake

**Mobile**
- [x] Agora RTC SDK integration (`agora_rtc_engine`)
- [x] Go-live screen: camera/mic permission, preview, publish
- [x] Discovery/home feed — static thumbnails only, no autoplay (plan §7)
- [x] Viewer screen: join as audience, render host video
- [x] Conservative default video profile (~360p) + weak-connection indicator
- [x] Reconnect-with-backoff for the Agora connection — via Agora's own `onConnectionStateChanged` reconnect handling; UI shows the weak-connection badge while it reconnects

**UI/UX design system** (added after an initial functional-but-plain pass)
- [x] `lib/core/theme`: `AppColors` (dark palette + Mela teal brand gradient + amber accent), `AppSpacing`, `AppRadius`, `AppTheme` (wires it all into one `ThemeData`, incl. input/chip/card/button themes) — uses the platform's bundled system font on purpose, **not** `google_fonts` (its default network font-fetch crashed on a real device with a flaky connection; see docs/features/streams.md)
- [x] `lib/core/widgets`: `PrimaryButton` (gradient CTA), `AppTextField`, `LiveBadge`, `ViewerCountBadge`, `WeakConnectionBadge`, `GradientScrim`, `EmptyState`, `MelaLogo` (painted from the generated brand paths, `mela_logo_data.dart`) — reusable pieces so Phase 2+ screens (chat, guests, moderation) stay visually consistent instead of each screen inventing its own styling
- [x] Login/signup redesigned: branded header, pill-shaped mode toggle, icon-prefixed fields, animated reveal of signup-only fields
- [x] Discovery redesigned: category filter chips, 2-column stream card grid with per-category gradient art (no fake data), branded app bar with logout action, custom gradient FAB
- [x] Go-live/viewer screens redesigned: gradient scrims over video for readable overlays, confirm-before-end dialog on the host side, consistent badge placement

**Cross-cutting**
- [x] Dual-stream/simulcast enabled on the publisher side
- [x] Publish/subscribe fallback-to-audio-only configured (subscribe side only - see gap above)

**Feature docs**
- [x] `docs/features/streams.md`, `realtime.md`

**Fixes from real-device testing** (after the phase was first marked done)
- [x] Real Agora RTC tokens via `agora-token` once credentials are set (was a placeholder signer); fails loudly if the App ID/Certificate aren't 32-char hex, since the builder otherwise silently returns an empty token
- [x] One live per host — `goLive()` auto-ends the host's previous live (fixed 6+ duplicate "live" cards left by crashed test sessions; stale rows cleaned up)
- [x] Full-screen camera preview before going live (`GET /v1/streams/config` supplies the App ID with no side effects), front/back camera flip, pinch-to-zoom — all confirmed on the device
- [x] Zoom actually works: capability is read once the camera is capturing (asking right after `startPreview()` reported "unsupported", silently disabling zoom) and re-read per camera after a flip; plus 1x/2x/4x/8x zoom stops from the camera's reported maximum, with a smooth glide on tap — confirmed on the device (both cameras report 8×)
- [x] Video fills the whole screen on host and viewer — the real cause was layout, not render mode: the Scaffold body's loose constraints let each screen's `Stack` size itself from its only non-positioned child, the top-bar row (36 + 64 + 48 = 148dp), so the video filled just that band. Fixed by the shared `LiveStage` (fills the screen, positions every child), pinned by a widget test on the reporting phone's geometry
- [x] Host-selectable stage layouts — Full screen, Fit, Split, Floating (drag to any corner, double-tap to resize), Minimal (controls auto-hide) — picked before or during the live, remembered for the next one, and mirrored to viewers (`PATCH /v1/streams/:id/layout` → `stream:layout_changed`); layout switches animate without re-creating the native video view
- [x] Back gesture while live asks to end the stream (`PopScope`) instead of leaving it running (#6)
- [x] Real-device dev workflow: `adb reverse` + `127.0.0.1` as the default API/socket address, VS Code launch configs that apply it automatically

## Phase 1.5 — Hardening & app foundations (next up)
Goal: fix what the codebase audit (2026-09-24) found before building more on top of it. Every item is a bug people will hit in normal use, a security gap, or a foundation that chat, notifications, and deep links all need. Doing this now — with 4 screens and 5 backend modules — is cheap; doing it after Phase 6 would be a rewrite.

### Audit findings
Every finding was checked against the code, not assumed.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1 | High | The project isn't under version control, so CI has never run | `D:\Development\Gambling` has no `.git`; the three `.github/workflows/*.yml` files can't have been pushed. (`.env`, which holds the real Agora certificate, *is* gitignored, so initializing git is safe.) |
| 2 | High | Sessions die after 15 minutes | `ApiClient` has no 401 → refresh → retry path and `SessionStore.readRefreshToken()` is never called; access tokens last 900 s. After that every call fails with a raw `ApiException(401…)`, and socket reconnects fail with `auth_error` |
| 3 | High | Login required on every app launch | `main.dart` always opens `LoginScreen`; stored tokens are never checked |
| 4 | High | Suspended users can stay signed in indefinitely | `AuthService.refresh()` never checks `user.status` (only `login()` does); open sockets are never force-closed |
| 5 | High | Zombie lives when the host's app dies | Only a *new* go-live by the same host ends a stale one. A crash, force-quit, lost signal, or backend restart leaves the stream `LIVE` in discovery indefinitely |
| 6 | High | The Android back gesture while live leaves the stream running | `GoLiveScreen` has no `PopScope`: back pops the route, `dispose()` releases the engine, but `POST /streams/:id/end` is never called. **`PopScope` added with the stage layouts; backgrounding the app is still open** |
| 7 | High | No way to reach one specific user in realtime | Sockets only join `stream:{id}` rooms — this blocks guest acceptance (Phase 6), force-disconnect on ban/suspend (Phase 4), and every notification (Phase 5) |
| 8 | Medium | One refresh-token slot per user | `users.hashedRefreshToken` holds a single token: once refresh works (#2), signing in on a second device silently signs the first one out at its next refresh. **Resolved: per-device `user_sessions`** |
| 9 | Medium | One socket per screen, and the host has none | `ViewerScreen` opens its own socket; `GoLiveScreen` never connects — the host can't see their viewer count, can't send a heartbeat (#5), and chat/guest requests would have nowhere to arrive |
| 10 | Medium | Viewer counts drift | `stream:join` accepts any string (the stream needn't exist or be live); a socket that joins a second stream without leaving the first stays counted in the first forever; counts are per socket, not per user; `stream:{id}:viewers` keys are never deleted, so after a backend restart dead socket ids inflate counts permanently |
| 11 | Medium | WebSocket CORS wide open, WS input unvalidated | `@WebSocketGateway({ cors: { origin: true } })` while REST honors `CORS_ORIGIN`; WS payloads bypass the global HTTP `ValidationPipe` |
| 12 | Medium | Raw exceptions shown to users | `e.toString()` rendered in the login, go-live, viewer, and discovery screens — e.g. the "ClientException with SocketException: Connection refused…" message seen during device testing |
| 13 | Medium | HTTP calls can hang forever | `http.get/post` with no timeouts and a new client per call; `ApiClient` also has no `DELETE` (needed from Phase 3; `PATCH` was added for stage layouts) |
| 14 | Medium | No routing or dependency-injection structure | `Navigator.push(MaterialPageRoute…)` everywhere and every screen constructs its own repositories — deep links (share, notification taps) need a router, and app-wide realtime/session state needs DI |
| 15 | Medium | Discovery breaks past 20 lives | The category filter runs client-side over page 1 only, the app never requests page 2, and cards show no viewer count |
| 16 | Medium | The public API exposes stream history; no single-stream lookup | `GET /streams?status=ended` (or `locked`/`scheduled`) works unauthenticated — contradicts "no history once a live ends"; there's no `GET /streams/:id` for links and notifications |
| 17 | Medium | Viewers are dropped silently when a live ends | The `stream_ended` handler just pops the screen, with no explanation |
| 18 | Medium | Full-screen video not verified | **Resolved**: not a render-mode issue — the live screens' `Stack` sized itself from the top-bar row under the Scaffold's loose constraints (148dp band). Fixed by `LiveStage` + a geometry regression test; the keyboard no longer resizes the video. Still to check: encoder orientation (the device log showed 640×360 encoding) |
| 19 | Low | Plan §7 items missing or never scheduled | REST compression (promised in §7) isn't implemented; the Data Saver toggle and the `connectivity_plus` offline banner had no task anywhere |
| 20 | Low | Backend ops basics missing | No env validation at boot (the placeholder `change-me` JWT secrets are accepted silently), no `helmet`, no `enableShutdownHooks()`, `/health` doesn't check Postgres/Redis |
| 21 | Low | CI drift | CI pins Flutter 3.35 / Node 22 while development uses Flutter 3.47.5 / Node 24; no explicit `prisma generate` step |
| 22 | Low | Thin tests at the seams | Mobile: 2 widget tests. Backend: no gateway unit tests (only the manual smoke script), no HTTP e2e tests, `UsersService` untested |
| 23 | Low | The app still wears its template identity | ~~`applicationId com.example.gambling_live_mobile` (not publishable)~~ **Resolved 2026-09-26**: renamed to `com.gamblinglive.app` (Android `applicationId`/`namespace`, iOS/macOS `PRODUCT_BUNDLE_IDENTIFIER`, Linux `APPLICATION_ID`) - confirmed with a real `flutter build apk --debug`. Still open: launcher label `gambling_live_mobile`, default Flutter icon and splash — tracked in Phase 9 (icons/splash). ~~admin-web is the untouched Vite starter~~ **Resolved in Phase 8**: replaced by the admin console |
| 24 | Low | Two PostgreSQL servers on port 5432 | A native PostgreSQL 18 service and the Docker PostgreSQL 16 container both bind 5432; the backend talks to the native one while `docker compose exec` inspects the other. **Resolved: Docker only** (native service disabled, data moved into the container) |

### Tasks
**Repo & process**
- [x] `git init`, first commit, push to a private GitHub remote so CI actually runs (#1)
- [x] Align CI with the local toolchains (Flutter 3.47.x, Node 24) and add an explicit `npx prisma generate` step (#21)
- [x] Decide the local database setup — **Docker only**: the native PostgreSQL 18 service is disabled and its data restored into the Docker PostgreSQL 16 container; README documents the port-5432 trap (#24)

**Auth & sessions**
- [x] Backend: per-device `user_sessions` replacing `users.hashedRefreshToken`: `sid` in both tokens, refresh rotation with a 2-minute reuse grace (lost responses on bad networks) and theft detection past it (an old token ends that session), compare-and-set against racing refreshes; logout ends only the current device; suspension (`user.suspended`) ends all of them (#8, plan §8)
- [x] Backend: `refresh()` rejects suspended users and ends their sessions (#4)
- [x] Backend: the `user.suspended` event also force-disconnects that user's open sockets through `user:{id}`; the app then renews its token, is refused, and lands on login (#4, #7)
- [x] Mobile: single-flight refresh in `ApiClient` — proactive renewal a minute before expiry, one `/auth/refresh` shared by concurrent 401s, each request retried once; only a definite 401 from refresh clears the session and routes to login, being offline never does (#2)
- [x] Mobile: session restore on launch — read before the first frame (no network round trip, works offline), straight onto discovery; no `/splash` route needed (#3)
- [x] Mobile: logout calls `POST /auth/logout` (ends only this device) before clearing local tokens, behind a native confirmation dialog (iOS alert / Material dialog)
- [x] Mobile: `ApiClient` 20 s timeouts, one shared `http.Client`, `delete` method, validation-error arrays kept as a list (#13)
- [x] Mobile: platform-correct token storage — iOS Keychain `first_unlock_this_device` plus a first-launch wipe (Keychain entries survive uninstall); Android `resetOnError` for backup-restored ciphertext

**Realtime foundation**
- [x] Backend: every socket joins `user:{id}` on connect; the handshake is checked in a `server.use` middleware (before the connection is accepted) and also requires the token's session to still be active (#7)
- [x] Backend: `stream:join` validated (DTOs, acked `{ok, error}`) and the stream must exist and be `LIVE`; a socket is in at most one stream room (joining B auto-leaves A); WS CORS reads `CORS_ORIGIN` (#10, #11)
- [x] Backend: presence counts unique users (userId → socket count, Lua-atomic), excludes the host, deletes its keys on stream end and resets them on boot; `peakViewerCount` saved when the live ends (#10)
- [x] Backend: host liveness — `stream:host_join` (verified host of a `LIVE` stream) + `stream:host_heartbeat` every 15 s refreshing `stream:{id}:host_alive` (TTL 90 s); an `@nestjs/schedule` sweeper every 30 s ends expired lives with `endedReason = HOST_DISCONNECTED`; `stream_ended` gains `reason` (`HOST_ENDED` / `HOST_DISCONNECTED` / `REPLACED`) (#5, plan §6.1) — verified live: a host that stopped heartbeating was ended at ~100 s
- [x] Mobile: one app-wide `RealtimeClient` — open while signed in (created the first time a live screen needs it), closed on logout; `OptionBuilder.setAuthFn` sends a fresh access token on every reconnect, and a refused handshake renews the token and reconnects (with backoff offline); screens use a `LiveRoom` instead of owning sockets (#9)
- [x] Mobile: the host joins as host, sends heartbeats, and sees the live viewer count (#9)
- [x] Mobile: a live timer ("LIVE 12:34") on the host and viewer screens, synced to the server's clock so every phone shows the same duration
- [x] Pause: the host pauses/resumes the live (camera and microphone off, viewers on "Live paused", PAUSED on the badge and the discovery card, 10 minutes allowed away from the app while paused); a viewer pauses their own playback (stops receiving media, resumes at the live edge) - `stream:host_pause` → `stream:paused`, restored on reconnect

**Live-screen correctness**
- [x] Mobile: `PopScope` on `GoLiveScreen` while publishing → the end-stream confirmation (#6)
- [x] Mobile: camera/microphone permission recovery on both platforms — "Try again" after a plain denial; "Open Settings" once the OS won't prompt again (iOS after one refusal, Android after two), re-checked automatically on return
- [x] Mobile: ending a live never strands the host offline (the end call is best effort); a viewer leaving while the stream loads no longer leaks the video engine
- [x] Mobile: app-lifecycle handling when the host backgrounds the app — decided: rely on the heartbeat grace window. Heartbeats pause while the app is in the background, viewers see "The host stepped away", and a host who doesn't come back within 90 s has the live ended (`HOST_DISCONNECTED`); coming back in time resumes it (#6)
- [x] Mobile: full-screen video — root cause fixed with `LiveStage`; `resizeToAvoidBottomInset: false` with only the bottom panel lifted above the keyboard; category chips in one scrolling row (#18)
- [ ] Mobile: verify viewers receive portrait frames (the device log showed 640×360 encoding); pin `orientationModeFixedPortrait` / a 360×640 profile if not (#18)
- [x] Mobile: resync the stage layout when the socket reconnects — every (re)join returns the room state (layout, viewer count, host away)
- [x] Mobile: "LIVE has ended" state for viewers — host name, why it ended, how long it lasted, "Watch other lives" (the Follow button arrives in Phase 3); also shown when a tapped card's live is already over, and a host variant when the server ended the host's live (#17)

**Mobile architecture**
- [x] Riverpod providers for `ApiClient`, `SessionStore` and the repositories, plus a `SessionController`; the 4 screens migrated (#14). (`RealtimeClient` and the current user come with the realtime work.)
- [x] go_router: `/login`, `/`, `/go-live`, `/live/:streamId` (nested under `/`, so back — Android button or iOS swipe — lands on discovery), with an auth redirect that preserves the intended destination and honors in-app paths only — the future deep-link entry point (#14)
- [x] `AppFailure` error layer mapping socket/timeout/HTTP failures and the API's validation messages to written copy; every `e.toString()` replaced (#12, plan §6.14)
- [x] iOS readiness (verified in CI, not yet on an iPhone): committed `ios/Podfile` enabling `permission_handler`'s camera/microphone macros (without them iOS never prompts and reports "denied"), CocoaPods xcconfig includes, an iOS Simulator launch config, and a `mobile-native-builds` workflow compiling the Android APK and the iOS app
- [ ] Feature-folder convention `data/` → `domain/` → `presentation/` applied to the existing features and documented for new ones

**API & discovery**
- [x] `GET /v1/streams/:id` — title, category, status, layout, startedAt/endedAt, endedReason, peakViewerCount, host, viewerCount, serverTime (#16)
- [x] Public `GET /streams` serves `live` only, **ranked by viewer count** (then newest), with a server-side `category` filter and `viewerCount` per item (Redis pipeline) (#15, #16)
- [x] Mobile discovery: most-watched lives first, infinite scroll (de-duplicated across pages), server-side category filter, viewer counts on cards, a skeleton grid instead of a spinner, refresh on returning from a live and on returning to the app after 30 s; a failed refresh keeps the list (#15)

**Backend ops**
- [x] Env validation at boot (fail fast in production on missing or placeholder secrets, `CORS_ORIGIN` required), `compression` (plan §7), `helmet`, `enableShutdownHooks()`, `/health` checking Postgres + Redis (503 when either is down) (#19, #20)

**Video provider: Agora + self-hosted LiveKit, switchable** (added 2026-09-25 - plan §3 update, docs/features/video-provider.md)
- [x] Backend: `VideoProviderRegistry` with Agora and LiveKit adapters; `VIDEO_PROVIDER` picks the vendor for new lives, `streams.videoProvider` keeps each live on the one it started on; `agoraChannelName` renamed to `channelName` in place (no data loss); fail-fast config at boot
- [x] Backend: LiveKit rooms created before the stream row (`auto_create` off; 90 s departure grace) and deleted on end; server-enforced grants (host: camera + mic only; viewers: subscribe-only, hidden; no data channel); 15-minute tokens; 503 when the media server is unreachable
- [x] Mobile: `HostVideoSession` / `ViewerVideoSession` with Agora and LiveKit implementations - screens are vendor-neutral, both SDKs ship; LiveKit gets the same 360p profile, simulcast/dynacast/adaptive stream, weak-connection badge, zoom stops (native max-zoom channel on Android and iOS) and connection-lost states
- [x] Dev: LiveKit dev server in `docker-compose.yml`, `adb reverse` for 7880/7881 in the VS Code launch configs; production deploy files in `infra/livekit` with a step-by-step runbook
- [x] Verified: backend tests, smoke test and a room/grant check against the real dev server; phone (SM A566B) preview + publishing camera and mic over LiveKit
- [ ] Verify on devices: a LiveKit viewer watching a LiveKit host (two devices), a camera flip while live, and the Agora path again after the refactor
- [ ] Verify on an iPhone: LiveKit and Agora in one app (CI only compiles it) and the iOS max-zoom lookup
- [ ] Deploy LiveKit on the production server (DNS, firewall, keys, TLS proxy) and switch `VIDEO_PROVIDER`
- [ ] Host liveness from LiveKit webhooks (`participant_left`, `room_finished`) - an extra, faster signal on top of the socket heartbeats (which already end abandoned lives, on both vendors) (#5)

**Tests & validation**
- [x] Backend: gateway unit tests (handshake auth, join/leave, room switching, presence, host join/heartbeat/away) and sweeper tests (#22)
- [ ] Backend: supertest e2e for auth (including refresh-while-suspended and two-device sessions) and streams, `UsersService` tests (#22)
- [x] Mobile: realtime tests over a fake transport (`RealtimeClient` reconnect/renewal, `LiveRoom` sync, heartbeats, away, end), live clock/format tests, the ended screen, and discovery (ranking, paging, category filter, refresh on resume)
- [ ] Mobile: `ApiClient` refresh/timeout tests (mocked `http.Client`), `AppFailure` mapping tests, router redirect tests (#22)
- [ ] Re-run `scripts/smoke-test-realtime.js`, then a real-device pass: go live; back gesture → confirm dialog; kill the app → the live auto-ends within ~90 s; a 20-minute session stays signed in; relaunch skips the login screen; video fills the screen on host and viewer

## Phase 2 — Live chat & live-room engagement
Goal: the TikTok-style live room — chat, likes, and the overlay layout from plan §6.14.

**Backend**
- [x] `chat_messages` table/migration
- [x] `chat:send` on the existing gateway (no second Socket.IO server): validate → Redis sliding-window rate limit per user/stream → persist → `chat:new` to `stream:{id}`; `chat:rejected` with a reason code
- [x] Cursor-paginated chat history: last N on join, and only messages after the last seen id on reconnect
- [x] Likes: `like:send {count}` (client-batched, per-user rate limit) → Redis `INCRBY` → throttled `likes_update`; `streams.likeCount` persisted on end — extract the viewer-count leading+trailing throttle into a shared helper rather than copying it
- [x] Feature doc: `docs/features/chat.md`
- [x] `chat:delete` (self, or the host) — pulled forward from Phase 4's moderation item; a real `moderators` table will extend it, not replace it

**Mobile**
- [x] Chat overlay: last ~5 messages visible with a faded top edge, newest at the bottom; scroll up for history with a "New messages" jump pill; "Say something…" composer above the keyboard; a plain viewer can chat but never requests a publisher token (plan §5)
- [x] Clear-screen gesture (hide/show every overlay) and a chat toggle
- [x] Likes: heart button + double-tap, optimistic floating-hearts animation, client-side batching, live like count
- [x] Host live controls: mic on/off, camera on/off (joining the flip/zoom controls already built)
- [x] Host chat: the host reads and sends chat too (`go_live_screen.dart`, same `ChatOverlay`/`ChatComposer`), and can delete any message; a plain viewer can delete their own (changed 2026-09-29: only the host and `DELETE_MESSAGES` moderators delete - docs/features/chat.md)
- [x] Reconnect resync: fetch only messages after the last seen id
- [x] Haptics on like and send; skeleton for the initial chat load

## Phase 3 — Profiles & connections (new)
Goal: people can find each other, follow, and see when the people they follow are live (plan §6.10).

**Backend**
- [x] `users.bio`; `PATCH /users/me` extended; the public profile adds counts, relationship flags (`isFollowing`, `isFollowedBy`, `isFriend`), and `liveStreamId`
- [x] `StorageProvider` interface + S3-compatible implementation; S3Mock added to `docker-compose.yml`; `POST /users/me/avatar/upload-url` (short-lived presigned PUT, content-type allow-list); `PATCH /users/me {avatarUrl}`
- [x] `follows` table/migration (`status` ACTIVE/PENDING, `notifyOnLive`), unique pair + followee index
- [x] `POST/PATCH/DELETE /users/:id/follow`, `GET /users/:id/followers|following`, `GET /users/me/friends` (cursor pagination)
- [x] `GET /users/search?q=` (prefix match, excludes suspended users)
- [x] `GET /streams?feed=following` (auth)
- [x] `user.followed` domain event (consumed by notifications in Phase 5)
- [x] Feature docs: `social.md`, `storage.md`

**Mobile**
- [x] Profile screen (own and others'): avatar with LIVE ring (tap → join the live), counts, Follow / Following / Friends button, bell toggle
- [x] Edit profile: display name, bio, avatar picker with on-device resize/compress (≤ 720 px)
- [x] Followers / Following / Friends lists (infinite scroll)
- [x] User search screen (debounced)
- [x] Discovery tabs: **For You** | **Following**
- [x] Viewer screen: host pill (avatar, name, Follow) top-left; Follow CTA on the "LIVE has ended" screen
- [x] Optimistic follow/unfollow with rollback on failure

## Phase 4 — Moderation, block & delegated moderators (was Phase 3)
**Backend**
- [x] `banned_phrases` table + word/phrase filter service (plan §6.3)
- [x] Link policy (URL blocking/allowlist)
- [x] `chat:delete` handler + `moderationStatus` update — done in Phase 2 (self-delete, or the host); now extended to any delegated moderator holding `DELETE_MESSAGES` via the real `moderators` table (2026-09-29: self-delete removed, and a moderator can't delete another moderator's or the host's message)
- [x] `blocks` table + `POST/DELETE /users/:id/block` — also deletes follows in both directions, prevents re-following, and hides the blocked person's lives from discovery, feeds, and search
- [x] `room_bans` table + `POST/DELETE /streams/:id/bans/:userId`; `force_disconnect` through the banned user's `user:{id}` room; ban check in `POST /streams/:id/join` (the Phase 1 TODO) and in `stream:join`
- [x] `reports` table + `POST /reports`
- [x] `moderators` table (scoped per stream, revised 2026-09-26 - a grant does not carry over to the host's future streams) with `capabilities[]` + `GET/POST /streams/:id/moderators`, `PATCH/DELETE /streams/:id/moderators/:userId` (plan §6.9)
- [x] Replace `PermissionsService.canModerateChannel(…, isActiveModerator)` with `hasChannelCapability(requesterId, hostId, grant, capability)` — tests for every capability, and for the host always passing
- [x] `moderator:granted` / `moderator:updated` / `moderator:revoked` realtime events to the moderator's `user:{id}` room
- [x] Pinned message: `POST/DELETE /streams/:id/pin` (host or `PIN_MESSAGES`) → `chat:pinned` / `chat:unpinned`; `streams.pinnedMessageId`
- [x] Viewer list: `GET /streams/:id/viewers` (paginated from presence)
- [x] Audit attribution: every moderator action records the acting moderator, not "the host"
- [x] Feature docs: `moderation.md`, `moderators.md`

**Mobile**
- [x] Long-press on a message → action sheet: view profile, report, and (per capability) delete, pin, ban - **scoping note**: no "mute" action, since room chat mute/unmute has no backend yet (Phase 7); the sheet only offers actions with a real, working endpoint behind them. **Added in Phase 7**: "Mute in chat" (host or `MUTE_CHAT`) and "Hide messages from …" (anyone). **Revised 2026-09-29** (client feedback): the sheet keeps only what's about the message - Pin/Unpin, Hide messages from …, Delete; View profile, Mute in chat and Ban moved to the profile card's "..." menu
- [x] Block/unblock on profiles
- [x] Moderator badge in chat - **scoping note**: shown only on this device's own messages (there's no per-message "is this sender currently a moderator" flag from the backend, so it can't be shown on everyone else's messages without a further backend change); "You're now a moderator for {host}" notice; the UI reacts live to `moderator:granted`/`updated`/`revoked` (2026-09-29: now on every moderator's messages - the room learns `moderatorIds` on join and from `stream:moderators`)
- [x] Host "Moderators" screen (reachable only while live, since a grant is scoped to that one stream - revised 2026-09-26): search a user → pick a preset (Chat moderator / Guest manager / Full moderator) or customize individual abilities → grant; edit; revoke
- [x] Viewer-list sheet (tap the viewer count) with profile and moderation actions (ban, from the list directly) - **revised 2026-09-29**: rows open the profile card, whose menu has the actions
- [x] Person menu on the profile card (client feedback, 2026-09-29): a "..." on anyone's card in a live lists what this user's role allows - invite on stage and make/remove moderator (host), mute their mic / remove from stage (guests), mute/unmute in chat, ban from this live / permanently - then Block/Unblock; one place, however the card was opened (`ModerationPolicy.memberActions`, `liveMemberActions`)
- [x] Pinned-message banner

## Phase 5 — Notifications & sharing (new)
Deliberately after Phase 4: don't amplify reach (notifications, share links) before hosts can moderate what that reach brings in (plan §6.11–6.12).

**Backend**
- [x] `stream.started` domain event from `goLive()`
- [x] `notifications` table + `NotificationsModule` with `@OnEvent` handlers: `stream.started` (per-host 30-minute cooldown, chunked follower fan-out), `user.followed` (`NEW_FOLLOWER`), `moderator.granted` (`MODERATOR_GRANTED`)
- [x] Realtime `notification:new` + `notification:unread_count` to `user:{id}` (the unread count is a `{delta: 1}`, not a recomputed total - avoids a COUNT query per fan-out recipient; `GET /me/notifications/unread-count` is the source of truth)
- [x] Inbox endpoints: `GET /me/notifications`, `GET /me/notifications/unread-count`, `POST /me/notifications/read`
- [x] `PUT/DELETE /me/push-token` (keyed off the caller's own `sessionId` JWT claim, stored on `UserSession.pushToken`); `notification_settings` + `GET/PATCH /me/notification-settings`
- [x] `PushProvider` interface + `FcmPushProvider` (Firebase Admin SDK) behind `PUSH_PROVIDER=fcm`; `NoopPushProvider` is the default (no Firebase project yet - needed from the project owner, same as the Agora keys); BullMQ queue with retry/backoff; no push when the recipient has an active socket (`RealtimeGateway.isUserOnline()`); prunes tokens the vendor reports invalid
- [x] `POST /streams/:id/invites` → `STREAM_INVITE` (friends only via `SocialService.isFriend()`, capped 20/stream via a Redis set, rate-limited via `RateLimitService`) - lives in a new `ShareModule`, not `StreamsController` (matches the plan's own file-tree grouping of invites with the web fallback/well-known files); emits `stream.invite_sent`, which `NotificationsModule` reacts to (fully decoupled - no import either direction)
- [x] Web fallback page `GET /live/:id` (server-rendered, Open Graph tags, HTML-escaped, open-in-app link via `APP_URL_SCHEME`) + `/.well-known/assetlinks.json` and `apple-app-site-association` (both `VERSION_NEUTRAL`, empty/placeholder until a real domain + signed app + Apple Developer account exist)
- [x] Feature docs: `notifications.md`, `share.md`

**Mobile**
- [x] Bell icon with a live unread badge (`NotificationBell`, discovery's app bar); notifications inbox (`NotificationsScreen` - grouped by day, skeleton-free simple loading state, mark all as read)
- [x] In-app banner for `notification:new` while the app is open (`NotificationBannerListener`, mounted once via `MaterialApp.router`'s `builder`) - clears after 3 s, View action or not (client feedback, 2026-09-29)
- [x] No other live opens while broadcasting - the host until they end their live, a guest until they leave the stage (client feedback, 2026-09-29): router `onEnter` guard (`guardLives`) + `broadcastingProvider`; banner View hidden for lives meanwhile
- [x] Share button on the live screen for everyone (host, guest, moderator, viewer) → a small sheet offering the native share sheet (`share_plus`) or "send to friends"
- [x] "Send to friends" sheet (multi-select from `GET /users/me/friends` → `POST /streams/:id/invites`)
- [x] Deep links: `app_links` + a custom scheme (`gamblinglive://live/{id}`, registered in `AndroidManifest.xml`/`Info.plist`) resolves to `/live/:id` today; a real `https://{domain}/live/{id}` (App/Universal Links) is parsed the same way once a domain + `.well-known` files exist - not yet, see "Needs from the project owner"
- [ ] FCM: **not wired into the Flutter app this phase** - `firebase_messaging` + `google-services.json`/`GoogleService-Info.plist` need a real Firebase project first (same boundary as the backend's `FcmPushProvider`); the settings screen and `PUT/DELETE /me/push-token` calls are ready for it once that exists
- [x] Notification settings screen (`NotificationSettingsScreen`, per-type push toggle - takes effect server-side even before FCM is wired); per-follow bell was already built in Phase 3

**Web player for share links** (client request, 2026-09-30 - docs/features/share.md)
- [x] `apps/web` (React + Vite + TS, like the admin console): the live's video (Agora or LiveKit web SDK, loaded only for the live's provider), host, viewer count, chat, pause/away/ended states; built to `/web/player.js` + `/web/player.css` + hashed `/web/assets/*`, served by its own nginx container behind `/web/*` on the API's host
- [x] `GET /live/:id` loads the player while live (settings as JSON, its own CSP); link previews unchanged; an ended live's page stays plain
- [x] `POST /streams/:id/watch`: anonymous `web-<uuid>` video identity + 4-hour watch ticket (own derived key), rate-limited per IP; banned signed-in viewers refused
- [x] Watch-only sockets (`handshake.auth.watchTicket`): `stream:watch`/`stream:leave` only, counted but never listed or announced, chat snapshot on join
- [x] Phones: "Get the app" bar, chat/like/follow/stage → install sheet (`intent://` on Android, scheme + App Store fallback on iOS), one prompt after a minute
- [x] Computers: QR code to the phone; log in / sign up on the page (`/auth/web/*`, httpOnly `SameSite=Strict` cookie) when joining in and once after a minute; signed in, chat/like/follow work there; the stage stays app-only
- [x] Compose (`web` service: local `app`+`tunnel` profiles, production), tunnel + production Caddy `/web/*`, `web-ci.yml`; `ANDROID_INSTALL_URL` / `IOS_INSTALL_URL`
- [ ] `IOS_INSTALL_URL` once the app has an App Store listing (iPhones get no store link until then)

**Host photos in chat & recording permission** (client request, 2026-09-30 - docs/features/chat.md, docs/features/streams.md)
- [x] The host posts a photo to their live's chat, with an optional caption: `POST /streams/:id/chat/image-upload-url` (host only) then `chat:send {imageKey}` - the key checked against this live, `chat_messages.imageUrl`; shown in the app (tap for full screen, Data Saver holds it until tapped), the web player and the admin chat log
- [x] Viewers can't screen-record or screenshot a live unless its host allows them: `recording_permissions` + `POST/DELETE/GET /streams/:id/recording-permissions[/:userId]` (host only), `canRecord` on join and every `stream:join`, private `recording:permission`; Android `FLAG_SECURE`, iOS covers the live and stops its media while the screen is captured; "Allow recording" / "Stop allowing recording" in the profile card menu
- [ ] Device checks: a real screen recording on Android (black) and iPhone (covered); a photo posted from the gallery on both

**Separate repositories & security pass** (client request, 2026-09-30)
- [x] Merged the GHCR continuous delivery from `main` (backend + console) with the web player: a CD workflow and `WEB_IMAGE` for it too
- [x] Four repositories, each complete on its own (README, `.gitignore`, `.editorconfig`, CI/CD), history kept: mela-backend (+ dev compose, `infra/`), mela-mobile (+ VS Code launch configs), mela-web, mela-admin-web (+ `docs/`, `branding/`, whose generator writes into the sibling checkouts)
- [x] Secrets only in untracked files: the local LiveKit server takes its key pair from `.env`; no built-in personal admin email (the seed skips without `SEED_ADMIN_EMAIL`); random passwords for the accounts smoke tests leave behind; Android release signing from `android/key.properties`
- [x] Local Postgres, Redis and S3Mock listen on 127.0.0.1 only; the admin container reaches the API through `host.docker.internal`
- [x] The ngrok tunnel for testing with friends is gone (no longer needed): no `tunnel` compose profile, `infra/tunnel`, `NGROK_*`/`TUNNEL_*` settings or the player's local container
- [x] CD: an SSH deploy key and the server's host key fingerprint (password only as a fallback); the server pulls with its own read-only registry login, so no job token is left there; per-app image tags (`BACKEND_TAG` / `ADMIN_TAG` / `WEB_TAG`); a docs change deploys nothing
- [x] No built-in addresses anywhere: every URL, host, port and app identifier comes from each repository's `.env` (`.env.example` holds this machine's values; the mobile app reads its file with `--dart-define-from-file`). The API (`env.validation.ts`), both Vite dev servers, the compose files, the admin image and the app all refuse to start without their settings and name the missing ones; builds and tests need none (CI has no `.env`)
- [ ] Create the four GitHub repositories, push them, and set the deploy secrets (repository or organization level); add `S3_REGION` to the server's `.env` before its next deploy

**Direct messages between friends** (client request, 2026-09-30 - docs/features/messages.md)
- [x] `conversations` (one row per pair of people) + `direct_messages` (`readAt`, `clientId`), migration `20261001090000_direct_messages`
- [x] `/me/conversations` REST: the inbox (newest first, unread count per conversation, `canMessage`), the unread total, a conversation's history (`before`), send, mark read. Only friends (mutual follows) can send - `403 NOT_FRIENDS` otherwise; live chat's text rules (cleaning up to 1000 characters, phrase filter, link policy); 5 at once, then one a second; resend-safe by `clientId`; people you blocked are left out of the inbox and the count
- [x] Realtime to both people's `user:{id}` rooms: `message:new`, `message:read`, and `message:unread_count` (a total)
- [x] App: an **Inbox** tab next to Following with the unread badge; the conversation list; a conversation screen (a message shows at once, with retry; Sent/Seen; earlier messages on scrolling up; read on open; locked with a note once they no longer follow each other); "New message" picks a friend; a Message button on a friend's profile
- [x] Web player (computers, signed in): an Inbox button with the unread count opens the same inbox in a drawer beside the live - list, new message, conversation, Sent/Seen, live updates over the player's socket
- [x] Console: **Private messages** (`VIEW_PRIVATE_MESSAGES`, migration `20261001100000_private_messages_permission`) - one day at a time, today by default; the list is who wrote to whom without text; opening a conversation shows it and is recorded in the audit log (`admin.private_messages_viewed`); read-only
- [ ] Push notifications for messages while the app is closed - needs the Firebase project, like the other push types
- [ ] Device check: two phones messaging each other, the badge and Seen updating live

**Needs from the project owner**: an app domain, a Firebase project, and an Apple Developer account (iOS push).

## Phase 6 — Guest management (was Phase 4)
**Backend**
- [x] `guest_requests` table + queue logic (cap, FIFO) — `GuestRequest`/`StreamGuest` models (`GuestRequestInitiator` unifies viewer-request and host-invite); `MAX_ACTIVE_GUESTS = 6`
- [x] `POST /streams/:id/guest-requests` + cancel endpoint
- [x] Accept/reject endpoints (host or `MANAGE_GUEST_REQUESTS`, plan §6.5) — mint the publisher token on accept and deliver it through `user:{id}`
- [x] `stream_guests` table; remove (host or `REMOVE_GUESTS`) and leave (self) endpoints
- [x] Cooldown after a host/moderator-initiated removal
- [x] Host invites a viewer on stage → `GUEST_INVITE` (an in-live prompt if they're watching, a notification otherwise)
- [x] Ending a live moves every active guest to removed

**Mobile**
- [x] "Request to join" on the right rail + pending state (camera/mic permission asked first)
- [x] Host/moderator incoming-requests sheet with a badge (`showGuestManagerSheet`, live-updating; "wants to join" snack bar)
- [x] Guest tile layouts (1+1, 1+2, 2×2, up to the configured maximum) - `LiveStage.tiles` + `stage_grid.dart`; the host's native video view is never re-created
- [x] Remove / leave-seat controls; guest mic/camera toggles (plus flip); a guest reconnects as a viewer on leave/removal/drop - a new guest comes on with the mic on and the camera off (client feedback, 2026-09-29)
- [x] Accept a stage invite (from inside the live or from a notification) - `selfGuestRequest` on join; host invites from the viewer list


## Phase 7 — Mute suite, low-bandwidth completion & polish (was Phase 5)
Validated: backend `tsc`/lint clean, 365/365 tests, a DI boot mapping all 8 new routes, migration `20260927064451_phase7_mute_suite` applied; mobile `flutter analyze` clean, 249/249 tests. Not yet on devices - see the last item.

- [x] Forced remote mute (`force_mute_audio`, host or `FORCE_MUTE_GUESTS`) + escalation-to-removal path; `presence:audio_state` so everyone sees who's muted (self A/V toggles ship earlier: host in Phase 2, guests in Phase 6) - `POST/DELETE /streams/:id/guests/:userId/mute-audio`, `stream_guests.micForceMuted` (a new seat starts unlocked); the guest's app turns the mic off and keeps it off; a guest whose audio still arrives 5 s later is flagged "remove them" on their tile and in the guest sheet. **Revised 2026-09-29** (client feedback): a moderator on stage can turn their own mic back on after the host locked it (`PermissionsService.canLiftOwnMicLock`)
- [x] Room chat mute/unmute (`room_chat_mutes` table + enforcement in the send pipeline; host or `MUTE_CHAT`) - `GET /streams/:id/chat/mutes`, `POST/DELETE /streams/:id/chat/mutes/:userId` (5 min / 1 h / rest of the live), `CHAT_MUTED`; only the muted person is told (`chat:muted`/`chat:unmuted`, and the `stream:join` answer on every rejoin); their composer locks with the reason and unlocks itself when a timed mute runs out
- [x] Personal chat mute (`personal_chat_mutes` table + client-side filter) - `POST/DELETE /users/:id/chat-mute`, `GET /users/me/chat-filter` (muted + blocked ids), `isMutedInChat` on profiles; "Hide messages from …" in the chat action sheet (with Undo) and on profiles; applies on every device of the account
- [x] Data Saver toggle — caps received resolution and blocks auto-upgrade (plan §7; never scheduled before) - Settings screen (new, from the profile) and the viewer's weak-connection badge; Agora: every remote on the low stream; LiveKit: `VideoQuality.LOW` per subscribed track (the lower of that and adaptive stream); remembered on the device
- [x] Offline / reconnecting banner via `connectivity_plus` (plan §7) - app-wide strip above every screen: "No internet connection" after 1 s offline, "Reconnecting…" after 3 s without the realtime connection; hides the moment it recovers
- [x] 0.5× ultra-wide zoom stop — `queryCameraFocalLengthCapability()` + `setCameraCapturerConfiguration(cameraFocalLengthType: ultraWide)` (a lens switch, not a zoom factor; the SDK warns some Android devices ignore it, so show the stop only when a switch is confirmed on that device) - LiveKit finds the lens natively (`ultraWideCameraId`, Android camera2 field of view / iOS `builtInUltraWideCamera`) and confirms it from the opened track; Agora trusts the SDK's answer (an error hides the stop for the session) - rear camera only
- [x] Post-live summary for hosts: duration, peak viewers, likes, new followers (plan §6.13) - `GET /streams/:id/summary` (host only); the host's ended screen after End as well as after a server-side end
- [x] Polish pass: muted icons, toasts, empty/error-state audit, accessibility (text scaling, contrast, semantic labels, touch targets), haptics audit - "Mic off" reminder on the host's own status row, mic-lock states on tiles, snack bars for every mute/hide (with Undo for hiding), semantic labels/tooltips on icon-only and tap-only controls app-wide (found by grepping every `IconButton`/`GestureDetector`/`InkWell`), a bigger unpin target, the ended screen scrolls under large text, haptics on going live, ending, following and accepting a guest. The empty/error-state review covered the Phase 7 surfaces (every new failure goes through `AppFailure` with written copy), not a fresh pass over older screens
- [ ] Verify on devices: the mic lock on Agora and LiveKit (guest complies; a non-complying guest gets flagged), the 0.5× lens on a phone that has one (both vendors), Data Saver visibly lowering quality, the banner in airplane mode

## Phase 8 — Admin dashboard (was Phase 6) ✅ done
Validated: backend `tsc`/lint clean, 479/479 tests, migration `20260927103000_phase8_admin_console` applied, `scripts/smoke-test-admin.js` passing end to end against a running server; mobile `flutter analyze` clean, 262/262 tests; admin web `tsc`/oxlint/build clean, 23/23 tests, plus a screenshot review of every page at desktop and phone widths. Details: [features/admin.md](./features/admin.md).

**Backend**
- [x] `admin_alerts`, `audit_logs` tables - plus report assignment/resolution, lock and suspension fields, `passwordChangeRequired` and `lastLoginAt`
- [x] Lock/unlock stream endpoints + `stream:locked`/`stream:unlocked` events - a lock ends the live at once (media closed, guests off stage, `stream_ended` with reason `LOCKED`); unlock clears the flag and tells the host
- [x] Alert compose endpoint (`global`/`stream` scope) + `admin:alert` event - global is super admin only; each alert records how many devices it reached
- [x] User suspend/reinstate endpoints (suspension revokes every session and force-disconnects, per Phase 1.5) - it also locks any live they're running; plus "sign out everywhere", profile fixes (username, name, bio, picture) and role changes
- [x] Admin stream listing with every status (history moved off the public endpoint in Phase 1.5), including auto-ended `host_disconnected` lives - with search, a date range and sorting, and a chat log with search and delete
- [x] Reports worklist endpoints - assign, resolve (with an outcome and a note, optionally closing related reports), dismiss, reopen
- [x] Banned-phrase CRUD endpoints - plus a "test this text" endpoint; changes reach the chat filter immediately
- [x] Audit-log query endpoint - every console action plus the app's own sign-ins, account changes, moderation, guest and social actions; search, filters, CSV export
- [x] `adminRole` claim + guard (`platform_moderator` / `super_admin`) - `AdminGuard` reads the role and status from the database on every request instead of trusting a token claim, so a demotion or suspension applies at once
- [x] A platform moderator's access is chosen by a super admin (added 2026-09-27): none by default, then view or manage per area (lives and chat, reports, users, alerts incl. alerting everyone, banned phrases, audit log), set when the account is created or promoted and editable later; checked on every route (`@RequirePermission`, `403 MISSING_PERMISSION`), migration `20260927170000_admin_permissions`, audited as `user.permissions_changed`
- [x] Default super admin seed (`npm run db:seed`, from `SEED_ADMIN_EMAIL`) with a one-time password that must be replaced at first sign-in; staff then change their own name, email and password
- [x] Console sign-in hardening: httpOnly `SameSite=Strict` refresh cookie, access token in memory only, per-IP and per-account sign-in limits, 12-hour sessions

**Admin Web**
- [x] Admin-only login - plus the forced first password change and an account page (name, email, password, sessions)
- [x] Streams table + lock/unlock action + chat-log drill-in
- [x] Alert composer - with a preview; alerting everyone asks for confirmation
- [x] Users table + suspend/reinstate - plus activity, reports, lives and devices per user
- [x] Reports worklist
- [x] Banned-phrase editor
- [x] Audit-log viewer - filters and search kept in the URL, an entry detail panel, CSV export
- [x] Basic analytics home (active streams, concurrent viewers, pending reports) - plus a 14-day chart and the last 24 hours
- [x] Staff page: create platform moderators (choosing what they can do) and super admins with a one-time password; a moderator's access can be edited from their page, and the console shows each staff member only what they can use
- [x] Sign-out asks for confirmation
- [x] Replace the Vite starter template (counter demo, hero image, framework logos) — nothing from it should survive into the real dashboard

**Mobile**
- [x] A locked live's ended screen says an administrator stopped it, with the reason
- [x] Admin alerts as banners over any screen, styled by severity (critical stays until tapped)
- [x] A suspended account's login says so (only after the right password)
- [ ] Verify on devices: the lock screen and alert banners on Agora and LiveKit

**Still open before production** (plan §11): 2FA for staff and a network allowlist for the console. ~~A deploy that serves the console and routes `/v1` to the API on the same origin~~ **Done in Phase 9**: the console's nginx image proxies `/v1` (docs/deployment.md).

## Phase 9 — Release readiness (new)
- [x] Final app name + a real `applicationId` / bundle id - `com.gamblinglive.app` (replacing `com.example.gambling_live_mobile`), see finding #23. Release signing key (App Links fingerprints depend on it) is still open - the app is still signed with the debug key.
- [x] Rebrand to **Mela (መላ)**: one generated logo geometry (`branding/`) for the launcher icons (Android adaptive + themed/monochrome, iOS, web, Windows, macOS), the native splash (Android 12+ and older, iOS), the in-app `MelaLogo`, the console's logo and favicons, and the share page; launcher label "Mela"; teal/amber palette in both apps
- [x] Copyright and version footer on log in / sign up (mobile, from `package_info_plus`) and on the console's sign-in page (from `package.json`); release versions 1.0.0 (+1)
- [x] Production Docker: multi-stage images for the API (non-root, tini, healthcheck, migrations + seed as a one-shot `migrate` job) and the console (unprivileged nginx, CSP and security headers, `/v1` proxy); local `docker compose --profile app`; `infra/production` with Caddy (automatic HTTPS), Postgres, Redis and optional LiveKit - verified locally end to end (admin smoke test against the container, console under its CSP)
- [x] Chat link allowlist from `CHAT_LINK_DOMAINS` instead of a hard-coded placeholder domain
- [ ] Store listing name: other Play Store apps already use "Mela" - pick a distinguishing listing title/subtitle before submitting
- [ ] Build flavors dev / staging / prod (API and socket URLs, Agora App IDs, Firebase configs)
- [ ] iOS build and real-device test (needs macOS + Xcode — not available on the current Windows development machine)
- [ ] Deployment target chosen (plan §15): the shared VPS (`/usr/src/apps`, `infra/api` and `infra/livekit` in mela-backend), secrets management, off-server backups; `@socket.io/redis-adapter` once there's more than one backend instance
- [ ] Observability: crash reporting (mobile), structured logs and error tracking (backend), uptime checks
- [ ] Store compliance: age rating and an 18+ self-declared age gate at signup for gambling-themed content, privacy policy and terms, in-app account deletion (both stores expect a deletion path for apps with sign-up — verify the current policy text)
- [ ] Security review against plan §11 (OWASP), dependency audit (including the tracked `deepmerge-ts` advisory), rate-limit tuning
- [ ] Load test at the target scale (e.g. 200 concurrent viewers in one live, plus chat/like bursts)

## Phase 10 (stretch) — not scheduled yet
Gifting/payments/wallet, KYC/compliance workflows, recording/VOD, scheduled lives with "remind me" notifications, private or connections-only lives (using `follows.status = PENDING`), "For You" recommendation ranking, multi-region scaling (plan §2.2, §15).
