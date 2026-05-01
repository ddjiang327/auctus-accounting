-- Accounting foundation tables.
-- Scope: chart accounts, payment accounts, categories, and contacts.

create table if not exists public.chart_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  class text not null check (class in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  group_name text not null,
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  is_contra boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, code)
);

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'ewallet', 'credit', 'investment', 'loan', 'other')),
  init_balance numeric not null default 0,
  icon text not null default '',
  color text not null default '#8E8E93',
  chart_account_id uuid not null references public.chart_accounts(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null,
  icon text not null default '',
  color text not null default '#8E8E93',
  chart_account_id uuid references public.chart_accounts(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, type, name)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('customer', 'supplier', 'both')),
  name text not null,
  abn text,
  email text,
  phone text,
  address text,
  payment_terms text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists chart_accounts_business_id_idx
  on public.chart_accounts(business_id);

create index if not exists payment_accounts_business_id_idx
  on public.payment_accounts(business_id);

create index if not exists payment_accounts_chart_account_id_idx
  on public.payment_accounts(chart_account_id);

create index if not exists categories_business_id_idx
  on public.categories(business_id);

create index if not exists categories_chart_account_id_idx
  on public.categories(chart_account_id);

create index if not exists contacts_business_id_idx
  on public.contacts(business_id);

drop trigger if exists chart_accounts_set_updated_at on public.chart_accounts;
create trigger chart_accounts_set_updated_at
before update on public.chart_accounts
for each row execute function public.set_updated_at();

drop trigger if exists payment_accounts_set_updated_at on public.payment_accounts;
create trigger payment_accounts_set_updated_at
before update on public.payment_accounts
for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

alter table public.chart_accounts enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.categories enable row level security;
alter table public.contacts enable row level security;

drop policy if exists chart_accounts_select_member on public.chart_accounts;
create policy chart_accounts_select_member
on public.chart_accounts
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists payment_accounts_select_member on public.payment_accounts;
create policy payment_accounts_select_member
on public.payment_accounts
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists categories_select_member on public.categories;
create policy categories_select_member
on public.categories
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists contacts_select_member on public.contacts;
create policy contacts_select_member
on public.contacts
for select
to authenticated
using (public.is_business_member(business_id));
