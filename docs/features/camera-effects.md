# Camera effects: Beautify, Effects and the live studio

**Location**: backend `apps/backend/src/camera-effects` (catalog, uploads) and `src/admin/camera-effects`; console `src/features/camera-effects`; mobile `lib/features/live_stream/effects` (model, catalog, downloads) and `lib/features/live_stream/studio` (the panels), native `android/app/src/main/kotlin/com/melalive/app/CameraEffects.kt` (the GPU pipeline) and `ArEngine.kt` (DeepAR)
**Depends on**: `common/storage` (uploads), `auth`, `admin`; on the phone, LiveKit's camera (flutter_webrtc) and the DeepAR SDK
**Depended on by**: the go-live screen and a guest's camera on stage

## What it does

The go-live preview is laid out like TikTok's LIVE studio: the camera full
screen, a pill with who can watch and the quality, three tools -
**Beautify**, **Effects**, **Settings** - and **Go LIVE**. Each tool opens a
dark, see-through panel over the camera, so the host watches themselves
change. Every change shows at once, in the preview and to viewers (the same
frames), and the Beautify and Effects buttons are in the live controls too.

| Panel | Tabs | Drawn by |
|---|---|---|
| **Beautify** | **Beauty**: Smooth, Brighten, Glow, Sharpen - then the rig's face sliders (Slim, V shape, Chin, Eyes, Nose, Lips...) by group | Skin: the app's GPU shader. Face shape: DeepAR (the beauty rig) |
| | **Makeup**: Female / Male looks | DeepAR |
| | **Filters**: 32 color looks in Portrait, Vibe, Film, Life, B&W, with a strength slider | The app's GPU shader |
| **Effects** | **Trending**, **New**, the staff's categories (Sports, Funny...), **Green Screen** (None, Blur, the host's own photo, staff backgrounds) | DeepAR |
| **Settings** | Who can watch, Layout, Schedule for later, **Live quality** (Data saver / Standard / HD) | - |

Kept for the next live: the beauty sliders, the makeup and the filter (and
the quality). Not kept: an effect and a background - like TikTok, a live
starts without them.

### Staff decide what's offered (no app update)

Effects, makeup, backgrounds and the beauty rig are **files staff upload in
the console** (**Manage → Camera effects**), published when ready. The app
reads the catalog (`GET /v1/camera-effects`) and downloads each file the
first time a host picks it (a spinner on its button), keeping it on the
phone after (`camera_effects/` in the app's storage; a replaced file is
fetched again). So the app stays small, and new effects reach every host at
once. The color filters and skin smoothing are built into the app.

- **Effects** belong to a **category** (the console's Categories tab; a tab
  in the app once it has a published effect). **Trending** is a tick on the
  effect; **New** is anything published in the last 14 days.
- **Makeup** is for Female, Male or Everyone (both tabs).
- **Backgrounds** are pictures (portrait, 9:16); the host can also use a
  photo from their phone - kept in the app, never uploaded.
- **Beauty** is one **rig** (only one published): a `.deepar` with face
  blend shapes, and its **sliders**, each mapping the app's 0-100 to one of
  the rig's parameters:

```json
[{ "key": "eye_size", "label": "Eyes", "group": "EYES",
   "gameObject": "FaceMesh", "component": "MeshRenderer",
   "parameter": "blendshape.eyeSize", "from": 0, "to": 100 }]
```

  The names must be the rig's own - open it in DeepAR Studio to read its
  game objects and blend shapes. `key` is what a host's setting is kept by:
  don't rename it once hosts use it.

### The AR engine: DeepAR

Face tracking, makeup, face shape, 3D effects and person segmentation (green
screen) come from **DeepAR** (Android SDK `ai.deepar.ar:DeepAR:5.6.22`, from
DeepAR's own Maven repository; ~10 MB more in the download per phone). It
runs offscreen on a thread of its own (`ArEngine.kt`): the camera frame is
drawn and read back as RGBA on the GPU thread, DeepAR draws it upright with
the effects, and that frame - with the app's own skin smoothing and filter
on top - goes to the preview and to LiveKit. A busy phone skips frames for
DeepAR rather than slowing the live; any error turns the AR effects off and
the camera goes on as it is. Only when something of DeepAR's is on does a
frame go through it.

Android with LiveKit only. On Agora (and iPhone, for now) Beautify shows the
skin sliders, and Effects says it isn't available on that phone.

### Setting it up

1. **DeepAR account** (developer.deepar.ai): create a project, add an
   **Android app** with the package name `com.melalive.app`, and copy its
   **license key**. Free while developing (with a watermark on some plans);
   pick a plan for the number of hosts before launch.
2. Backend `.env`: `DEEPAR_ANDROID_LICENSE_KEY=<the key>`, restart. Blank:
   the app offers only its own filters and skin beauty.
3. **Storage CORS** - the console uploads files straight to the bucket (a
   presigned link), so the bucket must allow the console's site: a CORS rule
   allowing `PUT` from `https://<console domain>` with the `Content-Type`
   header. (The console's own policy allows the storage address,
   `CSP_IMG_SRC`.)
4. **Content**: effects and makeup from DeepAR's asset store (free packs to
   start, more to buy) or made in **DeepAR Studio**; the face-shape sliders
   need a rig with blend shapes - DeepAR's **Premium/Ultimate Beauty**
   packages (the free beauty pack has none). Export each as `.deepar`, with a
   square thumbnail, and add them in the console. Publish.

### Live quality

| | Camera | Sent | For |
|---|---|---|---|
| Data saver | 384×216 | 220 kbps, 15 fps, one layer | weak connections |
| Standard (default) | 640×360 | 400 kbps, 15 fps, + a 180p layer | mobile data |
| HD | 960×540 | 900 kbps, 20 fps, + a 180p layer | Wi-Fi, strong 4G |

Chosen before going live; the preview's camera reopens at that size. HD uses
more of the server's bandwidth per live.

### Routes

```
GET    /v1/camera-effects                         (signed in) the catalog: engine, categories, effects, makeup, backgrounds, beauty
GET    /v1/admin/camera-effects[?kind]            [VIEW_CAMERA_EFFECTS]
GET    /v1/admin/camera-effects/categories        [VIEW_CAMERA_EFFECTS]
POST   /v1/admin/camera-effects/upload-url        ({contentType}) -> {uploadUrl, key}   [MANAGE_CAMERA_EFFECTS]
POST   /v1/admin/camera-effects                   ({kind, name, categoryId?, audience?, fileKey?, thumbnailKey?, imageKey?, controls?, featured?, published?, sortOrder?})  [MANAGE_CAMERA_EFFECTS]
PATCH  /v1/admin/camera-effects/:id               (any of those but kind)   [MANAGE_CAMERA_EFFECTS]
DELETE /v1/admin/camera-effects/:id               (its files too)           [MANAGE_CAMERA_EFFECTS]
POST/PATCH/DELETE /v1/admin/camera-effects/categories[/:id]  ({name, sortOrder}; only an empty one deleted)  [MANAGE_CAMERA_EFFECTS]
```

Audit: `camera_effect.created|updated|deleted`,
`camera_effect_category.created|updated|deleted` (target `CAMERA_EFFECT`).

## How to add to this feature

- **A filter**: a value in `CameraFilter` (`camera_effects.dart`) - a 3x4
  color matrix and its category; its button's colors are worked out from it.
- **A skin slider**: a uniform in the shader (`CameraEffects.kt`), a field in
  `CameraEffects` (Dart, with `toNative`/`toJson`) and an item in
  `beautify_panel.dart` (`_skin`).
- **A Settings row**: `live_settings_panel.dart` (`LiveSettingsActions` for
  what the go-live screen owns).
- **A face slider**: no code - add it to the rig's sliders in the console.

## How to modify this feature

- How long "New" lasts: `NEW_FOR_MS` (`camera-effects.rules.ts`).
- The qualities: `_paramsFor` (`livekit_video_session.dart`).
- Another AR SDK (Banuba...): `ArEngine.kt` is the only file that knows
  DeepAR; `ArSettings` (what Dart sends) stays the same.

## How to remove this feature

1. Backend: `CameraEffectsModule` from `app.module.ts` and `AdminModule`,
   the admin controller, a migration dropping `camera_effects`,
   `camera_effect_categories` and their enums (keep the permissions until
   no staff has them), `DEEPAR_ANDROID_LICENSE_KEY`.
2. Console: the `/camera-effects` route, sidebar item and permission area.
3. App: `ArEngine.kt` and the AR path in `CameraEffects.kt`, the DeepAR
   dependency and repository (`build.gradle.kts`), `effect_catalog.dart`,
   `effects_resolver.dart`, `effects_panel.dart` and the Makeup tab.

## Tests

- Backend: `src/camera-effects/camera-effects.service.spec.ts`.
- Console: `src/features/camera-effects/EffectForm.test.tsx`.
- App: `test/camera_effects_test.dart` (model, Beautify), `test/effect_catalog_test.dart`
  (catalog, downloads and what reaches the camera, Effects, Settings).
- Not covered by tests: DeepAR itself and the GPU path - try it on a phone
  (see "Setting it up").
