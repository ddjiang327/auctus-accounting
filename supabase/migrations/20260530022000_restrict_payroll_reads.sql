-- Payroll contains employee identity and pay data. Keep direct database reads
-- limited to roles that can work with payroll in the application.

drop policy if exists employees_select_member on public.employees;
create policy employees_select_payroll_roles
on public.employees
for select
to authenticated
using (public.current_business_role(business_id) in ('owner', 'admin', 'bookkeeper'));

drop policy if exists pay_runs_select_member on public.pay_runs;
create policy pay_runs_select_payroll_roles
on public.pay_runs
for select
to authenticated
using (public.current_business_role(business_id) in ('owner', 'admin', 'bookkeeper'));

drop policy if exists pay_slips_select_member on public.pay_slips;
create policy pay_slips_select_payroll_roles
on public.pay_slips
for select
to authenticated
using (public.current_business_role(business_id) in ('owner', 'admin', 'bookkeeper'));

drop policy if exists remittances_select_member on public.remittances;
create policy remittances_select_payroll_roles
on public.remittances
for select
to authenticated
using (public.current_business_role(business_id) in ('owner', 'admin', 'bookkeeper'));

drop policy if exists stp_submissions_select_member on public.stp_submissions;
create policy stp_submissions_select_payroll_roles
on public.stp_submissions
for select
to authenticated
using (public.current_business_role(business_id) in ('owner', 'admin', 'bookkeeper'));
