insert into public.chart_accounts (
  business_id,
  code,
  name,
  class,
  group_name,
  normal_balance,
  is_contra
)
select
  businesses.id,
  accounts.code,
  accounts.name,
  accounts.class,
  accounts.group_name,
  accounts.normal_balance,
  false
from public.businesses
cross join (
  values
    ('1200', 'Inventory - Raw Materials', 'asset', 'Current Assets - Inventory', 'debit'),
    ('1210', 'Inventory - Work-in-Progress', 'asset', 'Current Assets - Inventory', 'debit'),
    ('1220', 'Inventory - Finished Goods', 'asset', 'Current Assets - Inventory', 'debit'),
    ('5040', 'Inventory Adjustments', 'expense', 'Cost of Goods Sold', 'debit'),
    ('2400', 'PAYG Withholding Payable', 'liability', 'Current Liabilities - Payroll', 'credit'),
    ('2410', 'Superannuation Payable', 'liability', 'Current Liabilities - Payroll', 'credit'),
    ('2420', 'Payroll Deductions Payable', 'liability', 'Current Liabilities - Payroll', 'credit'),
    ('7080', 'Superannuation Expense', 'expense', 'General & Administrative', 'debit'),
    ('7090', 'Employee Reimbursements', 'expense', 'General & Administrative', 'debit')
) as accounts(code, name, class, group_name, normal_balance)
where not exists (
  select 1
  from public.chart_accounts existing
  where existing.business_id = businesses.id
    and existing.code = accounts.code
);
