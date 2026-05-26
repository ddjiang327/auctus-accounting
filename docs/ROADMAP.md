# Auctus Accounting — Product Roadmap

## Planned Features

| Feature | Document | Status |
|---------|---------|--------|
| AI Natural Language Entry | [AI_NATURAL_LANGUAGE_ROADMAP.md](./AI_NATURAL_LANGUAGE_ROADMAP.md) | Planned |
| Inventory Management | [INVENTORY_PAYROLL_ROADMAP.md](./INVENTORY_PAYROLL_ROADMAP.md) | Planned |
| Payroll | [INVENTORY_PAYROLL_ROADMAP.md](./INVENTORY_PAYROLL_ROADMAP.md) | Planned |

## Suggested Build Order

```
1. AI Natural Language Entry — Phase 1 (Web)
   ↓ delivers immediate UX value, small scope

2. Inventory — Phase 1
   ↓ self-contained, no compliance risk

3. AI Natural Language Entry — Phase 2 (Mobile voice)
   ↓ extends existing AI work to mobile

4. Payroll — Phase 1 (Basic)
   ↓ high demand feature, manageable scope

5. Inventory — Phase 2 (Stock take, alerts)

6. Payroll — Phase 2 (Compliance, leave accrual)

7. Payroll — Phase 3 (STP — separate project)
```

## Architecture Principle

All features extend the existing `accounting-core` package — no rewrites.
New journal entry types flow automatically into all existing reports (Trial Balance, P&L, Balance Sheet).
