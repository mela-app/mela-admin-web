# Deploying Mela

Mela runs on the shared VPS, in the same shape as every other app there:

```
/usr/src/apps/
├── infra/                    shared by every app
│   ├── postgres/             .env, docker-compose.yml, init-multi-db.sh
│   ├── redis/                .env, docker-compose.yml
│   └── livekit/              .env, docker-compose.yml, livekit.yaml   (Mela only, but infrastructure)
└── mela/
    ├── api/                  .env, docker-compose.yml, secrets/
    ├── web/                  .env, docker-compose.yml
    └── admin/                .env, docker-compose.yml
```

Each folder is one `docker compose` project with its own `.env`. They find
each other on the external `system-net` network, by container name, so
Postgres and Redis are never published to the internet and each app
publishes only its own port behind the reverse proxy.

The compose files and env templates for Mela's folders live in the
repositories: `infra/api/` in **mela-backend**, `infra/livekit/` likewise,
and each front end's `docker-compose.yml` at its own repository root. They
are templates - the copies on the server are what actually run, and CI never
touches them.

## What runs

| Container | Image | Where |
| --- | --- | --- |
| `mela-api` | `ghcr.io/<owner>/mela-backend` | `/usr/src/apps/mela/api`, published on `API_PORT` |
| `mela-api-migrate` | the same image | one-shot at every deploy: `prisma migrate deploy`, then the super-admin seed |
| `mela-admin` | `ghcr.io/<owner>/mela-admin` | `/usr/src/apps/mela/admin`; its nginx proxies `/v1` to `mela-api`, so the console and the API share one origin, as the sign-in cookie needs |
| `mela-web` | `ghcr.io/<owner>/mela-web` | `/usr/src/apps/mela/web`: the share page's player, which the API's `/live/:id` pages load - see [features/share.md](features/share.md) |
| `postgres`, `redis` | shared infra | `/usr/src/apps/infra/*`, on `system-net` only |
| `livekit` | `livekit/livekit-server` | `/usr/src/apps/infra/livekit`, host networking: signaling on `127.0.0.1:7880`, media on 7881/tcp and 50000-60000/udp |

Avatars and chat photos go to an external S3-compatible bucket (S3, R2, ...)
- see [features/storage.md](features/storage.md).

All three app images run as unprivileged users with a Docker `HEALTHCHECK`
(the API's `/health` checks Postgres and Redis; the console and the player
answer `/healthz`).

## Configuring the API

This is the part that differs from the other apps on the VPS: the API is
Node with Prisma, so the schema is applied by a one-shot container rather
than by the app itself.

1. **The database.** Postgres is shared, so Mela needs its own database and
   user there. On a server that already has data the init scripts no longer
   run - create it by hand, once; the commands are in mela-backend's
   `infra/postgres/README.md`. On Postgres 15 and later don't skip the
   `GRANT ALL ON SCHEMA public`, or the first migration fails with
   *permission denied for schema public*.

2. **The network.** Once per server:
   ```
   docker network create system-net
   ```
   (The shared Postgres compose creates it already; this is only for a
   fresh machine.)

3. **The folder.**
   ```
   mkdir -p /usr/src/apps/mela/api/secrets
   cd /usr/src/apps/mela/api
   ```
   Copy `infra/api/docker-compose.yml` and `infra/api/.env.example` from
   mela-backend into it, then `cp .env.example .env`.

4. **The settings.** Fill in `.env`. The ones that matter most:

   | Setting | What it is |
   | --- | --- |
   | `API_IMAGE` | `ghcr.io/<owner>/mela-backend:latest` - the package CD publishes, owner lowercase |
   | `API_PORT` / `PORT` | the same number, e.g. `6002`: the compose file maps the port to itself, and the API listens on `PORT` |
   | `DATABASE_URL` | `postgresql://mela_system_user:<password>@postgres:5432/mela_system?schema=public` - the container name, not localhost |
   | `REDIS_URL` | `redis://redis:6379` |
   | `CORS_ORIGIN` | the admin console's public address |
   | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two different `openssl rand -hex 32` values |
   | `LIVEKIT_API_URL` | `http://host.docker.internal:7880` - LiveKit uses host networking, so it is not a container name |
   | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | the first super admin, created by the migrate job |
   | `SUPPORT_EMAIL` | where people without the app ask to have their account deleted - shown on `https://<api domain>/delete-account`, the address Google Play's Data safety form asks for. Blank: the page only gives the steps in the app |

   Compose does **not** expand `${...}` inside an `env_file`, so unlike the
   .NET apps on this server, `DATABASE_URL` spells its values out rather
   than referring to `POSTGRES_USER` and friends. The `POSTGRES_*` lines are
   documentation; keep them in step by hand.

   The API validates its environment at boot and refuses to start on a
   missing setting or a sample secret, naming what is wrong - so a bad
   `.env` shows up in `docker compose logs mela-api`, not as a broken
   request later.

5. **The registry.** The images are private, so let the server read them:
   ```
   echo <token> | docker login ghcr.io -u <user> --password-stdin
   ```
   with a classic PAT that has only `read:packages`. Renew it before it
   expires, or pulls - and deploys - start failing.

6. **Start.**
   ```
   docker compose pull
   docker compose up -d
   ```
   `migrate` runs first and the API waits for it to exit cleanly. Check:
   `docker compose ps` (healthy), `docker compose logs migrate`, and
   `curl http://localhost:${API_PORT}/health`.

7. **The reverse proxy** in front of the VPS needs the API's public domain
   pointed at `API_PORT`, and `/web/*` on that same domain at the player's
   port, so share pages and the files they load share an origin.

8. **Sign in** to the console with the seeded admin and choose a new
   password (the seeded one is temporary). Then clear `SEED_ADMIN_PASSWORD`
   in `.env` - it is never used again once the account exists.

### LiveKit

Only with `VIDEO_PROVIDER=livekit`. It is infrastructure, not part of the
API: `/usr/src/apps/infra/livekit`, from `infra/livekit/` in mela-backend.
Generate a key pair with `docker run --rm livekit/livekit-server:v1.13.7
generate-keys`, put it in that folder's `.env` as `LIVEKIT_KEYS` and the
same pair in the API's `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`. Open
`7881/tcp` and `50000-60000/udp` in the firewall, and give
`LIVEKIT_DOMAIN` a TLS proxy to `127.0.0.1:7880` - the apps connect to
`wss://`. Details: [features/video-provider.md](features/video-provider.md).

## Continuous delivery

Each app deploys on its own, from its own repository's
`.github/workflows/cd.yml`, on every push to `main` (or by hand from the
Actions tab). Each workflow runs one deploy of its app at a time, builds its
image, pushes it to GHCR, then over SSH, in its own folder on the server:
`docker compose pull` and `docker compose up -d`.

Because each app is its own compose project, a deploy only ever touches that
app: the console's release cannot restart the API, and neither can touch
Postgres, Redis or LiveKit. For the API, `up -d` runs the `migrate`
container first, on the new image, before the new API serves anything.

| Repository | Pushes | `DEPLOY_PATH` |
| --- | --- | --- |
| mela-backend | `ghcr.io/<owner>/mela-backend:latest` + `:<sha>` | `/usr/src/apps/mela/api` |
| mela-admin-web | `ghcr.io/<owner>/mela-admin:latest` + `:<sha>` | `/usr/src/apps/mela/admin` |
| mela-web | `ghcr.io/<owner>/mela-web:latest` + `:<sha>` | `/usr/src/apps/mela/web` |

Tests run on every pull request, in each repository's `ci.yml` (all named
`CI`), plus `mobile-native-builds` when the mobile app's native files change.

The same secrets drive the deploy step in each repository - **Settings >
Secrets and variables > Actions**, or once for all of them as organization
secrets:

| Secret | Value |
| --- | --- |
| `SERVER_HOST` | the server's hostname or IP |
| `SERVER_USER` | an SSH user in the `docker` group (not root) |
| `SERVER_PASSWORD` | that user's SSH password |
| `DEPLOY_PATH` | that app's folder on the server, from the table above |

`GITHUB_TOKEN` is provided by Actions and used only to push the image;
nothing to configure. Since `DEPLOY_PATH` differs per app, it has to be a
repository secret, not an organization one.

Two things CI never touches, because they live only on the server: `.env`
and the compose file. Change either - including the templates in
`infra/api/` - and the server needs the new copy and a manual
`docker compose up -d`.

## Updating

Pushing to `main` is the normal path. By hand, in the app's folder:

```
docker compose pull
docker compose up -d
```

To pin a release rather than follow `latest`, point that app's image setting
in its `.env` (`API_IMAGE` for the API) at a `:<sha>` tag from its
repository - its automatic deploys then no longer change it, since they only
move `latest`.

## Backups

Mela's data is in the shared Postgres; see mela-backend's
`infra/postgres/README.md` for the dump and restore commands. Avatars live
in the bucket. Redis holds only rate limits, presence and queued jobs.

## The mobile app

Release builds point at the server with build-time settings, from a file in
mela-mobile such as `.env.production` (gitignored, like every `.env*` but
`.env.example`):

```
API_BASE_URL=https://API_DOMAIN/v1
SOCKET_URL=https://API_DOMAIN
APP_LINK_BASE_URL=https://API_DOMAIN/live
```

```
flutter build appbundle --release --dart-define-from-file=.env.production
```

(`flutter build ipa` takes the same flag; the app has no built-in addresses
and refuses to start without them.) Android release builds are signed with the upload key named in mela-mobile's `android/key.properties` (gitignored, like the keystore itself - mela-mobile's README); without that file they fall back to the debug key, which is fine for test APKs but not for the Play Store. Bump `version:` in mela-mobile's `pubspec.yaml` for every store upload - the build number after the `+` must always increase. For verified app links, fill `ANDROID_APP_SHA256_FINGERPRINT` / `APPLE_APP_ID` in `.env` ([features/share.md](features/share.md)). Once the app is in the stores, check where the share page's "Get the app" goes: `ANDROID_INSTALL_URL` defaults to the Play Store listing of `ANDROID_APP_PACKAGE_NAME`, and `IOS_INSTALL_URL` must be set to the App Store listing before iPhones get a store link.

## Notes

- **Client IPs**: `TRUST_PROXY` counts the proxy hops in front of the API.
  One reverse proxy on the VPS is `1`; the console's nginx passes the
  proxy's headers through unchanged, so the same value is right for both
  paths. Get it wrong and the audit log and the rate limits see the wrong
  addresses.
- **Logs**: `docker compose logs -f mela-api`. Docker's default log driver
  keeps them on disk without limit; set rotation in
  `/etc/docker/daemon.json` (`"log-opts": {"max-size": "10m", "max-file":
  "5"}`).
- **Migrations that fail** leave the API on the old container, because
  `up -d` stops at the `migrate` job. Read `docker compose logs migrate`,
  fix it, and run `docker compose up -d` again.
