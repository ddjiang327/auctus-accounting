# Pre-trial Progress Report (2026-05-12)

This note summarizes the recent hardening work completed without requiring local `.env` secrets, plus the remaining items to run when the local environment is available.

## Completed

### 2026-06-25) Latest main production deployment verified

- Pushed local `main` to GitHub after the inventory/payroll hardening commits:
  - `ba9c9a3` Harden inventory payroll cloud flows
  - `9b232d1` Add inventory payroll UI smoke
  - `6565201` Add inventory payroll backup restore smoke
  - `e9de25b` Expand production smoke for inventory payroll
- Confirmed the Vercel API production deployment reached Ready.
- Verified production after deployment:
  - `npm run smoke:production` passed against `https://auctus-web.netlify.app` and `https://auctus-api.vercel.app`, including inventory, payroll, backup, reset, and restore.
  - `npm run acceptance:production-roles` passed against production.
  - `AUCTUS_PRODUCTION_WEB_URL=https://auctus-web.netlify.app AUCTUS_PRODUCTION_API_URL=https://auctus-api.vercel.app AUCTUS_PRODUCTION_API_CORS_ORIGIN=https://auctus-web.netlify.app npm run audit:production` passed with 14 checks, 2 warnings, and 0 failures.

### 2026-06-25) Production inventory/payroll smoke expansion

- Expanded `scripts/production-browser-smoke.mjs` so `npm run smoke:production` now verifies inventory and payroll in production, not only the core contact/category/transaction flow.
- The production smoke creates a temporary confirmed Supabase user and temporary workspace on production, then verifies:
  - Contact, category, and transaction creation.
  - Product, purchase order, stock receipt, and sale movement.
  - Employee, finalised pay run, PAYG remittance, and STP submission.
  - Backup JSON contains all core accounting, inventory, and payroll markers.
  - Backend reset removes the markers.
  - Restore brings the markers back.
- Updated `scripts/production-role-acceptance.mjs` to handle the production mode selector before login and to wait on accessible headings.

Verification:
- `npm run smoke:production` passed against `https://auctus-web.netlify.app` and `https://auctus-api.vercel.app`.
- `npm run acceptance:production-roles` passed against production.
- `AUCTUS_PRODUCTION_WEB_URL=https://auctus-web.netlify.app AUCTUS_PRODUCTION_API_URL=https://auctus-api.vercel.app AUCTUS_PRODUCTION_API_CORS_ORIGIN=https://auctus-web.netlify.app npm run audit:production` passed with 14 checks, 2 warnings, and 0 failures.
- `npm run test -w apps/api` passed (12 files, 68 tests).
- `npm run build` passed.

### 2026-06-25) Inventory/payroll backup reset restore smoke

- Added `tests/e2e/auctus-inventory-payroll-backup-restore.spec.ts`.
- The smoke signs in through the Web UI, creates an isolated workspace, creates inventory and payroll records, downloads a backup, resets the backend ledger, restores the backup, verifies the records returned, and deletes the temporary workspace:
  - Product, purchase order, stock receipt, and sale movement.
  - Employee, finalised pay run, PAYG remittance, and STP submission.
  - Backup JSON contains the inventory/payroll markers before reset.
  - Reset removes the markers from the workspace.
  - Restore brings the inventory/payroll markers back.

Verification:
- `npx playwright test tests/e2e/auctus-inventory-payroll-backup-restore.spec.ts --project=chromium` passed.
- `npm run test -w apps/api` passed (12 files, 68 tests).
- `npm run build` passed.

### 2026-06-25) Inventory/payroll cloud UI smoke

- Added `tests/e2e/auctus-inventory-payroll-ui.spec.ts`.
- The smoke signs in through the Web UI, creates an isolated workspace, exercises the inventory and payroll screens, reloads the app, verifies persisted records, and deletes the temporary workspace:
  - Product creation through Inventory.
  - Purchase order creation, mark sent, and stock receipt.
  - Sale inventory movement.
  - Employee creation.
  - Finalised pay run.
  - PAYG remittance.
  - STP submission history.
- Repaired the local Playwright Chromium cache with `npx playwright install chromium` after Chromium reported missing browser resources and V8 startup snapshots.

Verification:
- `npx playwright test tests/e2e/auctus-inventory-payroll-ui.spec.ts --project=chromium` passed.
- `npm run test -w apps/api` passed (12 files, 68 tests).
- `npm run build` passed.

### 2026-06-25) Inventory/payroll cloud API smoke after Supabase resume

- Supabase project `zvcbnocynsxzyrvxcsbn` was resumed and DNS resolution for `zvcbnocynsxzyrvxcsbn.supabase.co` recovered.
- Added `tests/e2e/auctus-inventory-payroll-api.spec.ts`.
- The smoke creates an isolated workspace, exercises granular inventory and payroll endpoints, verifies the final ledger snapshot, and deletes the temporary workspace:
  - Product create/update/archive.
  - Negative stock validation.
  - Purchase order create/send/receive/link supplier bill.
  - Employee create/update/archive.
  - Pay run create/finalise.
  - Remittance and STP submission.

Verification:
- `npx playwright test tests/e2e/auctus-inventory-payroll-api.spec.ts --project=chromium` passed.
- `npm run test -w apps/api` passed (12 files, 68 tests).
- `npm run build` passed.

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
- These production control-plane items were completed later in sections 19 and 20.

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
- At this point Supabase Auth `site_url` and `additional_redirect_urls` still needed dashboard verification. They were confirmed later in section 20.
- At this point no repo deployment config had been found for Vercel, Render, Fly, Netlify, or another production host. Vercel API and Netlify Web config was added later in section 19.
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
- Follow `docs/PRODUCTION_DEPLOYMENT.md` for the exact host env, Supabase Auth, health check, and post-deploy audit steps.

This manual work was completed later in sections 19 and 20.

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

Added `scripts/pretrial-audit.mjs`, `npm run audit:pretrial`, and `npm run audit:production`.

The audit checks without printing secrets:
- Local API/Web env files exist.
- API and Web point at the same Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` exists for local API checks and is absent from Web local/example env.
- API env example documents the server-only service role variable.
- Local dev auto-login credentials are called out as a production warning.
- Local API URL and CORS origin are present.
- Repo deployment config is present or missing.
- Optional `AUCTUS_PRODUCTION_WEB_URL` and `AUCTUS_PRODUCTION_API_URL` are supplied when a deployment exists.
- Production Web returns the app HTML shell when `AUCTUS_PRODUCTION_WEB_URL` is supplied.
- Optional `AUCTUS_PRODUCTION_API_CORS_ORIGIN` matches the production Web origin.
- Production API CORS preflight allows the production Web origin when Web/API URLs are supplied.
- Production `GET /health` returns the expected Auctus API health payload when `AUCTUS_PRODUCTION_API_URL` is supplied.
- `supabase migration list` can run when Supabase CLI auth is available.

Verification:
- `npm run audit:production` passed with warnings only.
- Current warnings: Web local env has dev auto-login credentials, production Web/API/CORS URLs not supplied, production Web shell/CORS preflight/`/health` checks skipped, and this shell has no Supabase CLI access token for `supabase migration list`.

Documentation:
- Recorded the audit command and current warnings in `docs/MVP_HARDENING.md`.
- Added the production deployment runbook and audit commands to `docs/README.md`.

### 18) Production deployment runbook

Added `docs/PRODUCTION_DEPLOYMENT.md`.

The runbook records:
- Required Web/API/health host placeholders.
- Vercel API function entry, rewrites, build command, and required server-only env.
- Netlify Web build output and required browser-safe env.
- Supabase Auth Site URL and redirect URL checks.
- Post-deploy verification commands, including `npm run audit:production` with production URL inputs.

### 19) Netlify Web and Vercel API deployment config

Added first-pass production host config:
- `api/[...path].mjs`: Vercel function adapter that reuses the built API router and normalizes `/api/health` and `/api/v1/*` to the existing `/health` and `/v1/*` routes.
- `vercel.json`: builds packages + API, includes API dist files, and rewrites `/health` and `/v1/*` to the Vercel function.
- `netlify.toml`: builds packages + Web, publishes `apps/web/dist`, and routes SPA fallback traffic to `index.html`.

Verification:
- `npm run build` passed.
- `node --check api/[...path].mjs` passed.
- Local adapter smoke passed for `/api/health` and `/health`.
- `npm run audit:production` passed with 9 checks, 7 warnings, and 0 failures; deployment config files are now detected.
- `npm run test -w apps/api` passed: 7 files, 44 tests.

Documentation:
- Linked the runbook from `docs/MVP_HARDENING.md` and the pending deployment notes above.

### 20) Production deployment verification

Production hosts:
- Web: `https://auctus-web.netlify.app`
- API: `https://auctus-api.vercel.app`
- Health: `https://auctus-api.vercel.app/health`

Deployment fixes:
- Configured Git author email to `dd.jiang.claire@gmail.com` so Vercel accepts new commits.
- Added an env-independent Vercel health handler so `/health` can verify the API deployment before Supabase env is needed.
- Added explicit Vercel `api/health.mjs` and `api/v1/[...path].mjs` handlers so `/health` and `/v1/*` both reach the API runtime.
- Added `api/router.mjs` and rewired Vercel rewrites through a single router endpoint so deep API paths such as `/v1/businesses/:id/ledger` reach the API runtime.
- Added `scripts/production-browser-smoke.mjs` and `npm run smoke:production` for repeatable production login/workspace/business-cycle smoke tests.

Verification:
- `https://auctus-web.netlify.app` returned the production Web shell with `div#root`.
- `https://auctus-api.vercel.app/health` returned `{"ok":true,"service":"auctus-api"}`.
- `OPTIONS https://auctus-api.vercel.app/v1/businesses` returned 204 with `access-control-allow-origin: https://auctus-web.netlify.app`.
- `GET https://auctus-api.vercel.app/v1/businesses` returned 401 `{"error":"unauthorized"}`, confirming the production business API route is live and protected.
- `AUCTUS_PRODUCTION_WEB_URL=https://auctus-web.netlify.app AUCTUS_PRODUCTION_API_URL=https://auctus-api.vercel.app AUCTUS_PRODUCTION_API_CORS_ORIGIN=https://auctus-web.netlify.app npm run audit:production` passed: 15 checks, 1 warning, 0 failures.
- Supabase Auth Site URL is `https://auctus-web.netlify.app`; allowed redirect URLs include `https://auctus-web.netlify.app` and `https://auctus-web.netlify.app/`.
- `npm run smoke:production` passed after the router fix: it created a temporary confirmed Supabase user, signed in through the production Netlify Web app, created a temporary workspace through the Vercel API, loaded Home/Net Worth, created a contact, created a category, created a transaction, downloaded a backend backup, verified the backup markers, reset the temporary backend ledger, restored the backup, verified the transaction returned, and cleaned up the temporary user/workspace.
- Re-ran `npm run audit:production` after the expanded browser smoke: 15 checks, 1 warning, 0 failures. The remaining warning is local-only dev auto-login credentials in `apps/web/.env.local`.
- Deep production API path smoke changed from 404 to 401 for unauthenticated `GET https://auctus-api.vercel.app/v1/businesses/test-id/ledger`, confirming the Vercel router handles nested `/v1/*` routes.

Remaining production console item:
- None for the first trial deployment record.

### 21) Trial acceptance checklist run

Date: 2026-05-12

Production targets:
- Web: https://auctus-web.netlify.app
- API: https://auctus-api.vercel.app
- Supabase project: zvcbnocynsxzyrvxcsbn

Tester:
- David Jiang

### Result

Pass.

### Completed

Automated Gate:
- `npm run build` passed.
- `npm run test -w apps/api` passed: 7 files, 44 tests.
- `npx tsc -p apps/mobile/tsconfig.json --noEmit` passed.
- `npm run e2e` passed: 10 tests.
- `npm run smoke:production` passed.
- Production audit passed: 15 checks, 1 warning, 0 failures.
- Remaining warning was local-only dev auto-login variables in `apps/web/.env.local`, which is acceptable as long as not set in production Web hosting.

Owner/Admin Manual Pass:
- Signed in to production Web.
- Created disposable workspace: `Trial Acceptance 2026-05-12`.
- Confirmed Home loaded and showed `NET WORTH`.
- Created a contact.
- Created an expense category.
- Created a purchase transaction.
- Confirmed Activity showed the transaction.
- Downloaded backend backup.
- Reset Backend Ledger.
- Confirmed transaction/contact disappeared after reset.
- Restored downloaded backup.
- Confirmed transaction/contact returned after restore.
- Created a period lock.
- Confirmed transaction creation/editing inside locked period was blocked by the UI.
- Cleared the period lock.
- Confirmed owner/admin Settings exposed backup, restore, reset, period lock, account controls, and category management.

Production Control Plane:
- Netlify Web production deploy confirmed green on latest main commit `59dbb0a`.
- Vercel API production deploy confirmed green on latest main commit `59dbb0a`.
- `https://auctus-api.vercel.app/health` returned `{"ok":true,"service":"auctus-api"}`.
- Supabase Auth Site URL confirmed as `https://auctus-web.netlify.app`.
- Supabase Auth redirect URLs confirmed to include:
  - `https://auctus-web.netlify.app`
  - `https://auctus-web.netlify.app/`
- Netlify Web environment confirmed not to include:
  - `VITE_AUCTUS_DEV_EMAIL`
  - `VITE_AUCTUS_DEV_PASSWORD`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Vercel API environment confirmed to include:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `API_CORS_ORIGIN=https://auctus-web.netlify.app`

Cleanup:
- Deleted disposable workspace `Trial Acceptance 2026-05-12`.
- Deleted temporary auth users created only for acceptance testing.
- Removed downloaded backup files from local/shared download folders.

### Initially pending / skipped

Bookkeeper Manual Pass:
- Initially skipped in this pass.
- Completed later in section 25 with a production role acceptance smoke.

Viewer Manual Pass:
- Initially skipped in this pass.
- Completed later in section 25 with a production role acceptance smoke.

### Final decision

Trial acceptance is passed for first trial exposure after the follow-up production Bookkeeper/Viewer role acceptance check in section 25.

### 22) Web UI polish: action feedback and period-lock guidance

Added the first Web UI polish pass from manual trial feedback:

- Added a top-bar busy chip with a spinner for cloud write/export/restore/reset actions so users can see that clicks were received while network work is pending.
- Added action labels for saving transactions, contacts, accounts, categories, journals, settings, period locks, payments, backups, restores, and backend reset.
- Disabled the top `New Transaction` action while a cloud action is pending.
- Added proactive period-lock guidance when users click:
  - `New Transaction` while today is locked.
  - `Create Invoice` / `Enter Bill` while today is locked.
  - `Create Credit Note` / `Enter Supplier Credit` while today is locked.
  - An existing transaction dated inside a locked period.
- Added a local-mode Playwright regression test that creates a period lock, clicks `New Transaction`, and asserts the user sees the clear period-lock message.

Verification:
- `npx tsc -p apps/web/tsconfig.json --noEmit` passed.
- `npm run build:web` passed.
- `npx playwright test tests/e2e/auctus-local-backup.spec.ts --project=local-mode` passed: 2 tests.
- `npm run e2e` passed: 11 tests.
- `npm run smoke:production` passed after deployment: production login/workspace/contact/category/transaction/backup/reset/restore cycle completed.
- `npm run audit:production` passed after deployment: 15 checks, 1 warning, 0 failures. The remaining warning is local-only dev auto-login variables in `apps/web/.env.local`.

### 23) Web UI polish: dangerous settings copy and modal save feedback

Added the second Web UI polish pass:

- Clarified Settings > Data copy for backup/restore/reset:
  - Backup is a JSON copy of the current workspace.
  - Restore first downloads a safety backup, then replaces the workspace with the selected file.
  - Reset warns users to download a backup first.
- Expanded the Period Lock modal explanation so users understand locked dates block transactions, payments, journals, reconciliations, and document changes.
- Added modal-level duplicate-submit protection and `Saving…` / `Archiving…` / `Clearing…` labels for:
  - Transactions.
  - Contacts.
  - Accounts.
  - Business profile.
  - Document numbering.
  - Period locks.
  - Categories.
  - Manual journals.

Verification:
- `npx tsc -p apps/web/tsconfig.json --noEmit` passed.
- `npm run build:web` passed.
- `npx playwright test tests/e2e/auctus-role-ui.spec.ts --project=role-ui` passed after copy adjustments.
- `npm run e2e` passed: 11 tests.
- `npm run smoke:production` passed after deployment: production login/workspace/contact/category/transaction/backup/reset/restore cycle completed.
- `npm run audit:production` passed after deployment: 15 checks, 1 warning, 0 failures. The remaining warning is local-only dev auto-login variables in `apps/web/.env.local`.

### 24) Web UI polish: empty workspace onboarding

Added a focused onboarding panel to the Home screen for brand-new empty workspaces:

- Shows when the workspace has no transactions and no contacts.
- Keeps the existing `No transactions yet` empty state for continuity and tests.
- Adds first-step actions for adding a transaction, opening the people list, and reviewing setup.
- Adds helper copy on Activity explaining what will appear after the first transaction is saved.
- Avoided duplicate accessible names with the sidebar navigation so Playwright and assistive tech can distinguish onboarding actions from primary navigation.

Verification:
- `npx tsc -p apps/web/tsconfig.json --noEmit` passed.
- `npm run build:web` passed.
- `npx playwright test tests/e2e/auctus-smoke.spec.ts --project=chromium` passed: 3 tests.
- `npm run e2e` passed: 11 tests.
- `npm run smoke:production` passed after deployment: production login/workspace/contact/category/transaction/backup/reset/restore cycle completed.
- `npm run audit:production` passed after deployment: 15 checks, 1 warning, 0 failures. The remaining warning is local-only dev auto-login variables in `apps/web/.env.local`.

### 25) Production Bookkeeper / Viewer role acceptance

Added `scripts/production-role-acceptance.mjs` and `npm run acceptance:production-roles`.

The script runs against production Web/API/Supabase and cleans up its temporary data:

- Creates temporary confirmed Supabase users for `owner`, `bookkeeper`, and `viewer`.
- Creates a temporary production workspace and inserts real memberships.
- Signs in through the production Netlify Web login form.
- Verifies bookkeeper can:
  - Open the production workspace.
  - Create a contact.
  - Create a transaction.
  - See day-to-day accounting controls such as category management.
  - Not see admin-only controls: Track GST, Period Lock, Download Backup, Restore Backup, Reset Backend Ledger.
- Verifies viewer can:
  - Open Home/Activity/Contacts/Accounts/Settings in read-only mode.
  - Read the bookkeeper-created contact and transaction.
  - Not see New Transaction, Add Contact, account write controls, category management, backup/restore/reset, or Period Lock.
  - Receive a real production API `403` from `GET /v1/businesses/:businessId/backup`.

Verification:
- `node --check scripts/production-role-acceptance.mjs` passed.
- `npm run acceptance:production-roles` passed against:
  - Web: `https://auctus-web.netlify.app`
  - API: `https://auctus-api.vercel.app`
  - Supabase project: `zvcbnocynsxzyrvxcsbn`
- Temporary production role users and workspace were cleaned up after the check.

### 26) June 2026 BAS hardening, bundle split, and production smoke

Completed a focused production hardening pass on 2026-06-25:

- Fixed cash-basis BAS settlement handling so invoice payments and credit-note allocations are treated as gross settlement amounts, including GST-exclusive source documents.
- Added accounting-core coverage for:
  - GST-exclusive cash-basis invoice payments.
  - Voided invoice payments.
  - Cash-basis customer credit allocation dates.
  - Cash-basis supplier credit allocation dates.
  - GST-disabled BAS totals.
- Aligned Mobile BAS summary/reporting:
  - Reports screen now uses `basReport` for period BAS summary.
  - Home GST metric now uses `basReport` instead of legacy `gstAggregate`.
  - Mobile BAS CSV/HTML exports show the configured cash/accrual basis.
- Split the Web feature bundle with lazy-loaded views and removed the mixed static/dynamic `supabaseClient` import warning.
- Added local-mode lazy navigation coverage for Home, Activity, Sales, Purchases, Contacts, Accounts, Inventory, Payroll, Reports, Assets, Journals, and Settings.
- Stabilized production smoke reset verification by waiting for reset markers to disappear from the refreshed UI before failing.

Verification:
- `npm test -w packages/accounting-core` passed.
- `npm run test -w apps/api` passed.
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` passed.
- `npm run build` passed; Web main JS chunk is now below the Vite warning threshold at `495.55 kB`.
- `npx playwright test tests/e2e/auctus-lazy-navigation.spec.ts tests/e2e/auctus-local-backup.spec.ts --project=local-mode` passed: 4 tests.
- `npm run smoke:production` passed against:
  - Web: `https://auctus-web.netlify.app`
  - API: `https://auctus-api.vercel.app`
- `npm run acceptance:production-roles` passed against production.
- `AUCTUS_SUPABASE_MIGRATIONS_VERIFIED=20260601050000 AUCTUS_PRODUCTION_WEB_URL=https://auctus-web.netlify.app AUCTUS_PRODUCTION_API_URL=https://auctus-api.vercel.app AUCTUS_PRODUCTION_API_CORS_ORIGIN=https://auctus-web.netlify.app npm run audit:production` passed: 16 checks, 1 warning, 0 failures.
- Remaining audit warning is reviewed as acceptable for this shell: local-only dev auto-login variables in `apps/web/.env.local`.

### 27) Production audit migration verification fallback

Updated `scripts/pretrial-audit.mjs` so migration verification is explicit and less dependent on the current shell:

- Audit now reports the latest local Supabase migration file.
- If Supabase CLI is available, audit still runs `supabase migration list`.
- If Supabase CLI is missing, audit can accept an explicit `AUCTUS_SUPABASE_MIGRATIONS_VERIFIED=<latest local migration>` marker after dashboard or CLI verification.
- If the CLI reports a remote migration older than the latest local migration, audit fails instead of only passing the command.

Verification:
- `node --check scripts/pretrial-audit.mjs` passed.
- `npm run audit:pretrial` passed with expected local warnings.
- `AUCTUS_SUPABASE_MIGRATIONS_VERIFIED=20260601050000 AUCTUS_PRODUCTION_WEB_URL=https://auctus-web.netlify.app AUCTUS_PRODUCTION_API_URL=https://auctus-api.vercel.app AUCTUS_PRODUCTION_API_CORS_ORIGIN=https://auctus-web.netlify.app npm run audit:production` passed: 16 checks, 1 warning, 0 failures.

### 28) Mobile full-ledger restore coverage for inventory/payroll fields

Strengthened API restore tests for the current Mobile cloud sync strategy, where Mobile still saves a full `LedgerData` payload through the restore endpoint:

- Extended `apps/api/src/tests/ledgerAudit.test.ts` restore coverage with:
  - Product-linked transaction fields (`productId`, `productQty`).
  - Inventory movement source links.
  - Purchase order expected date, memo, and linked bill transaction.
  - Pay slip hours and adjustment payload.
  - Remittance memo.
  - STP reference and memo.
- Added assertions that restored rows keep relationship integrity after the restore ID-remapping step.

Verification:
- `npm run test -w apps/api -- ledgerAudit.test.ts` passed: 8 tests.
- `npm run test -w apps/api` passed: 12 files, 68 tests.
- `npm run build` passed.

### 29) Mobile cloud role write guard

Closed the mobile cloud mismatch created by the current full-ledger restore sync strategy:

- Mobile cloud workspaces now stay writable for `owner` and `admin` roles.
- `bookkeeper` and `viewer` roles see an explicit mobile read-only banner because mobile saves through the owner/admin restore endpoint.
- Mobile write entry points now guard edits, payments, allocations, voids, contacts, manual journals, recurring templates, backup, restore, reset, account changes, report settings, AI parsing, and global add actions before mutating local state.
- Documented the role constraint in `docs/ACCOUNTING_DECISIONS.md`.

Verification:
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` passed.
- `npm run build` passed.
