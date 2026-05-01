-- Audit log.
-- Scope: immutable business-scoped activity records for server-side accounting writes.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  detail text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_business_id_idx
  on public.audit_log(business_id);

create index if not exists audit_log_entity_idx
  on public.audit_log(business_id, entity_type, entity_id);

create index if not exists audit_log_created_at_idx
  on public.audit_log(created_at);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_member on public.audit_log;
create policy audit_log_select_member
on public.audit_log
for select
to authenticated
using (public.is_business_member(business_id));
