-- Transaction foundation tables.
-- Scope: transactions, invoice payments, and credit allocations.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  entry_mode text check (entry_mode in ('cash', 'invoice', 'credit_note')),
  amount numeric not null check (amount > 0),
  payment_account_id uuid references public.payment_accounts(id),
  payment_account_to_id uuid references public.payment_accounts(id),
  category_id uuid references public.categories(id),
  chart_account_id uuid references public.chart_accounts(id),
  clearing_chart_account_id uuid references public.chart_accounts(id),
  contact_id uuid references public.contacts(id),
  party text,
  date date not null,
  due_date date,
  note text,
  gst_mode text check (gst_mode in ('inc', 'exc', 'free')),
  invoice_no text,
  credit_note_no text,
  payment_terms text check (payment_terms in ('due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60', 'custom')),
  doc_status text check (doc_status in ('draft', 'sent', 'viewed')),
  recurring_template_id uuid,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  amount numeric not null check (amount > 0),
  date date not null,
  payment_account_id uuid not null references public.payment_accounts(id),
  receipt_no text,
  receipt_created_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.credit_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  credit_note_id uuid not null references public.transactions(id) on delete cascade,
  invoice_id uuid not null references public.transactions(id) on delete cascade,
  amount numeric not null check (amount > 0),
  date date not null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists transactions_business_id_idx
  on public.transactions(business_id);

create index if not exists transactions_payment_account_id_idx
  on public.transactions(payment_account_id);

create index if not exists transactions_category_id_idx
  on public.transactions(category_id);

create index if not exists transactions_contact_id_idx
  on public.transactions(contact_id);

create index if not exists invoice_payments_business_id_idx
  on public.invoice_payments(business_id);

create index if not exists invoice_payments_transaction_id_idx
  on public.invoice_payments(transaction_id);

create index if not exists credit_allocations_business_id_idx
  on public.credit_allocations(business_id);

create index if not exists credit_allocations_credit_note_id_idx
  on public.credit_allocations(credit_note_id);

create index if not exists credit_allocations_invoice_id_idx
  on public.credit_allocations(invoice_id);

create unique index if not exists transactions_invoice_no_unique_idx
  on public.transactions(business_id, invoice_no)
  where invoice_no is not null;

create unique index if not exists transactions_credit_note_no_unique_idx
  on public.transactions(business_id, credit_note_no)
  where credit_note_no is not null;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

drop trigger if exists invoice_payments_set_updated_at on public.invoice_payments;
create trigger invoice_payments_set_updated_at
before update on public.invoice_payments
for each row execute function public.set_updated_at();

drop trigger if exists credit_allocations_set_updated_at on public.credit_allocations;
create trigger credit_allocations_set_updated_at
before update on public.credit_allocations
for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.credit_allocations enable row level security;

drop policy if exists transactions_select_member on public.transactions;
create policy transactions_select_member
on public.transactions
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists invoice_payments_select_member on public.invoice_payments;
create policy invoice_payments_select_member
on public.invoice_payments
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists credit_allocations_select_member on public.credit_allocations;
create policy credit_allocations_select_member
on public.credit_allocations
for select
to authenticated
using (public.is_business_member(business_id));
