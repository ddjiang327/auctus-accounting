# Data Migration And Seed Strategy

This document defines how Auctus should create demo workspaces, seed dev users,
and keep local demo data separate from cloud workspace data before real trial
data is migrated.

## Boundaries

There are two distinct data modes:

- Local demo mode: Web and mobile load `DEFAULT_DATA` into browser/device
  storage when the cloud API is not configured. This is disposable app demo
  data and is not a server workspace.
- Cloud workspace mode: Web and mobile authenticate with Supabase, select a
  business workspace, and load `/v1/businesses/:businessId/ledger` from the API.
  A cloud workspace must only contain server-side business data for that
  `business_id`.

Do not silently copy local demo data into a cloud workspace. The only accepted
paths from local data to cloud are explicit import/restore flows owned by an
owner/admin, with confirmation and audit logging.

## Workspace Creation

When a user creates a cloud workspace through `POST /v1/businesses`:

- The API creates or upserts the Supabase `profiles` row for the actor.
- The API creates one `businesses` row.
- The creator is inserted into `business_members` as `owner`.
- A default `business_settings` row is inserted.
- `seedAccountingFoundation` creates the accounting foundation:
  chart accounts, payment accounts, and income/expense categories.
- No contacts, transactions, payments, invoices, bills, manual journals, bank
  feed rows, reconciliations, period locks, or audit history should be seeded.

This makes a new cloud workspace production-safe: it has structure, but no fake
business activity.

## Demo Workspace Creation

Demo workspaces should be explicit and disposable. Use a naming convention:

- Local-only examples: `Auctus Local Demo`.
- Cloud demo workspaces: `Demo - <scenario> - <YYYYMMDD>`.
- Smoke/E2E workspaces: `Smoke <label> <YYYYMMDDHHmmss>`.

A cloud demo workspace should be created by the same public API path as a real
workspace, then optionally populated through an explicit owner/admin
restore/import call. That keeps demo seeding inside the same permission and
audit boundaries as real migration.

For MVP trials, prefer these demo variants:

- `Demo - Empty Ledger`: created through `POST /v1/businesses`; no additional
  import. Use this for onboarding and empty-state checks.
- `Demo - BAS Workflow`: imported from a curated backup fixture with invoices,
  bills, payments, GST, and period lock examples. This fixture should be
  obviously fake and never share IDs with local `DEFAULT_DATA`.
- `Demo - Bank Reconciliation`: imported from a curated backup fixture with
  bank feed rows and one completed reconciliation.

Curated demo fixture files should live outside app runtime storage, for example
under `fixtures/demo-ledgers/`, and should be imported only by a manual
owner/admin action or a dedicated dev seed script.

## Dev User Seed

Dev users should be seeded in Supabase Auth, not in application tables only.
The app already supports dev auto-login through environment variables:

- Web: `VITE_AUCTUS_DEV_EMAIL`, `VITE_AUCTUS_DEV_PASSWORD`.
- Mobile: `EXPO_PUBLIC_DEV_EMAIL`, `EXPO_PUBLIC_DEV_PASSWORD`.

Recommended dev setup:

1. Create one Supabase Auth user per dev persona.
2. Sign in as that user.
3. Create workspaces through the API/UI so membership, settings, and accounting
   foundation are created by the same code path used in production.
4. If the persona needs non-owner access, add membership rows manually or via a
   future member-management API, then verify role behavior against
   `docs/PERMISSIONS.md`.

Suggested personas:

- `owner`: owns empty, BAS, and bank reconciliation demo workspaces.
- `admin`: member of the same workspaces for admin-permission checks.
- `bookkeeper`: member for daily accounting write checks.
- `viewer`: member for read-only UI/API checks.

Until member-management routes exist, adding `admin`, `bookkeeper`, and
`viewer` memberships is a manual Supabase step and should be treated as a
production-data operation.

## Real Data Migration

Real migration should use an explicit import/restore path:

1. Create a new cloud workspace through `POST /v1/businesses`.
2. Export or prepare a validated `LedgerData` backup envelope.
3. Owner/admin imports it through the restore/import UI or API endpoint.
4. API replaces the workspace ledger data in place and records an audit event.
5. User verifies opening balances, account mapping, GST/BAS settings, document
   numbering, contacts, outstanding invoices/bills, and reports before trial use.

Do not migrate real data into a demo workspace. Do not use local browser/mobile
storage as the source of truth once a cloud workspace exists.

## Local Demo Rules

Local demo mode must remain isolated:

- Web local data lives in browser storage through `ledgerDataAdapter`.
- Mobile local data lives in device storage through `mobileStore`.
- Local reset returns to `DEFAULT_DATA`.
- Local backup/export is a file artifact, not a cloud workspace.
- Signing into cloud should load the selected server ledger and should not show
  stale local demo data while the server ledger is unavailable.

If a user wants to move local data to cloud, require an explicit backup/export
then cloud restore/import confirmation.

## Cloud Seed Rules

Cloud seed data must be business-scoped and idempotent where possible:

- Foundation seed runs only when the workspace has no chart accounts.
- Seeded foundation rows must use server-generated IDs.
- Demo ledger imports may remap IDs during restore/import.
- Every cloud write must include `business_id` and pass membership/role guards.
- Demo transactions should never be inserted by app startup, login, or workspace
  selection.

## Pre-Trial Checklist

- [ ] Create a fresh empty cloud workspace and confirm no fake activity appears.
- [ ] Confirm local Web demo data does not appear after cloud login.
- [ ] Confirm local Mobile demo data does not appear after cloud login.
- [ ] Create or import a disposable cloud demo workspace and verify reports,
  invoices/bills, payments, bank feed, reconciliation, and audit log.
- [ ] Seed owner/admin/bookkeeper/viewer personas and verify UI/API permissions.
- [ ] Export a pre-migration backup before any real restore/import.
- [ ] Verify real opening balances, GST/BAS basis, document numbering, contacts,
  and outstanding documents with the accountant/BAS checklist.
