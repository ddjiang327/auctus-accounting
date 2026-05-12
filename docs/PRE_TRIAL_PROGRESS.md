# Pre-trial Progress Report (2026-05-10)

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

## Documentation Updates

- Updated `docs/MVP_HARDENING.md`:
  - Marked “Push `20260507010000_harden_direct_workspace_writes.sql` to the target Supabase project” as completed.
  - Marked “Run a manual UI pass on an empty workspace after creating a brand-new business” as completed.
  - Marked “Manually verify backend backup download, backend restore, and recovery from the pre-restore backup” as completed by the cloud recovery smoke above.

## Pending (needs local runtime / env)

### A) Manual pre-trial smoke (per `docs/MVP_HARDENING.md`)

- Validate error UX end-to-end:
  - API offline: confirm user-visible error banner/text + retry path (not only a failed request)
  - session expired: confirm the login screen shows the expiry notice and the re-login path is clear
  - 403 viewer: confirm forbidden actions surface as a permissions message (not a generic failure)
- Click-through role validation:
  - owner/admin/bookkeeper/viewer permissions across key screens and actions

### B) Trial deployment record in docs

Fill real deployment details into `docs/MVP_HARDENING.md`:
- Supabase project ref / URL
- API host / health URL
- Web host
- Production env configuration values (no secrets committed)
