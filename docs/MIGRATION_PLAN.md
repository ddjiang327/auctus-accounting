# Auctus Migration And Product Plan

## Current Direction

Auctus is being organized as a monorepo:

```text
auctus/
  apps/
    mobile/
    web/
    api/
  packages/
    accounting-core/
    shared-types/
  docs/
```

## Goal

Move shared accounting logic out of the mobile app so mobile, web, and API can reuse the same business rules.

The practical commercial direction is:

> Australia-focused, mobile-first small business accounting with a web dashboard, BAS-ready workflows, bank reconciliation, and accountant review.

Do not start by trying to clone every Xero/MYOB feature. Build a reliable accounting foundation first, then add inventory, payroll, compliance depth, and integrations.

## Current Status

- `apps/mobile` contains the Expo mobile app.
- `apps/web` contains the Vite web app.
- `apps/api` now contains the first backend API skeleton backed by Supabase.
- Backend/Supabase planning is captured in `docs/BACKEND_SCHEMA_PLAN.md`.
- `packages/accounting-core` contains the extracted accounting/domain functions from the mobile app.
- `packages/shared-types` contains the extracted shared models from the mobile app.
- `packages/accounting-core` has a Node test suite covering GST split, posting, payment posting, opening balances, manual journals, trial balance, financial position, invoice balance, credit notes, voided transactions, period locks, AR/AP aging, reconciliation, and BAS summary.
- `packages/accounting-core` now includes validation helpers for transaction amounts, locked-period dates, and credit allocation limits.
- BAS reporting now supports `cash` and `accrual` basis through `settings.basBasis`.
- Mobile Settings now has a BAS Basis switch for Cash and Accrual.
- Mobile now has broader locked-period enforcement for transaction edits, document status changes, manual journal changes, bank reconciliation finalise/void, and bank-feed clearing.
- `packages/accounting-core/src/index.ts` now exposes grouped public modules instead of containing all accounting code directly.
- Low-risk accounting-core implementation has been moved into `formatting.ts`, `dates.ts`, and `gst.ts`.
- Document accounting helpers have been moved into `documents.ts`.
- Period lock helpers have been moved into `periodLocks.ts`.
- Write-path validation helpers have been moved into `validation.ts`.
- Account/chart helper implementation has been moved into `accounts.ts`.
- Audit helper implementation has been moved into `audit.ts`.
- Reconciliation implementation has been moved into `reconciliation.ts`.
- Posting and ledger-balance implementation has been moved into `posting.ts`.
- Report implementation has been moved into `reports.ts`.
- `packages/accounting-core/src/ledger.ts` is now a compatibility barrel that re-exports the grouped modules.
- Root `package.json` uses npm workspaces.
- Mobile currently depends on:
  - `@auctus/accounting-core`
  - `@auctus/shared-types`
- Web now depends on:
  - `@auctus/accounting-core`
  - `@auctus/shared-types`
- Mobile compatibility wrappers remain at:
  - `apps/mobile/src/domain/accounting.ts`
  - `apps/mobile/src/domain/models.ts`
- Web compatibility wrappers remain at:
  - `apps/web/src/domain/accounting.ts`
  - `apps/web/src/domain/models.ts`
- Supabase backend foundation is in place:
  - Initial workspace schema exists for profiles, businesses, members, and settings.
  - Accounting foundation tables exist for chart accounts, payment accounts, categories, and contacts.
  - Transaction foundation tables exist for transactions, invoice payments, and credit allocations.
  - Audit log, period lock, and server-side document number allocation migrations exist.
  - Bank feed and bank reconciliation tables exist.
  - Business creation seeds default accounting foundation data.
  - Ledger snapshot now returns real chart accounts, payment accounts, categories, contacts, transactions, payments, credit allocations, period locks, bank feed items, bank reconciliations, and audit log from Supabase.
  - Server write paths now cover business profile/settings updates, payment accounts, categories, contacts, transactions, payments, credit allocations, voids, period locks, bank feed items, and bank reconciliations.
  - Backend transaction edits now support nullable field clearing and atomic update-with-new-payments through a Supabase RPC.
  - Server backup/restore, import, and reset endpoints now exist for owner/admin users, preserve the server audit trail, rebuild imported IDs into Supabase UUIDs, and audit each export/restore/reset.
  - Server write paths enforce membership/role checks, shared accounting validation, locked-period checks, no physical delete for commercial documents, and audit entries for key accounting changes.
  - Manual journals now have Supabase tables, ledger snapshot projection, and server write paths for create, update, void, and reverse.
- Web has begun feature parity work:
  - Accounts can now be added and edited from the web app.
  - Contacts can now be added and edited from the web app.
  - The transaction modal can now attach invoice/bill transactions to customer/supplier contacts.
  - Sales and Purchases now have separate web navigation entries while reusing the shared Documents workflow, status filters, create buttons, edit actions, and receive/pay entry points.
  - Invoice and bill detail views now exist inside the web Documents workflow, showing document status, contact, dates, category, GST summary, balance, and payment history.
  - Invoice and bill preview/PDF workflow now exists through a printable document preview and browser Print / Save PDF.
  - Web credit notes are now supported in the Documents workflow with credit/supplier-credit creation, remaining balance display, and allocation to open invoices/bills.
  - Web bank reconciliation workflow now exists in Accounts with CSV bank feed import, auto/manual matching, ignore/unignore, record-from-feed, finalise matched feed rows, manual statement reconciliation, void reconciliation, locked-period checks, and audit log entries.
  - Web manual journals and audit log UI now exist as a dedicated Journals page with journal create/edit, balanced debit/credit validation, void, reverse, locked-period checks, and audit log viewing.
  - Web Settings now includes accounting controls for period locks and document numbering across invoices, bills, credit notes, supplier credits, and receipts.
  - Web UI polish pass 1 is complete: dashboard cards, report tables, document list responsiveness, and base brand styling have been tightened.
  - Reports now use `basReport` from `@auctus/accounting-core`.
  - Settings can update BAS basis and basic business profile fields.
  - The web app shell has been changed from a phone-shaped prototype to a desktop dashboard layout with sidebar navigation and a top action bar.
  - Web has first backend integration for loading the Supabase ledger snapshot and sending transaction, payment, contact, and credit allocation writes through `apps/api` when configured.
  - Web Settings now sends business profile, GST/BAS settings, document numbering, and period-lock creation through `apps/api` when backend mode is configured.
  - Web Journals now sends manual journal create, update, void, and reverse actions through `apps/api` when backend mode is configured.
  - Web Accounts now sends payment account create and update actions through `apps/api` when backend mode is configured.
  - Web Accounts now sends bank feed import, match, ignore/unignore, record-from-feed, finalise reconciliation, and void reconciliation actions through `apps/api` when backend mode is configured.
  - Web Settings now sends backup download, restore, and reset actions through `apps/api` when backend mode is configured.

## Ownership And Responsibilities

Codex can drive:

- Overall technical architecture.
- Mobile app refactor.
- Extraction of `accounting-core`.
- Database schema design.
- Backend API.
- Web app.
- Login, business accounts, and permissions.
- Sync.
- Inventory.
- Reports.
- Payroll MVP implementation.
- Tests, bug fixes, and commercial polish.

The product owner must drive or confirm:

- Whether accounting treatment matches the target market.
- Australia GST, BAS, payroll, super, and compliance details.
- Real business scenarios and edge cases.
- Actual workflow testing.
- Commercial product tradeoffs and feature priority.

Important boundary: Codex can implement accounting logic, validations, tests, and workflows, but cannot independently certify legal, tax, payroll, BAS, STP, or accounting compliance. Compliance decisions need confirmation from the product owner, accountant, BAS agent, tax agent, payroll specialist, or official ATO guidance as appropriate.

## Product Scope

Build in this order:

1. Reliable bookkeeping and accounting core.
2. Mobile workflow cleanup.
3. Cloud backend, login, business workspace, and sync.
4. Web dashboard and review workflows.
5. Inventory.
6. Payroll MVP.
7. Deeper compliance, STP, integrations, and commercial hardening.

Avoid building advanced payroll, STP lodgement, complex inventory, or third-party integrations before the shared accounting engine and backend foundation are stable.

## Migration Order

1. Done: Extract pure models from `apps/mobile/src/domain/models.ts` into `packages/shared-types`.
2. Done: Extract accounting/posting/report/GST logic from `apps/mobile/src/domain/accounting.ts` into `packages/accounting-core`.
3. Done: Add first focused tests for accounting-core.
4. Done: Add more edge-case tests for posting, credit notes, GST-free transactions, voided documents, period locks, reconciliation, and AR/AP aging.
5. Done: Add focused tests for payment posting, opening balances, manual journals, all journal entries, and financial position.
6. Next: Review accounting assumptions exposed by the tests, especially transfer account choices, credit allocation behavior, GST-disabled behavior, BAS date basis, and opening-balance signs.
7. Done: Move real implementation out of `ledger.ts` into grouped accounting-core modules. `ledger.ts` now only preserves compatibility exports.
8. Next: Gradually update mobile imports to use `@auctus/accounting-core` and `@auctus/shared-types` directly, or keep wrappers until the app is stable.
9. Next: Review accounting assumptions and edge cases before database schema design.
10. Done: Build the web app against the shared accounting package through compatibility wrappers.
11. In progress: Fill web app feature gaps using the shared accounting package.
12. Done: Replace the phone-shaped web prototype shell with a desktop dashboard shell.
13. Done: Add first web Contacts workflow and connect invoice/bill entry to contacts.
14. Done: Add dedicated web Sales and Purchases workflows with lists, status filters, create actions, and receive/pay entry points.
15. Done: Web UI polish pass 1 for dashboard cards, reports tables, responsive details, and brand baseline.
16. Done: Add first invoice/bill detail view on web with status, GST, payment history, edit, and receive/pay actions.
17. Done: Add invoice/bill preview with print stylesheet and browser Save as PDF workflow.
18. Done: Add web credit notes and supplier credits with creation and allocation workflow.
19. Done: Add first web bank feed and bank reconciliation workflow using shared accounting-core reconciliation helpers.
20. Done: Add web manual journals and audit log UI.
21. Done: Add web Settings accounting controls for period locks and document numbering.
22. Done: Add the first API app skeleton with Supabase environment setup.
23. Done: Add Supabase workspace, accounting foundation, transaction foundation, audit log, period lock, and document number allocation migrations.
24. Done: Update ledger snapshot to return real Supabase chart accounts, payment accounts, categories, contacts, transactions, payments, credit allocations, period locks, and audit log.
25. Done: Add first server-authoritative write paths for business settings/profile, contacts, transactions, payments, credit allocations, voids, and period locks.
26. Done: Connect Web Settings persistence to the existing backend profile, settings, and period-lock APIs.
27. Done: Add manual journal Supabase tables, ledger snapshot support, API write paths, and Web Journals backend integration.
28. Done: Add payment account and category API write paths with role checks, chart-account ownership validation, archive guards, audit entries, and Web Accounts backend integration for payment account create/update.
29. Done: Add bank feed and bank reconciliation Supabase tables, ledger snapshot support, API write paths, and Web Accounts backend integration for import, match, ignore/unignore, record-from-feed, finalise, and void.
30. Done: Add owner/admin backup/restore, reset/import API workflows and connect Web Settings backup, restore, and reset actions to the backend.
31. Done: Add audited clear/unlock period-lock workflow and dedicated Web category management UI with chart-account mapping.
32. Done: Add backend transaction edit/update, nullable field clearing for type changes, and atomic update-with-new-payments Web integration.
33. In progress: Continue web/backend integration beyond the first write paths, especially remaining admin overrides and category-management polish.

## Technical Roadmap

### Phase 1: Accounting Core And Mobile Refactor

Estimated time: 2-4 weeks.

Goal: turn the existing mobile accounting logic into a shared engine.

Work:

- Move pure models into shared packages.
- Move posting logic into `packages/accounting-core`.
- Move GST calculation logic into `packages/accounting-core`.
- Move report calculation logic into `packages/accounting-core`.
- Keep mobile UI, navigation, storage, and device-specific code inside `apps/mobile`.
- Add tests around posting, GST, reports, and important edge cases.
- Update mobile imports to use shared packages.

Result:

- Mobile remains usable.
- Business logic becomes reusable by web and API.
- Future backend and web work has a stable accounting base.

### Phase 2: Backend, Login, And Cloud Sync

Estimated time: 3-5 weeks.

Goal: move from a local app toward a commercial SaaS foundation.

Work:

- Done: User accounts through Supabase Auth.
- Done: Business workspaces.
- Done: First database schema.
- Done: First roles and permissions.
- In progress: Cloud sync through business ledger snapshots and server write paths.
- Done: Audit log foundation.
- Done: Server-side accounting validation for current transaction, payment, credit allocation, void, contact, profile/settings, and period-lock write paths.
- Done: Backup/export, restore/import, and reset foundations.

Result:

- Multiple users/businesses can be supported.
- Data can sync across mobile and web.
- The system has an audit trail and backend authority.

### Phase 3: Web App Rebuild

Estimated time: 4-8 weeks.

Goal: recreate the current mobile functionality on web using the shared accounting packages and backend.

Work:

- Dashboard.
- Invoices.
- Bills.
- Contacts.
- Payments.
- Reports.
- BAS-ready views.
- Bank import.
- Settings.

Result:

- Web and mobile share accounting behavior.
- The web app becomes useful for review, reporting, and admin workflows.

### Phase 4: Inventory

Estimated time: 3-6 weeks.

Work:

- Products.
- Stock movements.
- Cost of goods sold.
- Inventory valuation.
- Inventory adjustments.
- Invoice and bill integration.

Result:

- Small businesses with stock can use Auctus beyond basic bookkeeping.

### Phase 5: Payroll MVP

Estimated time: 6-10 weeks.

Work:

- Employees.
- Pay runs.
- PAYG estimate.
- Super.
- Payslips.
- Payroll journal.
- Payroll reports.

Important: STP lodgement should not be part of the first payroll MVP unless there is a clear compliance and certification plan. STP adds significant complexity and risk.

### Phase 6: Commercial Hardening

Estimated time: 4-8 weeks.

Work:

- Broader automated tests.
- Permission boundary tests.
- Audit trail review.
- Subscription/billing.
- Backup and restore.
- Error monitoring.
- Data export.
- Production deployment.
- Support/admin tooling.

## Time Expectations

- Usable commercial MVP: about 3-4 months.
- More complete web + mobile + inventory + payroll MVP: about 5-7 months.
- Xero/MYOB-level maturity: 12+ months.

These estimates assume steady work and fast accounting/product decisions.

## Accounting Roadmap

The accounting roadmap should be developed alongside the technical roadmap.

Confirmed accounting/product decisions are recorded in:

```text
docs/ACCOUNTING_DECISIONS.md
```

Core areas to confirm:

- Chart of accounts structure.
- Invoice lifecycle details.
- Bill lifecycle details.
- Payment allocation edge cases.
- Overpayments and refunds.
- Accountant review workflow.

Payroll areas to confirm before implementation:

- Employee setup requirements.
- Pay calendar behavior.
- PAYG estimate assumptions.
- Super calculation assumptions.
- Leave handling for MVP or out of scope.
- Payslip requirements.
- Payroll journal posting.
- STP excluded from MVP unless separately planned.

Inventory areas to confirm before implementation:

- Inventory valuation method.
- Stock adjustment rules.
- COGS posting rules.
- Negative stock policy.
- Product tax treatment.
- Integration with invoices and bills.

## Commercial MVP Target

First commercial target:

- Australia small business focus.
- Mobile-first transaction entry.
- Web dashboard for review and admin.
- BAS-ready GST reporting.
- Bank import and reconciliation.
- Accountant review/export workflow.
- Clear audit trail.
- Reliable backup/export.

Later additions:

1. Inventory.
2. Payroll MVP.
3. STP and deeper compliance.
4. Integrations.

## Rules For Future Work

- Do not move all code at once.
- Keep UI code inside each app.
- Put reusable business logic in `packages/accounting-core`.
- Put cross-app TypeScript types in `packages/shared-types`.
- Keep storage/platform-specific code inside the app that owns it.
- Do not implement compliance-sensitive accounting behavior without recording the assumption.
- Prefer small migration steps with tests.
- After each migration step, run:

```bash
npm run build
npx tsc -p apps/mobile/tsconfig.json --noEmit
```

## Current Code Buckets

### Recently Completed

- Web Settings Business Profile is now complete enough for invoice/bill documents:
  - business name
  - ABN
  - email
  - phone
  - address
  - payment instructions
  - invoice footer
- Web Settings Data section is now clearer:
  - local backup download
  - JSON restore
  - local reset
  - visible backup scope/statistics
- Business profile updates are recorded in the web audit log.
- Web locked-period write validation has been tightened:
  - new/edit transaction saves now use `validateTransactionInput`
  - editing an existing transaction/document dated in a locked period is blocked
  - invoices, bills, credit notes and supplier credits are covered through the shared transaction save path
  - receive payment / pay bill now uses `validatePaymentInput`
  - credit note allocations continue to use `validateCreditAllocations`
  - manual journal void/reversal and bank reconciliation void/finalise paths already enforce period locks
- Accounting-core validation now includes:
  - `validateTransactionInput`
  - `validatePaymentInput`
  - `validateCreditAllocations`
  - `isDateLocked`
- Web audit log coverage now includes:
  - transaction create/update
  - invoice/bill/credit note create/update through the transaction path
  - payment record
  - credit note allocation
  - backup restore
  - local data reset
- Supabase/backend preparation now has:
  - `docs/BACKEND_SCHEMA_PLAN.md` for tables, RLS boundaries, API write paths, and sync strategy
  - explicit server authority rules for locked periods, audit log, no physical delete, role permissions, workspace isolation, restore/import, payment validation, and credit allocation validation
  - a web `ledgerDataAdapter` boundary so the current local storage implementation can later be swapped for a Supabase-backed adapter

### Already Exists

- Mobile app shell and screens.
- Some accounting/domain logic in mobile.
- Some reporting and UI workflows.
- Existing web/Vite app code.
- Monorepo folder structure.

### Needs Refactor

- Direct mobile imports still point at compatibility wrappers in `apps/mobile/src/domain`.
- Accounting-core needs deeper tests for opening balances, payment journal entries, AP aging, manual journals, financial position, report periods, and rounding.
- Accounting-core implementation should be gradually moved out of `ledger.ts` into the grouped modules once behavior is further covered by tests.
- Accounting decisions are now documented in `docs/ACCOUNTING_DECISIONS.md`.
- Implementation still needs audit-log enforcement for future admin overrides and API-level locked-period enforcement when backend write paths exist.
- GST/BAS/posting assumptions still need review before backend schema design.

### Web Must Rebuild Or Reconnect

- Dashboard against shared accounting logic.
- Invoices and bills against shared models.
- Contacts, payments, reports, BAS views, bank import, settings.
- Backend-backed data access once API exists.

### Backend Must Add

- Authentication.
- Business/workspace model.
- Database schema.
- Permissions.
- Sync API.
- Audit log.
- Server-side validation.
- Backup/export.

### Commercial Controls To Add

- Audit trail.
- Permission checks.
- Locked periods.
- Data export.
- Error monitoring.
- Backup and restore.
- Subscription/billing.
- Test coverage for core accounting behavior.

## First File To Read In Future Sessions

Before continuing migration work, read this file first:

```text
docs/MIGRATION_PLAN.md
```

Then inspect:

```text
docs/ACCOUNTING_DECISIONS.md
apps/mobile/src/domain/models.ts
apps/mobile/src/domain/accounting.ts
```
