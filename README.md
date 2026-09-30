# Mela admin console

The internal web console for platform staff: lives and their chat, users,
alerts, banned phrases, staff accounts and the audit log. The
roles, sign-in design and API are described in
[docs/features/admin.md](docs/features/admin.md).

This repository is also home to the project's documentation (`docs/`) and
the brand source (`branding/`).

| Repository | What it is |
| --- | --- |
| mela-backend | The API, the dev stack (`docker-compose.yml`) and the production stack (`infra/`) |
| mela-mobile | The Flutter app (viewers, hosts, guests) |
| mela-web | The web player that share links open in a browser |
| **mela-admin-web** (this one) | The admin console, the docs and the brand source |

## Documentation

- Architecture and feature plan: [docs/live-streaming-plan.md](docs/live-streaming-plan.md)
- Checkbox-level task breakdown: [docs/task-breakdown.md](docs/task-breakdown.md)
- How to add, modify or remove each feature: [docs/features/](docs/features/README.md)
- Deploying to a server: [docs/deployment.md](docs/deployment.md)

The docs were written when the apps shared one repository, so their paths
use its layout: `apps/backend/...` is mela-backend, `apps/mobile/...`
mela-mobile, `apps/web/...` mela-web and `apps/admin-web/...` this
repository; `infra/...` and the dev `docker-compose.yml` are in
mela-backend. Code comments in the other repositories that mention
`docs/...` mean this folder.

## Settings (.env)

Every address the console uses outside production comes from `.env` - the
code has none built in, and the dev server and the container refuse to
start while one is missing. `.env` is gitignored; `.env.example` is the
template, with the values for this machine:

```
cp .env.example .env        # Windows: copy .env.example .env
```

| Variable | Used by | What it is |
| --- | --- | --- |
| `ADMIN_API_ORIGIN` | `npm run dev`, `npm run preview` | The API that `/v1` is proxied to, so the console and the API share one origin (the sign-in cookie needs that) - mela-backend, `http://localhost:3000` locally |
| `ADMIN_PORT` | `docker compose` | Where the container listens on this machine (127.0.0.1 only) |
| `API_UPSTREAM` | `docker compose` | Where the container's nginx sends `/v1` - the API as a container sees it (`http://host.docker.internal:3000` locally) |
| `CSP_IMG_SRC` | `docker compose` | Where avatars and chat photos may load from, besides the console: the backend's `S3_PUBLIC_URL_BASE` origin |

`npm run build` and `npm test` need no `.env` (CI has none). The console
holds no secrets: signing in happens against the API.

## Run it locally

1. Start the API (mela-backend: `npm run start:dev`) with the database
   migrated.
2. Create the first super admin once: `npm run db:seed` in mela-backend. It
   reads `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` and `SEED_ADMIN_NAME`
   from that repository's `.env`.
3. Here, with `.env` in place: `npm ci`, then `npm run dev`, and open
   http://localhost:5173. Sign in with the seeded email and password. The
   console asks for a new password before anything else.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Type-checks (`tsc -b`) and builds into `dist/` |
| `npm run preview` | Serves the built `dist/` |
| `npm run lint` | oxlint |
| `npm test` | vitest (jsdom) |

## Deploying

The `Dockerfile` here builds the production image: `dist/` behind
unprivileged nginx (`nginx/default.conf.template`), which forwards `/v1/*`
to the API (`API_UPSTREAM`), answers unknown paths with `index.html` (so
links such as `/users/<id>` open the app), and sends the security headers
and caching rules. Put it behind HTTPS only, because the refresh cookie is
`Secure` in production; the whole stack is in mela-backend's
`infra/production` ([docs/deployment.md](docs/deployment.md)), which sets
`API_UPSTREAM` and `CSP_IMG_SRC` for it. Locally, with the API running and
`.env` in place: `docker compose up -d --build` here serves it on
`http://localhost:<ADMIN_PORT>`.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) lints, tests and
builds every push. CD ([.github/workflows/cd.yml](.github/workflows/cd.yml))
builds `ghcr.io/<owner>/mela-admin` on `main` - only when something that
goes into the image changes, never for docs - then, over SSH, restarts just
the console. Its secrets (repository or organization): `SERVER_HOST`,
`SERVER_USER`, `SERVER_SSH_KEY` (or `SERVER_PASSWORD`),
`SERVER_SSH_FINGERPRINT`, `DEPLOY_PATH`.

The sign-in page's footer shows `version` from `package.json` (injected as
`__APP_VERSION__` by `vite.config.ts`) - bump it with each release.

## Structure

```
src/
  main.tsx          providers (TanStack Query, toasts, session) and the app
  styles.css        Tailwind theme: brand colours, Inter
  app/              routes and their guards, lazily loaded pages, the shell, URL search parsers
  lib/              API client and session refresh, query hooks and actions, formatting, types
  components/ui/    buttons, form controls, dialogs, data table, empty/error/loading states
  components/brand/ the Mela logo (logo-data.ts is generated by branding/build.mjs)
  components/       session and toast providers, status badges, the overview chart
  features/<area>/  one folder per area: overview, streams, users, alerts,
                    phrases, audit, staff, account, auth
  test/setup.ts     jest-dom, plus a <dialog> polyfill for jsdom
```

Conventions:

- Filters, sorting and paging live in the URL (`app/search.ts`), so any
  view can be bookmarked or shared.
- Every server call goes through `lib/api.ts`. It renews the session once
  on a 401 and turns API errors into plain sentences.
- Changes go through `useAdminMutation` (`lib/queries.ts`), which refreshes
  the data on screen once a change succeeds.
- The access token stays in memory. The refresh token is an httpOnly cookie
  the page can't read. Only one tab renews at a time (`navigator.locks`),
  and signing out in one tab signs out the others (`BroadcastChannel`).
- Destructive actions ask for confirmation and a reason, which is kept in
  the audit log.

## Brand assets

The mark, the MELA / መላ wordmark and every icon are generated from one
geometry in `branding/mark.mjs` by `branding/build.mjs` (fonts: Montserrat
and Noto Sans Ethiopic, both SIL OFL). Colours: teal `#1D5B7C`, amber
`#F5A623`, navy `#1B3A55`. The outputs are committed in each repository, so
this is only needed after a logo change. It writes this console's favicons
and logo, and the other apps' icons, splash and logo code into their
checkouts next to this one (`../mela-mobile`, `../mela-web`,
`../mela-backend`; `MELA_MOBILE_DIR` / `MELA_WEB_DIR` / `MELA_BACKEND_DIR`
to point elsewhere; a missing one is skipped):

```
cd branding && npm ci && npm run build
cd ../../mela-mobile && dart run flutter_launcher_icons && dart run flutter_native_splash:create
```

Master artwork is in `branding/svg/`. After re-running
`flutter_launcher_icons`, restore
`android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` in mela-mobile
(it re-adds a 16% inset the artwork already accounts for) and discard its
edit to `ios/Runner.xcodeproj/project.pbxproj` (it overwrites an unrelated
build setting). Then commit the changes in each repository.
