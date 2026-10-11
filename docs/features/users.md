# Users

**Location**: `apps/backend/src/users`
**Plan reference**: task-breakdown Phase 0, Phase 3 (bio, avatar upload, relationship flags), Phase 4 (block)
**Depends on**: `common/prisma`, `auth` (for `JwtAuthGuard`/`OptionalJwtAuthGuard`/`CurrentUser`), `social` (relationship flags, block/unblock), `common/storage` (avatar upload)
**Depended on by**: every future feature that shows a username/avatar (chat, guests, admin)

## What it does

Own-profile read/update (`GET/PATCH /v1/users/me`) and public profile
lookup by id (`GET /v1/users/:id`). Public responses always use an
explicit Prisma `select` (`PUBLIC_PROFILE_SELECT`) rather than the raw row,
so `passwordHash` (and any session/token data, which now lives in `user_sessions`) can never leak, even by accident
later.

**Profile fields**: `username`, `displayName`, `bio` (≤ 280 chars), `avatarUrl`,
`profileVisibility` (`EVERYONE` | `FOLLOWERS` | `FRIENDS` | `ONLY_ME`),
`profileSharing` (the same values - who may share the profile's link,
docs/features/social.md) -
`shareLiveJoins` (whether followers hear when you join a live,
docs/features/notifications.md) -
all editable via `PATCH /users/me` (the DTO's shape *is* the allow-list).

**How often names change** (client request, 2026-10): a new `username`
once in 30 days, a new `displayName` once in 7 (`name-change-rules.ts`,
`users.usernameChangedAt` / `displayNameChangedAt`, migration
`20261012090000_name_change_limits`). Too soon is a 400 with
`code: 'USERNAME_CHANGE_TOO_SOON' | 'DISPLAY_NAME_CHANGE_TOO_SOON'` and
`nextChangeAt`; a username someone else has (any case) is a 409. Sending
the current name again isn't a change and isn't counted; staff fixes in the
console aren't limited. Only the owner's own profile carries
`usernameChangeableAt` / `displayNameChangeableAt` (null: may change now)
and `shareLiveJoins`. The app's edit-profile screen shows both fields, locks
one until its date ("You can change it again on ..."), and asks before a
change starts the wait. Every profile response also
carries `followerCount`, `followingCount`, `isFollowing`, `isFollowedBy`,
`isFriend`, `notifyOnLive` (this viewer's own bell state for that profile),
`liveStreamId` (their current live's id, or `null`) and `canViewProfile` -
when `false`, `bio`, `createdAt` and both counts come back `null` (profile
visibility, docs/features/social.md) - see
docs/features/social.md for how those are computed and why `GET /users/:id`
uses `OptionalJwtAuthGuard` instead of `JwtAuthGuard` (a public profile
must stay viewable while signed out, but the relationship flags need to
know who's asking when someone is signed in).

**Avatar upload** (`POST /users/me/avatar/upload-url {contentType}`):
returns a short-lived presigned upload URL from the `StorageProvider`
(docs/features/storage.md) plus the eventual public URL - the client
uploads the image bytes directly to object storage, then finalizes with
`PATCH /users/me {avatarUrl}`. The API never sees the image bytes.

**Block / unblock** (`POST/DELETE /users/:id/block`, plan §6.4): thin
controllers delegating straight to `SocialService.block()`/`unblock()`
(docs/features/social.md) - `UsersController` doesn't own any block logic
itself, the same way it doesn't own follow logic. Blocking someone also
removes any follow between the two of you, both ways, and (from that point
on) hides their lives from your discovery/feeds/search and theirs from
yours (`SocialService.blockedEitherWayUserIds`, checked in
`StreamsService.listLive()` and `SocialService.search()`).

**Deleting an account** (`AccountDeletionService`, `POST /v1/me/account/delete`,
2026-10) lives here too, since it removes the user and everything hanging
off them - documented in docs/features/auth.md with how it's proven.

## How to add to this feature

New public-profile fields: add the column via its own migration, then add
it to `PUBLIC_PROFILE_SELECT` in `users.service.ts` and, if it should be
user-editable, to `UpdateProfileDto` - do this deliberately, never switch
to selecting `*`.

## How to modify this feature

Changing what's editable via `PATCH /v1/users/me`: edit
`update-profile.dto.ts`. Changing the relationship-flag logic itself
(follower counts, friend detection) lives in `social.service.ts`, not
here - `UsersService` only calls it and merges the result in.

## How to remove this feature

Not expected to be removed. If it were: delete `UsersModule` from
`app.module.ts` and anything importing `UsersService` directly (nothing
does yet).

## Tests

`users.service.spec.ts` covers profile lookup/enrichment (relationship
flags and `liveStreamId` merged in, 404 for an unknown id),
`updateOwnProfile`, and the avatar-upload-url key shape (`SocialService`
and the `StorageProvider` are both mocked). Follow/search/friends/block
themselves are covered in `social.service.spec.ts` - see docs/features/social.md;
`UsersController`'s `block`/`unblock` routes are a direct one-line delegation,
so they're not separately unit-tested beyond that service coverage.
