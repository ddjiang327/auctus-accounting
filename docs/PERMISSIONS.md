# Permission Model

This document is the product/API contract for workspace roles. Web and mobile UI
should use it to hide or disable actions, but the API remains the authority.

The current source of truth is:

- API role guards in `apps/api/src/*/service.ts`.
- Permission assertions in `apps/api/src/tests/permissions.test.ts`,
  `ledgerAudit.test.ts`, `transactionPayments.test.ts`,
  `bankReconciliation.test.ts`, and `businessIsolation.test.ts`.

## Roles

- `owner`: Full control of the workspace, including accounting operations,
  settings, period locks, export/restore/import, and reset.
- `admin`: Same workspace management permissions as owner for the current MVP.
  Admins can manage settings, period locks, export/restore/import, reset, and
  normal accounting operations.
- `bookkeeper`: Can perform day-to-day accounting work, but cannot change
  high-risk administrative state such as business settings, period locks,
  export/restore/import, or reset.
- `viewer`: Read-only business member. Can load the workspace ledger but cannot
  write accounting, banking, settings, backup, import, or reset data.

Non-members have no access to the workspace. API routes must return `403` for
cross-business reads and writes.

## Permission Matrix

| Capability | Owner | Admin | Bookkeeper | Viewer |
| --- | --- | --- | --- | --- |
| Create a new workspace | Yes | Yes | Yes | Yes |
| Read workspace list and ledger snapshot for joined workspaces | Yes | Yes | Yes | Yes |
| Update business profile and settings | Yes | Yes | No | No |
| Create or clear accounting period locks | Yes | Yes | No | No |
| Export ledger backup | Yes | Yes | No | No |
| Restore ledger backup | Yes | Yes | No | No |
| Import ledger data | Yes | Yes | No | No |
| Reset ledger data | Yes | Yes | No | No |
| Create, update, void transactions and documents | Yes | Yes | Yes | No |
| Record or void invoice/bill payments | Yes | Yes | Yes | No |
| Apply credit note allocations | Yes | Yes | Yes | No |
| Manage payment accounts and categories | Yes | Yes | Yes | No |
| Manage contacts | Yes | Yes | Yes | No |
| Create, update, void, or reverse manual journals | Yes | Yes | Yes | No |
| Import, match, ignore, or unignore bank feed items | Yes | Yes | Yes | No |
| Finalise or void bank reconciliations | Yes | Yes | Yes | No |

Workspace creation is available to any authenticated user. The creator is added
to the new workspace as `owner`.

## Guard Groups

The API currently uses these effective guard groups:

- Member read: `owner`, `admin`, `bookkeeper`, `viewer`.
- Admin actions: `owner`, `admin`.
- Accounting write actions: `owner`, `admin`, `bookkeeper`.
- Read-only role: `viewer`.
- No access: unauthenticated users and non-members.

UI permissions should be derived from the same groups. Do not make mobile or Web
buttons more permissive than these groups, and do not rely on UI checks for
security.

## Supabase RLS Boundary

The API is the write authority for cloud workspaces. It uses the Supabase
service-role key server-side and applies the role guards above before writing.

Authenticated web/mobile clients may read joined workspace rows through RLS, but
they should not directly mutate workspace, membership, settings, or accounting
tables. Direct authenticated owner/admin write policies for `businesses`,
`business_members`, and `business_settings` are intentionally dropped in
`20260507010000_harden_direct_workspace_writes.sql` until member-management
routes are productized and tested.

## Not Yet Asserted

Workspace member management is not currently covered by API tests in this repo.
When member invitation/removal/role-change routes are added, define the intended
owner/admin split here and add matching API tests in the same change.

## Test Alignment

Current tests assert these rules:

- Requests without an auth token return `401`.
- Non-members receive `403` for ledger reads, transaction writes, period locks,
  bank feed import, reconciliation finalise, export, and reset.
- Viewers receive `403` for transaction writes, standalone payments,
  transaction updates with inline payments, reconciliation finalise, and
  reconciliation void.
- Bookkeepers receive `403` for business settings, period locks, export,
  restore, import, and reset.
- Bookkeepers can perform accounting operations such as recording payments and
  voiding reconciliations.
- Admins can update business settings, create period locks, export backups, and
  perform reconciliation writes.
- Owners can create period locks, export/restore/import/reset ledger data, and
  perform ordinary accounting writes.

When a permission rule changes, update this document and the matching API tests
in the same change.
