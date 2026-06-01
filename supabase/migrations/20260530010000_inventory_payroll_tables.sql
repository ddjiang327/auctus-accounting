-- Inventory and payroll module tables.
-- Server writes remain API-owned; authenticated clients get member-scoped reads only.

create table if not exists public.products (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sku text,
  unit_of_measure text,
  cost_price numeric not null default 0 check (cost_price >= 0),
  sell_price numeric not null default 0 check (sell_price >= 0),
  reorder_point numeric check (reorder_point >= 0),
  inventory_chart_account_id uuid references public.chart_accounts(id),
  cogs_chart_account_id uuid references public.chart_accounts(id),
  revenue_chart_account_id uuid references public.chart_accounts(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.inventory_movements (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  date date not null,
  type text not null check (type in ('purchase', 'sale', 'adjustment')),
  quantity numeric not null,
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  memo text,
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.purchase_orders (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  date date not null,
  expected_date date,
  supplier_id uuid references public.contacts(id),
  supplier_name text,
  status text not null check (status in ('draft', 'sent', 'received', 'cancelled')),
  memo text,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.purchase_order_lines (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_order_id text not null references public.purchase_orders(id) on delete cascade,
  product_id text not null references public.products(id),
  ordered_qty numeric not null default 0 check (ordered_qty >= 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  received_qty numeric not null default 0 check (received_qty >= 0),
  line_order integer not null default 0
);

create table if not exists public.employees (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  pay_type text not null check (pay_type in ('salary', 'hourly')),
  pay_rate numeric not null default 0 check (pay_rate >= 0),
  pay_frequency text not null check (pay_frequency in ('weekly', 'fortnightly', 'monthly')),
  tax_free_threshold boolean not null default true,
  super_fund_name text,
  tfn text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.pay_runs (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  pay_account_id uuid references public.payment_accounts(id),
  status text not null check (status in ('draft', 'finalised')),
  created_at timestamptz not null default now(),
  finalised_at timestamptz,
  voided_at timestamptz,
  updated_at timestamptz
);

create table if not exists public.pay_slips (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  pay_run_id text not null references public.pay_runs(id) on delete cascade,
  employee_id text not null references public.employees(id),
  gross numeric not null default 0 check (gross >= 0),
  payg_withheld numeric not null default 0 check (payg_withheld >= 0),
  super_amount numeric not null default 0 check (super_amount >= 0),
  net_pay numeric not null default 0 check (net_pay >= 0),
  hours numeric check (hours >= 0),
  line_order integer not null default 0
);

create table if not exists public.remittances (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  date date not null,
  type text not null check (type in ('payg', 'super')),
  amount numeric not null default 0 check (amount > 0),
  pay_account_id uuid references public.payment_accounts(id),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.stp_submissions (
  id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  pay_run_id text not null references public.pay_runs(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  status text not null check (status in ('submitted', 'accepted', 'rejected')),
  reference_number text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists products_business_id_idx on public.products(business_id);
create index if not exists inventory_movements_business_id_idx on public.inventory_movements(business_id);
create index if not exists inventory_movements_product_id_idx on public.inventory_movements(product_id);
create index if not exists purchase_orders_business_id_idx on public.purchase_orders(business_id);
create index if not exists purchase_order_lines_po_id_idx on public.purchase_order_lines(purchase_order_id);
create index if not exists employees_business_id_idx on public.employees(business_id);
create index if not exists pay_runs_business_id_idx on public.pay_runs(business_id);
create index if not exists pay_slips_pay_run_id_idx on public.pay_slips(pay_run_id);
create index if not exists remittances_business_id_idx on public.remittances(business_id);
create index if not exists stp_submissions_business_id_idx on public.stp_submissions(business_id);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists inventory_movements_set_updated_at on public.inventory_movements;
create trigger inventory_movements_set_updated_at before update on public.inventory_movements for each row execute function public.set_updated_at();
drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();
drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at before update on public.employees for each row execute function public.set_updated_at();
drop trigger if exists pay_runs_set_updated_at on public.pay_runs;
create trigger pay_runs_set_updated_at before update on public.pay_runs for each row execute function public.set_updated_at();
drop trigger if exists remittances_set_updated_at on public.remittances;
create trigger remittances_set_updated_at before update on public.remittances for each row execute function public.set_updated_at();
drop trigger if exists stp_submissions_set_updated_at on public.stp_submissions;
create trigger stp_submissions_set_updated_at before update on public.stp_submissions for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.employees enable row level security;
alter table public.pay_runs enable row level security;
alter table public.pay_slips enable row level security;
alter table public.remittances enable row level security;
alter table public.stp_submissions enable row level security;

drop policy if exists products_select_member on public.products;
create policy products_select_member on public.products for select to authenticated using (public.is_business_member(business_id));
drop policy if exists inventory_movements_select_member on public.inventory_movements;
create policy inventory_movements_select_member on public.inventory_movements for select to authenticated using (public.is_business_member(business_id));
drop policy if exists purchase_orders_select_member on public.purchase_orders;
create policy purchase_orders_select_member on public.purchase_orders for select to authenticated using (public.is_business_member(business_id));
drop policy if exists purchase_order_lines_select_member on public.purchase_order_lines;
create policy purchase_order_lines_select_member on public.purchase_order_lines for select to authenticated using (public.is_business_member(business_id));
drop policy if exists employees_select_member on public.employees;
create policy employees_select_member on public.employees for select to authenticated using (public.is_business_member(business_id));
drop policy if exists pay_runs_select_member on public.pay_runs;
create policy pay_runs_select_member on public.pay_runs for select to authenticated using (public.is_business_member(business_id));
drop policy if exists pay_slips_select_member on public.pay_slips;
create policy pay_slips_select_member on public.pay_slips for select to authenticated using (public.is_business_member(business_id));
drop policy if exists remittances_select_member on public.remittances;
create policy remittances_select_member on public.remittances for select to authenticated using (public.is_business_member(business_id));
drop policy if exists stp_submissions_select_member on public.stp_submissions;
create policy stp_submissions_select_member on public.stp_submissions for select to authenticated using (public.is_business_member(business_id));
