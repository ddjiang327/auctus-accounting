create or replace function public.update_transaction_with_payments(
  target_business_id uuid,
  target_transaction_id uuid,
  transaction_update jsonb,
  new_payments jsonb,
  transaction_audit jsonb,
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_transaction jsonb;
  inserted_payments jsonb := '[]'::jsonb;
begin
  update public.transactions
  set
    type = transaction_update->>'type',
    entry_mode = transaction_update->>'entry_mode',
    amount = (transaction_update->>'amount')::numeric,
    payment_account_id = (transaction_update->>'payment_account_id')::uuid,
    payment_account_to_id = (transaction_update->>'payment_account_to_id')::uuid,
    category_id = (transaction_update->>'category_id')::uuid,
    chart_account_id = (transaction_update->>'chart_account_id')::uuid,
    clearing_chart_account_id = (transaction_update->>'clearing_chart_account_id')::uuid,
    contact_id = (transaction_update->>'contact_id')::uuid,
    party = transaction_update->>'party',
    date = (transaction_update->>'date')::date,
    due_date = (transaction_update->>'due_date')::date,
    note = transaction_update->>'note',
    gst_mode = transaction_update->>'gst_mode',
    invoice_no = transaction_update->>'invoice_no',
    credit_note_no = transaction_update->>'credit_note_no',
    payment_terms = transaction_update->>'payment_terms',
    doc_status = transaction_update->>'doc_status',
    recurring_template_id = (transaction_update->>'recurring_template_id')::uuid,
    product_id = transaction_update->>'product_id',
    product_qty = (transaction_update->>'product_qty')::numeric
  where business_id = target_business_id
    and id = target_transaction_id
    and voided_at is null
  returning to_jsonb(public.transactions.*) into updated_transaction;

  if updated_transaction is null then
    raise exception 'transaction_update_not_found';
  end if;

  if jsonb_array_length(coalesce(new_payments, '[]'::jsonb)) > 0 then
    with inserted as (
      insert into public.invoice_payments (
        business_id,
        transaction_id,
        amount,
        date,
        payment_account_id,
        receipt_no,
        receipt_created_at
      )
      select
        target_business_id,
        target_transaction_id,
        (payment->>'amount')::numeric,
        (payment->>'date')::date,
        (payment->>'payment_account_id')::uuid,
        payment->>'receipt_no',
        (payment->>'receipt_created_at')::timestamptz
      from jsonb_array_elements(new_payments) as payment
      returning *
    )
    select coalesce(jsonb_agg(to_jsonb(inserted.*)), '[]'::jsonb)
    into inserted_payments
    from inserted;
  end if;

  insert into public.audit_log (
    business_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    detail,
    metadata
  )
  values (
    target_business_id,
    actor_user_id,
    transaction_audit->>'action',
    transaction_audit->>'entity_type',
    transaction_audit->>'entity_id',
    transaction_audit->>'detail',
    coalesce(transaction_audit->'metadata', '{}'::jsonb)
  );

  return jsonb_build_object(
    'transaction', updated_transaction,
    'payments', inserted_payments
  );
end;
$$;
