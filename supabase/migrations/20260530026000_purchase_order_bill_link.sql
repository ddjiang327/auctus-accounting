alter table public.purchase_orders
  add column if not exists bill_transaction_id text,
  add column if not exists billed_at timestamptz;
