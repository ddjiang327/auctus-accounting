-- Period locks.
-- Scope: immutable business-scoped accounting period close records.

create table if not exists public.period_locks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  locked_through date not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists period_locks_business_id_idx
  on public.period_locks(business_id);

create index if not exists period_locks_locked_through_idx
  on public.period_locks(business_id, locked_through);

alter table public.period_locks enable row level security;

drop policy if exists period_locks_select_member on public.period_locks;
create policy period_locks_select_member
on public.period_locks
for select
to authenticated
using (public.is_business_member(business_id));
