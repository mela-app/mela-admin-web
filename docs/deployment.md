# Deploying Mela

The API, the admin console, the share page's web player, Postgres, Redis, HTTPS and (optionally) LiveKit run on one Linux server with Docker, from `infra/production/` in a clone of **mela-backend**. The console and the player arrive as images their own repositories publish. Local development is in each repository's README; this page is the server.

## What runs

| Service | Image | Reachable at |
| --- | --- | --- |
| `caddy` | `caddy:2.10-alpine` | ports 80/443 on the host: TLS for every domain (Let's Encrypt, automatic) |
| `backend` | `mela-backend` (mela-backend's `Dockerfile`) | `127.0.0.1:3000`, behind `https://API_DOMAIN` |
| `migrate` | `mela-backend` | one-shot at every deploy: `prisma migrate deploy`, then the super-admin seed |
| `admin` | `mela-admin` (this repository's `Dockerfile`) | `127.0.0.1:8080`, behind `https://ADMIN_DOMAIN`; its nginx proxies `/v1` to the backend, so the console and the API share one origin |
| `web` | `mela-web` (mela-web's `Dockerfile`) | `127.0.0.1:8081`, behind `https://API_DOMAIN/web/*`: the web player's static files, which the share pages (`/live/:id`, served by the backend) load - see [features/share.md](features/share.md) |
| `postgres`, `redis` | `postgres:16-alpine`, `redis:7-alpine` | the internal Docker network only |
| `livekit` (profile `livekit`) | `livekit/livekit-server` | `127.0.0.1:7880` behind `https://LIVEKIT_DOMAIN`, media on 7881/tcp and 50000-60000/udp |

Avatars go to an external S3-compatible bucket (S3, R2, ...) - see [features/storage.md](features/storage.md).

All three app images run as unprivileged users, with a Docker `HEALTHCHECK` (`/health` checks the database and Redis; the console and the web player answer `/healthz`). The console's nginx sends a strict Content-Security-Policy, HSTS and the usual hardening headers; the API sets its own with helmet (and the share page, which loads the video SDKs, a CSP of its own).

## First deploy

1. **Server**: Linux with Docker Engine and the Compose plugin. At least 2 GB of RAM; LiveKit wants more CPU and bandwidth (see [features/video-provider.md](features/video-provider.md)).
2. **DNS**: A/AAAA records for `API_DOMAIN`, `ADMIN_DOMAIN` and (with LiveKit) `LIVEKIT_DOMAIN`, pointing at the server.
3. **Firewall**: `80/tcp` and `443/tcp`; with LiveKit also `7881/tcp` and `50000-60000/udp`. With ufw: `sudo ufw allow 80,443,7881/tcp && sudo ufw allow 50000:60000/udp` (and the same in the cloud provider's firewall).
4. **Settings**: on the server, in a clone of mela-backend:
   ```
   cd infra/production
   cp .env.example .env
   ```
   Fill in `.env` - every secret with a fresh random value (`openssl rand -hex 32`), `POSTGRES_PASSWORD` with letters and digits only, and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` for the first super admin. The backend refuses to start with a sample or short secret. Point `BACKEND_IMAGE` / `ADMIN_IMAGE` / `WEB_IMAGE` at the GHCR packages the repositories' CD publishes (`ghcr.io/<owner>/mela-backend`, `ghcr.io/<owner>/mela-admin`, `ghcr.io/<owner>/mela-web`, owner lowercase); `BACKEND_IMAGE` may be left unset to build the API on the server instead. For LiveKit, generate the key pair with `docker run --rm livekit/livekit-server:v1.13.7 generate-keys` into `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` (the `livekit` service is configured from the same two values).
5. **Registry**: the images are private by default, so let the server read them - `echo <token> | docker login ghcr.io -u <user> --password-stdin` with a classic PAT that has only `read:packages`. This is the server's only registry login: the CD workflows never log in there, so no token with write access ever reaches the server. Renew the PAT before it expires, or pulls (and deploys) start failing.
6. **Start**:
   ```
   docker compose pull
   docker compose up -d
   ```
   With `VIDEO_PROVIDER=livekit` on this same server, set `COMPOSE_PROFILES=livekit` in `.env` first, so LiveKit comes up with the rest. (Building the API on the server instead: `docker compose up -d --build`.) `migrate` runs first; the backend starts only once it succeeds. Check: `docker compose ps` (all healthy), `docker compose logs migrate`, `curl https://API_DOMAIN/health`, and `https://ADMIN_DOMAIN` shows the sign-in page.
7. **Sign in** to the console with the seeded admin and choose a new password (the seeded one is temporary). Then clear `SEED_ADMIN_PASSWORD` in `.env` - it is never used again once the account exists.

## Continuous delivery

Each app deploys on its own, from its own repository's `.github/workflows/cd.yml`, when something that goes into its image changes on `main` (or by hand from the Actions tab) - a docs change deploys nothing. Each workflow runs one deploy of its app at a time.

| Repository | Builds and pushes | Then, over SSH |
| --- | --- | --- |
| mela-backend | `ghcr.io/<owner>/mela-backend:latest` + `:<sha>` | `pull backend`, `run --rm migrate`, `up -d --no-deps backend` |
| mela-admin-web | `ghcr.io/<owner>/mela-admin:latest` + `:<sha>` | `pull admin`, `up -d --no-deps admin` |
| mela-web | `ghcr.io/<owner>/mela-web:latest` + `:<sha>` | `pull web`, `up -d --no-deps web` |

`--no-deps` is what keeps them independent: each workflow recreates one container and leaves Caddy, Postgres, Redis, LiveKit and the other apps running. A console release never restarts the API, and an API release never interrupts the console beyond the API calls it makes while the new container starts. The migrations run on the new image, in a one-shot `migrate` container, before the API is swapped.

Tests run on every push and pull request, in each repository's `ci.yml`: `backend-ci`, `admin-web-ci`, `web-ci`, `mobile-ci` (plus `mobile-native-builds` when native files change).

The same secrets drive the deploy step in each of the three repositories - **Settings > Secrets and variables > Actions**, or once for all of them as organization secrets:

| Secret | Value |
| --- | --- |
| `SERVER_HOST` | the server's hostname or IP |
| `SERVER_USER` | an SSH user in the `docker` group (not root) |
| `SERVER_SSH_KEY` | a private key made for deploys only (`ssh-keygen -t ed25519 -f mela-deploy`), whose public half is in that user's `~/.ssh/authorized_keys` |
| `SERVER_SSH_FINGERPRINT` | the server's SSH host key fingerprint (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server, the `SHA256:...` part), so nothing else can pose as the server |
| `SERVER_PASSWORD` | only while there is no key: that user's SSH password - remove it once the key works, and turn off password logins on the server |
| `DEPLOY_PATH` | the directory holding `.env` and `docker-compose.yml` on the server, e.g. `/srv/mela-backend/infra/production` |

`GITHUB_TOKEN` is provided by Actions and used only to push the image; nothing to configure.

Two things CI deliberately never touches, because they live only on the server: `.env` (settings and secrets) and the compose file itself. Change either - including `infra/production/docker-compose.yml` and the `Caddyfile` in mela-backend - and the server needs a `git pull` and a manual `docker compose up -d` before it takes effect.

## Updating

Pushing to `main` is the normal path. By hand, in `DEPLOY_PATH`:

```
docker compose pull
docker compose up -d
```

The `migrate` job applies any new migrations before the new backend starts. To pin one app's release rather than follow `latest`, set its `BACKEND_TAG` / `ADMIN_TAG` / `WEB_TAG` in `.env` to a commit SHA from its repository - its automatic deploys then no longer change it here, since they only move the `latest` tag. Without a registry, `git pull && docker compose up -d --build` builds the API on the server instead; the console or the player can be built in a clone of its repository with `docker build -t mela-admin .` (or `mela-web`), with `ADMIN_IMAGE` / `WEB_IMAGE` set to that name.

## Backups

The data that matters is Postgres (avatars live in the bucket). A nightly dump, e.g. from cron:

```
docker compose exec -T postgres pg_dump -U mela -d mela --format=custom > mela-$(date +%F).dump
```

Restore into an empty database with `pg_restore -U mela -d mela --clean --if-exists`. Keep copies off the server. Redis holds only rate limits, presence and queued jobs; it is persisted (AOF) but needn't be backed up.

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

- **Client IPs**: Caddy replaces any client-sent `X-Forwarded-For`, the console's nginx passes Caddy's through unchanged, so `TRUST_PROXY=1` is right for both paths. Keep it that way if you change the proxies, or the audit log and the rate limits see the wrong addresses.
- **LiveKit on its own server**: use `infra/livekit/` there instead of the `livekit` profile ([features/video-provider.md](features/video-provider.md)).
- **Logs**: `docker compose logs -f backend`. Docker's default log driver keeps them on disk without limit; set rotation in `/etc/docker/daemon.json` (`"log-opts": {"max-size": "10m", "max-file": "5"}`).
