# Feature Documentation Index

Every backend feature module ships with a short doc here explaining how to
**add to it**, **modify it**, and **remove it** - so extending this app
later doesn't require reverse-engineering the codebase first. This is the
practical follow-through on the architecture principles in
[live-streaming-plan.md §4.1](../live-streaming-plan.md).

**Where the code is.** The apps now live in four repositories; these docs
keep the paths of the repository they were written in: `apps/backend/...`
is **mela-backend**, `apps/mobile/...` **mela-mobile**, `apps/web/...`
**mela-web** and `apps/admin-web/...` **mela-admin-web** (where these docs
are). `infra/...` and the dev `docker-compose.yml` are in mela-backend.

## Template for a new feature doc

When you build a new feature module (Phase 1+), create
`docs/features/<feature>.md` using this structure:

```markdown
# <Feature name>

**Location**: `apps/backend/src/<folder>` (+ mobile/admin-web paths if applicable)
**Plan reference**: plan §X.Y
**Depends on**: <other modules/services it imports>
**Depended on by**: <other modules that import this one, if any>

## What it does
2-4 sentences.

## How to add to this feature
E.g. "add a new banned-phrase rule": which file, which function, any migration needed.

## How to modify this feature
Behavior that's expected to change over time and where it lives.

## How to remove this feature
Exact steps: which module(s) to unregister from `app.module.ts`, which
Prisma models/migrations to drop, which other modules' imports to clean up.
Call out anything that will break if this is removed without those steps.

## Tests
Where its tests live and what they cover.
```

## Status

| Feature | Doc | Status |
|---|---|---|
| Permissions | [permissions.md](./permissions.md) | Done (Phase 0) |
| Domain events | [events.md](./events.md) | Done (Phase 0) |
| Video provider | [video-provider.md](./video-provider.md) | Done (Phase 0) |
| Auth | [auth.md](./auth.md) | Done (Phase 0) |
| Users | [users.md](./users.md) | Done (Phase 0) |
| Streams (go live/watch) | [streams.md](./streams.md) | Done (Phase 1) |
| Realtime (Socket.IO, presence) | [realtime.md](./realtime.md) | Done (Phase 1) |
| Chat & likes | [chat.md](./chat.md) | Done (Phase 2) |
| Storage (presigned uploads) | [storage.md](./storage.md) | Done (Phase 3) |
| Social (profiles, follows, search) | [social.md](./social.md) | Done (Phase 3) |
| Moderation & block | [moderation.md](./moderation.md) | Done (Phase 4) |
| Host-delegated moderators (with abilities) | [moderators.md](./moderators.md) | Done (Phase 4) |
| Notifications | [notifications.md](./notifications.md) | Done (Phase 5) |
| Share links & deep links | [share.md](./share.md) | Done (Phase 5) |
| Web player (share links play in the browser) | [share.md](./share.md), [auth.md](./auth.md) (web sign-in), [realtime.md](./realtime.md) (watch-only sockets) | Done (2026-09-30) |
| Host photos in chat | [chat.md](./chat.md), [storage.md](./storage.md) | Done (2026-09-30) |
| Recording permission (no screen recording unless the host allows) | [streams.md](./streams.md), [realtime.md](./realtime.md) | Done (2026-09-30) |
| Direct messages between friends (Inbox tab; web player inbox; the console's Private messages) | [messages.md](./messages.md), [admin.md](./admin.md) | Done (2026-09-30) |
| Guests | [guests.md](./guests.md) | Done (Phase 6) |
| Mute/unmute (all four kinds, plan §6.7) | [moderation.md](./moderation.md) (room chat mute), [guests.md](./guests.md) (mic lock), [social.md](./social.md) (personal chat mute), [chat.md](./chat.md) | Done (Phase 7) |
| Low bandwidth: Data Saver, offline banner | [streams.md](./streams.md), [realtime.md](./realtime.md) | Done (Phase 7) |
| Admin console & audit trail | [admin.md](./admin.md) | Done (Phase 8) |
| Brand (Mela logo, icons, splash) & production Docker deploy | [Brand assets](../../README.md#brand-assets) (this repository's README), [../deployment.md](../deployment.md) | Done (Phase 9) |

Phase 1.5 (hardening) changes `auth`, `realtime`, and `streams` in place rather than adding new modules — update those docs as each task lands. See [task-breakdown.md](../task-breakdown.md) for the phase map.
