alter table public.business_settings
  add column if not exists inventory_state_version integer not null default 1 check (inventory_state_version > 0),
  add column if not exists payroll_state_version integer not null default 1 check (payroll_state_version > 0);

drop function if exists public.replace_inventory_module_state(uuid, jsonb, jsonb, jsonb);
drop function if exists public.replace_payroll_module_state(uuid, jsonb, jsonb, jsonb, jsonb);

create or replace function public.replace_inventory_module_state(
  p_business_id uuid,
  p_expected_version integer,
  p_products jsonb default '[]'::jsonb,
  p_inventory_movements jsonb default '[]'::jsonb,
  p_purchase_orders jsonb default '[]'::jsonb
)
returns void
language plpgsql
as $$
begin
  update public.business_settings
  set inventory_state_version = inventory_state_version + 1
  where business_id = p_business_id
    and inventory_state_version = p_expected_version;

  if not found then
    raise exception 'module_state_conflict: inventory state version mismatch'
      using errcode = 'P0001';
  end if;

  delete from public.purchase_order_lines where business_id = p_business_id;
  delete from public.purchase_orders where business_id = p_business_id;
  delete from public.inventory_movements where business_id = p_business_id;
  delete from public.products where business_id = p_business_id;

  insert into public.products (
    id, business_id, name, sku, unit_of_measure, cost_price, sell_price, reorder_point,
    inventory_chart_account_id, cogs_chart_account_id, revenue_chart_account_id, archived_at
  )
  select
    product->>'id',
    p_business_id,
    coalesce(nullif(product->>'name', ''), 'Unnamed product'),
    nullif(product->>'sku', ''),
    nullif(product->>'unitOfMeasure', ''),
    coalesce(nullif(product->>'costPrice', '')::numeric, 0),
    coalesce(nullif(product->>'sellPrice', '')::numeric, 0),
    nullif(product->>'reorderPoint', '')::numeric,
    nullif(product->>'inventoryChartAccountId', '')::uuid,
    nullif(product->>'cogsChartAccountId', '')::uuid,
    nullif(product->>'revenueChartAccountId', '')::uuid,
    nullif(product->>'archivedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) as product
  where nullif(product->>'id', '') is not null;

  insert into public.inventory_movements (
    id, business_id, product_id, date, type, quantity, unit_cost, memo, source_id
  )
  select
    movement->>'id',
    p_business_id,
    movement->>'productId',
    (movement->>'date')::date,
    movement->>'type',
    coalesce(nullif(movement->>'quantity', '')::numeric, 0),
    coalesce(nullif(movement->>'unitCost', '')::numeric, 0),
    nullif(movement->>'memo', ''),
    nullif(movement->>'sourceId', '')
  from jsonb_array_elements(coalesce(p_inventory_movements, '[]'::jsonb)) as movement
  where nullif(movement->>'id', '') is not null;

  insert into public.purchase_orders (
    id, business_id, date, expected_date, supplier_id, supplier_name, status, memo,
    received_at, bill_transaction_id, billed_at
  )
  select
    purchase_order->>'id',
    p_business_id,
    (purchase_order->>'date')::date,
    nullif(purchase_order->>'expectedDate', '')::date,
    nullif(purchase_order->>'supplierId', '')::uuid,
    nullif(purchase_order->>'supplierName', ''),
    coalesce(nullif(purchase_order->>'status', ''), 'draft'),
    nullif(purchase_order->>'memo', ''),
    nullif(purchase_order->>'receivedAt', '')::timestamptz,
    nullif(purchase_order->>'billTransactionId', ''),
    nullif(purchase_order->>'billedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(p_purchase_orders, '[]'::jsonb)) as purchase_order
  where nullif(purchase_order->>'id', '') is not null;

  insert into public.purchase_order_lines (
    id, business_id, purchase_order_id, product_id, ordered_qty, unit_cost, received_qty, line_order
  )
  select
    (purchase_order->>'id') || '_' || (line.ordinality - 1)::text,
    p_business_id,
    purchase_order->>'id',
    line.value->>'productId',
    coalesce(nullif(line.value->>'orderedQty', '')::numeric, 0),
    coalesce(nullif(line.value->>'unitCost', '')::numeric, 0),
    coalesce(nullif(line.value->>'receivedQty', '')::numeric, 0),
    line.ordinality - 1
  from jsonb_array_elements(coalesce(p_purchase_orders, '[]'::jsonb)) as purchase_order
  cross join lateral jsonb_array_elements(coalesce(purchase_order->'lines', '[]'::jsonb)) with ordinality as line(value, ordinality)
  where nullif(purchase_order->>'id', '') is not null
    and nullif(line.value->>'productId', '') is not null;
end;
$$;

create or replace function public.replace_payroll_module_state(
  p_business_id uuid,
  p_expected_version integer,
  p_employees jsonb default '[]'::jsonb,
  p_pay_runs jsonb default '[]'::jsonb,
  p_remittances jsonb default '[]'::jsonb,
  p_stp_submissions jsonb default '[]'::jsonb
)
returns void
language plpgsql
as $$
begin
  update public.business_settings
  set payroll_state_version = payroll_state_version + 1
  where business_id = p_business_id
    and payroll_state_version = p_expected_version;

  if not found then
    raise exception 'module_state_conflict: payroll state version mismatch'
      using errcode = 'P0001';
  end if;

  delete from public.stp_submissions where business_id = p_business_id;
  delete from public.remittances where business_id = p_business_id;
  delete from public.pay_slips where business_id = p_business_id;
  delete from public.pay_runs where business_id = p_business_id;
  delete from public.employees where business_id = p_business_id;

  insert into public.employees (
    id, business_id, name, pay_type, pay_rate, pay_frequency, tax_free_threshold,
    employment_basis, ordinary_hours_per_week, casual_loading_rate, super_fund_name, tfn, archived_at
  )
  select
    employee->>'id',
    p_business_id,
    coalesce(nullif(employee->>'name', ''), 'Unnamed employee'),
    coalesce(nullif(employee->>'payType', ''), 'salary'),
    coalesce(nullif(employee->>'payRate', '')::numeric, 0),
    coalesce(nullif(employee->>'payFrequency', ''), 'weekly'),
    coalesce(nullif(employee->>'taxFreeThreshold', '')::boolean, true),
    coalesce(nullif(employee->>'employmentBasis', ''), 'full_time'),
    coalesce(nullif(employee->>'ordinaryHoursPerWeek', '')::numeric, 38),
    coalesce(nullif(employee->>'casualLoadingRate', '')::numeric, 0.25),
    nullif(employee->>'superFundName', ''),
    nullif(employee->>'tfn', ''),
    nullif(employee->>'archivedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(p_employees, '[]'::jsonb)) as employee
  where nullif(employee->>'id', '') is not null;

  insert into public.pay_runs (
    id, business_id, period_start, period_end, pay_date, pay_account_id, status,
    created_at, finalised_at, voided_at
  )
  select
    pay_run->>'id',
    p_business_id,
    (pay_run->>'periodStart')::date,
    (pay_run->>'periodEnd')::date,
    (pay_run->>'payDate')::date,
    nullif(pay_run->>'payAccountId', '')::uuid,
    coalesce(nullif(pay_run->>'status', ''), 'draft'),
    coalesce(nullif(pay_run->>'createdAt', '')::timestamptz, now()),
    nullif(pay_run->>'finalisedAt', '')::timestamptz,
    nullif(pay_run->>'voidedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(p_pay_runs, '[]'::jsonb)) as pay_run
  where nullif(pay_run->>'id', '') is not null;

  insert into public.pay_slips (
    id, business_id, pay_run_id, employee_id, gross, payg_withheld, super_amount,
    net_pay, hours, adjustments, line_order
  )
  select
    slip.value->>'id',
    p_business_id,
    pay_run->>'id',
    slip.value->>'employeeId',
    coalesce(nullif(slip.value->>'gross', '')::numeric, 0),
    coalesce(nullif(slip.value->>'paygWithheld', '')::numeric, 0),
    coalesce(nullif(slip.value->>'superAmount', '')::numeric, 0),
    coalesce(nullif(slip.value->>'netPay', '')::numeric, 0),
    nullif(slip.value->>'hours', '')::numeric,
    coalesce(slip.value->'adjustments', '[]'::jsonb),
    slip.ordinality - 1
  from jsonb_array_elements(coalesce(p_pay_runs, '[]'::jsonb)) as pay_run
  cross join lateral jsonb_array_elements(coalesce(pay_run->'paySlips', '[]'::jsonb)) with ordinality as slip(value, ordinality)
  where nullif(pay_run->>'id', '') is not null
    and nullif(slip.value->>'id', '') is not null;

  insert into public.remittances (
    id, business_id, date, type, amount, pay_account_id, memo
  )
  select
    remittance->>'id',
    p_business_id,
    (remittance->>'date')::date,
    remittance->>'type',
    coalesce(nullif(remittance->>'amount', '')::numeric, 0),
    nullif(remittance->>'payAccountId', '')::uuid,
    nullif(remittance->>'memo', '')
  from jsonb_array_elements(coalesce(p_remittances, '[]'::jsonb)) as remittance
  where nullif(remittance->>'id', '') is not null;

  insert into public.stp_submissions (
    id, business_id, pay_run_id, submitted_at, status, reference_number, memo
  )
  select
    submission->>'id',
    p_business_id,
    submission->>'payRunId',
    coalesce(nullif(submission->>'submittedAt', '')::timestamptz, now()),
    coalesce(nullif(submission->>'status', ''), 'submitted'),
    nullif(submission->>'referenceNumber', ''),
    nullif(submission->>'memo', '')
  from jsonb_array_elements(coalesce(p_stp_submissions, '[]'::jsonb)) as submission
  where nullif(submission->>'id', '') is not null;
end;
$$;
