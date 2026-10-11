# Legal: 18+ age check, Terms of Service and Privacy Policy

**Location**: `apps/backend/src/legal` (rules, pages, catch-up endpoints); sign-up checks in `apps/backend/src/auth/identity/identity-sign-in.service.ts`; mobile `lib/features/legal` + `lib/features/auth/sign_up_*`; web player `src/auth/legal.ts` + `AuthDialog.tsx`
**Depends on**: `auth` (sign-up, JWT guard), `admin` (suspension, reinstating), `share` (page brand/escaping)

## What it does

Mela is an 18+ app. Everyone gives a date of birth and agrees to the
**Terms of Service** (`/terms`) and **Privacy Policy** (`/privacy`) before
any account exists, and every acceptance is recorded with the version.

### The documents

- `GET /terms`, `GET /privacy` (root, `VERSION_NEUTRAL`, like `/delete-account`): static HTML with no script and no cookies (`legal-pages.ts`). They name the operator (`LEGAL_OPERATOR_NAME`, default "Mela") and the contact (`SUPPORT_EMAIL`). Written from what Mela actually does: no ads, no sale of data, lives not recorded, preview images, deletion. **Have a lawyer review them** for the countries Mela is offered in.
- `LEGAL_VERSION` (`legal-rules.ts`, the date they take effect) covers both documents. Bump it on any change people must agree to again: every account is asked once more on its next launch.
- `GET /v1/legal` (public): `{version, minimumAge, termsPath, privacyPath}`.

### At sign-up (app and web)

- A **neutral age screen** (Google Play's rule for 18+ apps): "When's your birthday?" with a calendar that suggests no answer, and "I agree to the Terms of Service and Privacy Policy". Nothing says which age is needed until someone is too young.
  - Email sign-up: it's the first step, before the email form (the account is made by itself once the link is tapped).
  - Google: right after Google, for someone new.
- Under 18: no account and nothing kept. Firebase forgets the identity, and the phone or browser waits **24 hours** before anyone may try another date (`AgeGateLock` in the app, `localStorage` on the web).
- The server checks it all again (`checkNewAccountLegal`, first thing in `createAccount`, before any lookup):
  - `birthDate` (YYYY-MM-DD, a real date from 1900 to today) at least 18 years ago, else 403 `UNDER_AGE`;
  - `acceptedLegalVersion` equal to `LEGAL_VERSION`, else 409 `LEGAL_VERSION_OUTDATED` (the app shows the documents again);
  - an app from before the age check sends neither: 400 `APP_UPDATE_REQUIRED`.
- Stored: `users.birthDate` (a date, not on the profile), `users.legalVersion`/`legalAcceptedAt`, and a `legal_acceptances` row `{version, platform, acceptedAt}`.

### Accounts made before it

- `GET /v1/me/legal` → `{…info, acceptedVersion, needsAcceptance, needsBirthDate}`.
- The app's router sends a signed-in account that must act to `/legal` (`LegalGateScreen`) until it has, then on to where it was headed (`legalRedirect`). Offline, the app isn't held up: the next launch asks.
- `POST /v1/me/legal {version, birthDate?, platform}` records the acceptance (and the date of birth, if the account has none; a date already given never changes).
- An account that says it's **under 18 is suspended**, as staff would (`UNDER_AGE_REASON`, `user.suspended` by the user themselves): signed out everywhere, disconnected, and in the audit log. Staff can reinstate it from the console if it was a mistake. The app shows why and signs out.

The web player asks at sign-up only; the app asks accounts made earlier.

## How to change the documents

1. Edit `legal-pages.ts`.
2. If people must agree again, set `LEGAL_VERSION` to the date the change takes effect.
3. Deploy: everyone sees "We've updated our terms" on their next launch, and new sign-ups send the new version.

## Tests

`legal.service.spec.ts` (age math, real dates, status, accept, under-18 suspension, the pages and their escaping), `identity-sign-in.service.spec.ts` "the age check and the Terms". Mobile: `sign_up_flow_test.dart` "the age check", `legal_test.dart` (redirect, links, lock, the catch-up screen end to end), `widget_test.dart` (the age step in both sign-ups). Web: `AuthDialog.test.tsx`.

Migration: `20261014090000_age_check_and_legal`.
