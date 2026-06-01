alter table public.pay_slips
  add column if not exists adjustments jsonb not null default '[]'::jsonb;
