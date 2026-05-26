# Inventory & Payroll — Roadmap

## Architecture Decision: Extend, Not Rewrite

The existing `accounting-core` architecture is sound and does not need to be rewritten.

**Why it works as-is:**
- All reports derive from `allJournalEntries()` — adding new journal entry sources automatically flows into Trial Balance, P&L, and financial position
- Pure functions, immutable data — safe to extend without breaking existing behaviour
- `LedgerData` is the single source of truth — new entity arrays can be added without touching existing fields

**What changes:**
- `shared-types` — new interfaces added (existing interfaces untouched)
- `accounting-core` — two new modules added (`inventory.ts`, `payroll.ts`)
- `posting.ts` — two lines added to `allJournalEntries()` to include new entry types
- Default chart of accounts — new accounts added for inventory and payroll

---

## Inventory

### New data types (`shared-types`)

```ts
Product           // name, SKU, unit price, cost price, unit of measure
InventoryItem     // productId, quantity, avgCost (current stock state)
InventoryMovement // productId, qty, unitCost, type (purchase/sale/adjustment), sourceId
```

Added to `LedgerData` as new arrays alongside existing fields.

### New module: `inventory.ts`

Valuation method: **AVCO (Weighted Average Cost)**
- Simpler to implement than FIFO, suitable for MVP
- avgCost recalculates on each purchase

Journal entries generated:

| Event | Debit | Credit |
|-------|-------|--------|
| Purchase stock | Inventory Asset | Accounts Payable |
| Sell stock | Cost of Goods Sold | Inventory Asset |
| Stock adjustment (up) | Inventory Asset | Inventory Adjustment |
| Stock adjustment (down) | Inventory Adjustment | Inventory Asset |

### New chart of accounts

```
1300  Inventory Asset          (asset)
5100  Cost of Goods Sold       (expense)
```

### UI features

- Product catalogue — create and manage products with cost and sell prices
- Invoice / bill line items — select products, auto-fill price, auto-generate COGS entry on sale
- Inventory valuation report — current stock quantities and total value
- Stock take — adjust quantities to match physical count

### Implementation phases

**Phase 1 (2–3 weeks):** Product management, invoice line items, AVCO valuation, inventory valuation report

**Phase 2:** Stock take workflow, low-stock alerts, purchase order tracking

---

## Payroll

### New data types (`shared-types`)

```ts
Employee       // name, TFN, super fund, pay type (salary/hourly), pay rate
PayRun         // period start/end, status (draft/finalised), paySlips[]
PaySlip        // employeeId, gross, paygWithheld, superAmount, netPay, leave entries
LeaveBalance   // employeeId, annualLeave, sickLeave (hours)
```

Added to `LedgerData` as new arrays.

### New module: `payroll.ts`

**`calculatePaySlip(employee, gross)`**
- PAYG withholding based on ATO tax tables (weekly/fortnightly/monthly scale-up)
- Superannuation: 11.5% of ordinary time earnings (rate is legislated and changes annually)
- Net pay = gross − PAYG − any voluntary deductions

**`payRunJournalEntries(payRun, data)`**

Journal entries generated per pay run:

| Debit | Credit |
|-------|--------|
| Wages & Salaries Expense | PAYG Withholding Liability |
| Superannuation Expense | Superannuation Payable |
| — | Bank (net pay to employees) |

Liabilities are cleared when remittances are made to ATO and the super fund.

### New chart of accounts

```
6100  Wages & Salaries         (expense)
6110  Superannuation Expense   (expense)
2200  PAYG Withholding         (liability)
2210  Superannuation Payable   (liability)
```

### Compliance considerations (Australia)

| Requirement | Complexity | Notes |
|-------------|-----------|-------|
| PAYG tax tables | Medium | ATO publishes NAT 1008 tables; must update when rates change |
| Super rate changes | Low | Legislated increases — update constant each financial year |
| STP (Single Touch Payroll) | High | Requires real-time reporting to ATO per pay event; needs third-party STP gateway integration (e.g. KeyPay, Xero STP) |
| Leave accrual | Medium | Annual leave accrues at 4 weeks/year; sick leave at 10 days/year under Fair Work Act |

### Implementation phases

**Phase 1 — Basic payroll (3–4 weeks):**
- Employee records
- Manual pay run (enter gross, system calculates PAYG and super)
- Pay run journal entries auto-generated
- Pay slip PDF export

**Phase 2 — Compliance:**
- ATO PAYG tax table integration
- Leave accrual tracking
- Superannuation remittance workflow

**Phase 3 — STP (separate project):**
- Integrate third-party STP gateway
- Real-time pay event reporting to ATO
- Year-end payment summaries

---

## Summary

| Feature | Approach | Estimated Effort |
|---------|---------|-----------------|
| Inventory (Phase 1) | Extend `accounting-core` + new UI | 2–3 weeks |
| Payroll basics | Extend `accounting-core` + new UI | 3–4 weeks |
| Payroll compliance (STP) | Third-party integration | Separate project |

Start with Inventory Phase 1 — it is self-contained and delivers immediate value.
Payroll basics can follow without blocking on STP compliance.
