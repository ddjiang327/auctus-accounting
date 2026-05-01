import type { LedgerData, PaymentTerms, Transaction, TransactionType } from '@auctus/shared-types';
import { dueDateForTerms, todayStr } from './dates.js';
import { txTotal } from './gst.js';

export { dueDateForTerms } from './dates.js';

export function isInvoice(tx: Transaction) {
  return tx.entryMode === 'invoice' && tx.type !== 'transfer' && !tx.voidedAt;
}

export function isCreditNote(tx: Transaction) {
  return tx.entryMode === 'credit_note' && tx.type !== 'transfer' && !tx.voidedAt;
}

export function txPayments(tx: Transaction, data: LedgerData) {
  if (!isInvoice(tx)) return tx.type === 'transfer' ? [] : [{ amount: txTotal(tx, data), date: tx.date, accountId: tx.accountId || '' }];
  return Array.isArray(tx.payments) ? tx.payments : [];
}

export function txPaid(tx: Transaction) {
  if (tx.voidedAt) return 0;
  return (tx.payments || []).filter((p) => !p.voidedAt).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

export function txBalance(tx: Transaction, data: LedgerData) {
  if (!isInvoice(tx)) return 0;
  const creditApplied = (data.creditAllocations || [])
    .filter((a) => {
      if (a.invoiceId !== tx.id) return false;
      const cn = data.transactions.find((t) => t.id === a.creditNoteId);
      return !cn?.voidedAt;
    })
    .reduce((sum, a) => sum + a.amount, 0);
  return Math.max(0, +(txTotal(tx, data) - txPaid(tx) - creditApplied).toFixed(2));
}

export function creditNoteAllocated(data: LedgerData, creditNoteId: string) {
  return (data.creditAllocations || [])
    .filter((a) => a.creditNoteId === creditNoteId)
    .reduce((sum, a) => sum + a.amount, 0);
}

export function creditNoteBalance(tx: Transaction, data: LedgerData) {
  if (!isCreditNote(tx)) return 0;
  return Math.max(0, +(txTotal(tx, data) - creditNoteAllocated(data, tx.id)).toFixed(2));
}

export function formatCreditNumber(data: LedgerData, type: TransactionType) {
  if (type === 'income') return `${data.settings.creditNotePrefix || 'CN-'}${String(data.settings.nextCreditNoteNumber || 1).padStart(4, '0')}`;
  if (type === 'expense') return `${data.settings.supplierCreditPrefix || 'SC-'}${String(data.settings.nextSupplierCreditNumber || 1).padStart(4, '0')}`;
  return '';
}

export function paymentTermsLabel(value?: PaymentTerms) {
  const labels: Record<PaymentTerms, string> = {
    due_on_receipt: 'Due on receipt',
    net_7: 'Net 7',
    net_14: 'Net 14',
    net_30: 'Net 30',
    net_60: 'Net 60',
    custom: 'Custom',
  };
  return labels[value || 'due_on_receipt'];
}

export function formatDocumentNumber(data: LedgerData, type: TransactionType) {
  if (type === 'income') return `${data.settings.invoicePrefix || 'INV-'}${String(data.settings.nextInvoiceNumber || 1).padStart(4, '0')}`;
  if (type === 'expense') return `${data.settings.billPrefix || 'BILL-'}${String(data.settings.nextBillNumber || 1).padStart(4, '0')}`;
  return '';
}

export function contactName(data: LedgerData, id?: string, fallback?: string) {
  const contact = (data.contacts || []).find((item) => item.id === id);
  return contact?.name || fallback || '';
}

export function invoiceStatus(tx: Transaction, data: LedgerData) {
  if (!isInvoice(tx)) return { label: 'Paid', tone: 'paid' as const };
  if (txBalance(tx, data) <= 0) return { label: 'Paid', tone: 'paid' as const };
  if ((tx.dueDate || tx.date) < todayStr()) return { label: 'Overdue', tone: 'overdue' as const };
  if (tx.docStatus === 'viewed') return { label: 'Viewed', tone: 'viewed' as const };
  if (tx.docStatus === 'sent') return { label: 'Sent', tone: 'sent' as const };
  return { label: 'Draft', tone: 'draft' as const };
}
