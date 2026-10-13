# Hosting restrictions and appeals

**Location**: `apps/backend/src/hosting-restrictions` (rules, service, reasons, the app's `/me/hosting` routes); `apps/backend/src/admin/hosting` (the console's routes); console `src/features/hosting`; mobile `lib/features/hosting`
**Depends on**: `common/prisma`, `common/events`, `common/storage` (appeal pictures), `auth` (JWT guard), `admin` (guard, permissions)
**Depended on by**: `streams` (`assertCanHost` on going live and joining a stage; ends a restricted host's live), `scheduled-lives` (refuses scheduling; cancels what was announced), `notifications`, `realtime`, `audit`, `admin/overview` (the waiting count)

## What it does

The team watches lives and their chat every day. When a host behaves badly,
staff **pause their hosting** because of that live: until staff lift it or
the time they set runs out, the account can't **go live**, **join a stage**
(raise a hand, accept an invite, or be invited) or **schedule a live**.
Everything else stays exactly as it is - watching lives, chat, private
messages with friends, the profile. It's moderation the host can see and
answer: the app shows them what the team wrote, and they may **appeal**,
with up to 3 pictures.

- **The reason is the team's own words.** Staff pick a saved reason (its
  words still editable for this host) or write a new one - and can keep it
  as a reason for next time. Reasons live in the console (**Hosting
  restrictions → Reasons**): added, edited, archived (no longer offered) or
  restored. A restriction keeps its own copy of the title and message, so
  editing a reason never changes what a host was already told.
- **Tied to a live, paused from where staff read the chat.** The console
  (2026-10 redesign):
  - **Live chat** is the workspace: hosts (paused ones badged), the chat
    live by live with **Pause hosting** on each live's heading, and beside
    it the **Host** panel - account links, **Hosting** (can go live /
    paused, with "Answer the appeal" opening the case beside the page, and
    how many times before) and the lives that day.
  - The **pause dialog** picks the live it's about (the one opened from,
    or any that day), the reason, how long, a team note, and previews what
    the host will read.
  - A **live's page**: "Inspect in Live chat", a banner while the host is
    paused, the Host card with the same Hosting status, and the **Hosting**
    tab with the restrictions about that live and their appeals.
  - **Lives** list: paused hosts badged.
  - **Hosting restrictions** page: Appeals waiting / In force / Ended / All
    (with counts), search by host, each opened as a case - who and why,
    details, the appeal as a timeline, and the answer box at the bottom
    (Ask for more, Keep restriction, Lift - confirmed) - plus the
    **Reasons library**.
- **How long:** until lifted, 24 hours, 3, 7 or 30 days - changeable later,
  counted from then. One restriction in force per account at a time.
- **At once:** a live the host is running ends (`StreamEndReason.HOST_RESTRICTED`
  - viewers just see "An administrator stopped this live"); they leave any
  stage they're on; their upcoming scheduled lives are cancelled.
- **Staff note:** for the team only; never shown to the host.

### The appeal

A conversation between the host and "the Mela team" (staff names aren't
shown to the host). Whose turn it is (`HostingAppealState`):

| State | Meaning | The host can write |
|---|---|---|
| `NONE` | The host hasn't written | Yes |
| `WAITING_STAFF` | The host wrote: the team's turn (counted on the sidebar) | No - one at a time |
| `WAITING_HOST` | The team asked for more | Yes |
| `KEPT` | The team kept the restriction | Again 24 hours later (`APPEAL_AGAIN_AFTER_MS`) |

Staff answer with **Keep restriction** or **Ask for more** (both need a
message), or **Lift** (a message optional). The host gets a push for each
(`HOSTING_RESTRICTED`, `HOSTING_APPEAL_ANSWERED`, `HOSTING_RESTORED` - always
pushed, like security notices) and the app's screen updates as it happens
(`hosting:changed` on the user's own socket room).

Pictures go straight to storage like chat photos: the app asks for an
upload URL, then sends the keys with the message. Only keys handed out for
that restriction are accepted (`hosting-appeals/{restrictionId}/{uuid}.jpg|png`,
`isAppealImageKey`).

### What the host sees (mobile)

- **Go live** opens "Your hosting is paused" instead of the camera
  (`HostingGate`): the title and message, since/until, the conversation,
  and the appeal form (or "The Mela team is reviewing what you sent" /
  "You can write again ..."). It says that watching, chat and messages work
  as usual. Lifted while open: "You can go live".
- Their live stopped by a restriction ends on "Your live was stopped" with
  **See why**.
- Raising a hand or accepting a stage invite: "Your hosting is paused, so
  you can't join a stage" with **See why**. A host inviting them only hears
  "They can't join a stage right now" - whose hosting is paused is between
  them and the team.
- The three notifications open the same screen (`/hosting`).

### Routes (all under `/v1`)

```
GET    /me/hosting                         -> {restriction: {..., canWrite, writeOpensAt, messages} | null}
POST   /me/hosting/appeal-image-upload-url ({contentType: image/jpeg|image/png})
POST   /me/hosting/appeal                  ({text: 1-1000, imageKeys?: up to 3})

GET    /admin/hosting-reasons[?archived=true]                         [VIEW_HOSTING_RESTRICTIONS]
POST   /admin/hosting-reasons ({title, message})                      [MANAGE_HOSTING_RESTRICTIONS]
PATCH  /admin/hosting-reasons/:id ({title?, message?, archived?})     [MANAGE_HOSTING_RESTRICTIONS]
GET    /admin/hosting-restrictions[?state=waiting|active|ended|all&streamId&userId&q&page&pageSize]  [VIEW_HOSTING_RESTRICTIONS]
GET    /admin/hosting-restrictions/in-force?userIds=a,b   (up to 100: the one in force on each, for badges)  [VIEW_HOSTING_RESTRICTIONS]
GET    /admin/hosting-restrictions/:id     (with the conversation and the host's other restrictions)  [VIEW_HOSTING_RESTRICTIONS]
POST   /admin/hosting-restrictions ({userId, streamId?, reasonId?, title, message, note?, durationHours?: 1-8760|null, saveAsReason?})  [MANAGE_HOSTING_RESTRICTIONS]
POST   /admin/hosting-restrictions/:id/lift ({reply?})                [MANAGE_HOSTING_RESTRICTIONS]
POST   /admin/hosting-restrictions/:id/answer ({decision: KEEP|ASK, text})  [MANAGE_HOSTING_RESTRICTIONS]
PATCH  /admin/hosting-restrictions/:id ({endsAt?: ISO|null, note?})   [MANAGE_HOSTING_RESTRICTIONS]
```

Refusals the app understands: `403 HOSTING_RESTRICTED` (going live, a
stage, scheduling), `409 APPEAL_PENDING`, `409 APPEAL_TOO_SOON` (with
`opensAt`); staff get `409 ALREADY_RESTRICTED` (with `restrictionId`) and
`409 NOT_ACTIVE`.

### Audit

On the host (target `USER`), and on the live (`streamId`, so the live's
**Activity** tab shows them): `hosting.restricted` (the title as reason),
`hosting.lifted`, `hosting.changed`, `hosting.appeal_sent`,
`hosting.appeal_kept`, `hosting.appeal_asked`. Reasons:
`hosting_reason.created|updated|archived|restored` (target `HOSTING_REASON`).

### Data

`hosting_restriction_reasons`, `hosting_restrictions`,
`hosting_restriction_messages` (migration `20261017090000_hosting_restrictions`).
In force means `liftedAt IS NULL AND (endsAt IS NULL OR endsAt > now)`
(`activeRestrictionWhere`) - nothing has to run when one runs out.

## How to add to this feature

- **Another thing a paused host can't do:** call
  `HostingRestrictionsService.assertCanHost(userId)` where it starts (import
  `HostingRestrictionsModule`); undo anything running in an
  `@OnEvent(DomainEvents.HostingRestricted)` listener, like
  `StreamsService.handleHostingRestricted`.
- **Another duration:** `DURATIONS` in the console's
  `src/features/hosting/durations.ts` (the API takes any 1-8760 hours).
- **Another appeal step:** a value in `HostingAppealState` (migration),
  its rule in `appealOpensAt` (`hosting-rules.ts`), and the labels in the
  console (`HOSTING_APPEAL_LABELS`) and app (`HostingAppealState.fromWire`).

## How to modify this feature

- The wait after **Keep**: `APPEAL_AGAIN_AFTER_MS`; pictures per message:
  `APPEAL_MAX_IMAGES` (and `kAppealMaxImages` in the app).
- What the host reads around the team's words: `hosting_paused_screen.dart`;
  the push wording: `NotificationsService.onHosting*`.
- Who may restrict: the `VIEW_/MANAGE_HOSTING_RESTRICTIONS` permissions
  (a super admin gives them per moderator, **Hosting restrictions** area).

## How to remove this feature

1. Drop `HostingRestrictionsModule` from `app.module.ts`, `StreamsModule`,
   `ScheduledLivesModule` and `AdminModule` (and the admin controllers).
2. Remove the `assertCanHost`/`isRestricted` calls and the
   `HostingRestricted` listeners in `StreamsService` and
   `ScheduledLivesService`, the notification, realtime and audit listeners,
   and the overview's `hosting` count.
3. A migration dropping the three tables and `HostingAppealState`
   (keep the enum values `HOST_RESTRICTED`, the notification types and the
   permissions until no row uses them).
4. Console: the `/hosting` route, sidebar item, the live page's tab and
   button, the Live chat link. App: `lib/features/hosting`, the `/hosting`
   route, `HostingGate`, and the handling in `go_live_screen.dart` and
   `viewer_screen.dart`.

## Tests

- Backend: `src/hosting-restrictions/hosting-restrictions.service.spec.ts`
  (who may host, restricting, appealing, the rules, answering and lifting);
  `streams.service.spec.ts` and `scheduled-lives.service.spec.ts` ("hosting
  restrictions" / "a paused host").
- Console: `src/features/hosting/RestrictionView.test.tsx`.
- App: `test/hosting_test.dart`.
