# Analytics (active users, retention, watching, installs)

**Location**: `apps/backend/src/activity` (who used Mela, watch minutes, installs), `apps/backend/src/admin/analytics` (the console's numbers), `apps/admin-web/src/features/analytics`, `apps/mobile/lib/core/app_client_info.dart`, `apps/mobile/lib/features/share/data/install_referrer.dart`
**Plan reference**: client request, 2026-11 (production: "is it growing?")
**Depends on**: Prisma, Redis, `LivePresenceService` (viewers of a running live), `@nestjs/schedule`
**Depended on by**: campaigns (audiences by activity and app version)

## What it does

The console's **Analytics** page (`/analytics`, Growth > Analytics, `VIEW_ANALYTICS`) answers whether Mela grows: people active today, this week and this month, how many new accounts come back, how much is watched, the hosts watched most, and where installs come from - over the last 7, 30 or 90 UTC days, with **Export CSV** (one row a day).

What feeds it - all counted by the server, so nothing waits on it:

- **Active days** (`user_active_days`: account, UTC day, platform). `ActivityInterceptor` (global) runs after the auth guard on every app or web-player request with a signed-in session and calls `ActivityService.touch()`: a Redis key per device, day and app version (`SET NX`, 2 days) makes it at most one database write per device a day (or per app update). The console's own requests set `request.admin`, not `request.user`, so staff using the console are never counted. Daily, weekly (7 days) and monthly (30 days) active users, "stickiness" (daily ÷ monthly) and retention come from this table.
- **The app's version on each device**: the app sends `X-Mela-Platform` (android/ios), `X-Mela-App-Version` and `X-Mela-App-Build` on every request (`AppClientInfo`, read once at startup). The same `touch()` saves them on the device's session (`user_sessions.appVersion`/`appBuild`, and its platform). Campaigns target app versions with it. Older app versions send none: their users count as active, with an unknown platform.
- **Watch minutes**: `LiveStatsService.meter()` once a minute (`ActivityJobs`, one instance per minute via a Redis key): every viewer of a running live adds a minute to its `streams.viewerMinutes`, and `streams.uniqueViewers` is how many different people watched it so far (a Redis set per live, a day's expiry). The host isn't a viewer. A day's "minutes watched" is the sum over lives started that day.
- **Installs** (`app_installs`): the app's first launch after installing (or after updating to the version that has this) posts `POST /v1/installs {installationId, referrer?, installedAt?}` - no account needed, 5 a minute per address, retried on later launches until it gets through (`reportInstallOnce`). The source is read from Google Play's install referrer: `mela_open=live/…` → a shared live, `mela_open=profile/…` → a shared profile (the get-Mela page adds those), `utm_medium=organic` or `utm_source=google-play` → Google Play, any other `utm_source` → a campaign link, else other. One row per install id: a resend changes nothing.

On the page:

- **Active today / this week / this month**, with the share of the month's users who come on a given day, and **new accounts** (app users only - staff are left out everywhere).
- **Active users and new accounts per day**, **lives started per day** (with minutes live in all) and **minutes watched per day** - charts with the numbers in a table for screen readers.
- **Coming back**: for each of the last 8 weeks' sign-ups (weeks start Monday, UTC), the share who used the app again the next day, in their second week (days 7-13) and a month on (days 30-36). A window that hasn't passed yet for that week shows "—", not 0%.
- **Where installs come from** and **this month's users, by phone**.
- **Hosts watched most**: top 10 by minutes watched in their lives this period, with lives, viewers, most at once and likes; a host links to their account page.

A notice says from which day activity has been counted - it starts with this release, so earlier days show none (new accounts and lives go further back).

`GET /v1/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` [VIEW_ANALYTICS] - 92 days at most; refreshed by the page every 5 minutes.

## How to add to this feature

- **A new number per day**: add a sub-select to `AdminAnalyticsService.days()` (zero-filled by `generate_series`), its field to `DayRow` and the console's `AnalyticsDay`, a column in `analyticsCsv()`, and a chart or KPI on the page.
- **A new install source**: `installSource()` in `activity.service.ts` and `SOURCE_LABELS` in the console's `analytics-data.ts`.

## How to modify this feature

- Retention windows: `RETURN_WINDOWS` in `admin-analytics.service.ts`.
- What counts as activity: `ActivityInterceptor` (any authenticated HTTP request today; the realtime socket isn't counted on its own - the app always calls the API when opened).
- Watch-minute cadence: `ActivityJobs` (60 s) - the minute key in `LiveStatsService` must match it.

## How to remove this feature

Unregister `ActivityModule` from `app.module.ts` (and the console route/nav item and `AdminAnalyticsController`), drop `user_active_days`, `app_installs` and the `streams.viewerMinutes`/`uniqueViewers` and `user_sessions.appVersion`/`appBuild` columns. Campaign audiences by activity and app version stop working without them.

## Tests

Backend: `activity.service.spec.ts` (headers read and validated, install sources, once a day per device, failures never fail a request, watch minutes once a minute across instances), `admin-analytics.service.spec.ts` (totals, active users, retention with windows not yet passed, top hosts without deleted accounts, range limits). The SQL was run against Postgres 16 with sample data. Console: `AnalyticsPage.test.tsx` (KPIs, retention, install shares, top hosts, CSV, date range). Mobile: `console_reporting_test.dart` (headers on every request, install report once and retried).
