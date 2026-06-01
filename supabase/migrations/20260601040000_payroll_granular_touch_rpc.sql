create or replace function public.touch_payroll_state(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.business_settings
  set payroll_state_version = payroll_state_version + 1
  where business_id = p_business_id;
end;
$$;

revoke all on function public.touch_payroll_state(uuid) from public;
grant execute on function public.touch_payroll_state(uuid) to service_role;
