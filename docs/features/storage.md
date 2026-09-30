# Storage (avatars and chat photos)

**Location**: `apps/backend/src/common/storage`
**Plan reference**: plan §4.1, §6.10; task-breakdown Phase 3
**Depends on**: nothing internal - a leaf module (just `@nestjs/config`)
**Depended on by**: `users` (avatar upload), `chat` (the host's photos)

## What it does

A single `StorageProvider` interface (`createUploadUrl(key, contentType)` -
`{uploadUrl, publicUrl}`, and `publicUrl(key)`) so the object storage vendor is a config choice,
not a code change - the same pattern as `common/video-provider` (plan
§4.1). `S3StorageProvider` is the only implementation today: it works
against **any S3-compatible API** (`@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner`), so the identical code runs against
S3Mock in dev and real S3/R2/Backblaze in production - only `S3_ENDPOINT`
and the credentials change.

**Direct upload, not a proxy**: the API only ever hands back a
short-lived (5 minute) presigned `PUT` URL - the client uploads the image
bytes straight to object storage, and the request body never passes
through the backend. `S3_PUBLIC_URL_BASE` is used to build the object's
eventual public URL up front (a public-read bucket's URL is deterministic
from its key), so the caller can `PATCH /users/me {avatarUrl}` with that
URL as soon as the upload succeeds, without a second round trip to ask
"what's it called now".

`STORAGE_PROVIDER` (a DI token, exported from `storage-provider.interface.ts`)
is how the interface is bound to `S3StorageProvider` in `storage.module.ts` -
`StorageProvider` is a TypeScript interface, so unlike a class it needs an
explicit token to inject by (`@Inject(STORAGE_PROVIDER)`).

**Keys**: `avatars/<userId>/<uuid>.<ext>` for avatars and
`chat-images/<streamId>/<uuid>.<jpg|png>` for the host's chat photos
(docs/features/chat.md) - both in the one bucket, both public-read through
`S3_PUBLIC_URL_BASE`. A chat photo is sent by its key, never by a URL:
the API checks the key is one it handed out for that live and builds the
URL itself with `publicUrl(key)`. A presigned PUT can't cap the size, so
the app scales photos down before uploading (1280 px) - the same trust
model as avatars. In production the bucket is S3/R2 behind its own public
URL.

**Dev setup**: `docker compose up -d s3mock` - the `avatars` bucket is
created automatically on startup (`COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS`
in `docker-compose.yml`), no console/CLI step needed. See `.env.example`
for the matching `S3_*` variables. S3Mock accepts presigned URLs and plain
GETs without validating signatures/auth at all (it's a test double, not a
real authorization layer - see their docs' "Important Limitations"), so no
bucket policy is needed either for uploads or for the public avatar URLs
to load in the app.

**Why S3Mock, not MinIO or LocalStack**: this originally ran on MinIO, but
MinIO's community edition stopped publishing container images (it's
source-build-only now, see their README - `docker pull minio/minio` 403s).
LocalStack was tried next, but its `latest` image now hard-exits without a
`LOCALSTACK_AUTH_TOKEN` even for non-commercial use. **Adobe's S3Mock**
(Apache-2.0, `adobe/s3mock`) needs neither an account nor a token and is
purpose-built for exactly this (local S3 API testing) - verified end-to-end
(presigned PUT, then an unauthenticated GET of the same object, both 200)
before settling on it. No code changed in `s3-storage.service.ts` across any
of these three - only `S3_ENDPOINT` and the docker-compose service differ.

Like the video providers, missing config doesn't crash the app at boot -
`S3StorageProvider`'s constructor logs a warning and `createUploadUrl()`
simply fails (a clear error, not placeholder behavior - there's no
meaningful "fake upload URL" fallback the way Agora/LiveKit can hand back
a placeholder token).

## How to add to this feature

- **A new object type** (e.g. stream thumbnails, later): reuse
  `StorageProvider.createUploadUrl()` with a new key prefix - don't add a
  second storage abstraction.
- **A CDN in front of the bucket**: change `S3_PUBLIC_URL_BASE` to the CDN's
  domain - nothing else needs to change, since the public URL is only ever
  built from that one value.

## How to modify this feature

The upload URL TTL (`UPLOAD_URL_TTL_SECONDS`, 5 minutes) and which content
types are accepted (`AvatarUploadUrlDto`'s allow-list, currently
`image/jpeg`/`image/png`) are the two knobs most likely to change - both
are single constants, not spread across call sites.

## How to remove this feature

Remove `StorageModule` from `UsersModule`'s imports, delete
`POST /users/me/avatar/upload-url`, and stop calling it from the mobile
edit-profile screen (avatars would then only be settable by pasting a
URL directly into `PATCH /users/me {avatarUrl}`, which still works
standalone).

## Tests

`s3-storage.service.spec.ts` covers the presigned-URL shape and the
public-URL construction (including not double-slashing when
`S3_PUBLIC_URL_BASE` has a trailing slash) - `@aws-sdk/s3-request-presigner`
is mocked, so no real network/S3Mock call happens in tests.
