alter table public.transactions
  add column if not exists product_id text references public.products(id),
  add column if not exists product_qty numeric check (product_qty is null or product_qty > 0);

create index if not exists transactions_product_id_idx
  on public.transactions(product_id);
