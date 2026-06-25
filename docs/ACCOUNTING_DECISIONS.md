# Accounting Decisions

These decisions define the current accounting/product rules for Auctus. Update this file when a rule changes.

## BAS And GST

### BAS Basis

Decision: support both cash basis and accrual basis.

- Cash basis: GST is reported when payment is received or made.
- Accrual basis: GST is reported when invoice or bill is issued.
- MVP default assumption: cash basis unless business settings specify otherwise.

Implementation note: `basReport` supports both cash and accrual basis using `settings.basBasis`. Cash-basis invoice payments and credit-note allocations are treated as gross settlement amounts, including for GST-exclusive source documents.

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

Implementation note: balance calculation ignores voided credit notes. `validateCreditAllocations` enforces allocation limits. Cash-basis BAS reports credit notes on allocation date; accrual-basis BAS reports them on credit note date.

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

Implementation note: current core has date-lock helper functions. Mobile now blocks locked-period transaction edits, document status changes, manual journal changes, bank reconciliation finalise/void, and bank-feed clearing. The first API write paths now enforce locked periods for transactions, payments, credit allocations, and voids. Backend transaction edits support nullable field clearing for type changes and can atomically update a transaction with newly recorded payments through a database RPC. Backend period-lock clearing is owner/admin only and uses a database RPC so the unlock and audit entry are committed atomically.

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

## Mobile Cloud Sync

Decision:

- Mobile remains local-first when cloud API configuration is absent.
- When cloud API is configured, users sign in, choose a business, load the server ledger, save changes locally, and push the full ledger snapshot back to the server.
- MVP mobile cloud sync does not attempt multi-device offline conflict merging. Last successful save wins until a proper conflict model is designed.

Implementation note: current mobile cloud mode loads `/ledger` after login/workspace selection and debounces full-ledger saves through the existing restore endpoint.

## Accountant / BAS Review Checklist

Use this list for review with an accountant or BAS agent before treating the rules as production-ready accounting guidance.

- [ ] BAS cash-basis date rule: confirm GST should be included by payment date for partial payments, split payments, voided payments, and credit note allocations.
- [ ] BAS accrual-basis date rule: confirm GST should be included by invoice/bill issue date, and confirm how draft, sent, viewed, voided, and credit-note documents should affect BAS timing.
- [ ] Credit note allocation: confirm customer credit notes and supplier credits reduce GST/revenue/expense at the credit note date, allocation date, original invoice date, or another date for BAS and reporting.
- [ ] Opening balance signs: confirm positive and negative opening balances for bank, cash, credit card, loan, and other payment accounts post with the expected debit/credit sign against Opening Balance Equity.
- [ ] GST-disabled behavior: confirm non-GST-registered businesses should treat all transaction amounts as full net/business amounts, ignore stored `gstMode`, and show zero BAS/GST even for imported historical data.
- [ ] Owner contribution/drawings: confirm whether MVP should keep these out of ordinary transfers and handle them through manual journals, or add dedicated owner contribution/drawings workflows with equity postings.
- [ ] Refund and overpayment workflow: confirm target product/accounting flow for customer refunds, supplier refunds, overpayments, unapplied credits, and whether negative ordinary transactions must remain blocked.

## Pending Product/Accounting Work

- Done: add mobile UI for `settings.basBasis`.
- Done: add API write-path validation for locked periods on current backend write paths.
- Done: add audit-log enforcement for current void, payment, credit allocation, contact, period lock, and business profile/settings write paths.
- Done: add API audit and ownership validation for payment account and category management.
- Done: add API validation and audit enforcement for bank feed import/matching/ignore and bank reconciliation finalise/void.
- Done: add owner/admin backup/restore, reset/import backend workflows with audit entries.
- Done: add owner/admin audited period-lock clear/unlock backend workflow.
- Done: add backend transaction edit/update with nullable field clearing and atomic update-with-new-payments workflow.
- Continue API write-path validation as new backend features are added, especially admin overrides.
