# Pre-trial Progress Report (2026-05-12)

This note summarizes the recent hardening work completed without requiring local `.env` secrets, plus the remaining items to run when the local environment is available.

## Completed

### 1) Push RLS hardening migration to remote Supabase

- Confirmed the remote project was behind by one migration and then pushed it:
  - `20260507010000_harden_direct_workspace_writes.sql`
- Verified migrations are now aligned (local/remote match through `20260507010000`).

What the migration does:
- Drops direct authenticated owner/admin write policies for:
  - `businesses`
  - `business_members`
  - `business_settings`

### 2) Verify “direct authenticated writes” surface

Goal:
- Direct authenticated writes should be removed for workspace/accounting tables.
- The only remaining authenticated write policy should be `profiles_update_self`.

Result:
- Queried `pg_policies` for policies with `roles` containing `authenticated` and `cmd` in `INSERT/UPDATE/DELETE/ALL`.
- The only remaining match is:
  - `profiles / profiles_update_self / UPDATE / {authenticated}`

Notes:
- Running the full `supabase/rls_audit.sql` via `supabase db query --linked` can require `SUPABASE_DB_PASSWORD`. Without it, the linked DB connection can hit authentication failure limits (circuit breaker). The core policy assertion above was still completed successfully.

### 3) Add minimal API-level role regression tests (viewer write denial)

Added minimal tests to ensure `viewer` cannot perform additional write actions beyond transactions:
- `POST /v1/businesses/:businessId/contacts` → 403
- `POST /v1/businesses/:businessId/payment-accounts` → 403
- `POST /v1/businesses/:businessId/manual-journals` → 403

Verification:
- `npm run test -w apps/api` passed (45 tests)
- `npm run build:api` passed

### 4) Pre-trial smoke progress (cloud UI)

Completed checks:
- Confirmed workspace selector empty-state copy renders when the user has no businesses.
- Created a brand-new cloud workspace (`Smoke Workspace 20260510-001`) and confirmed:
  - Dashboard loads
  - Recent Transactions shows `No transactions yet`
  - No demo/local transactions leaked into the new cloud workspace

API offline check (partial, via UI action):
- Stopped the API server and triggered a backend call from Settings (`Download Backup`).
- Observed the browser request fail with `net::ERR_CONNECTION_REFUSED` for:
  - `GET /v1/businesses/:businessId/backup`

### 5) E2E smoke verification (Playwright)

- Updated Playwright base URL to `http://127.0.0.1:5173` so browser origin matches the API CORS origin.
- Hardened `authenticate()` in the smoke spec to fall back to email/password when dev auto-login does not advance.
- Re-ran Playwright smoke: `npm run e2e` passed (3 tests).

### 6) In-app recoverable error UI (session expired / 403 viewer)

Goal:
- Replace `window.alert` error handling with an in-page recoverable state that can be reused for API offline / retry.
- Distinguish session expiry from permission issues:
  - session expired: "Session expired. Please sign in again."
  - 403 viewer: "You do not have permission to perform this action."

Changes:
- Added `AuctusApiError` so API failures carry HTTP status codes.
- Added `AppAlertsProvider` / `useAppAlerts` to allow feature components to report errors to the Shell banner.
- Replaced `window.alert` usage across the web app with banner-driven errors.

### 7) Cloud export → restore → pre-restore recovery smoke

Completed automated cloud recovery smoke with Playwright:
- Created disposable workspaces:
  - `Recovery Smoke 1778403157036 A` (`d5a5d24e-b3e0-4dbd-814d-2d59c586e9d6`)
  - `Recovery Smoke 1778403157036 B` (`fbd511a4-3571-44ac-899d-1466c5406532`)
- Added unique contact markers to each workspace.
- Downloaded backup A and confirmed it contains marker A.
- Downloaded backup B and confirmed it contains marker B and not marker A.
- Restored backup B into workspace A and captured the automatic pre-restore backup.
- Confirmed the pre-restore backup contains marker A.
- Confirmed workspace A then contains marker B and no longer contains marker A.
- Restored from the pre-restore backup and confirmed workspace A contains marker A again and no longer contains marker B.
- Confirmed invalid restore JSON surfaces a page-level `Restore failed` error instead of a browser alert.

Implementation note:
- Fixed the web workspace selection state so newly created workspaces are added to the in-memory workspace list immediately. This keeps the manual Switch Workspace flow consistent after creating a workspace.
- Added `tests/e2e/auctus-recovery.spec.ts` to keep this recovery path covered.

Verification:
- `npm run build:web` passed.
- `npm run e2e` passed (4 Playwright tests, including the new recovery smoke).

### 8) Recoverable API error UX smoke

Added `tests/e2e/auctus-error-ux.spec.ts` to keep user-facing error recovery covered without relying on process-level API shutdown:
- API unreachable on `Download Backup` → visible banner: "Cannot reach the server. Check your connection and retry." plus Retry action.
- `401` on `Download Backup` → returns to sign-in and shows: "Session expired. Please sign in again."
- `403` on `Download Backup` → visible permissions message: "You do not have permission to perform this action."

Verification:
- `npx playwright test tests/e2e/auctus-error-ux.spec.ts` passed (3 tests).

## Documentation Updates

- Updated `docs/MVP_HARDENING.md`:
  - Marked “Push `20260507010000_harden_direct_workspace_writes.sql` to the target Supabase project” as completed.
  - Marked “Run a manual UI pass on an empty workspace after creating a brand-new business” as completed.
  - Marked “Manually verify backend backup download, backend restore, and recovery from the pre-restore backup” as completed by the cloud recovery smoke above.
  - Added automated recoverable-error UX coverage for API unreachable, expired session, and 403 responses.

### 9) Local backup download → restore → pre-restore recovery smoke

Added `tests/e2e/auctus-local-backup.spec.ts` targeting a separate Playwright project (`local-mode`) that starts the Vite dev server on port 5174 with `VITE_SUPABASE_URL=""` and `VITE_SUPABASE_ANON_KEY=""` so the web app runs in local (no-auth) mode.

Steps covered by the test:
1. Clear localStorage to start with the default ledger (no contacts, no transactions).
2. Add contact marker A via the Contacts UI.
3. Click "Download Backup" in Settings — capture the downloaded JSON file; assert it contains marker A.
4. Add contact marker B — state is now A + B.
5. Restore backup A (A only) via the file input in Settings.
   - `window.confirm` is auto-accepted by Playwright.
   - App downloads a pre-restore safety backup (contains A + B) before replacing state.
   - App state becomes backup A content (A only).
6. Assert the pre-restore safety backup JSON contains both marker A and marker B.
7. Assert the Contacts view shows marker A and not marker B.
8. Restore from the pre-restore backup — another safety backup (A only) is downloaded.
9. Assert the Contacts view now shows both marker A and marker B (full recovery confirmed).

`playwright.config.ts` changes:
- Added `testIgnore: '**/auctus-local-backup.spec.ts'` to the existing `chromium` project so cloud tests are unaffected.
- Added `local-mode` project with `testMatch: '**/auctus-local-backup.spec.ts'` and `baseURL: 'http://127.0.0.1:5174'`.
- Added a third `webServer` entry that starts a second Vite dev instance on port 5174 with empty Supabase env vars.

Verification:
- `npm run e2e` passed (8 tests: 7 cloud [chromium] + 1 local-mode).
- `npm run build` passed.
- `npm run test -w apps/api` passed (45 tests).

### 10) Export / restore / import / reset API role matrix

Updated `apps/api/src/tests/ledgerAudit.test.ts` so ledger-data administration permissions are covered as an explicit matrix:

- `owner` and `admin` must receive `200` for:
  - `GET /v1/businesses/:businessId/backup`
  - `POST /v1/businesses/:businessId/restore`
  - `POST /v1/businesses/:businessId/import`
  - `POST /v1/businesses/:businessId/reset`
- `bookkeeper` and `viewer` must receive `403 forbidden` for the same four actions.

The test mocks `seedAccountingFoundation` inside this file so the reset allow-path verifies permission routing without depending on seed-table mock details.

Verification:
- `npm run test -w apps/api` passed (7 files, 44 tests).

Documentation:
- Marked “Verify owner/admin can export/restore/reset and bookkeeper/viewer cannot” complete in `docs/MVP_HARDENING.md`.

### 11) Off-platform project backup recorded

Confirmed a copied project backup exists outside the working repository:

- Path: `/Users/david/Documents/Claude/Projects/backup/auctus`
- Size: `430M`
- Checked on: 2026-05-12
- Contents include `.git`, `apps`, `docs`, `packages`, `supabase`, `tests`, and root project config files.

Documentation:
- Marked “Keep at least one off-platform backup before trial data is reset or imported” complete in `docs/MVP_HARDENING.md`.

### 12) Production environment local repo/env audit

Audited repository-tracked env examples and local env file placement without recording secret values:

- `.gitignore` ignores `.env` and `.env.*`, while keeping `.env.example` tracked.
- Tracked env examples:
  - `apps/api/.env.example`: `PORT`, `HOST`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `API_CORS_ORIGIN`.
  - `apps/web/.env.example`: `VITE_AUCTUS_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, plus local/dev-only `VITE_AUCTUS_DEV_EMAIL` and `VITE_AUCTUS_DEV_PASSWORD`.
- Local untracked env files exist at `apps/api/.env.local` and `apps/web/.env.local`.
- `apps/web/.env.local` contains dev login variables for local E2E/dev testing; those must not be set on the production Web host.
- `SUPABASE_SERVICE_ROLE_KEY` appears in API env examples/docs only, not in Web env examples or Web source.
- `apps/api/README.md` already documents `SUPABASE_SERVICE_ROLE_KEY` as server-only, exact `API_CORS_ORIGIN`, and `GET /health` as the deployment health check.

Not completed from local repo inspection:
- Production hosting provider env values still need control-plane verification.
- Supabase Auth production `site_url` and `additional_redirect_urls` still need control-plane verification.
- API `/health` monitoring still needs the real deployed health URL.

### 13) Remote Supabase RLS direct-read smoke

Ran a one-off remote Supabase RLS smoke using local API env credentials without printing secret values.

Setup:
- Created two temporary confirmed auth users through the service-role admin client.
- Created one temporary business for each user through the service-role client.
- Inserted owner memberships and default business settings for both businesses.
- Signed in each user through the anon client.

Assertions:
- Unauthenticated anon client reading Alice's `businesses` row returned `0` rows.
- Unauthenticated anon client reading Alice's `business_settings` row returned `0` rows.
- Alice authenticated client reading Alice's own `businesses` row returned `1` row.
- Alice authenticated client reading Bob's `businesses` row returned `0` rows.
- Alice authenticated client reading Bob's `business_settings` row returned `0` rows.
- Bob authenticated client reading Alice's `businesses` row returned `0` rows.
- Bob authenticated client reading Alice's `business_members` rows returned `0` rows.

Cleanup:
- Deleted the temporary `business_settings`, `business_members`, `businesses`, and auth users in the script `finally` block.

Documentation:
- Marked “Confirm cross-business read attempts return no rows for anon/authenticated client queries” complete in `docs/MVP_HARDENING.md`.

### 14) Real-role UI and viewer 403 smoke

Added `tests/e2e/auctus-role-ui.spec.ts` and a dedicated Playwright `role-ui` project.

The test creates temporary Supabase auth users and one temporary workspace with real memberships for `owner`, `admin`, `bookkeeper`, and `viewer`, then cleans them up at the end.

Assertions:
- owner/admin can see Settings controls, Period Lock, Download Backup, Restore Backup, Reset Backend Ledger, account controls, and category management.
- bookkeeper can see ordinary accounting controls such as contacts/accounts/categories, but cannot see export/restore/reset, Period Lock, or business settings.
- viewer cannot see create/edit/admin controls in Settings, Contacts, or Accounts.
- viewer receives a real API `403` from `GET /v1/businesses/:businessId/backup` using a real viewer Supabase session, not a Playwright route mock.

Implementation note:
- Added `auctus_disable_dev_auto_login` / `VITE_AUCTUS_DISABLE_DEV_AUTO_LOGIN` support so E2E can run role-specific sessions without local dev auto-login overriding the active test user.
- The `role-ui` project reuses the normal 5173 web origin so the API's exact `API_CORS_ORIGIN` behavior remains covered instead of widening CORS for tests.

Verification:
- `npx playwright test tests/e2e/auctus-role-ui.spec.ts --project=role-ui` passed.

Documentation:
- Marked the real-role UI/403 pass and API role matrix checklist items complete in `docs/MVP_HARDENING.md`.

### 15) Target environment audit

Checked the local repo and CLI-accessible deployment state without printing secret values.

Confirmed:
- Local API env points at Supabase project `zvcbnocynsxzyrvxcsbn`.
- Local Web env points at the same Supabase project.
- Local runtime origins are development-only: API `http://127.0.0.1:4010`, Web API target `http://127.0.0.1:4010`, and `API_CORS_ORIGIN=http://127.0.0.1:5173`.
- `supabase migration list` passed and confirmed the linked remote project is aligned with local migrations through `20260507010000`.
- The real-role UI smoke has already created temporary users and a temporary business on the target Supabase project and cleaned them up.

Not confirmed from this shell:
- `supabase projects list` requires `SUPABASE_ACCESS_TOKEN`; the token is not available here.
- Supabase Auth `site_url` and `additional_redirect_urls` still need dashboard verification or a Supabase Management API token.
- No repo deployment config was found for Vercel, Render, Fly, Netlify, or another production host.
- Production Web/API env values and API `/health` monitoring still need control-plane verification.

Documentation:
- Filled the Supabase project ref/URL in `docs/MVP_HARDENING.md`.
- Marked “Create a test user and test business on production Supabase” complete because the target Supabase project has now been exercised by temporary-user RLS and real-role UI smokes.
- Left production host/env/Auth URL/health monitoring items unchecked.

## Pending (needs local runtime / env)

### A) Manual pre-trial smoke (per `docs/MVP_HARDENING.md`)

- Runtime/error and role smoke are now covered by Playwright plus API permission tests.
- Disposable workspace validation is now covered by Playwright against the target Supabase project.
- Remaining manual work is production-control-plane verification.

### B) Trial deployment record in docs

Fill real deployment details into `docs/MVP_HARDENING.md`:
- API host / health URL
- Web host
- Production env configuration values (no secrets committed)
- Confirm no production Web `VITE_AUCTUS_DEV_EMAIL` / `VITE_AUCTUS_DEV_PASSWORD`
- Confirm production API-only `SUPABASE_SERVICE_ROLE_KEY`
- Confirm production `API_CORS_ORIGIN`, Supabase Auth URLs, and `/health` monitoring

### 16) Disposable trial workspace lifecycle smoke

Added `tests/e2e/auctus-disposable-workspace.spec.ts` for an isolated target-Supabase workspace lifecycle check.

Assertions:
- Creates a unique disposable workspace through the real Web/API flow.
- Creates a contact, edits it, and verifies the original draft name is gone.
- Creates a temporary category and archives it through Settings > Manage Categories.
- Downloads a backend backup and verifies it contains the edited contact and archived category marker.
- Resets the backend ledger and verifies the edited contact is no longer present.
- Restores the downloaded backup and verifies the edited contact returns.
- Deletes the temporary workspace with the service-role client in the test cleanup block.

Verification:
- `npx playwright test tests/e2e/auctus-disposable-workspace.spec.ts --project=chromium` passed.

Documentation:
- Marked “Create, edit, archive, export, restore, and reset a disposable trial workspace” complete in `docs/MVP_HARDENING.md`.

### 17) Repeatable pre-trial audit command

Added `scripts/pretrial-audit.mjs` and `npm run audit:pretrial`.

The audit checks without printing secrets:
- Local API/Web env files exist.
- API and Web point at the same Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` exists for local API checks and is absent from Web local/example env.
- API env example documents the server-only service role variable.
- Local dev auto-login credentials are called out as a production warning.
- Local API URL and CORS origin are present.
- Repo deployment config is present or missing.
- Optional `AUCTUS_PRODUCTION_WEB_URL` and `AUCTUS_PRODUCTION_API_URL` are supplied when a deployment exists.
- `supabase migration list` can run when Supabase CLI auth is available.

Verification:
- `npm run audit:pretrial` passed with warnings only.
- Current warnings: Web local env has dev auto-login credentials, no production deployment config found in repo, production Web/API URLs not supplied, and this shell has no Supabase CLI access token for `supabase migration list`.

Documentation:
- Recorded the audit command and current warnings in `docs/MVP_HARDENING.md`.
