insert into public.chart_accounts (business_id, code, name, class, group_name, normal_balance)
select b.id, v.code, v.name, v.class, v.group_name, v.normal_balance
from public.businesses b
cross join (
  values
    ('2420', 'Payroll Deductions Payable', 'liability', 'Current Liabilities - Payroll', 'credit'),
    ('7090', 'Employee Reimbursements', 'expense', 'General & Administrative', 'debit')
) as v(code, name, class, group_name, normal_balance)
where not exists (
  select 1
  from public.chart_accounts ca
  where ca.business_id = b.id
    and ca.code = v.code
);
