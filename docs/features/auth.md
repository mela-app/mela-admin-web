# Auth

**Location**: `apps/backend/src/auth` (+ `apps/mobile/lib/core/api_client.dart`, `session_store.dart`, `features/auth/`)
**Plan reference**: plan §8 (`user_sessions`), §11 (security); task-breakdown Phase 0, Phase 1.5 (#2, #3, #4, #8)
**Depends on**: `common/prisma`, `common/events`, `@nestjs/jwt`, `argon2`
**Depended on by**: `users`, and every module that guards a route with `JwtAuthGuard`

## What it does

Signup / login / refresh / logout with **one session per signed-in device**
(`user_sessions`), so signing in on a second phone never signs the first
one out. Passwords are hashed with argon2.

- **Login/signup** create a session row (optionally tagged with the
  device's `platform`: `ANDROID` / `IOS` / `WEB`) and return a 15-minute
  access token plus a 7-day refresh token. Both carry the session id
  (`sid` claim); refresh tokens also carry a random `jti`.
- **Refresh** rotates the refresh token every time. The just-rotated token
  stays valid for `REFRESH_REUSE_GRACE_MS` (2 minutes), so a phone whose
  refresh response was lost on a bad network can retry instead of being
  signed out. An **older** token coming back is treated as stolen and ends
  that device's session. Two refreshes racing on the same row are
  resolved with a compare-and-set (the loser retries once).
- **Suspended users** can't log in or refresh; the first refresh attempt
  also ends all their sessions. Login answers `403 ACCOUNT_SUSPENDED`
  ("This account has been suspended"), but only after a correct password,
  so a stranger can't learn that an account exists. The `user.suspended`
  domain event (`AuthService.endAllSessions`) ends every session of that
  user; the admin console's suspend just emits it.
- A successful login records `users.lastLoginAt` and emits
  `user.logged_in`; logout emits `user.logged_out` (both for the audit
  trail, docs/features/admin.md). `revokeAllSessions` ("sign out
  everywhere"), `revokeOtherSessions` (after a password change) and
  `startSessionFor` (the console's own sign-in) are what the admin module
  uses; it never mints tokens itself.
- **Logout** (`POST /auth/logout {refreshToken}`) ends only the session
  behind that token, identified by the refresh token rather than the access
  token so it still works after the access token expired. It always
  returns 200 and reveals nothing about the token.
- Refresh tokens are stored as SHA-256 hashes (they're long random JWTs;
  argon2 on every refresh would only burn CPU). Sessions idle longer than
  the refresh TTL are deleted when that user next signs in.
- `JwtAuthGuard` verifies the access token, then checks that its session
  (`sid`) is still active (`AuthService.isSessionActive`), so a suspension
  or "sign out everywhere" stops an unexpired access token on its next
  request, not 15 minutes later. It attaches `request.user` (incl.
  `sessionId`); `@CurrentUser()` reads it back out.
- **Web sign-in** (`WebAuthController`, `POST /v1/auth/web/signup`,
  `/login`, `/refresh`, `/logout` - the share page's web player on a
  computer, docs/features/share.md): the same accounts, sessions
  (platform `WEB`), rotation and suspension rules as above, but the
  refresh token never reaches the page's JavaScript - it's an httpOnly
  cookie, `mela_web_refresh`, `SameSite=Strict`, `Secure` in production,
  sent only to `/v1/auth/web`, lasting the refresh TTL. The responses
  carry the access token alone, which the player keeps in memory (renewing
  it a minute early; a browser that signed in keeps just a "signed in"
  marker in `localStorage`, so a fresh visit knows to ask). Every route
  wants `X-Requested-With: mela-web` - a cross-site form can't send that
  header, which with `SameSite=Strict` shuts out cross-site request
  forgery - and is rate-limited per IP (sign-up 5/min, login 10/min,
  refresh 30/min). A refused refresh clears the cookie; logout ends the
  session and clears it. The page renews and signs in only through these
  routes; everything else is the normal API with the access token.

## Mobile side

- **`SessionStore`** keeps the tokens in the iOS Keychain /
  Android KeyStore-backed storage:
  - iOS: `first_unlock_this_device` - readable in the background after the
    first unlock (a live can refresh while the screen is off), never
    restored onto another device. Keychain entries **survive uninstalling
    the app**, so `clearIfFreshInstall()` (called in `main()`) wipes them
    on the first launch after an install, detected with a
    SharedPreferences marker (those are erased on uninstall).
  - Android: `resetOnError` - after a backup restore the encrypted values
    come back without their KeyStore key; they're wiped instead of making
    every read fail. Reads that still fail are treated as signed out.
- **`ApiClient`** (one shared `http.Client`, 20 s timeout) renews the access
  token when it's within a minute of expiring, and on a 401 renews once and
  retries. Concurrent renewals share a single `/auth/refresh`. Only a
  definite 401 from `/auth/refresh` clears the session and fires
  `sessionEnded`; being offline never signs anyone out.
  `validAccessToken()` serves connections that authenticate outside HTTP -
  the viewer's Socket.IO client calls it on every (re)connect via
  `setAuthFn`.
- **`SessionController`** (Riverpod) holds signed-in/out and flips to
  signed-out on `sessionEnded`; go_router's redirect (`app/router.dart`,
  `authRedirect`) follows it, returning the user to where they were headed
  after login (only in-app paths are honored).
- **Startup**: `main()` reads the saved session before the first frame (the
  native launch screen covers it) and opens straight onto discovery - no
  network round trip, works offline.
- **Logout** asks for confirmation first (`core/widgets/confirm_dialog.dart`:
  a native iOS alert on iPhone, a Material dialog on Android).

## How to add to this feature

- New login method (e.g. OAuth/social login): add an endpoint in
  `auth.controller.ts` that ends with the same private `startSession()` in
  `auth.service.ts` - never mint tokens elsewhere.
- "Sign out of all devices" for the user themselves: an authenticated
  endpoint calling `revokeAllSessions` (the console already has it for
  staff, `POST /admin/users/:id/sessions/revoke`).
- Device push tokens (Phase 5): add `pushToken` to `user_sessions`; logout
  and suspension already delete the row, so a signed-out phone stops
  receiving that account's notifications automatically.

## How to modify this feature

Token lifetimes are env-driven (`JWT_ACCESS_TTL_SECONDS` /
`JWT_REFRESH_TTL_SECONDS`). The reuse grace window is
`REFRESH_REUSE_GRACE_MS` in `auth.service.ts`. Rate limits on
`/auth/signup` and `/auth/login` are per-route `@Throttle(...)` in
`auth.controller.ts`.

## How to remove this feature

Not expected to be removed, but if replacing the auth strategy entirely:
`JwtAuthGuard` and `CurrentUser` are the only two exports other modules
depend on (`AuthModule` exports `JwtAuthGuard`) - keep that contract and
everything downstream keeps working.

## Tests

- Backend `auth.service.spec.ts`: duplicate signup, signup emits
  `user.registered` and creates a session, unknown/suspended login rejected,
  two logins = two independent sessions, rotation, in-grace retry,
  post-grace replay ends the session, suspended user can't refresh and
  loses all sessions, signed-out session rejected, pre-session (no `sid`)
  tokens rejected, the refresh race, logout by (even expired) token,
  garbage logout is a no-op, suspension event ends all sessions, a suspended
  account is told so only after the right password, and login records
  `lastLoginAt` and emits `user.logged_in`. `jwt-auth.guard.spec.ts`: an
  access token whose session has ended is refused.
  `web-auth.controller.spec.ts`: the web routes refuse a request without
  `X-Requested-With: mela-web`, set the httpOnly cookie and return only the
  access token, sign up and log in as `WEB`, refresh from the cookie
  (clearing it when refused), and log out. `watch-ticket.service.spec.ts`:
  a watch ticket isn't an access token, nor the other way round.
- Web (`apps/web`, Vitest) `session.test.ts`: the access token in memory
  only, one renewal for callers asking at once, early renewal, sign-out on
  a refused renewal, the session kept through a dropped connection, logout
  even offline.
- Mobile `api_client_test.dart` (renewal, single-flight, offline, timeout,
  validation messages), `session_store_test.dart` (fresh-install wipe),
  `router_test.dart` (redirects), `widget_test.dart` (saved session opens
  discovery; ended session returns to login), `logout_confirmation_test.dart`
  (both platforms).
