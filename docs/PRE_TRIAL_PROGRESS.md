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

## Pending (needs local runtime / env)

### A) Manual pre-trial smoke (per `docs/MVP_HARDENING.md`)

- Validate error UX end-to-end:
  - Manual real-role pass is still pending for 403 viewer behavior.
- Click-through role validation:
  - full owner/admin/bookkeeper/viewer permissions across key screens and actions
  - export/restore/import/reset API role matrix is now automated

### B) Trial deployment record in docs

Fill real deployment details into `docs/MVP_HARDENING.md`:
- Supabase project ref / URL
- API host / health URL
- Web host
- Production env configuration values (no secrets committed)
