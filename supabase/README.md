# Supabase

This directory contains database migrations for the Auctus backend.

The first migration creates:

- `profiles`
- `businesses`
- `business_members`
- `business_settings`
- first RLS policies for workspace isolation and owner/admin settings writes

Apply migrations with the Supabase CLI once the project is linked:

```bash
supabase link --project-ref zvcbnocynsxzyrvxcsbn
supabase db push
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only in `apps/api/.env.local`.
