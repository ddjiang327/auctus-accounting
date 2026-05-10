# Backend Schema Plan

This file is the working plan for the Supabase/backend phase. It defines the first database shape, authority rules, and sync boundaries before backend code is added.

## Goals

- Support multiple users and multiple business workspaces.
- Make the backend the authority for accounting writes.
- Reuse `@auctus/accounting-core` validation on server write paths.
- Preserve local-first/mobile workflows while adding cloud sync.
- Keep commercial accounting documents auditable and recoverable.

## Core Entities

### `profiles`

User profile linked to Supabase Auth.

- `id uuid primary key references auth.users(id)`
- `email text not null`
- `display_name text`
- `created_at timestamptz not null`
- `updated_at timestamptz`

### `businesses`

One accounting workspace.

- `id uuid primary key`
- `name text not null`
- `abn text`
- `email text`
- `phone text`
- `address text`
- `logo_uri text`
- `logo_text text`
- `payment_instructions text`
- `invoice_footer text`
- `currency text not null default 'AUD'`
- `locale text not null default 'en-AU'`
- `created_at timestamptz not null`
- `updated_at timestamptz`

### `business_members`

Membership and permission boundary.

- `id uuid primary key`
- `business_id uuid not null references businesses(id)`
- `user_id uuid not null references profiles(id)`
- `role text not null` (`owner`, `admin`, `bookkeeper`, `viewer`)
- `created_at timestamptz not null`
- unique `(business_id, user_id)`

### `business_settings`

Accounting and document numbering settings.

- `business_id uuid primary key references businesses(id)`
- `gst_enabled boolean not null`
- `gst_rate numeric not null default 0.10`
- `bas_basis text not null` (`cash`, `accrual`)
- `invoice_prefix text not null`
- `bill_prefix text not null`
- `credit_note_prefix text not null`
- `supplier_credit_prefix text not null`
- `receipt_prefix text not null`
- `next_invoice_number integer not null`
- `next_bill_number integer not null`
- `next_credit_note_number integer not null`
- `next_supplier_credit_number integer not null`
- `next_receipt_number integer not null`
- `updated_at timestamptz`

## Accounting Tables

All accounting rows include `business_id`, `created_at`, `updated_at`, and should be protected by RLS using `business_members`.

### `chart_accounts`

- `id uuid primary key`
- `business_id uuid not null`
- `code text not null`
- `name text not null`
- `class text not null` (`asset`, `liability`, `equity`, `revenue`, `expense`)
- `group_name text not null`
- `normal_balance text not null` (`debit`, `credit`)
- `is_contra boolean`
- unique `(business_id, code)`

### `payment_accounts`

Bank, cash, wallet, credit card, loan, and other payment accounts.

- `id uuid primary key`
- `business_id uuid not null`
- `name text not null`
- `type text not null`
- `init_balance numeric not null default 0`
- `icon text`
- `color text`
- `chart_account_id uuid not null references chart_accounts(id)`
- `archived_at timestamptz`

### `categories`

UI categories mapped to chart accounts.

- `id uuid primary key`
- `business_id uuid not null`
- `type text not null` (`income`, `expense`)
- `name text not null`
- `icon text`
- `color text`
- `chart_account_id uuid references chart_accounts(id)`
- `archived_at timestamptz`

### `contacts`

- `id uuid primary key`
- `business_id uuid not null`
- `type text not null` (`customer`, `supplier`, `both`)
- `name text not null`
- `abn text`
- `email text`
- `phone text`
- `address text`
- `payment_terms text not null`
- `archived_at timestamptz`

### `transactions`

Cash transactions, transfers, invoices, bills, credit notes, and supplier credits.

- `id uuid primary key`
- `business_id uuid not null`
- `type text not null` (`income`, `expense`, `transfer`)
- `entry_mode text` (`cash`, `invoice`, `credit_note`)
- `amount numeric not null`
- `payment_account_id uuid references payment_accounts(id)`
- `payment_account_to_id uuid references payment_accounts(id)`
- `category_id uuid references categories(id)`
- `chart_account_id uuid references chart_accounts(id)`
- `clearing_chart_account_id uuid references chart_accounts(id)`
- `contact_id uuid references contacts(id)`
- `party text`
- `date date not null`
- `due_date date`
- `note text`
- `gst_mode text` (`inc`, `exc`, `free`)
- `invoice_no text`
- `credit_note_no text`
- `payment_terms text`
- `doc_status text`
- `recurring_template_id uuid`
- `voided_at timestamptz`
- `voided_by uuid references profiles(id)`
- `void_reason text`

### `invoice_payments`

- `id uuid primary key`
- `business_id uuid not null`
- `transaction_id uuid not null references transactions(id)`
- `amount numeric not null`
- `date date not null`
- `payment_account_id uuid not null references payment_accounts(id)`
- `receipt_no text`
- `receipt_created_at timestamptz`
- `voided_at timestamptz`
- `voided_by uuid references profiles(id)`

### `credit_allocations`

- `id uuid primary key`
- `business_id uuid not null`
- `credit_note_id uuid not null references transactions(id)`
- `invoice_id uuid not null references transactions(id)`
- `amount numeric not null`
- `date date not null`
- `voided_at timestamptz`

### `manual_journals`

- `id uuid primary key`
- `business_id uuid not null`
- `date date not null`
- `memo text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz`
- `reversed_at timestamptz`
- `reversal_of uuid references manual_journals(id)`
- `voided_at timestamptz`

### `manual_journal_lines`

- `id uuid primary key`
- `business_id uuid not null`
- `manual_journal_id uuid not null references manual_journals(id)`
- `chart_account_id uuid not null references chart_accounts(id)`
- `debit numeric not null default 0`
- `credit numeric not null default 0`
- `line_order integer not null`

### `period_locks`

- `id uuid primary key`
- `business_id uuid not null`
- `locked_through date not null`
- `note text`
- `created_by uuid references profiles(id)`
- `created_at timestamptz not null`

### `bank_feed_items`

- `id uuid primary key`
- `business_id uuid not null`
- `payment_account_id uuid not null references payment_accounts(id)`
- `date date not null`
- `description text not null`
- `amount numeric not null`
- `reference text`
- `raw_hash text not null`
- `matched_source_id text`
- `imported_at timestamptz not null`
- `reconciled_at timestamptz`
- `ignored_at timestamptz`
- unique `(business_id, payment_account_id, raw_hash)`

### `bank_reconciliations`

- `id uuid primary key`
- `business_id uuid not null`
- `payment_account_id uuid not null references payment_accounts(id)`
- `statement_date date not null`
- `statement_balance numeric not null`
- `book_balance numeric not null`
- `difference numeric not null`
- `cleared_source_ids jsonb not null`
- `created_at timestamptz not null`
- `finalized_at timestamptz not null`
- `voided_at timestamptz`

### `audit_log`

Append-only operational trail.

- `id uuid primary key`
- `business_id uuid not null`
- `actor_user_id uuid references profiles(id)`
- `action text not null`
- `entity_type text not null`
- `entity_id text not null`
- `detail text not null`
- `created_at timestamptz not null`
- `metadata jsonb`

## Server Authority Rules

Server write paths must enforce these rules even if the client already checked them:

- Every accounting write must include `business_id` and verify the actor belongs to that business.
- Ordinary transactions cannot be zero or negative.
- `validateTransactionInput` runs before creating/updating transactions.
- `validatePaymentInput` runs before recording payments.
- `validateCreditAllocations` runs before applying credit notes.
- `isDateLocked` blocks writes dated on or before the locked-through date.
- Accounting documents are not physically deleted in commercial mode; use `voided_at`.
- Voids, transaction edits, unlocks, admin overrides, restore/import, payment records, credit allocations, journal writes, and reconciliation finalise/void must create audit log entries.
- Transaction edits that also record new payments should use the atomic update-with-payments RPC so transaction and payment writes cannot partially apply.
- Role capabilities are defined in `PERMISSIONS.md`. Keep API guards, tests, Web UI, and mobile UI aligned with that matrix.
- RLS must prevent cross-business reads and writes.

## API Write Paths

Initial backend functions/routes should be business-scoped:

- Done: `createBusiness`
- Done: `updateBusinessProfile`
- Done: `updateBusinessSettings`
- Done: `createTransaction`
- Later: `updateTransaction`
- Done: `voidTransaction`
- Done: `recordPayment`
- Done: `voidPayment`
- Done: `applyCreditAllocation`
- Done: `createManualJournal`
- Done: `updateManualJournal`
- Done: `voidManualJournal`
- Done: `reverseManualJournal`
- Done: `createPeriodLock`
- Done: `clearPeriodLocks`
- Done: `importBankFeed`
- Done: `matchBankFeedItem`
- Done: `ignoreBankFeedItem`
- Done: `finalizeBankReconciliation`
- Done: `voidBankReconciliation`
- Done: `exportLedgerBackup`
- Done: `restoreLedgerBackup`
- Done: `importLedgerData`
- Done: `resetLedgerData`

Current implementation note: the first API app now exposes a Supabase-backed ledger snapshot and server write paths for businesses, payment accounts, categories, contacts, transactions, payments, credit allocations, manual journals, bank feed items, bank reconciliations, backup/restore/import/reset, voids, reversals, period locks, and audited period unlock/clear. Remaining write paths should follow the same business-scoped route pattern and server-authoritative validation rules.

## Sync Strategy

MVP can start with snapshot sync per business:

- Client loads a full `LedgerData` projection for the selected business.
- Server stores normalized tables but can return a denormalized `LedgerData` shape for existing mobile/web screens.
- Writes go through server functions, then client refreshes the business snapshot.
- Later add incremental sync using `updated_at`, tombstones/void markers, and per-table cursors.

## Open Decisions Before Implementation

- Whether mobile remains fully offline-write capable in the first cloud version.
- Decided for current MVP: restore/import replaces the current business ledger data in place, preserves the server audit log, and records a restore/import audit entry. A separate imported workspace can be added later.
- Whether document numbers are allocated server-side only, or reserved client-side for offline drafts.
- Whether audit log can be hidden from non-admin users or visible read-only to all business members.
- Whether attachments/files are needed in the first backend release.
