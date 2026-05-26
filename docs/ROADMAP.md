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

---

## Deployment Strategy: Dual Mode

Two modes targeting different user groups.

| | Local Mode | Cloud Mode |
|--|-----------|-----------|
| **Target users** | Developers, self-hosters, privacy-conscious users | Small business owners |
| **Data storage** | Device local / export as JSON file | Supabase |
| **AI features** | Online API call, ledger data never uploaded | Online API call |
| **Multi-device** | Manual import / export | Auto sync |
| **Pricing** | Free | Paid |

### Local Mode

- Data lives entirely on-device (web: IndexedDB; mobile: `expo-secure-store`)
- Full accounting features available offline
- AI natural language entry works — only the user's text input is sent to the AI, not the ledger
- Export / import via JSON file for backup or device migration
- No account required

### Cloud Mode

- Current architecture — Supabase backend, account required
- Adds multi-device sync, automatic backup, and future collaboration features
- Monetisation target

### Reference

Proven model used by Obsidian and Logseq: local free, cloud sync paid.
