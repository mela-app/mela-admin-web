# App crashes

**Depends on**: `auth` (the optional sign-in guard), `activity` (`appClientOf` - the app's `X-Mela-*` headers), the admin console's guard and the `VIEW_APP_RELEASES` permission. Crashlytics (docs/features/app-updates.md, "Watching a release") keeps running alongside.

## What it does

When the app closes by itself on someone's phone, the console's **Crashes** page (Manage → Crashes, `/crashes`) says what happened, how often, on which phones and app versions, and what the person did just before. Client request, 2026-11: customers reported the app closing on opening it, joining a live or opening one, and nobody could see why.

Four kinds of report, all `app_crashes` rows (`AppCrashKind`):

| Kind | What it is | How the app learns of it |
|---|---|---|
| `NATIVE_CRASH` | A crash in native code - the video engines (WebRTC, Agora) | Android's record of why the app ended (`ApplicationExitInfo`, Android 11+), on the next launch |
| `JAVA_CRASH` | An uncaught Java/Kotlin exception | `CrashWatch.kt`'s uncaught-exception handler writes the stack before handing on to Crashlytics; sent on the next launch |
| `ANR` | The app froze ("not responding") and Android closed it | `ApplicationExitInfo`, with the main thread's stack from its trace |
| `LOW_MEMORY`, `KILLED` | Android closed it for memory, or killed it with a signal, **while it was in use** (background kills aren't crashes) | `ApplicationExitInfo` |
| `OTHER` | Excessive resource use, a failed start | `ApplicationExitInfo` |
| `DART_ERROR` | An error nothing caught - the app lived through it (`fatal: false`) | `FlutterError.onError` / `PlatformDispatcher.onError`, as it happens |

Each report carries **breadcrumbs**: the last 30 steps the app noted (`CrashWatch.note`) - every screen (the router's location), `home preview <id>`, `live video: viewer joining (livekit)`, `... releasing`, `host publishing`, `app start`. They're written to a file natively as they happen, so even a native crash keeps them; the report for the most recent exit gets the session's trail.

## Backend

- `POST /v1/app/crashes` `{reports: [{kind, fatal, message, stack?, breadcrumbs?, occurredAt?, deviceModel?, osVersion?}]}` (`AppCrashesController`, `OptionalJwtAuthGuard` - a crash before sign-in counts too; 20 batches a minute, 20 reports a batch). The app version, build and platform come from the request's `X-Mela-*` headers; the account from the token if any. `AppCrashesService.record` trims (message 2,000, stack 16,000, 30 breadcrumbs), dates a report from the future or over 30 days old at its arrival, and stores its **signature** (`crashSignature`: kind + message + top 4 stack frames, numbers, addresses and quoted values left out, SHA-1) - the same crash on every phone groups together.
- `GET /v1/admin/crashes?days=&kind=&appVersion=&fatal=&page=&pageSize=` (`AdminCrashesService.groups`, `VIEW_APP_RELEASES`): groups by signature, most reports first - each with its kind, latest message, count, people, first/last seen, versions and up to 5 devices; plus totals, a zero-filled count per day (closed / errors) and the versions seen.
- `GET /v1/admin/crashes/:signature?days=&page=` (`reports`): that crash's reports, newest first, with the stack, breadcrumbs, phone and account.
- The Data page's **Crash reports** set (`appCrashes`, by age) clears them; a deleted account leaves its reports anonymous (`onDelete: SetNull`).

## Mobile

- `android/.../CrashWatch.kt` (installed first thing in `MainActivity.onCreate`; channel `mela_live/crashes`): `note`, `device` (manufacturer + model, Android version), `pending` (what ended the last session(s) since the last one acknowledged, and the Java crash file), `acknowledge {upTo}`.
- `lib/core/crash_watch.dart`: started from `MelaApp.build` with each account's `ApiClient`; hooks the error handlers once (release builds only, after Crashlytics), sends Dart errors in batches (at most 15 distinct per session), and four seconds after start sends the last session's reports, then acknowledges them - offline, the next launch tries again.
- Crashlytics now also gets native crashes: `firebase-crashlytics-ndk` (on the Firebase BoM firebase_core uses), with native symbols uploaded by release builds (`nativeSymbolUploadEnabled`; a test build skips it with `ORG_GRADLE_PROJECT_skipCrashlyticsSymbols=true`).

## Crash fixes in the same change (2026-11)

- flutter_webrtc 1.6.3 (renderer dispose fixes) with livekit_client 2.13.2; the camera effects compile against the same WebRTC (`150.7871.04`). livekit_client 2.14 was left out: it adds a native library (`livekit_ffi`) downloaded at build time.
- LiveKit host: leaves the room before freeing the guests' video renderers (frames landing on a freed renderer crash natively); every renderer is detached from its video before it's freed.
- Agora: `release()` waits (up to 15 s) for a join, preview or publish still running - Agora crashes natively on a call to a released engine - and a viewer closed while getting ready doesn't join the channel.
- Native threads catch `Throwable`: an out-of-memory error while shrinking a live's thumbnail, or reading share targets' icons, no longer closes the app.

## How to modify / remove

New kinds go in `AppCrashKind` (a migration), `CrashWatch.kt`'s `exitReport`, and the page's labels. To remove: drop `AppCrashesModule`, `src/admin/crashes`, the `appCrashes` data set and the `app_crashes` table; in the app `CrashWatch.kt`, its channel in `MainActivity`, `core/crash_watch.dart` and the `note` calls; the console's `features/crashes`, route and nav item.
