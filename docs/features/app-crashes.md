# App crashes

**Depends on**: `auth` (the optional sign-in guard), `activity` (`appClientOf` - the app's `X-Mela-*` headers), the admin console's guard and the `VIEW_APP_RELEASES` permission. Crashlytics (docs/features/app-updates.md, "Watching a release") keeps running alongside.

## What it does

When the app closes by itself on someone's phone, the console's **Crashes** page (Manage → Crashes, `/crashes`) says what happened, how often, on which phones and app versions, and what the person did just before. Client request, 2026-11: customers reported the app closing on opening it, joining a live or opening one, and nobody could see why.

Four kinds of report, all `app_crashes` rows (`AppCrashKind`):

| Kind | What it is | How the app learns of it |
|---|---|---|
| `NATIVE_CRASH` | A crash in native code - the video engines (WebRTC, Agora) | Android's record of why the app ended (`ApplicationExitInfo`, Android 11+), on the next launch; from Android 12 with the crashing thread's backtrace from its tombstone (`Tombstone.kt`) |
| `JAVA_CRASH` | An uncaught Java/Kotlin exception | `CrashWatch.kt`'s uncaught-exception handler writes the stack before handing on to Crashlytics; sent on the next launch |
| `ANR` | The app froze ("not responding") and Android closed it | `ApplicationExitInfo`, with the main thread's stack from its trace |
| `LOW_MEMORY`, `KILLED` | Android closed it for memory, or killed it with a signal, **while it was in use** (background kills aren't crashes) | `ApplicationExitInfo` |
| `OTHER` | Excessive resource use, a failed start | `ApplicationExitInfo` |
| `DART_ERROR` | An error nothing caught - the app lived through it (`fatal: false`) | `FlutterError.onError` / `PlatformDispatcher.onError`, as it happens |

Each report carries **breadcrumbs**: the last 30 steps the app noted (`CrashWatch.note`) - every screen (the router's location), `home preview <id>`, `live video: viewer joining (livekit)`, `... releasing`, `host publishing`, `app start`. They're written to a file natively as they happen, so even a native crash keeps them; the report for the most recent exit gets the session's trail.

## Backend

- `POST /v1/app/crashes` `{reports: [{kind, fatal, message, stack?, breadcrumbs?, occurredAt?, deviceModel?, osVersion?}]}` (`AppCrashesController`, `OptionalJwtAuthGuard` - a crash before sign-in counts too; 20 batches a minute, 20 reports a batch). The app version, build and platform come from the request's `X-Mela-*` headers; the account from the token if any. `AppCrashesService.record` trims (message 2,000, stack 16,000, 30 breadcrumbs), dates a report from the future or over 30 days old at its arrival, and stores its **signature** (`crashSignature`: kind + message + top 4 stack frames, numbers, addresses and quoted values left out, SHA-1) - the same crash on every phone groups together.
- `GET /v1/admin/crashes?days=&kind=&appVersion=&fatal=&page=&pageSize=` (`AdminCrashesService.groups`, `VIEW_APP_RELEASES`): groups by signature, most reports first - each with its kind, latest message, count, people, first/last seen, versions and up to 5 devices; plus totals, a zero-filled count per day (closed / errors) and the versions seen.
- `GET /v1/admin/crashes/:signature?days=&page=` (`reports`): that crash's reports, newest first, with the stack, breadcrumbs, phone and account. The signature must be 16 hex characters.
- **Removing** (`MANAGE_APP_RELEASES`, like withdrawing a release): `DELETE /v1/admin/crashes/:signature` removes every report of a crash, of any age (`removeCrash`, audit `crash.deleted` with the kind, message and how many); `DELETE /v1/admin/crashes/reports/:id` removes one report (`removeReport`, audit `crash.report_deleted`). A removed crash that happens again comes back as new. On the page: a bin on each row, **Remove this crash** at the foot of its reports, and a bin on each report - each asks first. Staff who only view releases don't see them.
- The Data page's **Crash reports** set (`appCrashes`, by age) clears them; a deleted account leaves its reports anonymous (`onDelete: SetNull`).

## Mobile

- `android/.../CrashWatch.kt` (installed first thing in `MainActivity.onCreate`; channel `mela_live/crashes`): `note`, `device` (manufacturer + model, Android version), `pending` (what ended the last session(s) since the last one acknowledged, and the Java crash file), `acknowledge {upTo}`.
- `lib/core/crash_watch.dart`: started from `MelaApp.build` with each account's `ApiClient`; hooks the error handlers once (release builds only, after Crashlytics), sends Dart errors in batches (at most 15 distinct per session), and four seconds after start sends the last session's reports, then acknowledges them - offline, the next launch tries again.
- Crashlytics now also gets native crashes: `firebase-crashlytics-ndk` (on the Firebase BoM firebase_core uses), with native symbols uploaded by release builds (`nativeSymbolUploadEnabled`; a test build skips it with `ORG_GRADLE_PROJECT_skipCrashlyticsSymbols=true`).

## Crash fixes in the same change (2026-11)

- (Reverted after 1.0.17, see below.) flutter_webrtc 1.6.3 with livekit_client 2.13.2.
- LiveKit host: leaves the room before freeing the guests' video renderers (frames landing on a freed renderer crash natively); every renderer is detached from its video before it's freed.
- Agora: `release()` waits (up to 15 s) for a join, preview or publish still running - Agora crashes natively on a call to a released engine - and a viewer closed while getting ready doesn't join the channel.
- Native threads catch `Throwable`: an out-of-memory error while shrinking a live's thumbnail, or reading share targets' icons, no longer closes the app.

## Fixed after 1.0.17 (2026-11-24)

- **The top crash on 1.0.17**: `IllegalStateException: release() called on an object with refcount < 1` on `main_texture_camera_thread`, opening Go Live with saved beauty/filter settings. flutter_webrtc 1.6.3 started releasing the frame a camera processor returns; `CameraEffects.kt` still released it as well, one frame later.
- **Video packages back to the versions the live app ran on before**: livekit_client `2.13.0` and flutter_webrtc `1.6.2+hotfix.3` (the one livekit_client pins), pinned exactly in `pubspec.yaml`; the camera effects compile against WebRTC `150.7871.01` again, and `CameraEffects.kt` releases its own frames as it did (with 1.6.2 nothing else does). Upgrading either is a deliberate step: test a live with beauty on, a guest, and leaving/rejoining on real phones first - and on 1.6.3+ the processor must stop releasing its frames.
- Kept from the change above (app code, fine on the old packages): renderers detached before they're freed (livekit_client 2.13.0 does the same itself), the LiveKit host leaving before freeing guests' renderers, Agora's release waiting for work in flight, native threads catching `Throwable`, and Crashlytics NDK.
- Releasing a LiveKit live runs each step on its own (`_quietly`): leaving the room, freeing guests' video, then the microphone, camera and preview - one failing (LiveKit's `room.dispose()` throwing) no longer leaves the camera or microphone open for the next live.
- `CrashWatch.install` can't take the app down: if anything in it fails, crash watching is off for that session and every later call does nothing.
- Breadcrumbs name pushed screens (`screen /go-live`, a live) - before, the router's list kept the home uri under them, so everything read `screen /`.
- A Java crash a file each (`crash_java/`, the newest 5): crashing again within seconds of starting, before the last one was sent, no longer overwrites it - those showed as a bare `crash` from Android's exit record, without a stack.

## Fixed after 1.0.18 (2026-11-25)

- **Native crashes on starting a live's video**: MediaTek phones on Android 16 (TECNO CL6/CL6k, Samsung A075F) crashed natively a moment after `live video: viewer joining (livekit)` - and, the live being Home's moving preview, again at every launch. Lives arrive as VP8 (livekit_client's default), which WebRTC decoded in the phone's video hardware. Now it's WebRTC's own software decoder (libvpx) for VP8 and VP9 (`VideoDecoding.kt`, set on flutter_webrtc's decoder factory, its `forceSWCodecList`, from `main` and before each join or publish). Hosts still encode in hardware - flutter_webrtc's own option would have moved encoding to software too. A live (at most 540p) is light work for libvpx; check a live plays smoothly on a low-end MediaTek phone before each release that touches it. The decoder factory is reached by its private fields in flutter_webrtc `1.6.2+hotfix.3` (kept by its ProGuard rules): upgrading flutter_webrtc means checking `MethodCallHandlerImpl.videoDecoderFactory` still exists - if not, decoding quietly stays as it was.
- **No crash loop at launch**: when the last session crashed or froze with live video the last thing it did (`CrashWatch.videoCrashLastSession`: the last breadcrumb is `live video: ...` or `home preview ...`, and Android's last exit a crash or ANR), Home shows lives' pictures without the moving preview for that session. Opening a live still plays it.
- **Native crash reports name the crash**: the message is the signal, thread and top frame (`Native crash: SIGSEGV (SEGV_MAPERR) in thread '...' at libfoo.so (Function+12)`), with the backtrace as the stack - so different native crashes no longer all group as one "crash".
- One report per process: a native crash also listed as a plain crash (same pid) was sent twice, the second as a "Java crash" with no stack.

## Exporting (2026-11-27)

To hand crashes to whoever fixes them: **Export** at the top of the page downloads the crashes matching the page's filters (time, kind, version, only when the app closed) as one Markdown file, `mela-crashes-<date>.md`; **Export this crash** at the foot of an open crash downloads just that one. `GET /v1/admin/crashes/export?days=&kind=&appVersion=&fatal=&signature=` (`AdminCrashesService.export`, `VIEW_APP_RELEASES`) gives the 50 most common crashes, each with its 5 newest reports - message, stack, breadcrumbs, app version and build, phone, Android version, whether the app closed - and **no accounts**: a report says only signed in or out, so the file is safe to pass on. Each export is audited (`crash.exported`, with its filters). The console writes the file (`features/crashes/crash-export.ts`): totals, then each crash with its signature, counts, versions and phones, and its reports' steps and stacks in `~~~~` fences.

## How to modify / remove

New kinds go in `AppCrashKind` (a migration), `CrashWatch.kt`'s `exitReport`, and the page's labels. To remove: drop `AppCrashesModule`, `src/admin/crashes`, the `appCrashes` data set and the `app_crashes` table; in the app `CrashWatch.kt`, its channel in `MainActivity`, `core/crash_watch.dart` and the `note` calls; the console's `features/crashes`, route and nav item.
