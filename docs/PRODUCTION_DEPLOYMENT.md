# Production Deployment Runbook

Use this when creating the first trial deployment. Do not paste secret values into this file.

## Required Hosts

Record these in `docs/MVP_HARDENING.md` after deployment:

- Web host: `https://<web-host>`
- API host: `https://<api-host>`
- API health: `https://<api-host>/health`
- Supabase project: `zvcbnocynsxzyrvxcsbn` / `https://zvcbnocynsxzyrvxcsbn.supabase.co`

## API Host

Build command:

```bash
npm run build:api
```

Start command:

```bash
npm run start -w apps/api
```

Environment:

```bash
PORT=4010
HOST=0.0.0.0
SUPABASE_URL=https://zvcbnocynsxzyrvxcsbn.supabase.co
SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
API_CORS_ORIGIN=https://<web-host>
```

Rules:

- Keep `SUPABASE_SERVICE_ROLE_KEY` only on the API host.
- Set `API_CORS_ORIGIN` to the exact Web origin, with no trailing path.
- Configure the platform health check to `GET /health`.

## Web Host

Build command:

```bash
npm run build:web
```

Output directory:

```bash
apps/web/dist
```

Environment:

```bash
VITE_AUCTUS_API_URL=https://<api-host>
VITE_SUPABASE_URL=https://zvcbnocynsxzyrvxcsbn.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

Rules:

- Do not set `VITE_AUCTUS_DEV_EMAIL`.
- Do not set `VITE_AUCTUS_DEV_PASSWORD`.
- Do not set any service role key on the Web host.

## Supabase Auth

In the Supabase dashboard for project `zvcbnocynsxzyrvxcsbn`:

- Set Site URL to `https://<web-host>`.
- Add `https://<web-host>` to allowed redirect URLs.
- Add any required local development redirect URLs separately, if still needed.

## Verification

Run the normal local verification:

```bash
npm run build
npm run test -w apps/api
npx tsc -p apps/mobile/tsconfig.json --noEmit
npm run e2e
```

After production hosts exist, run:

```bash
AUCTUS_PRODUCTION_WEB_URL=https://<web-host> \
AUCTUS_PRODUCTION_API_URL=https://<api-host> \
AUCTUS_PRODUCTION_API_CORS_ORIGIN=https://<web-host> \
npm run audit:production
```

Expected result:

- No failures.
- `Production Web shell check passed` passes.
- `Production API CORS origin matches Web origin` passes.
- `Production API CORS preflight passed` passes.
- `Production API health check passed` passes.
- Any remaining warnings are reviewed before trial users are invited.

If Supabase CLI auth is available, `supabase migration list` should also pass in the audit. If the shell has no `SUPABASE_ACCESS_TOKEN`, verify migrations in the Supabase dashboard or by running `supabase migration list` after login.
