create or replace function public.link_purchase_order_bill(
  p_business_id uuid,
  p_purchase_order_id text,
  p_bill_transaction_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.purchase_orders
  set bill_transaction_id = p_bill_transaction_id,
      billed_at = now()
  where business_id = p_business_id
    and id = p_purchase_order_id
    and bill_transaction_id is null;

  if not found then
    raise exception 'purchase_order_bill_link_failed: purchase order not found or already billed'
      using errcode = 'P0001';
  end if;

  update public.inventory_movements
  set source_id = p_bill_transaction_id
  where business_id = p_business_id
    and source_id like p_purchase_order_id || ':%';

  update public.business_settings
  set inventory_state_version = inventory_state_version + 1
  where business_id = p_business_id;
end;
$$;

revoke all on function public.link_purchase_order_bill(uuid, text, text) from public;
grant execute on function public.link_purchase_order_bill(uuid, text, text) to service_role;
