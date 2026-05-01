-- Bank feed and bank reconciliation tables.

create table if not exists public.bank_feed_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  payment_account_id uuid not null references public.payment_accounts(id),
  date date not null,
  description text not null,
  amount numeric not null,
  reference text,
  raw_hash text not null,
  matched_source_id text,
  imported_at timestamptz not null default now(),
  reconciled_at timestamptz,
  ignored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, payment_account_id, raw_hash)
);

create table if not exists public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  payment_account_id uuid not null references public.payment_accounts(id),
  statement_date date not null,
  statement_balance numeric not null,
  book_balance numeric not null,
  difference numeric not null,
  cleared_source_ids jsonb not null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id)
);

create index if not exists bank_feed_items_business_id_idx
  on public.bank_feed_items(business_id);

create index if not exists bank_feed_items_payment_account_id_idx
  on public.bank_feed_items(payment_account_id);

create index if not exists bank_feed_items_raw_hash_idx
  on public.bank_feed_items(business_id, payment_account_id, raw_hash);

create index if not exists bank_reconciliations_business_id_idx
  on public.bank_reconciliations(business_id);

create index if not exists bank_reconciliations_payment_account_id_idx
  on public.bank_reconciliations(payment_account_id);

drop trigger if exists bank_feed_items_set_updated_at on public.bank_feed_items;
create trigger bank_feed_items_set_updated_at
before update on public.bank_feed_items
for each row execute function public.set_updated_at();

alter table public.bank_feed_items enable row level security;
alter table public.bank_reconciliations enable row level security;

drop policy if exists bank_feed_items_select_member on public.bank_feed_items;
create policy bank_feed_items_select_member
on public.bank_feed_items
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists bank_reconciliations_select_member on public.bank_reconciliations;
create policy bank_reconciliations_select_member
on public.bank_reconciliations
for select
to authenticated
using (public.is_business_member(business_id));
