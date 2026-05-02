-- Atomic transaction update with optional new payments.
-- Scope: keep transaction edits and payment inserts from partially applying.

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
  updated_transaction public.transactions%rowtype;
  payment_item jsonb;
  inserted_payment public.invoice_payments%rowtype;
  receipt_number text;
  receipt_created timestamptz;
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
    recurring_template_id = (transaction_update->>'recurring_template_id')::uuid
  where business_id = target_business_id
    and id = target_transaction_id
    and voided_at is null
  returning *
  into updated_transaction;

  if not found then
    raise exception 'transaction_update_not_found';
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
    transaction_audit->'metadata'
  );

  for payment_item in
    select value from jsonb_array_elements(coalesce(new_payments, '[]'::jsonb))
  loop
    receipt_number := coalesce(nullif(payment_item->>'receipt_no', ''), public.allocate_document_number(target_business_id, 'receipt'));
    receipt_created := coalesce((payment_item->>'receipt_created_at')::timestamptz, now());

    insert into public.invoice_payments (
      business_id,
      transaction_id,
      amount,
      date,
      payment_account_id,
      receipt_no,
      receipt_created_at
    )
    values (
      target_business_id,
      target_transaction_id,
      (payment_item->>'amount')::numeric,
      (payment_item->>'date')::date,
      (payment_item->>'payment_account_id')::uuid,
      receipt_number,
      receipt_created
    )
    returning *
    into inserted_payment;

    inserted_payments := inserted_payments || jsonb_build_array(jsonb_build_object(
      'id', inserted_payment.id,
      'amount', inserted_payment.amount,
      'date', inserted_payment.date,
      'payment_account_id', inserted_payment.payment_account_id,
      'receipt_no', inserted_payment.receipt_no,
      'receipt_created_at', inserted_payment.receipt_created_at,
      'voided_at', inserted_payment.voided_at
    ));

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
      'record',
      'payment',
      inserted_payment.id::text,
      'Recorded payment ' || inserted_payment.amount || ' for transaction ' || target_transaction_id || ' on ' || inserted_payment.date,
      jsonb_build_object(
        'transactionId', target_transaction_id,
        'amount', inserted_payment.amount,
        'date', inserted_payment.date,
        'paymentAccountId', inserted_payment.payment_account_id
      )
    );
  end loop;

  return jsonb_build_object(
    'transaction', jsonb_build_object(
      'id', updated_transaction.id,
      'type', updated_transaction.type,
      'amount', updated_transaction.amount,
      'payment_account_id', updated_transaction.payment_account_id,
      'payment_account_to_id', updated_transaction.payment_account_to_id,
      'category_id', updated_transaction.category_id,
      'chart_account_id', updated_transaction.chart_account_id,
      'clearing_chart_account_id', updated_transaction.clearing_chart_account_id,
      'date', updated_transaction.date,
      'note', updated_transaction.note,
      'gst_mode', updated_transaction.gst_mode,
      'entry_mode', updated_transaction.entry_mode,
      'contact_id', updated_transaction.contact_id,
      'party', updated_transaction.party,
      'invoice_no', updated_transaction.invoice_no,
      'credit_note_no', updated_transaction.credit_note_no,
      'payment_terms', updated_transaction.payment_terms,
      'due_date', updated_transaction.due_date,
      'doc_status', updated_transaction.doc_status,
      'voided_at', updated_transaction.voided_at,
      'recurring_template_id', updated_transaction.recurring_template_id
    ),
    'payments', inserted_payments
  );
end;
$$;
