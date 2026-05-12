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
- [ ] Run a manual UI pass with API offline, expired session, and a 403 viewer role.

## Export / Import Recovery Path

- [x] Restore/import file is parsed and checked for required ledger sections before replacing data.
- [x] Restore downloads a safety backup of the current ledger before replacing local or backend data.
- [ ] Manually verify local backup download, local restore, and recovery from the pre-restore backup.
- [x] Manually verify backend backup download, backend restore, and recovery from the pre-restore backup.
- [ ] Verify owner/admin can export/restore/reset and bookkeeper/viewer cannot.
- [ ] Keep at least one off-platform backup before trial data is reset or imported.

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

- [ ] Do not set `VITE_AUCTUS_DEV_EMAIL` or `VITE_AUCTUS_DEV_PASSWORD` in production.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` exists only on the API host.
- [ ] `API_CORS_ORIGIN` exactly matches the production web origin.
- [ ] Supabase Auth allowed redirect/site URLs include the production web host.
- [ ] API `/health` is monitored.

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
- [ ] Confirm cross-business read attempts return no rows for anon/authenticated client queries.
- [ ] Confirm API role matrix manually:
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

- Supabase project: `<project-ref>` / `https://<project-ref>.supabase.co`
- API host: `https://<api-host>`
- Web host: `https://<web-host>`
- API health: `https://<api-host>/health`
- Web build command: `npm run build:web`
- API build command: `npm run build:api`
- Supabase migrations: `supabase db push`

Pre-trial verification:

- [x] `npm run build:packages`
- [x] `npm run build:api`
- [x] `npm run build:web`
- [x] `npm run test -w apps/api`
- [x] `npx tsc -p apps/mobile/tsconfig.json --noEmit`
- [x] `npm run e2e`
- [ ] Create a test user and test business on production Supabase.
- [ ] Create, edit, archive, export, restore, and reset a disposable trial workspace.

Latest automated verification: 2026-05-12.

- `npm run build` passed.
- `npm run test -w apps/api` passed: 7 files, 45 tests.
- `npx tsc -p apps/mobile/tsconfig.json --noEmit` passed.
- `npm run e2e` passed: 7 Playwright tests, including cloud export → restore → pre-restore backup recovery and recoverable API error UX.
- Playwright now asserts newly created cloud workspaces show `No transactions yet`.
- Playwright now asserts API unreachable, 401 session expiry, and 403 forbidden responses render user-visible recovery messages instead of browser alerts.
- `supabase migration list` passed and showed local/remote migrations aligned through `20260507010000`.
- `supabase db push --dry-run` passed and reported it would push only `20260507010000_harden_direct_workspace_writes.sql`; the migration was then pushed to the target Supabase project.
- Remote policy audit confirmed the remaining direct authenticated write surface is `profiles_update_self`; workspace/accounting direct writes are removed.
- Full target schema audit output was not available in this shell because `supabase db query --linked` can require `SUPABASE_DB_PASSWORD`; keep `supabase/rls_audit.sql` for SQL editor or `psql` verification when credentials are available.
