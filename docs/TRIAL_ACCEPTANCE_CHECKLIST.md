# Trial Acceptance Checklist

Use this before inviting trial users. Run these checks against production only:

- Web: `https://auctus-web.netlify.app`
- API: `https://auctus-api.vercel.app`
- Supabase project: `zvcbnocynsxzyrvxcsbn`

Do not use real customer data for this pass. Use a disposable workspace and remove it after verification.

## 1. Automated Gate

Run from the repo root:

```bash
npm run build
npm run test -w apps/api
npx tsc -p apps/mobile/tsconfig.json --noEmit
npm run e2e
npm run smoke:production
AUCTUS_PRODUCTION_WEB_URL=https://auctus-web.netlify.app AUCTUS_PRODUCTION_API_URL=https://auctus-api.vercel.app AUCTUS_PRODUCTION_API_CORS_ORIGIN=https://auctus-web.netlify.app npm run audit:production
```

Expected:

- All commands pass.
- `audit:production` has 0 failures.
- The only acceptable warning is local-only dev auto-login variables in `apps/web/.env.local`.

## 2. Owner/Admin Manual Pass

Use a real browser session with an owner or admin account.

- [ ] Sign in at `https://auctus-web.netlify.app`.
- [ ] Create a disposable workspace named `Trial Acceptance <date>`.
- [ ] Confirm Home loads and shows `NET WORTH`.
- [ ] Create a contact.
- [ ] Create an expense category in Settings > Manage Categories.
- [ ] Create a purchase transaction using that category.
- [ ] Confirm Activity shows the transaction.
- [ ] Download a backup from Settings and keep the file until this pass is complete.
- [ ] Reset Backend Ledger in Settings.
- [ ] Confirm the transaction/contact are gone after reset.
- [ ] Restore the downloaded backup.
- [ ] Confirm the transaction/contact return.
- [ ] Create a period lock through Settings.
- [ ] Try to create or edit a transaction inside the locked period and confirm the UI blocks it.
- [ ] Clear the period lock.
- [ ] Confirm Settings exposes backup, restore, reset, period lock, account controls, and category management only for owner/admin.

## 3. Bookkeeper Manual Pass

Use a bookkeeper membership in the same disposable workspace.

- [ ] Sign in and open the workspace.
- [ ] Confirm ordinary accounting screens load.
- [ ] Create a contact.
- [ ] Create a normal purchase or sale transaction.
- [ ] Confirm Activity updates.
- [ ] Confirm Settings does not show Download Backup, Restore Backup, Reset Backend Ledger, Period Lock, or business settings controls.
- [ ] Confirm account/category day-to-day controls match the current permission policy, while dangerous ledger/settings controls remain hidden.

## 4. Viewer Manual Pass

Use a viewer membership in the same disposable workspace.

- [ ] Sign in and open the workspace.
- [ ] Confirm Home, Activity, Reports, Contacts, and Accounts are readable.
- [ ] Confirm `New Transaction` is not available.
- [ ] Confirm Contacts does not show `Add Contact`.
- [ ] Confirm Accounts does not show write controls.
- [ ] Confirm Settings does not show backup, restore, reset, period lock, or business settings controls.
- [ ] Confirm a direct backup attempt returns 403 if tested through the API console or existing role-smoke script.

## 5. Production Control Plane

- [ ] Netlify production deploy is green for the latest `main` commit.
- [ ] Vercel production deploy is green for the latest `main` commit.
- [ ] `https://auctus-api.vercel.app/health` returns `{"ok":true,"service":"auctus-api"}`.
- [ ] Supabase Auth Site URL is `https://auctus-web.netlify.app`.
- [ ] Supabase Auth redirect URLs include `https://auctus-web.netlify.app` and `https://auctus-web.netlify.app/`.
- [ ] Netlify Web environment does not include `VITE_AUCTUS_DEV_EMAIL`, `VITE_AUCTUS_DEV_PASSWORD`, or any service role key.
- [ ] Vercel API environment includes `SUPABASE_SERVICE_ROLE_KEY` and exact `API_CORS_ORIGIN=https://auctus-web.netlify.app`.

## 6. Cleanup

- [ ] Delete the disposable workspace or temporary test rows from Supabase.
- [ ] Delete temporary auth users that were created only for acceptance.
- [ ] Remove downloaded backup files from shared/download folders after verification.
- [ ] Record the date, tester, production URLs, and result in `docs/PRE_TRIAL_PROGRESS.md`.
