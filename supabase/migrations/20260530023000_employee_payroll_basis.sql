alter table public.employees
  add column if not exists employment_basis text not null default 'full_time'
    check (employment_basis in ('full_time', 'part_time', 'casual')),
  add column if not exists ordinary_hours_per_week numeric not null default 38
    check (ordinary_hours_per_week >= 0 and ordinary_hours_per_week <= 168),
  add column if not exists casual_loading_rate numeric not null default 0.25
    check (casual_loading_rate >= 0 and casual_loading_rate <= 1);
