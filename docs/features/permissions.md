# Permissions (`PermissionsService`)

**Location**: `apps/backend/src/common/permissions`
**Plan reference**: plan §4.1, §5, §6.9
**Depends on**: nothing (pure logic - no Prisma/HTTP imports)
**Depended on by**: every controller/service that gates an action by role (streams, chat, guests, moderation, moderators, admin, as those land in later phases)

## What it does

Single source of truth for every "can this user do X" check in the app -
host-vs-moderator-vs-admin authority, all in one service, instead of
`if (hostId === userId)` scattered across controllers.

It's deliberately **pure**: methods take plain IDs/booleans (e.g.
`isActiveModerator: boolean`) rather than Prisma models, so this module
never needs to import the (future) `streams` or `moderators` tables. The
caller (e.g. the future `GuestsService`) looks up whatever it needs and
passes the result in.

## How to add to this feature

Add a new method for each new "can X do Y" question as new features land.
Add a matching case to `permissions.service.spec.ts` in the same change.

## How to modify this feature

Changing who is allowed to do something (e.g. letting moderators send
global alerts) is a one-line change to the relevant method here - no
controller changes required. That's the point of this abstraction.

## How to remove this feature

Not expected to be removed (it's the authorization backbone). If a
specific check is no longer needed, delete the method here - TypeScript
will fail the build at every call site, so nothing is silently left calling
a removed check.

## Tests

`permissions.service.spec.ts` covers host vs. moderator vs. plain-viewer
moderation rights. Admin console access is per permission, not per role
(`admin-permissions.ts`, chosen by a super admin for each platform
moderator - see docs/features/admin.md); `admin-permissions.spec.ts`
covers what each permission includes and what each role ends up with.
