# Auctus API

Backend API for Auctus. This app will own Supabase-backed server write paths, business/workspace permissions, audit-sensitive workflows, and server-side accounting validation.

Before implementing the API, read:

- `../../docs/BACKEND_SCHEMA_PLAN.md`
- `../../docs/ACCOUNTING_DECISIONS.md`
- `../../docs/MIGRATION_PLAN.md`

The backend must treat `@auctus/accounting-core` as the server-side accounting validation source for transaction, payment, credit allocation, locked-period, posting, BAS, reconciliation, and audit-sensitive workflows.

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in the Supabase project URL, anon key, and service role key.
3. Run from the repo root:

```bash
npm run dev:api
```

The first skeleton routes are:

- `GET /health`
- `GET /v1/businesses` lists business workspaces for the authenticated user.
- `POST /v1/businesses` creates a business workspace, owner membership, and default settings for the authenticated user.
- `GET /v1/businesses/:businessId/ledger` returns the first backend `LedgerData` snapshot shape for an authenticated business member.

Example:

```bash
curl http://127.0.0.1:4010/v1/businesses \
  -H "authorization: Bearer <supabase-access-token>"

curl -X POST http://127.0.0.1:4010/v1/businesses \
  -H "authorization: Bearer <supabase-access-token>" \
  -H "content-type: application/json" \
  -d '{"name":"Example Business"}'

curl http://127.0.0.1:4010/v1/businesses/<business-id>/ledger \
  -H "authorization: Bearer <supabase-access-token>"
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to mobile or web clients. It is server-only.

## Production Notes

Set `HOST=0.0.0.0` on the API host unless the platform injects its own bind address. Set `API_CORS_ORIGIN` to the exact production web origin.

Required API environment:

```bash
PORT=4010
HOST=0.0.0.0
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
API_CORS_ORIGIN=https://<web-host>
```

Build and start:

```bash
npm run build -w apps/api
npm run start -w apps/api
```

Use `GET /health` as the deployment health check.
