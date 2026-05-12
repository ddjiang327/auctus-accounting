# Auctus Docs

Project notes and migration plans live here.

- `ACCOUNTING_DECISIONS.md`: current accounting/product rules and accountant/BAS review checklist.
- `BACKEND_SCHEMA_PLAN.md`: Supabase schema, authority rules, and backend boundaries.
- `DATA_MIGRATION_SEED_STRATEGY.md`: real-data migration, dev seed, demo workspace, and local/cloud data boundaries.
- `MIGRATION_PLAN.md`: migration progress and next work.
- `MVP_HARDENING.md`: pre-trial hardening, production environment, RLS audit, and deployment checklist.
- `PERMISSIONS.md`: owner/admin/bookkeeper/viewer capabilities aligned with API tests.
- `PRODUCTION_DEPLOYMENT.md`: production Web/API/Supabase Auth setup and post-deploy verification.

Useful commands:

- `npm run audit:pretrial`: local/target Supabase pre-trial audit.
- `npm run audit:production`: same audit with production URL checks enabled by `AUCTUS_PRODUCTION_*` env vars.
