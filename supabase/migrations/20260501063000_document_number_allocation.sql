-- Document number allocation.
-- Scope: atomic server-side numbering for invoices, bills, credit notes, supplier credits, and receipts.

create or replace function public.allocate_document_number(
  target_business_id uuid,
  document_kind text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.business_settings%rowtype;
  allocated_number integer;
  allocated_prefix text;
begin
  if document_kind not in ('invoice', 'bill', 'credit_note', 'supplier_credit', 'receipt') then
    raise exception 'Unsupported document kind: %', document_kind;
  end if;

  select *
  into settings_row
  from public.business_settings
  where business_id = target_business_id
  for update;

  if not found then
    raise exception 'Business settings missing for %', target_business_id;
  end if;

  if document_kind = 'invoice' then
    allocated_number := settings_row.next_invoice_number;
    allocated_prefix := settings_row.invoice_prefix;

    update public.business_settings
    set next_invoice_number = next_invoice_number + 1
    where business_id = target_business_id;
  elsif document_kind = 'bill' then
    allocated_number := settings_row.next_bill_number;
    allocated_prefix := settings_row.bill_prefix;

    update public.business_settings
    set next_bill_number = next_bill_number + 1
    where business_id = target_business_id;
  elsif document_kind = 'credit_note' then
    allocated_number := settings_row.next_credit_note_number;
    allocated_prefix := settings_row.credit_note_prefix;

    update public.business_settings
    set next_credit_note_number = next_credit_note_number + 1
    where business_id = target_business_id;
  elsif document_kind = 'supplier_credit' then
    allocated_number := settings_row.next_supplier_credit_number;
    allocated_prefix := settings_row.supplier_credit_prefix;

    update public.business_settings
    set next_supplier_credit_number = next_supplier_credit_number + 1
    where business_id = target_business_id;
  else
    allocated_number := settings_row.next_receipt_number;
    allocated_prefix := settings_row.receipt_prefix;

    update public.business_settings
    set next_receipt_number = next_receipt_number + 1
    where business_id = target_business_id;
  end if;

  return allocated_prefix || lpad(allocated_number::text, 4, '0');
end;
$$;
