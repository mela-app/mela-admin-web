# Campaigns (push campaigns, in-app banners, featured hosts)

**Location**: `apps/backend/src/campaigns`, `apps/backend/src/admin/campaigns`, `apps/admin-web/src/features/campaigns`, `apps/mobile/lib/features/announcements`, `apps/mobile/lib/features/notifications/presentation/push_notifications_listener.dart`
**Plan reference**: client request, 2026-11
**Depends on**: notifications (`PushQueueService` - the same queue and devices as every push), analytics (audiences by activity and app version), streams (For You ranking)
**Depended on by**: nothing

## What it does

The console's **Campaigns** page (`/campaigns`, Growth > Campaigns; `VIEW_CAMPAIGNS` to see, `MANAGE_CAMPAIGNS` to act) reaches many people at once, three ways:

### Push notifications

A title (65), a message (240), optionally what a tap opens - a live or profile link pasted from the app's Share (stored as `/live/<id>` or `/profile/<id>`; anything else is refused) - and **who gets it**:

- phones: Android, iPhone or both; app versions (e.g. `1.0.3`, to ask them to update);
- only hosts (went live in the last 30 days);
- active in the last N days, or away for N days (to win them back).

Every audience is app users only, active accounts, with a phone that can get a push (a push token), who didn't turn off **News from Mela** (`notification_settings.pushAnnouncements`, a new toggle in the app's notification settings). The form shows how many it reaches right now (`POST /admin/campaigns/audience-size`), and sending asks again with that number.

**Send now** or **Schedule** (the admin's own time). `CampaignsJobs` (every 30 s) sends what is due: a campaign is claimed first (`SCHEDULED` → `SENDING`, one instance wins), its recipients are read 500 at a time and queued on the push queue with `data: {type: CAMPAIGN, campaignId, path?}` (collapse key per campaign), then it's `SENT` with how many it reached - or `FAILED` with why. A scheduled campaign can be cancelled until it goes out. Any campaign not being sent right now can be **deleted** (with its opens): a scheduled one then never goes out; a sent one leaves the list, but pushes already delivered stay on phones. The audience is resolved when it goes out, not when it was scheduled.

**Opened**: the app reports `POST /v1/me/campaigns/:id/opened` when someone opens it from the push (once per person; `push_campaign_opens`), and the list shows how many of those reached opened it. A campaign arriving while the app is open shows as a message with **Open**.

### In-app banners

A title, a message, a kind (information, good news, warning), an optional button (an https link, or a live or profile in the app), phones (every, Android, iPhone), when it starts and ends (empty: until ended), and whether people can close it. The app shows the running ones - at most three, newest first - at the top of the home screen (`GET /v1/announcements`, no account needed, read with the list and on pull-to-refresh). A closed banner stays closed on that phone until the team edits it (remembered by id + `updatedAt`); one that can't be closed always shows. **End** takes it off the app at once and keeps it in the list; **Delete** removes it.

### Featured hosts

Hosts shown **first on For You** whenever they're live, in the team's order (arrows to move), unless their live is paused - then it's ranked like any other. Search and the Following tab are unchanged. Optional reason (staff only) and end time. Suspended accounts and staff can't be featured. `StreamsService.listLive` reads the list at most every 30 s; each live carries `featured: true`.

Everything staff do here is in the audit log: `campaign.scheduled`, `campaign.cancelled`, `campaign.deleted`, `announcement.published|updated|ended|deleted`, `featured_host.added|removed|reordered`.

### Routes (under `/v1`)

```
GET    /admin/campaigns[?page&pageSize]                     [VIEW_CAMPAIGNS]
POST   /admin/campaigns/audience-size ({audience})          [VIEW_CAMPAIGNS]
POST   /admin/campaigns ({title, body, openPath?, audience, scheduledAt?})  [MANAGE_CAMPAIGNS]
POST   /admin/campaigns/:id/cancel                          [MANAGE_CAMPAIGNS]
DELETE /admin/campaigns/:id                                 [MANAGE_CAMPAIGNS]
GET    /admin/announcements[?page&pageSize]                 [VIEW_CAMPAIGNS]
POST   /admin/announcements | PATCH /admin/announcements/:id | POST /:id/end | DELETE /:id  [MANAGE_CAMPAIGNS]
GET    /admin/featured-hosts                                [VIEW_CAMPAIGNS]
POST   /admin/featured-hosts ({userId, note?, endsAt?}) | PUT /admin/featured-hosts/order ({userIds}) | DELETE /admin/featured-hosts/:userId  [MANAGE_CAMPAIGNS]
GET    /announcements                                       (the app; any)
POST   /me/campaigns/:id/opened                             (the app; signed in)
```

## How to add to this feature

- **A new audience filter**: a field on `CampaignAudience` (validated) and its condition in `audienceWhere()` (`campaign-audience.ts`), then the console's `CampaignAudience` type, `audienceText()` and the compose form.
- **Banners on another screen**: drop `AnnouncementBanners()` there.

## How to modify this feature

- Batch size and cadence: `SEND_BATCH` (500) in `campaigns.service.ts`, `CampaignsJobs` (30 s).
- What a tap may open: `APP_PATH` (backend) and `_campaignPath` (app).

## How to remove this feature

Unregister `CampaignsModule` (app and admin modules), `AdminCampaignsController` and the console route; drop `push_campaigns`, `push_campaign_opens`, `announcements`, `featured_hosts` and `notification_settings.pushAnnouncements`; take `featuredPositions()` out of `StreamsService.listLive`. Older apps simply stop seeing banners.

## Tests

Backend: `campaigns.service.spec.ts` (audience conditions, links, scheduling, claimed once, batches, failures, cancel only before sending, delete but not while sending, opens once, banners by platform and time, featuring rules), `streams.service.spec.ts` (featured first on For You in order, not when paused, not in search). Console: `CampaignsPage.test.tsx` (open rate, sending with the reach shown, view-only staff, publishing a banner, wording). Mobile: `console_reporting_test.dart` (a campaign push's route, banners read).
