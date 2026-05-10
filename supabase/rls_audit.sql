-- Supabase RLS / role audit for the target project.
-- Run in the Supabase SQL editor or through psql after migrations are pushed.

-- 1. Every public table should have RLS enabled unless it is intentionally
--    public/static.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2. Inspect all policies. For the current MVP, business-scoped accounting
--    tables should expose member read policies only; writes should go through
--    the API service-role path.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Highlight policies that still allow direct authenticated writes.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and roles::text like '%authenticated%'
order by tablename, policyname;

-- 4. Confirm the expected authenticated direct write surface after
--    20260507010000_harden_direct_workspace_writes.sql:
--    profiles_update_self may remain; workspace/accounting writes should not.
