# App updates

**Location**: `apps/backend/src/app-releases` (what phones ask), `apps/backend/src/admin/releases` (publishing), `apps/admin-web/src/features/releases` (the console's **App updates** page), `apps/mobile/lib/features/app_update` (prompts, the required-update screen, what's new)
**Plan reference**: none - client request, 2026-10 ("the app improves step by step; tell people when there's an update")
**Depends on**: `common/prisma`, `common/events` (`app_release.changed`), `realtime` (relays it), `audit` (records it)
**Depended on by**: nothing

## What it does

The team publishes each new version of the app from the console - per
platform, with what's new, a download link, and whether it's **required**.
Phones ask whether they're current when the app opens, when it comes back
to the foreground, and the moment an update is published. A phone on an
older build is offered the update with everything new since its version;
below a required update the app can't be used until it's updated. After
updating, the app shows once what the new version brought.

### Versions and builds

A release has a **version** people see (`1.2.0`, three numbers) and a
**build number** phones compare: the number after `+` in `pubspec.yaml`
(`version: 1.2.0+12` - Android's `versionCode`, iOS's `CFBundleVersion`).
Builds only go up per platform: publishing refuses a build that isn't
higher than the newest one (`BUILD_NOT_NEWER`), or a version lower than the
newest one's (`VERSION_OLDER`). Android requires a higher build for an APK
to install over the old one anyway.

APKs built with `--split-per-abi` report `1000 × ABI + build` as their
version code (Flutter's Gradle plugin: 1008, 2008...). The app takes that
offset back off (`installedBuild()` in `app_update_controller.dart`), which
holds while build numbers stay below 1000.

### What a phone is told (`GET /v1/app/update?platform&build`)

Public (signed in or not, so a build too old to sign in can still be told),
under the API's global throttle. `AppReleasesService.check()` answers:

- `status`: `REQUIRED` when any release newer than `build` is required -
  not only the newest; `AVAILABLE` when there is a newer release;
  `UP_TO_DATE` otherwise (also for a build newer than anything published).
- `latest`: the newest release's `version`, `build` and `downloadUrl` - the
  link phones open, even when an older release is the required one.
- `changes`: every release newer than `build`, newest first (up to 10) -
  what's new since this phone's version.
- `current`: the notes of the installed build itself, for "what's new"
  after updating.

### On the phone (`lib/features/app_update`)

`AppUpdateGate` wraps the router in `MaterialApp.router`'s `builder`;
`AppUpdateController` (`appUpdateProvider`) holds the last answer.

- **When it asks**: on launch; on coming back to the foreground, at most
  every 30 minutes (`recheckAfter`); right away on `app:update` for its
  platform (only while signed in - the socket only runs then); and from
  **Settings → About → Version** ("Check for updates").
- **An available update** opens a sheet: the new version, what's new (one
  point per line of the notes; each version named when there are several),
  **Update now** (opens the link in the store or the browser -
  `url_launcher`) and **Later**. Either answer puts that build off for 3
  days (`postponeFor`); a newer build is offered at once. The Settings
  tile keeps saying an update is available.
- **A required update** replaces the whole app with a screen that can only
  update - the router is taken down, so nothing behind it runs. Pressing
  back leaves the app.
- **Never during a live**: nothing is shown while the phone is watching
  (`/live/...`), setting up (`/go-live`), hosting or on a stage
  (`broadcastingProvider`). A required update waits until the live is left.
- **What's new** shows once, on the first launch of a newer build, when the
  team published notes for it. A fresh install - or the first version with
  this feature - just records its build. If an update is offered on the
  same launch, its notes cover what's new and this sheet is skipped.
- Kept on the device (`shared_preferences`): `app_update_postponed_build`,
  `app_update_postponed_until`, `app_update_seen_build`. A failed check
  keeps the last answer and asks again on the next launch or resume.
- The download link opens only if it's `https` (or `http` while developing);
  a phone never opens anything else the server sends.

### In the console (`/app-updates`, under Manage)

Each platform's newest release and the build below which phones must
update; **Publish an update** (version, build number, what's new, the
download link - the platform's last link is suggested - and "Required
update"), with a preview of the sheet or screen phones will show, and a
confirmation before publishing; the history, where a release can be
**edited** (what's new, the link, required or not - the version and build
stay) or **withdrawn** (phones stop being told about it; a withdrawn
required update no longer holds anyone up). Every change reaches the open
apps at once.

Access: `VIEW_APP_RELEASES` (see what was published) and
`MANAGE_APP_RELEASES` (publish, edit, withdraw), the **App updates** area
in a platform moderator's access. Audited as `app.release_published`,
`app.release_updated` (with the fields that changed) and
`app.release_withdrawn` - category Settings, target `APP_RELEASE`
("Android 1.2.0 (12)").

### Data and events

- `app_releases` (`AppRelease`): `platform` (`AppPlatform`: `ANDROID`,
  `IOS`), `version`, `build` (unique per platform), `notes`, `downloadUrl`,
  `required`, `publishedById`, timestamps. Migration
  `20261005090000_app_releases` (also adds the two permissions).
- Domain event `app_release.changed` (`AppReleaseChangedPayload`: `change`
  is `published`, `updated` or `withdrawn`, plus the release and the actor).
  `RealtimeGateway` relays it to every socket as `app:update {platform}`;
  `AuditEventsListener` records it.

### Releasing a new version

1. Bump `version:` in mela-mobile's `pubspec.yaml` - the version as people
   should see it, and a higher build number (`1.2.0+12`).
2. Build it (mela-mobile README, "A release APK") and put it where phones
   can download it over https - the store, or the server.
3. In the console, **App updates → Publish an update**: the same version
   and build, one change per line, the download link. Tick **Required
   update** only for fixes everyone must have.

Publish only once the build can be downloaded: open apps are told at once.

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
   `lib/features/app_update`, `appUpdateRepositoryProvider`, and
   `url_launcher` (plus its `<queries>` entry in `AndroidManifest.xml`) if
   nothing else uses it.

Phones already shipped keep asking `GET /v1/app/update`; with the route gone
they get a 404, treat it like being offline, and carry on.

## Tests

- Backend (jest): `app-releases/app-releases.service.spec.ts` (up to date,
  available with what's new, required by an older release),
  `app-releases/app-release.rules.spec.ts` (versions, https links),
  `admin/releases/admin-releases.service.spec.ts` (publishing rules, a race
  on the same build, editing only what changed, withdrawing, the platform
  summary), plus cases in `audit/audit-events.listener.spec.ts` and
  `realtime/realtime.gateway.spec.ts`.
- Console (vitest): `features/releases/release-form.test.ts`, and the
  access area in `lib/permissions.test.tsx`.
- Mobile: `app_update_test.dart` (the answer, notes, split-APK builds, when
  to offer and when to show what's new, the request, rechecking, the
  realtime event, what's kept on the device) and
  `app_update_gate_test.dart` (the sheet, Later, Update now, the required
  screen, waiting out a live or a broadcast, what's new once, a first
  install).
- Not unit-tested: opening a real store page or APK link (`url_launcher`) -
  check on a device.
