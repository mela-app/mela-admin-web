# App updates

**Location**: `apps/backend/src/app-releases` (what phones ask), `apps/backend/src/admin/releases` (publishing), `apps/admin-web/src/features/releases` (the console's **App updates** page), `apps/mobile/lib/features/app_update` (prompts, the required-update screen, what's new)
**Plan reference**: none - client request, 2026-10 ("the app improves step by step; tell people when there's an update")
**Depends on**: `common/prisma`, `common/events` (`app_release.changed`), `realtime` (relays it), `audit` (records it)
**Depended on by**: nothing

## What it does

The team publishes each new version of the app from the console - per
platform, with what's new and whether it's **required**. Phones ask whether
they're current when the app opens, when it comes back to the foreground,
and the moment an update is published. A phone on an older version is
offered the update with everything new since its version; below a required
update the app can't be used until it's updated. On Android, **Google Play
does the updating inside the app** (in-app updates). After updating, the app
shows once what the new version brought.

### Versions, not builds

A release is a **version** (`1.2.0`, three numbers, as in `pubspec.yaml` and
the store) and what's new in it. Phones compare versions as numbers
(`1.10.0` is newer than `1.9.0`). The console asks for no build number and no
link:

- The build number is Play's business. It still goes up with every upload,
  but nobody types it twice - and a mismatch can no longer leave a phone
  thinking it's out of date after updating.
- The link is the store: `ANDROID_INSTALL_URL`, or else the Play listing of
  `ANDROID_APP_PACKAGE_NAME`; `IOS_INSTALL_URL` for the App Store
  (`store-link.ts`, shared with the share page). Publishing for iOS is refused
  (`NO_STORE_LINK`) until there's a listing.

Each version must be newer than the newest one published for that platform
(`VERSION_NOT_NEWER`). Releases from before this change keep their build and
link, still shown in the console.

### What a phone is told (`GET /v1/app/update?platform&version&build`)

Public (signed in or not, so a version too old to sign in can still be told),
under the API's global throttle. `AppReleasesService.check()` reads the
platform's releases and answers:

- `status`: `REQUIRED` when any release newer than `version` is required -
  not only the newest; `AVAILABLE` when there is a newer release;
  `UP_TO_DATE` otherwise (also for a version newer than anything published).
- `latest`: the newest release's `version` and `downloadUrl` (the store).
- `changes`: every release newer than `version`, newest version first (up to
  10) - what's new since this phone's version.
- `current`: the notes of the installed version itself, for "what's new".

Apps from before this change send only `build`: they're compared by build
with the releases that have one, and are behind every release published
since (those have none), so they're told to update.

### On the phone (`lib/features/app_update`)

`AppUpdateGate` wraps the router in `MaterialApp.router`'s `builder`;
`AppUpdateController` (`appUpdateProvider`) holds the last answer and what
Google Play has (`StoreUpdater`: `PlayStoreUpdater` on Android, through the
`in_app_update` plugin - Google's Play Core in-app updates).

- **When it asks**: on launch; on coming back to the foreground, at most
  every 30 minutes (`recheckAfter`) - Play itself on every return, as a
  download may have finished; right away on `app:update` for its platform
  (while signed in); and from **Settings → About → Version**. Play is only
  asked when the server says there's an update.
- **An available update** opens a sheet: the new version, what's new,
  **Update now** and **Later** (3 days, `postponeFor`; a newer version is
  offered at once).
  - Installed from Google Play: **Update now** downloads it in the background
    (a *flexible* update) while Mela stays usable ("Downloading the
    update…"). Once downloaded: "The update is ready - **Restart**" - one tap
    installs it and Mela restarts on the new version. Settings shows the same
    ("Downloading…", "tap to restart"), and a download finished while the app
    was closed is picked up on the next launch.
  - Anywhere else (an APK from elsewhere, a debug build, iPhones): the store
    page opens.
  - Play doesn't have it for this phone yet (a staged rollout, or still in
    review): nothing is offered; Settings says it's on its way.
- **The offer closes by itself** once it no longer applies - the phone is up
  to date (updated, or the team withdrew it), it became required (its own
  screen takes over), or it's downloading.
- **A required update** replaces the whole app with a screen that can only
  update. From Google Play, Play's own full-screen update (*immediate*) opens
  by itself - it downloads, installs and restarts Mela; turned down, the
  screen stays with **Update now** to try again. An update left half-way is
  resumed when the app comes back. Pressing back leaves the app.
  **Nobody is locked out of an update they can't get**: installed from Play,
  with Play having no newer version for this phone - still rolling out, or a
  version typed wrong in the console - the app stays usable and Settings says
  it's on its way (`mustUpdateNow`); the check after Play has it blocks. Only
  an app not from Play (no way to ask Play) is blocked on the server's word.
  **Installed by Play** (`InstalledApp.fromPlay`, Android's installer
  `com.android.vending`) but Play's update check fails - common right after
  a fresh install, and in closed testing - counts as Play having nothing for
  this phone: no offer, no lock. Before, a fresh install could be sent to a
  Play page with no update on it, again and again.
- **Never during a live**: nothing is shown while the phone is watching,
  setting up, hosting or on a stage. A required update waits until the live
  is left.
- **What's new** shows once, on the first launch of a newer version, when the
  team published notes for it. A fresh install just records its version.
- Kept on the device (`shared_preferences`): `app_update_postponed_version`,
  `app_update_postponed_until`, `app_update_seen_version`. A phone with
  `app_update_seen_build` from before counts as having seen an older version.

### In the console (`/app-updates`, under Manage)

Each platform's newest version and the version below which phones must
update; **Publish an update** (the version - the next patch is suggested -
what's new, and "Required update"; where phones get it is shown read-only:
Google Play or the App Store), with a preview of the sheet or screen phones
will show, and a confirmation before publishing; the history, where a
release can be **edited** (what's new, required or not - the version stays)
or **withdrawn** (phones stop being told about it; a withdrawn required
update no longer holds anyone up). Every change reaches the open apps at once.

Access: `VIEW_APP_RELEASES` and `MANAGE_APP_RELEASES`. Audited as
`app.release_published`, `app.release_updated` (with the fields that
changed) and `app.release_withdrawn` - target `APP_RELEASE` ("Android 1.2.0").

### Data and events

- `app_releases` (`AppRelease`): `platform` (`ANDROID`, `IOS`), `version`,
  `notes`, `required`, `publishedById`, timestamps; `build` and `downloadUrl`
  only on releases from before versions were compared (migration
  `20261015090000_releases_by_version` made both optional).
- Domain event `app_release.changed` (`published`, `updated` or `withdrawn`,
  plus the release and the actor). `RealtimeGateway` relays it to every
  socket as `app:update {platform}`; `AuditEventsListener` records it.

### Releasing a new version

The industry's usual way (Semantic Versioning, a build number that only goes
up, staged rollouts) - see mela-mobile's README, "A release build":

1. Raise `version:` in mela-mobile's `pubspec.yaml`: a new patch for fixes
   (1.2.0 → 1.2.1), a new minor for features (1.2.1 → 1.3.0). **Every release
   needs a new version** - two builds sharing one look the same to the
   update check (1.0.1+10 and 1.0.1+11 are both "1.0.1").
2. Commit, then `./tool/release.ps1` (or `tool/release.sh`): it builds the
   app bundle with the **build number set automatically** (the count of git
   commits), refuses a version already released (git tag `v<version>`), and
   tags the commit.
3. Upload it to Google Play (internal, closed testing or production) -
   ideally a **staged rollout**: 10-20% first, more once crash reports look
   healthy.
4. **Once Play has it live on that track**, in the console: **App updates →
   Publish an update** with exactly that version and one change per line.
   Tick **Required update** only for fixes everyone must have.

In-app updates only work for an app installed from Google Play (testers too,
from the testing track's link).

Apps from before versions were compared send only their build: each release
published since gets a build above theirs in the answer (`withLegacyBuilds`),
so those apps are still offered - or required - the update.

### Watching a release

Release builds send crash reports to Firebase Crashlytics (`CrashReports`,
`lib/core/crash_reports.dart`): what broke and where, the app version, the
phone model and Android version - nothing about the account. Debug builds
and builds without `google-services.json` send nothing. The Privacy Policy
says so. After each step of a rollout, look at **Firebase → Crashlytics**
(crash-free users per version) and Play Console's **Android vitals**; halt the
rollout in Play if a version crashes more than the one before. Crashlytics
must be enabled once in the Firebase console (Build → Crashlytics → Enable).

## How to add to this feature

- **Another platform** (a desktop app, say): a value in the `AppPlatform`
  enum (a migration), the mobile `installedAppProvider`'s platform switch,
  and the console's `APP_PLATFORM_LABELS`.
- **More per release** (a minimum OS version, say): a column on
  `AppRelease`, the DTOs in `admin/releases/admin-releases.dto.ts`, the
  answer in `AppReleasesService.check()`, then `UpdateCheck.fromJson` and
  the sheets on the phone.

## How to modify this feature

- How often phones ask, and how long "Later" holds: `recheckAfter` and
  `postponeFor` in `AppUpdateController`.
- What counts as being inside a live: `_isLive` and `broadcastingProvider`
  in `AppUpdateGate`.
- How many releases' notes a phone is sent: `CHANGES_SHOWN` in
  `app-releases.service.ts`.
- Publishing rules: `publish()` in `AdminReleasesService`, and their
  mirror for instant feedback in the console's `release-form.ts`.
- The wording: `update_sheets.dart` and `update_required_screen.dart`.

## How to remove this feature

1. Remove `AppReleasesModule` from `app.module.ts`, `AdminReleasesController`
   and `AdminReleasesService` from `AdminModule`, then delete
   `src/app-releases` and `src/admin/releases`.
2. Remove `app_release.changed` from `domain-events.ts`, its relay in
   `realtime.gateway.ts` and its handler in `audit-events.listener.ts`, and
   the `app.release_*` actions from `audit-catalog.ts`.
3. A migration dropping `app_releases` and `AppPlatform`. The
   `VIEW_APP_RELEASES`/`MANAGE_APP_RELEASES` enum values can stay (Postgres
   can't drop enum values without recreating the type) - remove them from
   `INCLUDES` and the console's access areas.
4. Console: the route, the sidebar entry and `features/releases`.
5. Mobile: `AppUpdateGate` in `main.dart`, `AppVersionTile` in Settings,
   `lib/features/app_update`, `appUpdateRepositoryProvider`, the `in_app_update` package, and
   `url_launcher` (plus its `<queries>` entry in `AndroidManifest.xml`) if
   nothing else uses it.

Phones already shipped keep asking `GET /v1/app/update`; with the route gone
they get a 404, treat it like being offline, and carry on.

## Tests

- Backend (jest): `app-releases/app-releases.service.spec.ts` (by version -
  1.10.0 after 1.9.0 - up to date, available from Google Play with what's
  new, required by an older release, at most 10 releases, apps that send
  only a build, no App Store listing), `app-releases/app-release.rules.spec.ts`
  (versions), `admin/releases/admin-releases.service.spec.ts` (no build or
  link, only newer versions, iOS needs a listing, editing only what changed,
  withdrawing, the platform summary with the next version), plus cases in
  `audit/audit-events.listener.spec.ts` and `realtime/realtime.gateway.spec.ts`.
- Console (vitest): `features/releases/release-form.test.ts`, and the access
  area in `lib/permissions.test.tsx`.
- Mobile: `app_update_test.dart` (the answer, versions, when to offer - not
  while Play hasn't got it or it downloads - what's new, the request,
  rechecking, the realtime event, what's kept on the device, and through a
  fake Google Play: the background download and restart, Play's own screen
  for a required update, a download finished earlier, not on Play yet, not
  from Play) and `app_update_gate_test.dart` (the sheet, Later, the store
  page, the required screen, waiting out a live or a broadcast, what's new
  once, a first install, the offer closing by itself, and the Play flows).
- Not unit-tested: Google Play itself (`PlayStoreUpdater`) - check on a phone
  that installed Mela from a Play testing track.
