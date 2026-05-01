-- Manual journal tables.
-- Scope: server-authoritative manual journal postings and reversal workflow.

create table if not exists public.manual_journals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  date date not null,
  memo text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  reversed_at timestamptz,
  reversal_of uuid references public.manual_journals(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text
);

create table if not exists public.manual_journal_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  manual_journal_id uuid not null references public.manual_journals(id) on delete cascade,
  chart_account_id uuid not null references public.chart_accounts(id),
  debit numeric not null default 0 check (debit >= 0),
  credit numeric not null default 0 check (credit >= 0),
  line_order integer not null,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists manual_journals_business_id_idx
  on public.manual_journals(business_id);

create index if not exists manual_journals_reversal_of_idx
  on public.manual_journals(reversal_of);

create index if not exists manual_journal_lines_business_id_idx
  on public.manual_journal_lines(business_id);

create index if not exists manual_journal_lines_manual_journal_id_idx
  on public.manual_journal_lines(manual_journal_id);

drop trigger if exists manual_journals_set_updated_at on public.manual_journals;
create trigger manual_journals_set_updated_at
before update on public.manual_journals
for each row execute function public.set_updated_at();

alter table public.manual_journals enable row level security;
alter table public.manual_journal_lines enable row level security;

drop policy if exists manual_journals_select_member on public.manual_journals;
create policy manual_journals_select_member
on public.manual_journals
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists manual_journal_lines_select_member on public.manual_journal_lines;
create policy manual_journal_lines_select_member
on public.manual_journal_lines
for select
to authenticated
using (public.is_business_member(business_id));
