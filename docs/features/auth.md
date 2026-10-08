# Auth

**Location**: `apps/backend/src/auth` (+ `auth/identity/` for verified sign-up; mobile `lib/core/api_client.dart`, `session_store.dart`, `features/auth/`; web `src/auth/`)
**Plan reference**: plan §8 (`user_sessions`), §11 (security); task-breakdown Phase 0, Phase 1.5 (#2, #3, #4, #8)
**Depends on**: `common/prisma`, `common/events`, `@nestjs/jwt`, `argon2`, `firebase-admin` (checking sign-up identity tokens)
**Depended on by**: `users`, and every module that guards a route with `JwtAuthGuard`

## What it does

Sign-up with a proven identity, then login / refresh / logout with **one
session per signed-in device** (`user_sessions`), so signing in on a
second phone never signs the first one out. Passwords are hashed with argon2.

### Verified sign-up (client request, 2026-10)

Every new account starts from an identity someone proved is theirs - a
Google account, or an email whose owner tapped the link sent to it. A phone
number is the next way to prove it (below).

- **Firebase Authentication proves it; Mela keeps the account.** The app
  (and the web player) signs the person in to Firebase - with Google, or
  with an email and password once Firebase's emailed link was tapped - and
  sends the resulting **ID token** to the API. `FirebaseIdentityVerifier`
  (`auth/identity/`) checks its signature, audience (`FIREBASE_PROJECT_ID`),
  issuer and expiry against Google's public keys - no service account
  needed - and `identityFromFirebaseClaims` turns it into a
  `VerifiedIdentity`: `google` (Google's own account id `sub`, which never
  changes, plus the email Google vouched for) or `email` (only with
  `email_verified`; else `403 EMAIL_NOT_VERIFIED`). Anything else is
  `400 UNSUPPORTED_IDENTITY`. Once Mela has the account, the client
  deletes the person from Firebase and signs out of it: Firebase holds no
  password or session, and the email sign-up's password lives only in Mela
  (argon2). Google and the emailed link are free; nothing is sent from Mela.
- **`POST /v1/auth/identity {idToken, platform?}`** (10/min per IP): signs
  in when the identity has an account - `{status: 'SIGNED_IN',
  accessToken, refreshToken}` - or answers `{status: 'NEEDS_ACCOUNT',
  email, displayName, suggestedUsername}` without creating anything. A
  Google account is found by its linked identity (`user_identities`,
  unique `(provider, subject)`), else by the email Google vouched for
  (case-insensitive), which links the two. A confirmed email never signs
  into an account - it only starts one (`409 EMAIL_TAKEN` when the email
  is in use, told only to whoever proved it, so no stranger learns which
  emails have accounts).
- **`POST /v1/auth/identity/signup {idToken, username, displayName,
  password?}`** (5/min): creates the account with `emailVerifiedAt` set -
  a password only for an email sign-up (`400 PASSWORD_REQUIRED`), never for
  Google (`400 PASSWORD_NOT_ALLOWED`: Google accounts have no password).
  Taken usernames are refused whatever their case (`409 USERNAME_TAKEN`),
  and a race on the unique indexes maps to the same codes. Emits
  `user.registered` with `method` (`google` | `email`, audited).
- **`GET /v1/auth/username-available?username=`** (30/min): `{available}`,
  case-insensitive. Suggestions (`usernameCandidates`) come from the
  person's Google name, else their email's local part (letters outside
  a-z drop out; `mela` when nothing is left), then with 2, 3, 4 random
  digits - checked in one query per round.
- **Existing accounts.** Password login carries on unchanged. Continue with
  Google on an account with the same email links them
  (`account.identity_linked`, audited). **If that account's email was
  never proven** (`emailVerifiedAt` null - every account made before this),
  whoever made it may not own the email, so the Google owner takes it over:
  its password stops working, every other device is signed out (the
  realtime gateway disconnects their sockets), and from then on it signs in
  with Google. An account already linked to a different Google account is
  refused (`409 GOOGLE_ACCOUNT_MISMATCH`). **Staff accounts never sign in
  with Google** (`403 PASSWORD_SIGN_IN_REQUIRED`): the console checks their
  password, and a mistyped staff email must not be claimable. For the same
  reason the console won't make a password-less (Google) account staff -
  it creates a separate staff account instead. Suspended accounts get
  `403 ACCOUNT_SUSPENDED`.
- **Login** treats a Google-only account like a wrong password, checking a
  dummy argon2 hash so it takes as long, and says nothing about how the
  account signs in. The app's login form says "Signed up with Google? Use
  Continue with Google." instead.
- **A password, any time later - never required** (client request,
  2026-10): Settings > Account > Password in the app. `GET
  /v1/me/sign-in-methods` says `{email, hasPassword, google: {email} | null,
  managedByConsole}`; `PUT /v1/me/password` `{newPassword (8-72),
  currentPassword?, idToken?}` sets it (5/min, `AccountPasswordService`).
  Whoever asks proves it's them right now: with the **current password**, or
  with a fresh Google sign-in whose subject is **this account's linked
  Google identity** (`403 GOOGLE_ACCOUNT_MISMATCH` otherwise; a confirmed
  email won't do). Google is the only way for an account made with Google
  (`GOOGLE_CONFIRMATION_REQUIRED`), and the way back for anyone who forgot
  theirs ("Forgot it? Confirm with Google instead") - no weaker than
  Continue with Google, which that Google account can already use. Without
  Google an existing password must be given (`CURRENT_PASSWORD_REQUIRED`,
  `WRONG_PASSWORD`, `SAME_PASSWORD`). The **first** password leaves every
  device signed in (`account.password_added`); a **change** signs out every
  other device (`account.password_changed`). Both are audited with
  `confirmedWith: password | google` and leave a security notice in the
  app's notifications (docs/features/notifications.md). A rejected Google
  token answers 400, not 401 - on a signed-in route the app reads 401 as
  its own session ending. **Staff** passwords follow the console's stricter
  rules, so they change there only (`403 STAFF_ACCOUNT`; the app shows
  "Change it in the admin console").
- **Deleting an account** (2026-10; Apple's guideline 5.1.1(v) and Google
  Play's account deletion policy want it in the app for any app with
  sign-up): Settings > Account > Delete account. `POST
  /v1/me/account/delete {currentPassword?, idToken?}` (5/min,
  `AccountDeletionService` in `src/users`), proven like a password change -
  `proveAccount` in `auth/account-proof.ts` is shared by both: the current
  password, or a fresh sign-in to the account's own linked Google account
  (the only way for an account made with Google, and the way back for a
  forgotten password), with the same refusals. Staff are refused (`403
  STAFF_ACCOUNT`). In order: any live they're running ends
  (`StreamsService.end`); then in one transaction the audit trail is
  anonymised - their own entries' actor becomes "Deleted account" without
  IP address or device, entries about them get the same label - their
  lives are deleted, then the user row, and the database cascades the rest
  (sessions and push tokens, Google sign-in link, follows, blocks, mutes,
  chat messages, private messages and conversations, notifications,
  settings, stage and moderator rows). Report cases stay, with their
  snapshot and the account's id set to null (docs/features/moderation.md).
  Then the avatar and the chat photos of their lives are deleted from
  storage (best effort). `account.deleted` closes their sockets
  (`RealtimeGateway.handleAccountDeleted`) and is audited - `account.deleted`
  (by the user, labelled "Deleted account"), or `user.deleted` with the
  reason when a super admin deleted it from the console (`POST
  /v1/admin/users/:id/delete {reason}`, for someone who asked without the
  app; staff are made app users first, `409`). The username is free again
  afterwards.
- **Deleting without the app**: `GET /delete-account` (no version prefix,
  `AccountDeletionPageController` in `src/share`) is a static page - the
  steps in the app, what's deleted and what's kept, and, with `SUPPORT_EMAIL`
  set, an email link to ask instead (answered within 7 days, then done from
  the console). Google Play's Data safety form asks for this address:
  `https://<the API's domain>/delete-account`.
- **The old sign-up** (`POST /v1/auth/signup`, never verified) answers
  `400 APP_UPDATE_REQUIRED` ("Update Mela to sign up") for apps from before
  this; the web player's old sign-up route is gone.
- **A phone number next**: Firebase phone sign-in (paid per SMS on
  Firebase's pay-as-you-go plan) gives an ID token with `phone_number` and
  `sign_in_provider: 'phone'`. It needs a `phone` case in
  `identityFromFirebaseClaims`, a `PHONE` value in `IdentityProvider`
  (subject = the E.164 number) and `users.email` made optional for
  phone-only accounts - the endpoints and both clients' flows stay as they are.

**Setup (once, in the Firebase console - project `FIREBASE_PROJECT_ID`):**
Authentication > Sign-in method: enable **Google** and **Email/Password**.
Project settings > the Android app: add the **SHA-1 and SHA-256** of every
key that signs the app (the debug keystore's for development builds; the
release key's), then download `google-services.json` again - it now carries
the OAuth clients Google sign-in needs. For the web player: add a **Web
app**, put its `apiKey`/`appId` in the API's `FIREBASE_WEB_API_KEY` /
`FIREBASE_WEB_APP_ID`, and add the API's domain to Authentication >
Settings > **Authorized domains**. iOS needs `GoogleService-Info.plist` and
its `REVERSED_CLIENT_ID` as a URL scheme in `Info.plist`.

### Sessions

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
- **Web sign-in** (`WebAuthController`, `POST /v1/auth/web/identity`,
  `/identity/signup`, `/login`, `/refresh`, `/logout` - the share page's web player on a
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
  forgery - and is rate-limited per IP (Google 10/min, new account 5/min, login 10/min,
  refresh 30/min). A refused refresh clears the cookie; logout ends the
  session and clears it. The page renews and signs in only through these
  routes; everything else is the normal API with the access token.
  **Continue with Google on the web**: the share page passes the Firebase
  Web app's public settings in its player config (only when
  `FIREBASE_WEB_API_KEY` / `FIREBASE_WEB_APP_ID` are set) and widens its
  CSP just for Google's popup: `script-src https://apis.google.com` and
  `frame-src https://{authDomain}`. The player loads Firebase as its own
  chunk when the sign-in dialog opens (so the popup opens straight from the
  click), keeps Firebase in memory only, and someone new picks a username
  in the dialog. Without those settings it says to sign up in the app.

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
- **Signing in or up** (`features/auth/login_screen.dart`): Continue with
  Google first, then password login for existing accounts, then "Sign up
  with email". `SignUpFlow` (`sign_up_flow.dart`, a `ChangeNotifier`) runs
  the steps - `start`, `emailForm`, `checkEmail`, `chooseUsername` - over
  an `IdentityVerifier` (`identity/`; Firebase in the app,
  `firebase_auth` + `google_sign_in`, a fake in tests). The email form checks
  the username is free before Firebase sends the link; "Check your email"
  looks for the tapped link every 4 s and whenever the app comes back to
  the foreground, with "I've confirmed it", "Send the link again" (after
  30 s) and "Use a different email". A username taken in the meantime only
  asks for another - the email stays confirmed. Android's back button goes
  back a step. Without Firebase (no `google-services.json`) the buttons say
  signing up isn't available in that build; login still works.
- **Password settings** (`features/auth/account/password_screen.dart`,
  route `/settings/password`, shut while hosting like the rest of the
  account settings): Settings > Account shows "Add a password" for an
  account made with Google, "Password" otherwise, and "Change it in the
  admin console" for staff (`PasswordTile`, over `signInMethodsProvider`).
  Adding asks for the new password twice, then "Confirm with Google"
  (`IdentityVerifier.signInWithGoogle()`, `finish()` once the API
  answered); changing asks for the current one too, or Google after
  "Forgot it?". A tapped security notice opens it.
- **Delete account** (`features/auth/account/delete_account_screen.dart`,
  route `/settings/delete-account`, shut while hosting like the rest):
  Settings > Account > Delete account, in red. The screen says it can't be
  undone, what's deleted and what's kept, then asks for the password - or
  "Confirm with Google and delete" for an account made with Google, or after
  "Forgot it?" - and once more in a dialog (`confirmAction`: a native alert
  on iPhone). Done, `SessionController.deleteAccount` forgets the session on
  this device without logging out (the server already ended every
  session), the router goes to login, and "Your account was deleted."
  shows. A staff account is told it's deleted in the console.

## How to add to this feature

- New login method (e.g. a phone number): add its case to
  `identityFromFirebaseClaims` and `IdentityProvider` (see "A phone number
  next" above) - sign-in still ends in `AuthService.startSessionFor`; never
  mint tokens elsewhere.
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
`/auth/identity`, `/auth/identity/signup` and `/auth/login` are per-route `@Throttle(...)` in
`auth.controller.ts`.

## How to remove this feature

Not expected to be removed, but if replacing the auth strategy entirely:
`JwtAuthGuard` and `CurrentUser` are the only two exports other modules
depend on (`AuthModule` exports `JwtAuthGuard`) - keep that contract and
everything downstream keeps working.

## Tests

- Backend `auth.service.spec.ts`: unknown/suspended login rejected, a
  Google-only account refused like a wrong password,
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
  access token, continue with Google (the cookie only once signed in), create
  the account and log in as `WEB`, refresh from the cookie
  (clearing it when refused), and log out. `watch-ticket.service.spec.ts`:
  a watch ticket isn't an access token, nor the other way round.
  `identity/identity-sign-in.service.spec.ts`: signing in a linked Google
  account, a newcomer's suggested start, linking a proven account (password
  and devices kept) vs taking over an unproven one (password cleared,
  sessions ended before the new one), a mismatched Google account, staff and
  suspended accounts left alone, a confirmed email never signing in, account
  creation for both methods (password only for email), and every conflict.
  `identity/verified-identity.spec.ts`: Firebase claims to identities
  (unverified email, missing ids, unsupported providers) and username
  suggestions. `share/web-fallback.controller.spec.ts`: the Firebase web
  settings and CSP only when configured. `account-password.service.spec.ts`:
  the sign-in methods; a first password confirmed with the linked Google
  account only (not another one, a confirmed email, or an expired sign-in -
  a 400 there), keeping every device; a change with the current password or
  Google, signing out the other devices (all of them for a token without a
  session); wrong, missing and unchanged passwords; staff left to the console.
  `users/account-deletion.service.spec.ts`: deleting with the password
  (its live ended, the audit trail anonymised, its lives and files gone, the
  event), nothing without the right password, Google for an account made
  with Google, staff left to the console, a super admin's delete with a
  reason, never their own or a staff account.
  `share/account-deletion-page.controller.spec.ts`: the page's steps and
  lists, and the support email link only when set (escaped).
- Web `auth/AuthDialog.test.tsx`: log in; Continue with Google into an
  account or on to a username (taken before and after sending; checked
  before sending; cancelled); a closed popup changes nothing; without
  Firebase it sends people to the app. `App.test.tsx`: the button appears
  only with the page's Firebase settings.
- Web (`apps/web`, Vitest) `session.test.ts`: the access token in memory
  only, one renewal for callers asking at once, early renewal, sign-out on
  a refused renewal, the session kept through a dropped connection, logout
  even offline.
- Mobile `api_client_test.dart` (renewal, single-flight, offline, timeout,
  validation messages), `session_store_test.dart` (fresh-install wipe),
  `router_test.dart` (redirects), `widget_test.dart` (saved session opens
  discovery; ended session returns to login; the sign-in screen, the email
  form's checks, a whole Google sign-up landing on discovery),
  `sign_up_flow_test.dart` (both methods step by step: the link found by
  polling, resend after the wait, a username taken before or after the
  link, an email in use, a different email, the username lookup),
  `password_screen_test.dart` (the settings row for Google, password and
  staff accounts; adding with Google, the two not matching, backing out of
  Google; changing with the current one, a refusal, resetting with Google,
  no Google way back without Google),
  `delete_account_test.dart` (what goes and stays shown first; the password
  and a second confirmation, then signed out with the session forgotten;
  nothing without the password or after Cancel; Google for an account made
  with it, and after "Forgot it?"; a wrong password keeps them signed in;
  staff told to use the console),
  `logout_confirmation_test.dart` (both platforms).
