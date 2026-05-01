# Accounting Decisions

These decisions define the current accounting/product rules for Auctus. Update this file when a rule changes.

## BAS And GST

### BAS Basis

Decision: support both cash basis and accrual basis.

- Cash basis: GST is reported when payment is received or made.
- Accrual basis: GST is reported when invoice or bill is issued.
- MVP default assumption: cash basis unless business settings specify otherwise.

Implementation note: `basReport` supports both cash and accrual basis using `settings.basBasis`.

### GST Registration

Decision: support both GST-registered and non-GST-registered businesses.

- If GST is enabled, transaction `gstMode` is used.
- If GST is disabled, all GST calculation is treated as zero even if a transaction has `gstMode`.
- Non-GST businesses should treat the transaction amount as the full net/business amount.

## Credit Notes

Decision:

- Allow partial allocation.
- Allow one credit note to be allocated to multiple invoices.
- Voided credit note allocations become invalid.
- Do not allow allocation above the credit note remaining balance.
- Do not allow allocation above the invoice outstanding balance.

Implementation note: balance calculation ignores voided credit notes. `validateCreditAllocations` enforces allocation limits.

## Transfers

Decision:

- Moving money between ordinary bank, cash, and credit card accounts is a transfer.
- Transfers do not affect income, expense, or GST.
- Credit card repayment is a transfer.
- Owner contribution and drawings are not ordinary transfers.
- Owner contribution/drawings should be handled later through a dedicated workflow or manual journal.

## Posting Rules

### Income Invoice

Decision:

- Dr Accounts Receivable.
- Cr Revenue.
- Cr GST Collected, if GST applies.

### Expense Bill

Decision:

- Dr Expense.
- Dr GST Paid, if GST applies.
- Cr Accounts Payable.

### Cash Income

Decision:

- Dr Bank/Cash.
- Cr Revenue.
- Cr GST Collected, if GST applies.

### Cash Expense

Decision:

- Dr Expense.
- Dr GST Paid, if GST applies.
- Cr Bank/Cash.

### Customer Credit Note

Decision:

- Dr Revenue.
- Dr GST Collected, if GST applies.
- Cr Accounts Receivable.

### Supplier Credit

Decision:

- Dr Accounts Payable.
- Cr Expense.
- Cr GST Paid, if GST applies.

## Voids And Deletion

Decision:

- Commercial accounting documents are not physically deleted.
- Use voiding instead of deletion.
- Voiding must write an audit log entry.
- Locked-period documents cannot be voided unless there is admin override or a reversal journal workflow.

Implementation note: current logic excludes voided transactions from posting, BAS, balances, and reports. The first API write paths now enforce audit and locked-period rules for transaction, payment, and credit-allocation voids.

## Locked Periods

Decision:

- Default behavior: transactions and accounting documents dated on or before the locked-through date cannot be added, edited, or voided.
- Owner/admin can unlock a period, but this must write an audit log entry.
- Later versions should support reversal workflows.

Implementation note: current core has date-lock helper functions. Mobile now blocks locked-period transaction edits, document status changes, manual journal changes, bank reconciliation finalise/void, and bank-feed clearing. The first API write paths now enforce locked periods for transactions, payments, credit allocations, and voids. Backend period-lock clearing is owner/admin only and uses a database RPC so the unlock and audit entry are committed atomically.

## Opening Balances

Decision:

- MVP supports opening balances for bank, cash, and credit card/payment accounts.
- AR/AP opening balances are deferred.
- Inventory opening balances are deferred until the inventory module.

Implementation note: current opening balance logic posts payment account `initBalance` to Opening Balance Equity.

## Rounding

Decision:

- MVP rounds GST at the transaction total level.
- When invoice line items are added, move toward line-level calculation plus invoice-level reconciliation.

Implementation note: current `gstSplit` rounds each transaction split to 2 decimal places.

## Negative Amounts

Decision:

- Ordinary transaction amounts cannot be negative.
- Refunds and credits should use credit note or refund workflows.
- Corrections should use void, reversal, or manual journal workflows.

Implementation note: `validateTransactionInput` rejects negative and zero ordinary transaction amounts. The first API transaction write path now enforces this server-side.

## Bank Reconciliation

Decision:

- Bank feed matching only marks an item as matched.
- Reconciliation finalise is what makes ledger rows cleared.
- Ignored bank feed items are retained.
- Ignored bank feed items should be reversible through unignore.

Implementation note: current reconciliation logic excludes rows whose source ids are in finalised reconciliation `clearedSourceIds`.

Backend implementation note: bank feed and bank reconciliation write paths now enforce role checks, locked-period checks for finalise/void, server-side cleared-source validation, zero-difference finalisation, and audit entries. `matched_source_id` is stored as text because ledger source ids can include generated opening-balance ids as well as UUID-backed transactions and payments.

## Backup, Restore, Reset, And Import

Decision:

- Backup export returns the denormalized `LedgerData` snapshot inside an `auctus-ledger-backup` envelope.
- Restore/import replaces the current business ledger data in place for the MVP.
- Server audit log is preserved during restore/import/reset and receives a new audit entry for each operation.
- Imported ledger IDs are rebuilt as Supabase UUIDs, with related accounts, categories, transactions, payments, journals, bank feed matches, opening-balance ids, and reconciliation source ids remapped.
- Only owner/admin users can export, restore/import, or reset backend business data.

## Pending Product/Accounting Work

- Done: add mobile UI for `settings.basBasis`.
- Done: add API write-path validation for locked periods on current backend write paths.
- Done: add audit-log enforcement for current void, payment, credit allocation, contact, period lock, and business profile/settings write paths.
- Done: add API audit and ownership validation for payment account and category management.
- Done: add API validation and audit enforcement for bank feed import/matching/ignore and bank reconciliation finalise/void.
- Done: add owner/admin backup/restore, reset/import backend workflows with audit entries.
- Done: add owner/admin audited period-lock clear/unlock backend workflow.
- Continue API write-path validation as new backend features are added, especially admin overrides.
