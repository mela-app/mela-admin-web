# Share a live & deep links

**Location**: `apps/backend/src/share` + `apps/web` (the share page's browser player) + mobile `lib/features/live_stream` (share button), `lib/app` (deep link wiring)
**Plan reference**: plan §6.12
**Depends on**: `social` (block checks and who may watch, for in-app invites), `common/rate-limit` (anti-spam); the web player on `streams` (`POST /streams/:id/watch`), `realtime` (watch-only sockets) and `auth` (web sign-in)
**Depended on by**: nothing imports this module - `ShareService.sendInvites()` emits a `stream.invite_sent` domain event that `notifications` reacts to (see docs/features/notifications.md); nothing else depends on it either

## What it does

- **`POST /streams/:id/invites`** (`ShareService.sendInvites()`, "send to
  friends" from the live screen): 404s unless the stream is currently live;
  a per-sender token-bucket rate limit (5 batches/minute via
  `RateLimitService`) rejects a burst; the requested user ids are
  deduplicated, yourself removed, and re-checked server-side - the server
  never trusts a client-supplied id list at face value: active accounts
  only, nobody blocked either way with the sender or the host, and only
  people who may watch that live (a followers' or friends' live). Friend
  or not (client request, 2026-10: the sheet also searches anyone), each
  person is sent a live **once per sender per live** - a Redis SET
  (`invite:{streamId}:{senderId}`, 24h TTL) remembers who, and also caps
  distinct invites to 20 per sender per stream, refusing once it's full
  rather than silently dropping the rest. Whatever's left after all of that emits one `stream.invite_sent`
  domain event `{streamId, senderId, recipientIds}` - `NotificationsService`
  does the actual notification fan-out (§6.11), so this module never
  touches the `notifications` table directly.
- **`GET /live/:id`** (`WebFallbackController`, deliberately unversioned -
  `VERSION_NEUTRAL`, not under `/v1`, since this is what a real
  `https://{app-domain}/live/:id` share link points at for a browser, not
  an API call from the app): a small server-rendered HTML page - the
  stream's title, host, live/ended state, Open Graph tags so the link
  previews nicely in chat apps, and an "open in app" link using the custom
  URL scheme (`APP_URL_SCHEME`, default `gamblinglive`). User-controlled
  text (title, host display name) is HTML-escaped before being embedded in
  the page, a real XSS concern otherwise since both are attacker-controllable
  strings; an id that isn't a UUID never reaches the database. While the
  live is on, the page also carries the **web player** (below): that
  server-rendered content sits inside `<div id="mela-player">` as the
  fallback (what link previews, crawlers and a browser without JavaScript
  get), plus the player's settings as JSON (`<script
  id="mela-player-config" type="application/json">`, `<` escaped),
  `/web/player.css` and `/web/player.js`, and a Content-Security-Policy of
  its own - helmet's default would block the video SDKs' connections:
  `connect-src 'self' https: wss:` (plus `http: ws:` outside production),
  `media-src 'self' blob: mediastream:`, `worker-src 'self' blob:`,
  `img-src 'self' data: blob: https:`, scripts from this origin only. An
  ended live's page has no player - just the fallback.
- **Web player** (`apps/web`, React + Vite + TypeScript like the admin
  console): watching a live in the browser from its share link - the
  video, the host's name and viewer count, the chat (read-only until
  signed in), and the way into the app.
  - **Files**: built to fixed names, `/web/player.js` and
    `/web/player.css` (revalidated on every visit, so a deploy shows at
    once), plus content-hashed `/web/assets/*` (cached for a year). The
    video SDKs are separate chunks loaded only for the live's provider
    (Agora ~430 kB gzipped, LiveKit ~135 kB); the page itself is ~95 kB.
    The `web` container (nginx, `apps/web/Dockerfile`) serves them, and
    Caddy routes `/web/*` on the API's host to it - one origin, so the
    player calls the API and its socket without CORS.
  - **Watching**: `POST /v1/streams/:id/watch` (streams module; optional
    sign-in; 20 per minute per IP) answers 404 when the live is over, 403
    to a signed-in viewer the host has banned, and otherwise: the stream,
    an audience video token for an anonymous viewer id (`web-<uuid>`, never
    the account's - it can't clash with the viewer's own app), a **watch
    ticket** (`WatchTicketService`: a JWT for that viewer id and live,
    4 hours, signed with a key derived from `JWT_ACCESS_SECRET`, so it can
    never pass as an access token), `isFollowingHost`, the pinned message,
    who's on stage (`activeGuests`, `hostAgoraUid`) and `serverTime`. The
    browser then joins the video straight from Agora's cloud or the
    LiveKit server as audience - Agora: the host's full stream, guests'
    low streams, audio-only fallback on a weak connection; LiveKit:
    adaptive stream.
  - **Live updates**: the ticket opens a **watch-only socket**
    (docs/features/realtime.md): `stream:watch` joins the live's room -
    counted in the viewer count, never listed or announced - and answers
    with the room's state and the last 30 chat messages. From then on the
    page follows the room like the app: viewers, likes, chat (new,
    deleted, pinned), "Live paused", "The host stepped away", guests
    joining and leaving the stage, moderators' MOD badges, admin alerts,
    and the end - with the app's own wording ("LIVE has ended", "This live
    was stopped" with the administrator's reason, "Removed from stream").
    A ticket that ran out (a reconnect after 4 hours) fetches a new one.
  - **Phones** (Android, iPhone, and iPads asking for the desktop site):
    chatting, liking, following and joining the stage all need the app.
    A "Get the app" bar stays at the top; tapping any of those opens a
    sheet with "Open in the app" (Android: an `intent://` link, which
    goes to the Play Store by itself when the app isn't installed; iOS:
    the custom scheme, then the App Store after 1.5 s if the page is
    still showing), "Get the app" (the store link) and "Not now". After a
    minute of watching, the sheet comes up once by itself (once per tab:
    `sessionStorage` `mela.web.nudged`).
  - **Computers**: the video beside a side panel - chat, controls, and a
    QR code of the page ("Watch on your phone"; the code is drawn locally
    with `uqr`). Signed out, chatting, liking or following opens **Log in
    / Sign up** right on the page (the same rules as the app's sign-up),
    and after a minute of watching that dialog opens once by itself.
    Signed in (`/v1/auth/web`, docs/features/auth.md), the player joins
    the room as the account (`stream:join`) and chats, likes and follows
    for real; a Follow tapped before signing in goes through after. The
    stage stays app-only: "Join the stage" shows the QR code. Signed in,
    an **Inbox** button with the unread count opens their direct messages
    in a drawer beside the live (docs/features/messages.md).
  - **Sound**: browsers hold sound back until the first tap; the player
    shows "Tap to unmute", and any tap on the page unmutes.
  - **Where "Get the app" goes**: `ANDROID_INSTALL_URL` (default: the Play
    Store listing for `ANDROID_APP_PACKAGE_NAME`) and `IOS_INSTALL_URL`
    (blank: no iOS store link until there's an App Store listing).
  - **Signing up**: Continue with Google, when the API has the Firebase Web
    app's settings (`FIREBASE_WEB_API_KEY` / `FIREBASE_WEB_APP_ID`) - the
    page then also allows Google's popup in its CSP; otherwise new people
    are sent to the app. Existing accounts log in with their password
    either way. See docs/features/auth.md.
  - **Limits, by design**: anonymous viewers count but aren't listed (no
    name to show); a viewer banned from a live can still watch it signed
    out, but can't chat, like or follow there; the viewer count can only
    be inflated as fast as the watch endpoint's per-IP limit allows.
- **`GET /profile/:id`** (`ProfileLinkController`, 2026-10, unversioned like
  `/live/:id`): where a shared profile link lands in a browser - so the app
  opened it straight away if installed (App Links / Universal Links, once
  verified - the AASA lists `/profile/*` too). A small page with Open Graph
  tags (the name, `@username`, the picture when it's an http(s) URL),
  `noindex`, an "Open in the Mela app" button (`{APP_URL_SCHEME}://profile/:id`)
  and "Get Mela" store buttons (`installLinks`, shared with the web player:
  `ANDROID_INSTALL_URL` / `IOS_INSTALL_URL`). A nonce'd script at the end of
  the body tries the app at once: on Android an `intent://` URL with
  `S.browser_fallback_url` set to the Play Store - Chrome opens the app, or
  the store when it isn't installed; on iPhone/iPad it goes to the App Store
  only when `APPLE_APP_ID` is set (with Universal Links, an installed app
  never reaches this page) and `IOS_INSTALL_URL` exists. Unknown, non-UUID
  and non-active accounts get a plain 404 page with the store buttons. Its
  own CSP: `default-src 'none'`, the nonce'd script only, inline styles,
  images from https. The app parses `/profile/:id` (and
  `{scheme}://profile/:id`) in `deep_link_listener.dart`: its own id opens
  the Profile tab, anyone else's their profile. `AppConfig.profileLink`
  builds the link from `APP_LINK_BASE_URL` (the root now - a legacy
  `.../live` value still works).
- **`.well-known/assetlinks.json` / `.well-known/apple-app-site-association`**
  (`WellKnownController`, also `VERSION_NEUTRAL`): the domain-verification
  files Android App Links / iOS Universal Links need to open a link
  straight into the app instead of a browser. Return empty/placeholder
  content until `ANDROID_APP_SHA256_FINGERPRINT`/`APPLE_APP_ID` are set -
  **needs a real app domain, a signed release build, and an Apple
  Developer account (needed from the project owner, same as the Agora
  keys)**, so this is deliberately inert for now, not half-built: the
  routes exist and are wired up so nothing else has to change once those
  values are set.
- **Mobile deep links** (`apps/mobile/lib/features/notifications/presentation/deep_link_listener.dart`
  - grouped with notifications since it's mounted alongside
  `NotificationBannerListener`, not because it's conceptually part of that
  feature): a custom URL scheme (`gamblinglive://live/{id}`) works today
  without any of the above - registered as an Android intent-filter
  (`AndroidManifest.xml`) and an iOS `CFBundleURLTypes` entry (`Info.plist`),
  resolving to the same `/live/:streamId` go_router route a normal in-app
  navigation would use. `DeepLinkListener` handles both a cold start
  (`AppLinks.getInitialLink()`) and a link received while already running
  (`AppLinks.uriLinkStream`), and navigates through `routerProvider`'s
  instance - mounted above the Router, `GoRouter.of(context)` throws there
  (fixed 2026-09-27); `parseLiveDeepLink()` normalizes the custom
  scheme's `host`+`path` split and a real https link's plain `path` to one
  shape before matching, so the same parser handles both without a second
  code path once App/Universal Links are real. Real Android App Links / iOS
  Universal Links (the `https://` ones, no "open with" prompt) are deferred
  until the domain + well-known files above are real.
- **Mobile share button** (`apps/mobile/lib/features/share`): on the live
  screen for everyone (host, guest, moderator, viewer) - `showShareSheet()`
  offers the native share sheet (`share_plus`'s `Share.share()`, via
  `share_live.dart`, sharing `AppConfig.appLinkBaseUrl` + the stream id -
  `APP_LINK_BASE_URL` in the app's `.env`: the custom scheme
  (`gamblinglive://live`) until a domain exists, then
  `https://{domain}/live`) or "send to friends" (`send_to_friends_sheet.dart` - multi-select
  from `GET /users/me/friends`, or anyone through `GET /users/search` in its search box, then
  `ShareRepository.sendInvites()`; whoever this device already sent the live to shows as "Sent",
  `sentInvitesProvider`).
- **Security**: a share link is never an access grant on its own -
  `POST /streams/:id/join` still enforces room bans/blocks server-side
  regardless of how the viewer got there, so a leaked link can't bypass
  them (plan §6.12).

## How to add to this feature

- **Share attribution/analytics** (`?ref=`): deferred (plan §6.12) - would
  add a query param read by both the mobile deep-link handler and
  `WebFallbackController`, and a column somewhere to record it; nothing
  here currently threads one through.
- **A higher/lower invite cap or rate limit**: `INVITE_CAP_PER_STREAM` and
  `INVITE_RATE_LIMIT` are both constants at the top of `share.service.ts`.

## How to modify this feature

The web fallback page's HTML is a single template-string function
(`renderPage()` in `web-fallback.controller.ts`) - no templating engine
dependency; the player's settings are `PlayerConfig` in the same file
(and `apps/web/src/config.ts` on the other side).

**Working on the web player**: with the backend running,
`npm run dev` in `apps/web` and open
`http://localhost:5174/web/?stream=<live id>` - Vite proxies `/v1` and the
socket to `WEB_API_ORIGIN` in the player's `.env` (no default), one origin as
in production. The real share page with the built player runs on the
server, where Caddy sends `/web/*` to the player's container
(`https://API_DOMAIN/live/<id>`). `npm test` (Vitest),
`npm run lint` (oxlint) and `npm run build` (type-checks first) in
`apps/web`; CI: `.github/workflows/ci.yml` there. The words the player shows
are in `src/copy.ts` (prompts, ended screens), and the one-minute prompt's
delay is `NUDGE_AFTER_MS` in `src/App.tsx`.

## How to remove this feature

Remove `ShareModule` from `app.module.ts`. `NotificationsModule` still
boots fine without it (it only ever reacts to `stream.invite_sent` if it
happens to fire - nothing breaks if it never does). Mobile: remove the
share button and "send to friends" sheet from the live screen, and the
deep-link intent-filter/URL-scheme registration in
`android/app/src/main/AndroidManifest.xml`/`ios/Runner/Info.plist` (a
plain `flutter run` still works without them - it just means a
`gamblinglive://` link no longer reopens the app).

**Just the web player**: drop the player markup from `renderPage()` (the
page goes back to the plain preview), the `web` service from both compose
files and the `/web/*` routes from the Caddyfiles, then `apps/web`.
`POST /streams/:id/watch`, `WatchTicketService`, the gateway's watch-only
sockets and `/v1/auth/web` exist only for it and can go too.

## Tests

`share.service.spec.ts` covers: 404 on a non-live stream, the rate limit,
silently dropping non-friends and yourself, emitting `stream.invite_sent`
with the final filtered+capped list, refusing once the per-stream cap is
already used up, and only inviting up to the remaining room under the cap.
A manual smoke test (`Invoke-WebRequest`) confirmed `GET /live/:id` (200,
HTML) and `GET /.well-known/assetlinks.json` (200, `[]` with no fingerprint
configured) against a running dev server.

Web player, backend: `web-fallback.controller.spec.ts` (the player only
while live, its CSP, the settings JSON escaped, non-UUID ids),
`watch-ticket.service.spec.ts`, the `watch` cases in
`streams.service.spec.ts` (404 when over, 403 when banned, an anonymous
viewer id and ticket), "watch-only sockets" in `realtime.gateway.spec.ts`,
`web-auth.controller.spec.ts` and `live-presence.service.spec.ts`
(anonymous viewers kept out of the list). `apps/web` (Vitest): the room
reducer, the page settings, app/store links and device detection, the web
session (renewal, one refresh for concurrent callers, sign-out on refusal,
surviving a dropped connection), sign-up validation, the dialog, and the
gating - phone vs computer, signed in or not, the one-minute prompt, the
ended screens. End to end through the tunnel (2026-09-30, Agora): an
anonymous viewer counted, chat history and new messages, sign-up on a
computer then like/follow/chat as that account, the phone's install
sheet, the live ending while watched, and the ended link's plain page.

Mobile: `share_repository_test.dart` covers `sendInvites()` posting to
`/streams/:id/invites` with the raw `userIds` (the server, not the mobile
repository, is what actually filters to friends - confirmed by the request
body still containing a deliberately-not-a-friend id, and only the
server's-returned subset coming back as `invited`). `deep_link_test.dart`
covers `parseLiveDeepLink()` for both link shapes, percent-decoding, and
non-matching links (see docs/features/notifications.md for the rest of
that file's coverage, and why it lives under `features/notifications/`).
