# MVP Hardening Checklist

Use this before any real trial workspace is created.

## Runtime UI

- [x] Web render failures are caught by a React error boundary with retry/reload actions.
- [x] API/network failures surface as a visible sync error banner with retry.
- [x] Initial cloud workspace loading blocks the app from showing stale local demo data.
- [x] Workspace selector has an empty state when a signed-in user has no businesses.
- [x] Playwright smoke confirms a newly created cloud workspace opens with an empty transaction list.
- [x] Run a manual UI pass on an empty workspace after creating a brand-new business.
- [x] Playwright recoverable-error smoke confirms API offline, expired session, and 403 responses surface clear in-app messages.
- [x] Run a manual UI pass with API offline, expired session, and a 403 viewer role.

## Export / Import Recovery Path

- [x] Restore/import file is parsed and checked for required ledger sections before replacing data.
- [x] Restore downloads a safety backup of the current ledger before replacing local or backend data.
- [x] Manually verify local backup download, local restore, and recovery from the pre-restore backup.
- [x] Manually verify backend backup download, backend restore, and recovery from the pre-restore backup.
- [x] Verify owner/admin can export/restore/reset and bookkeeper/viewer cannot.
- [x] Keep at least one off-platform backup before trial data is reset or imported.

## Production Environment

API host environment:

```bash
PORT=4010
HOST=0.0.0.0
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
API_CORS_ORIGIN=https://<web-host>
```

Web host environment:

```bash
VITE_AUCTUS_API_URL=https://<api-host>
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

Production rules:

- [x] Do not set `VITE_AUCTUS_DEV_EMAIL` or `VITE_AUCTUS_DEV_PASSWORD` in production.
- [x] `SUPABASE_SERVICE_ROLE_KEY` exists only on the API host.
- [x] `API_CORS_ORIGIN` exactly matches the production web origin.
- [x] Supabase Auth allowed redirect/site URLs include the production web host.
- [x] API `/health` is monitored.

Deployment setup steps are tracked in `docs/PRODUCTION_DEPLOYMENT.md`.

Local repository/env audit on 2026-05-12:

- `.env.local` files are ignored by git; only `.env.example` files are tracked.
- `apps/web/.env.local` currently includes local dev login variables for E2E/local testing; do not copy these to production hosting.
- `SUPABASE_SERVICE_ROLE_KEY` appears in API env examples/docs only, not in Web env examples or Web source.
- `apps/api/README.md` documents `SUPABASE_SERVICE_ROLE_KEY` as server-only and `API_CORS_ORIGIN` as the exact production web origin.
- Supabase Auth production `site_url` is `https://auctus-web.netlify.app`; allowed redirect URLs include `https://auctus-web.netlify.app` and `https://auctus-web.netlify.app/`.

Target environment audit on 2026-05-12:

- Local API env points at Supabase project `zvcbnocynsxzyrvxcsbn`; local Web env points at the same project.
- Local API/Web env values are development-only for runtime origins: API is `http://127.0.0.1:4010`, Web API target is `http://127.0.0.1:4010`, and `API_CORS_ORIGIN` is `http://127.0.0.1:5173`.
- `supabase migration list` confirmed the linked remote project is aligned with local migrations through `20260507010000`.
- `supabase projects list` could not verify project metadata because the Supabase Management API access token is not available in this shell. Supabase Auth site URL / redirect URL still needs dashboard or `SUPABASE_ACCESS_TOKEN` verification.
- Vercel API and Netlify Web deployment config now exists in `vercel.json`, `api/[...path].mjs`, `api/health.mjs`, `api/v1/[...path].mjs`, and `netlify.toml`.
- Production Web/API verification passed for `https://auctus-web.netlify.app` and `https://auctus-api.vercel.app`: Web shell, exact CORS origin, CORS preflight, API `/health`, and unauthenticated `/v1/businesses` returning 401.
- `npm run audit:production` passed with production URL inputs: 15 passed, 1 warning, 0 failures. The remaining warning is local-only dev auto-login credentials in `apps/web/.env.local`.
- Supabase Auth Site URL and allowed redirect URLs were verified in the Supabase dashboard for `https://auctus-web.netlify.app`.

## Supabase RLS / Role Manual Audit

The API uses the service role key and must enforce business membership and roles server-side. RLS still matters for direct anon/authenticated client access.

- [x] Static migration audit confirms every business-scoped table has RLS enabled: `businesses`, `business_members`, `business_settings`, `chart_accounts`, `payment_accounts`, `categories`, `contacts`, `transactions`, `invoice_payments`, `credit_allocations`, `audit_log`, `period_locks`, `manual_journals`, `manual_journal_lines`, `bank_feed_items`, `bank_reconciliations`.
- [x] Static migration audit confirms member read policies require `public.is_business_member(business_id)`.
- [x] Static migration audit confirms accounting tables expose member read policies only; normal accounting writes go through the API service-role path.
- [x] Remote Supabase migration list matches local migrations through `20260502013000`.
- [x] Added migration `20260507010000_harden_direct_workspace_writes.sql` to remove direct authenticated owner/admin writes to workspace, membership, and settings rows; API service-role writes remain the intended write path.
- [x] Push `20260507010000_harden_direct_workspace_writes.sql` to the target Supabase project.
- [x] Confirm the same RLS state on the target Supabase project after migrations are pushed.
- [x] Reviewed direct authenticated owner/admin policies for `businesses`, `business_members`, and `business_settings`: they should not stay enabled for trial/production while member-management UI/API is not productized.
- [x] Confirm cross-business read attempts return no rows for anon/authenticated client queries.
- [x] Confirm API role matrix manually:
  - owner/admin: settings, period locks, export/restore/reset, account/category management.
  - bookkeeper: ordinary accounting writes, no export/restore/reset or unlock.
  - viewer: read-only.

Useful SQL inspection is available in `supabase/rls_audit.sql`:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Deployment Target

Record the real trial deployment here before inviting users.

- Supabase project: `zvcbnocynsxzyrvxcsbn` / `https://zvcbnocynsxzyrvxcsbn.supabase.co`
- API host: `https://auctus-api.vercel.app`
- Web host: `https://auctus-web.netlify.app`
- API health: `https://auctus-api.vercel.app/health`
- Web build command: `npm run build:packages && npm run build:web`
- API build command: `npm run build:packages && npm run build:api`
- Supabase migrations: `supabase db push`

Pre-trial verification:

- [x] `npm run build:packages`
- [x] `npm run build:api`
- [x] `npm run build:web`
- [x] `npm run test -w apps/api`
- [x] `npx tsc -p apps/mobile/tsconfig.json --noEmit`
- [x] `npm run e2e`
- [x] Create a test user and test business on production Supabase.
- [x] Create, edit, archive, export, restore, and reset a disposable trial workspace.

Latest automated verification: 2026-06-25.

- `npm run build` passed.
- `npm run audit:production` passed with production URL inputs: 14 passed, 2 warnings, 0 failures. It confirmed the Netlify Web shell, Vercel API health check, exact production CORS origin, and production CORS preflight. The remaining warnings are local-only dev auto-login variables in `apps/web/.env.local` and no Supabase CLI binary available in this shell for migration listing.
- `npm run smoke:production` passed: created a temporary confirmed Supabase user, signed in through `https://auctus-web.netlify.app`, created a temporary workspace through the production API, loaded Home/Net Worth, created a contact/category/transaction/inventory/payroll records, downloaded and verified a backend backup, reset the temporary backend ledger, restored the backup, verified the data returned, and cleaned up the temporary user/workspace.
- `npm run acceptance:production-roles` passed: bookkeeper write/no-admin UI, viewer read-only UI, and viewer backup 403.
- `npm run test -w apps/api` passed.
- `npm test -w packages/accounting-core` passed with BAS cash-basis settlement and credit-allocation coverage.
- `npx tsc -p apps/mobile/tsconfig.json --noEmit` passed.
- `npx playwright test tests/e2e/auctus-lazy-navigation.spec.ts tests/e2e/auctus-local-backup.spec.ts --project=local-mode` passed: 4 tests.
- Web bundle splitting is active and the main JS chunk is below the Vite warning threshold at `495.55 kB`.
- Previous `npm run e2e` coverage includes:
  - Cloud export → restore → pre-restore backup recovery.
  - Local backup download → restore → safety backup download → recovery from pre-restore backup.
  - Recoverable API error UX (unreachable, 401, 403).
  - Real owner/admin/bookkeeper/viewer UI permissions and viewer 403 using temporary Supabase users/memberships.
- Playwright now asserts newly created cloud workspaces show `No transactions yet`.
- Playwright now asserts API unreachable, 401 session expiry, and 403 forbidden responses render user-visible recovery messages instead of browser alerts.
- Local backup smoke uses a second Playwright project (`local-mode`) targeting port 5174 (Vite dev server started with empty Supabase vars so the app runs without auth).
- API permission tests now assert owner/admin can export, restore, import, and reset ledger data while bookkeeper/viewer receive 403 for the same actions.
- Real-role UI smoke now asserts owner/admin can see settings, period lock, backup/restore/reset, account controls, and category management; bookkeeper keeps day-to-day accounting controls without admin-only controls; viewer is read-only and receives a real API 403 for backup.
- Disposable workspace lifecycle smoke creates a unique target-Supabase workspace, creates and edits a contact, creates and archives a category, downloads a backend backup, resets the backend ledger, restores the backup, verifies the contact returns, and deletes the temporary workspace afterward.
- Off-platform project backup confirmed at `/Users/david/Documents/Claude/Projects/backup/auctus` (430M, copied 2026-05-12 before further trial reset/import work).
- `supabase migration list` passed and showed local/remote migrations aligned through `20260507010000`.
- `supabase db push --dry-run` passed and reported it would push only `20260507010000_harden_direct_workspace_writes.sql`; the migration was then pushed to the target Supabase project.
- Remote policy audit confirmed the remaining direct authenticated write surface is `profiles_update_self`; workspace/accounting direct writes are removed.
- Remote Supabase RLS direct-read smoke created two temporary users/businesses and confirmed anon reads returned 0 rows, each authenticated user could read their own business, and cross-business reads of `businesses`, `business_settings`, and `business_members` returned 0 rows.
- Real-role UI smoke created temporary owner/admin/bookkeeper/viewer users and a temporary business on the target Supabase project, then cleaned them up after successful UI/API role assertions.
- Target environment audit confirmed local env points at Supabase project `zvcbnocynsxzyrvxcsbn`, but no production Web/API hosts are recorded in the repo and Supabase Management API access is not available in this shell for Auth URL verification.
- Full target schema audit output was not available in this shell because `supabase db query --linked` can require `SUPABASE_DB_PASSWORD`; keep `supabase/rls_audit.sql` for SQL editor or `psql` verification when credentials are available.
