# Auctus Accounting — Product Roadmap

## Planned Features

| Feature | Document | Status |
|---------|---------|--------|
| AI Natural Language Entry | [AI_NATURAL_LANGUAGE_ROADMAP.md](./AI_NATURAL_LANGUAGE_ROADMAP.md) | Planned |
| Inventory Management | [INVENTORY_PAYROLL_ROADMAP.md](./INVENTORY_PAYROLL_ROADMAP.md) | In progress |
| Payroll | [INVENTORY_PAYROLL_ROADMAP.md](./INVENTORY_PAYROLL_ROADMAP.md) | In progress |

## Next Engineering Pass

- Move Mobile cloud writes from owner/admin full-ledger restore saves to per-action API write endpoints so bookkeepers can safely write from mobile.
- Keep old inventory/payroll module-state replacement endpoints as compatibility/recovery paths only.
- Keep production smoke/role acceptance cleanup strict so temporary production users and workspaces cannot fail silently.

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

## Recently Completed

- Dedicated cloud E2E coverage for inventory/payroll granular API flows.
- Real Supabase inventory/payroll API, UI, backup/reset/restore, and production smoke coverage after project resume.
- Production role acceptance covering owner/admin management access, bookkeeper day-to-day writes, and viewer read-only behavior.

### Reference

Proven model used by Obsidian and Logseq: local free, cloud sync paid.
