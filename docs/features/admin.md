# Admin console & audit trail

**Location**: `apps/backend/src/admin` (console API), `apps/backend/src/audit` (audit trail), `apps/backend/prisma/seed.ts` (default super admin), `apps/admin-web` (the console), `apps/mobile/lib/features/alerts` + `live_stream/widgets/live_ended_view.dart` (what app users see)
**Plan reference**: plan §3.4, §6.8, §11; task-breakdown Phase 8
**Depends on**: `auth` (sessions, `revokeAllSessions`), `streams` (`lock`/`unlock`/`lockLiveStreamsOfHost`), `chat` (`BannedPhrasesService`, message delete), `realtime` (relays, `connectedCount`), `common/rate-limit`, `common/events`, `common/permissions`
**Depended on by**: nothing. The app modules only emit domain events; `audit` listens to them.

## What it does

An internal web console for platform staff: watch and lock lives, read and
moderate a live's chat - live by live, or a day at a time by host - decide
on what users reported, send in-app alerts, manage accounts (suspend,
reinstate, sign out everywhere, fix a profile, change a platform role),
edit the banned-phrase list, create staff accounts, publish app updates
(docs/features/app-updates.md),
and search the audit trail. Every action is enforced on the server and
written to the audit log, and so is every sign-in, account change and
moderation action taken in the mobile app.

### Roles and permissions

A **super admin** can do everything. A **platform moderator** starts with
no access and can do only what a super admin gives them. That is chosen
when the account is created (or promoted), at least one area is required,
and it can be changed later from their user page (`PATCH
/admin/users/:id/permissions`). Access is set per area of the console:

| Area | View | Manage |
|---|---|---|
| Lives and chat | `VIEW_LIVES`: the lives list, a live's details and chat log, Live chat by day | `MANAGE_LIVES`: lock, unlock, delete chat messages for good (one or many) |
| Users | `VIEW_USERS`: accounts, details, devices | `MANAGE_USERS`: suspend, reinstate, sign out everywhere, fix a profile (app users only) |
| Reports | `VIEW_REPORTS`: the Reports page - what was reported and by whom, reported private messages included | `MANAGE_REPORTS`: decide (everyone who reported it is told), remove a reported private message |
| Alerts | `VIEW_ALERTS`: sent alerts | `SEND_ALERTS`: alert one live; `SEND_GLOBAL_ALERTS`: also alert everyone |
| Banned phrases | `VIEW_PHRASES`: the list, testing a message | `MANAGE_PHRASES`: add, change, remove |
| Audit log | `VIEW_AUDIT_LOG`: read and export | |
| Private messages | `VIEW_PRIVATE_MESSAGES`: read conversations between users, a day at a time - each one opened is audited | |
| App updates | `VIEW_APP_RELEASES`: the published versions | `MANAGE_APP_RELEASES`: publish, edit, withdraw (docs/features/app-updates.md) |

A stronger permission includes the area's weaker ones
(`common/permissions/admin-permissions.ts`), so a moderator who can manage
users can see them too. Every staff member sees the overview's totals
(its list of lives only with `VIEW_LIVES`),
the staff list, and their own account page, which shows what they can do.
Only a super admin can add staff, change a role or permissions, or act on
a staff account.

`AdminGuard` (`admin/admin.guard.ts`) runs on every `/admin` route. It
checks the access token and its session, then reads the user's role,
status and permissions **from the database** on each request, so a
demotion, a suspension or a change of access takes effect on the very next
call. `@RequirePermission(X)` on a controller or route names what it needs
(a route's own replaces the controller's), refused with `403
MISSING_PERMISSION`; `@SuperAdminOnly()` narrows a route to super admins.
The console hides what the signed-in staff member can't use, sends them to
a "no access" page for a link they can't open, and re-reads their access
after a `MISSING_PERMISSION` or when the tab regains focus. There is always
at least one active super admin: the last one can't be demoted or
suspended.

### Signing in (plan §11)

- `POST /v1/admin/auth/sign-in {email, password}` only accepts
  `PLATFORM_MODERATOR`/`SUPER_ADMIN` accounts. Failures return one generic
  message and are audited with a reason (`admin.sign_in_failed`). Limits:
  5 per minute per IP, and a per-account token bucket (`ADMIN_SIGN_IN_LIMIT`:
  10 tries, then 1 more every 3 minutes, answered `429 TOO_MANY_ATTEMPTS`;
  if Redis is down, sign-in is allowed).
- The refresh token lives in an **httpOnly, `SameSite=Strict` cookie**
  `gl_admin_refresh`, scoped to `Path=/v1/admin/auth` and `Secure` in
  production. Its lifetime is `ADMIN_SESSION_MAX_AGE_SECONDS` (default
  12 h). Page script never sees it. The access token is kept in memory
  only. `refresh` and `sign-out` also require
  `X-Requested-With: admin-console`, which a cross-site form can't send.
- A seeded or staff-created account has `passwordChangeRequired`. Until it
  sets its own password, only `GET /admin/me` and `POST /admin/me/password`
  work; everything else answers `403 PASSWORD_CHANGE_REQUIRED`. Passwords
  need 12 to 128 characters with both letters and numbers, and can't
  contain the email's name part (`admin/password-policy.ts`).
  Changing the password signs out every other session.
- Staff change their own name, email (current password required) and
  password, and can end their other sessions, from `/admin/me`.

### The default super admin (seed)

`npm run db:seed` (`prisma/seed.ts`) creates the super admin from
`SEED_ADMIN_EMAIL` (no default - without it the seed creates nobody), `SEED_ADMIN_PASSWORD`
(policy-checked; it's a one-time password) and `SEED_ADMIN_NAME`, with
username `admin` (or `admin_N` if that's taken) and
`passwordChangeRequired: true`. It is idempotent. It never resets an
existing account's password, it promotes an existing non-admin account
with that email (audited as `user.role_changed`), and it writes
`admin.seeded`.

### What app users see

- **Lock** (`POST /admin/streams/:id/lock {reason}`): the live ends at
  once. It goes through the same close path as the host's End, then
  `status = LOCKED` with `lockedBy`/`lockedReason`/`lockedAt`. The room
  first gets `stream:locked {streamId, reason}`, then
  `stream_ended {reason: 'LOCKED'}`. The app shows "An administrator
  stopped this live" with the reason (`LiveEndReason.locked`). Locking does
  not suspend the host. **Unlock** clears the flag (the live stays over)
  and tells the host's devices (`stream:unlocked {streamId}` on
  `user:{hostId}`).
- **Suspend**: every session is revoked, the user's sockets are
  disconnected, and any live they're running is locked (viewers see "The
  host's account was suspended"; the reason itself stays in the console).
  The app's login then answers `403 ACCOUNT_SUSPENDED`, but only after a
  correct password, so the message doesn't reveal which accounts exist.
- **Alerts** (`POST /admin/alerts {scope, streamId?, message, severity}`):
  stored in `admin_alerts` with the number of connected devices reached,
  then sent as `admin:alert {id, scope, streamId, message, severity,
  createdAt}` to one live's room or to every socket. The app shows them as
  banners over any screen (`AdminAlertOverlay`, at most 3). `INFO` hides
  after 8 s and `WARNING` after 12 s. `CRITICAL` stays until tapped
  ("Got it"). A resent alert isn't shown again once dismissed.

### Audit trail

`AuditLog` (`audit_logs`) is append-only: there is no update or delete
endpoint - only a super admin's **Data** page can remove it, all or what's
older than some days, and that removal is then recorded as the first entry
of what's left. `AuditEventsListener` turns domain events into entries; the
console services emit the same events rather than writing entries
directly. Each entry stores:

- `category`, `action` (from `audit/audit-catalog.ts`) and `reason`;
- the actor: `actorRole` plus a captured `actorLabel`;
- the target: `targetType` plus a captured `targetLabel`;
- the live it happened in (`streamId`), `metadata` (before/after values,
  for example), and the request's IP and user agent.

The IP and user agent come from `common/request-context` (AsyncLocalStorage).
Set `TRUST_PROXY` behind a reverse proxy, or every entry records the
proxy's IP. The labels are captured when the entry is written, so it still
reads correctly after a rename or a deleted account (`actorId` becomes
null).

`GET /admin/audit-logs` filters by `q` (the actor's or target's name, the
action, the reason, or the start of an IP address),
`category`, `action`, `actorRole`, `actorId`, `userId` (anything done by
or to that user), `targetType` + `targetId`, `streamId` and a `from`/`to`
date range, 25 per page by default. `GET /admin/audit-logs/catalog` returns
the category and action labels for the filters. `GET /admin/audit-logs/export`
returns the same filters as CSV, capped at 10,000 rows, with a UTF-8 BOM
for Excel and formula-neutralised cells; the export itself is audited
(`admin.audit_exported`).

### Reports (docs/features/moderation.md)

The **Reports** page (`/reports`, first under Safety; 2026-10) is where
what people report in the app is decided. The sidebar shows how many cases
are open - in red while an urgent one waits - and the overview has an "Open
reports" figure (`overview.reports {open, urgent}`, null without
`VIEW_REPORTS`). One case per reported thing, however many reported it:
Open (urgent first, then the latest report), Action taken or No violation
(latest decision first), and a filter by what was reported (lives, chat
messages, accounts, private messages). A row shows what it is ("Chat message
from @ana"), why - each reason with how many chose it - how many reports,
and when. The case opens beside the list (`?report=`, so a link can point
at one - an audit entry about a report does):

- **What was reported**, from the snapshot taken at the first report - so
  it's there even after the message, live or account is gone (it says so).
  A private message shows here because it was reported; reading it needs
  `VIEW_REPORTS`, not `VIEW_PRIVATE_MESSAGES`.
- **Whose it is**, with their status and how many other things of theirs
  were reported.
- **Every report**: the reason, the reporter's own words, who and when.
- **Act on it**: the usual tools, each with its own permission - delete
  the chat message for good (`MANAGE_LIVES`), remove the private message
  from both people's conversation (`MANAGE_REPORTS`), lock the live while
  it runs (`MANAGE_LIVES`), suspend the account (`MANAGE_USERS`), open the
  live.
- **Decide** (`MANAGE_REPORTS`): a note for the team (optional; reporters
  never see it), then **No violation** or **Action taken**. Each reporter
  gets a notification with the outcome. A decided case shows who decided,
  when, and the note.

The page's callout reminds staff that the app promises a review within 24
hours, which Apple requires.

**Deleting an account** (super admins; 2026-10): an app user's page has
**Delete account** - for someone who asked to be deleted without the app
(the `/delete-account` page offers email, docs/features/auth.md). It asks
for a reason (kept in the audit log as `user.deleted`), deletes exactly as
the app's own Delete account does, and returns to the users list. Staff
accounts are made app users first.

### Private messages (docs/features/messages.md)

The **Private messages** page (`/messages`, under Records) shows direct
messages between users one local day at a time - today unless another day
is picked, with previous/next day and "Today" buttons, a person search and
`?userId=` (a user's page links there with **Private messages**). The list
is who wrote to whom that day, how many messages and when - never the
text. The text shows only in the conversation opened beside the list
(both people, oldest first, when each was read), and the server records
every conversation opened as `admin.private_messages_viewed` (target
`CONVERSATION`, with the day's range and both user ids); the next pages of
the same conversation aren't recorded again, and the console never
refetches an open conversation by itself. Ranges are capped at 31 days
(`MAX_RANGE_DAYS`). It's read-only: nothing can be edited or deleted there.
A platform moderator needs `VIEW_PRIVATE_MESSAGES`, which a super admin
gives them.

### Live chat

The **Live chat** page (`/chat`, under Monitor; client request, 2026-10)
arranges the chat from lives like private messages: one local day at a
time, today unless another day is picked, with the same day controls and a
host search. The list is the hosts whose lives had chat that day - how
many lives and messages, the last one's time, latest first (`GET
/admin/chat/hosts`: the lives running that day, then a `groupBy` of their
messages, added up per host). Picking a host shows their chat that day
beside the list, oldest first, under a heading for each live (`GET
/admin/chat/hosts/:hostId`), with the chat log's search and status filter,
every moderation status, and the same delete and suspend actions; a live
that began the day before shows its date. Today's list refreshes every 30 s
and the open chat every 15 s. The open host stays when the day changes, to
read their chat day by day, and a host's user page links there with
**Live chat** (`?host=`). Chat in a live is public, so reading it isn't
audited - deleting a message is, as anywhere. It needs `VIEW_LIVES`; a
live's own **Chat log** tab is unchanged. The day range rules are shared
with private messages (`admin/day-range.ts`).

**Deleting chat from the console erases it** (client request, 2026-10):
the row is deleted from the database, its photo from storage, and it
disappears from the console and from everyone's chat in the live
(`ChatService.eraseAsAdmin`, the same `chat:deleted` as a host's delete; a
pinned one is unpinned too). Only the audit entry keeps who sent it and an
excerpt (`metadata.erased`). A host's or moderator's delete in the app still
only hides the message, so the console keeps showing it, struck through,
under "Deleted by a host or moderator" - where staff can erase it too. Staff
with `MANAGE_LIVES` get a checkbox on every message, in Live chat and a
live's Chat log: pick some, or **Pick all shown**, then **Delete N
messages** - one confirmation, then `POST /admin/chat/messages/delete`
(500 at a time; the console splits a bigger pick).

### Data (super admins)

The **Data** page (`/data`, under System; client request, 2026-10) is for
super admins only - it's not a permission a moderator can be given. It lists
what is stored by area (people, lives, messages and notifications, the
console), each kind with its row count and tables (`GET /admin/data`, from
`AdminDataService`'s list of data sets), and removes one kind at a time:
all of it, or - for chat, lives, private messages, notifications, alerts
and the audit log - only what's older than some days, and for signed-in
devices only those unused for some days. **Reset everything** removes all
but the signed-in super admin's own account (other staff included); it can
keep app updates, banned phrases and the audit log, and needs `RESET` typed
as well.

- Every removal asks for the admin's password again (`400 WRONG_PASSWORD`;
  10 tries a minute), and is audited afterwards - `data.cleared` (target
  `DATA`, with how many rows went) or `data.reset` - so even clearing the
  audit log leaves that entry.
- A running live keeps everything that belongs to it: its chat, stage
  guests and requests, moderators, mutes, recording permissions and room
  bans. Removing app users keeps staff and anyone hosting a live right now.
  A reset waits until no live runs (`409 LIVES_RUNNING`, lock them first).
- Removing a live takes everything in it with it (the database cascades);
  removing app users removes their lives first, then them.
- Files go too: chat photos with their messages or lives, and profile
  pictures with their accounts (`StorageProvider.deleteUrls`, best effort).
- Signing everyone out (all signed-in devices) and a reset close everyone
  else's realtime connection at once (`data.cleared` with `signedOut`,
  `data.reset`); the admin's own session stays.
- A reset empties every table but `users` (only the admin's row stays),
  their sessions, settings and sign-in links, `_prisma_migrations` and what
  it was asked to keep (`TRUNCATE`, in one transaction) - so a table added
  later is covered without changing it.

### App updates

The **App updates** page (`/app-updates`, under Manage) publishes each new
version of the app, per platform - see docs/features/app-updates.md.

### REST routes (all under `/v1`, all audited)

Each route needs the permission in brackets (a super admin has them all).

```
POST   /admin/auth/sign-in | /admin/auth/refresh | /admin/auth/sign-out
GET/PATCH /admin/me          POST /admin/me/password | /admin/me/email
GET    /admin/me/sessions    DELETE /admin/me/sessions/:sessionId
GET    /admin/overview                         (any staff; counts + 14-day series, UTC; open reports with VIEW_REPORTS)
GET    /admin/streams[?q&status&hostId&from&to&sort&order&page&pageSize]    [VIEW_LIVES]
GET    /admin/streams/:id | /admin/streams/:id/chat[?q&status&cursor&limit]  [VIEW_LIVES]
DELETE /admin/streams/:id/chat/:messageId                                  [MANAGE_LIVES]
POST   /admin/streams/:id/lock ({reason}) | /admin/streams/:id/unlock      [MANAGE_LIVES]
GET    /admin/users[?q&status&role&sort&order] | /admin/users/:id | /:id/sessions  [VIEW_USERS]
POST   /admin/users/:id/suspend ({reason}) | /reinstate | /sessions/revoke  [MANAGE_USERS]
PATCH  /admin/users/:id/profile ({username?, displayName?, bio?, removeAvatar?, reason})  [MANAGE_USERS]
PATCH  /admin/users/:id/role ({platformRole, permissions?})                (super admin)
PATCH  /admin/users/:id/permissions ({permissions})                        (super admin)
POST   /admin/users/:id/delete ({reason})                                  (super admin; app users only)
GET    /admin/staff                            (any staff)
POST   /admin/staff ({email, displayName, platformRole, permissions?})     (super admin; returns a one-time password)
GET    /admin/alerts                                                       [VIEW_ALERTS]
GET    /admin/alerts/targets   (running lives to alert, with their reach)  [SEND_ALERTS]
POST   /admin/alerts           (GLOBAL also needs SEND_GLOBAL_ALERTS)       [SEND_ALERTS]
GET    /admin/banned-phrases | POST /admin/banned-phrases/test             [VIEW_PHRASES]
POST/PATCH/DELETE /admin/banned-phrases[/:id]                              [MANAGE_PHRASES]
GET    /admin/audit-logs | /admin/audit-logs/catalog | /admin/audit-logs/export  [VIEW_AUDIT_LOG]
GET    /admin/messages/conversations?from&to[&q&userId&page&pageSize]      [VIEW_PRIVATE_MESSAGES]
GET    /admin/messages/conversations/:id?from&to[&cursor&limit]  (audited)  [VIEW_PRIVATE_MESSAGES]
GET    /admin/chat/hosts?from&to[&q&page&pageSize]                         [VIEW_LIVES]
GET    /admin/chat/hosts/:hostId?from&to[&q&status&cursor&limit]           [VIEW_LIVES]
POST   /admin/chat/messages/delete ({messageIds: 1-500})                   [MANAGE_LIVES]
GET    /admin/reports[?status=OPEN|ACTIONED|DISMISSED&type&page&pageSize] | /admin/reports/:id  [VIEW_REPORTS]
POST   /admin/reports/:id/resolve ({outcome: ACTIONED|DISMISSED, note?})   [MANAGE_REPORTS]
POST   /admin/reports/:id/remove-message   (a reported private message)    [MANAGE_REPORTS]
GET    /admin/app-releases[?page&pageSize]                                 [VIEW_APP_RELEASES]
POST   /admin/app-releases ({platform, version, build, notes, downloadUrl, required?})  [MANAGE_APP_RELEASES]
PATCH  /admin/app-releases/:id ({notes?, downloadUrl?, required?}) | DELETE /admin/app-releases/:id  [MANAGE_APP_RELEASES]
GET    /admin/data                                                         (super admin)
POST   /admin/data/clear ({dataSet, olderThanDays?, password})             (super admin)
POST   /admin/data/reset ({password, keep?: [appUpdates|bannedPhrases|auditLog]})  (super admin)
```

Every admin controller except sign-in/refresh/sign-out is throttled at
300 requests a minute (`ADMIN_API_THROTTLE`), since staff often work all
day from one office address.

### The console (`apps/admin-web`)

React 19 + Vite + TypeScript, Tailwind CSS 4, TanStack Router (code-based
routes, lazily loaded pages, filters and pages kept in the URL so a view
can be shared or bookmarked), TanStack Query (every mutation refreshes the
data on screen) and TanStack Table (server-side sorting and pagination).
See [the console's README](../../README.md) for its
structure and scripts.

In production the console is its own image (`apps/admin-web/Dockerfile`):
the static build behind unprivileged nginx, which also proxies `/v1` to the
API, so the console and the API share one origin and the refresh cookie
stays first-party - the same arrangement as Vite's dev proxy. nginx sends a
strict Content-Security-Policy (`CSP_IMG_SRC` adds the avatar bucket's
origin), HSTS and the usual hardening headers, caches the hashed assets for
a year and never caches `index.html`. It passes the TLS proxy's
`X-Forwarded-For` through unchanged, so the API's `TRUST_PROXY=1` still
finds the client. Deploying: [docs/deployment.md](../deployment.md).

### Environment

| Key | Where | Meaning |
|---|---|---|
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | backend | The default super admin (seed only; the password is replaced at first sign-in) |
| `ADMIN_SESSION_MAX_AGE_SECONDS` | backend | Console session length, default 43200 (12 h) |
| `TRUST_PROXY` | backend | Express `trust proxy` (a hop count or a list), so audit entries record the real client IP |
| `CORS_ORIGIN` | backend | Required. Include the console's origin if it is ever served from a different origin |
| `ADMIN_API_ORIGIN` | admin-web `.env` (dev server, preview) | Where Vite proxies `/v1`; required, no default |
| `API_UPSTREAM`, `CSP_IMG_SRC` | admin-web image | Where nginx proxies `/v1`; extra image sources for the CSP. Both required - the image has no defaults (production: `/usr/src/apps/mela/admin/.env`; locally: the repo's `.env`) |

## How to add to this feature

- **A new admin action**:
  1. Add a DTO and a service method in the matching `admin/<area>` folder,
     and a route on its controller. It inherits `AdminGuard`, the throttle
     and the controller's `@RequirePermission`; give the route its own
     (`@RequirePermission(AdminPermission.X)`) if it changes something, or
     `@SuperAdminOnly()` for staff management.
  2. Emit a domain event carrying the `actorId` and `reason`.
  3. Add the action to `AUDIT_ACTIONS` in `audit-catalog.ts` (plain text,
     so no migration), and a handler in `audit-events.listener.ts`.
  4. In the console, add the call to `actions` in
     `admin-web/src/lib/queries.ts`, use it through `useAdminMutation`, and
     show its button only when `auth.can('X')`.
- **A new permission**: add it to the `AdminPermission` enum (a migration),
  to `INCLUDES` in `common/permissions/admin-permissions.ts` if it implies
  another, to the console's `AdminPermission` type, and as a level of an
  area (or a new area) in `admin-web/src/lib/permissions.ts`, which the
  picker and summaries read.
- **Auditing something the app does**: emit or reuse a domain event in the
  owning module, then do steps 3 and 4 above. The owning module doesn't
  import `audit`.
- **A console page**: add a component under `admin-web/src/features/<area>`,
  a route in `app/router.tsx` (a `lazyRouteComponent`, `beforeLoad:
  needs('VIEW_X')`, plus a search parser in `app/search.ts` if it has
  filters), and a sidebar entry in `app/AppShell.tsx` with the same
  `needs`.

## How to modify this feature

- Who may do what: the `@RequirePermission` on each route; what a
  permission includes, in `admin-permissions.ts`; the areas and levels a
  super admin chooses from, in `admin-web/src/lib/permissions.ts`.
  Staff-only rules: `@SuperAdminOnly()`, and `assertCanActOnStaff` and
  `assertAnotherSuperAdmin` in `AdminUsersService`.
- Session length: `ADMIN_SESSION_MAX_AGE_SECONDS`. Sign-in limits:
  `ADMIN_SIGN_IN_LIMIT` and the `@Throttle` on `sign-in`.
- Password rules: `admin/password-policy.ts` (the console mirrors them in
  `features/account/password.ts` for instant feedback; the server decides).
- Wording in the audit log: the labels in `audit-catalog.ts`. Existing
  entries keep the action key, so they pick up a changed label too.

## How to remove this feature

1. Remove `AdminModule` and `AuditModule` from `app.module.ts`, then delete
   `src/admin`, `src/audit` and `common/request-context`.
2. Drop the `admin_alerts` and `audit_logs` tables in a new migration. Of
   the other columns added by `20260927103000_phase8_admin_console`,
   `users.passwordChangeRequired` is only used by the console, like `users.adminPermissions` and
   the `AdminPermission` enum (`20260927170000_admin_permissions`).
   `users.lastLoginAt` (app login),
   `users.suspendedAt`/`suspensionReason` and `streams.locked*` (the
   suspend and lock paths) should only go together with the code that
   writes them.
3. Remove the `stream:locked`/`stream:unlocked`/`admin:alert` relays in
   `realtime.gateway.ts`, and on mobile `features/alerts` plus its wrapper
   in `main.dart`.
4. Delete `prisma/seed.ts` and the `prisma.seed` entry in `package.json`,
   and `apps/admin-web`.

Locking would still work from the streams module, but nothing would be
able to call it.

## Tests

- Backend (jest):
  - `admin/admin.guard.spec.ts`: token, session, role, super-admin-only,
    pending password, permissions (a stronger one covering a weaker one).
  - `common/permissions/admin-permissions.spec.ts`: what each permission
    includes, and what each role ends up with.
  - `admin/password-policy.spec.ts`.
  - `admin/auth/admin-auth.service.spec.ts`: sign-in, rate limit, refresh,
    password and email change, the permissions the console is told.
  - `admin/users/admin-users.service.spec.ts`: staff rules, the last super
    admin, profile edits, staff creation and role changes with access,
    permission changes.
  - `admin/content/admin-content.service.spec.ts`: alert targets, global
    alerts by permission, phrases.
  - `admin/chat/admin-chat.service.spec.ts`: hosts with chat that day,
    added up across their lives; one host's chat by live, filters, paging;
    deleting several messages at once.
  - `admin/data/admin-data.service.spec.ts`: the counts, the password asked
    again, only older chat (running lives kept, photos deleted), kinds only
    removable all at once, signing everyone out but this console, app users
    after their lives, empty conversations, the phrase cache, room bans; a
    reset's `TRUNCATE` sparing the admin's account and what was kept, and
    waiting for running lives.
  - `chat/chat.service.spec.ts` (`eraseAsAdmin`): rows gone, the room told,
    a pin taken down, photos deleted. `common/storage/s3-storage.service.spec.ts`:
    deleting this bucket's files only, failures logged.
  - `admin/releases/admin-releases.service.spec.ts`: see
    docs/features/app-updates.md.
  - `admin/reports/admin-reports.service.spec.ts`: see
    docs/features/moderation.md; deleting an account, docs/features/auth.md.
  - `audit/audit.service.spec.ts`: filters, CSV escaping.
  - `audit/audit-events.listener.spec.ts`: every handler.
  - `auth/jwt-auth.guard.spec.ts`: a revoked session.
  - The gateway specs: the lock, unlock and alert relays.
- End to end: `node scripts/smoke-test-admin.js` against a running backend
  (`API_ORIGIN` in the backend's `.env`). It creates a throwaway
  admin, then checks sign-in, forced password change, cookie refresh, lock
  and unlock seen from a real socket, alerts, suspension, phrases,
  a platform moderator limited to what they were given (and a change to it
  applying at their next request), the audit log and CSV export, and
  sign-out, then deletes both accounts. Admin sign-in allows 5 per minute
  per IP and each run signs in three times, so wait a minute between runs.
- Mobile: `admin_alerts_test.dart`, plus lock cases in
  `live_room_test.dart`, `live_ended_view_test.dart`,
  `api_client_test.dart` and `app_failure_test.dart`.
- Console (vitest): `lib/api.test.ts` (single-flight refresh, errors, a
  missing permission re-reading access), `lib/permissions.test.tsx` (access
  levels and the picker), `lib/format.test.ts`, `app/search.test.ts` (URL
  filters, safe redirects), `features/account/PasswordForm.test.tsx`,
  `components/ui/ui.test.tsx`, `features/chat/sections.test.ts` (a host's
  day split by live), `features/releases/release-form.test.ts`,
  `features/data/DataPage.test.tsx` (counts by area, removing older chat,
  a refused password, the reset's confirmations) and
  `features/streams/ChatLog.test.tsx` (picking messages and deleting them
  at once; none for read-only staff), `features/reports/ReportCase.test.tsx`
  (what was reported and by whom; deciding with a note, or as no violation;
  read-only staff; deleting the chat message, removing a private message;
  something gone since; a decided case).
