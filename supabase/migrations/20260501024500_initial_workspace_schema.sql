-- Initial Auctus workspace schema.
-- Scope: auth profiles, business workspaces, membership, settings, and first RLS boundary.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abn text,
  email text,
  phone text,
  address text,
  logo_uri text,
  logo_text text,
  payment_instructions text,
  invoice_footer text,
  currency text not null default 'AUD',
  locale text not null default 'en-AU',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'bookkeeper', 'viewer')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table if not exists public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  gst_enabled boolean not null default true,
  gst_rate numeric not null default 0.10,
  bas_basis text not null default 'cash' check (bas_basis in ('cash', 'accrual')),
  invoice_prefix text not null default 'INV-',
  bill_prefix text not null default 'BILL-',
  credit_note_prefix text not null default 'CN-',
  supplier_credit_prefix text not null default 'SCN-',
  receipt_prefix text not null default 'RCT-',
  next_invoice_number integer not null default 1 check (next_invoice_number > 0),
  next_bill_number integer not null default 1 check (next_bill_number > 0),
  next_credit_note_number integer not null default 1 check (next_credit_note_number > 0),
  next_supplier_credit_number integer not null default 1 check (next_supplier_credit_number > 0),
  next_receipt_number integer not null default 1 check (next_receipt_number > 0),
  updated_at timestamptz
);

create index if not exists business_members_user_id_idx
  on public.business_members(user_id);

create index if not exists business_members_business_id_idx
  on public.business_members(business_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

drop trigger if exists business_settings_set_updated_at on public.business_settings;
create trigger business_settings_set_updated_at
before update on public.business_settings
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_business_role(target_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select bm.role
  from public.business_members bm
  where bm.business_id = target_business_id
    and bm.user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_business_role(target_business_id) is not null
$$;

create or replace function public.can_manage_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_business_role(target_business_id) in ('owner', 'admin')
$$;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_settings enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists businesses_select_member on public.businesses;
create policy businesses_select_member
on public.businesses
for select
to authenticated
using (public.is_business_member(id));

drop policy if exists businesses_update_admin on public.businesses;
create policy businesses_update_admin
on public.businesses
for update
to authenticated
using (public.can_manage_business(id))
with check (public.can_manage_business(id));

drop policy if exists business_members_select_member on public.business_members;
create policy business_members_select_member
on public.business_members
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists business_members_insert_admin on public.business_members;
create policy business_members_insert_admin
on public.business_members
for insert
to authenticated
with check (public.can_manage_business(business_id));

drop policy if exists business_members_update_admin on public.business_members;
create policy business_members_update_admin
on public.business_members
for update
to authenticated
using (public.can_manage_business(business_id))
with check (public.can_manage_business(business_id));

drop policy if exists business_members_delete_admin on public.business_members;
create policy business_members_delete_admin
on public.business_members
for delete
to authenticated
using (public.can_manage_business(business_id));

drop policy if exists business_settings_select_member on public.business_settings;
create policy business_settings_select_member
on public.business_settings
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists business_settings_insert_admin on public.business_settings;
create policy business_settings_insert_admin
on public.business_settings
for insert
to authenticated
with check (public.can_manage_business(business_id));

drop policy if exists business_settings_update_admin on public.business_settings;
create policy business_settings_update_admin
on public.business_settings
for update
to authenticated
using (public.can_manage_business(business_id))
with check (public.can_manage_business(business_id));
