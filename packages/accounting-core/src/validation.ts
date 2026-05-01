import type { CreditAllocation, InvoicePayment, LedgerData, Transaction } from '@auctus/shared-types';
import { creditNoteBalance, isCreditNote, isInvoice, txBalance } from './documents.js';
import { isDateLocked } from './periodLocks.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function validation(errors: string[]): ValidationResult {
  return { ok: errors.length === 0, errors };
}

export function validateTransactionInput(data: LedgerData, tx: Transaction, options: { allowLockedPeriod?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Transaction amount must be greater than zero.');
  if (!options.allowLockedPeriod && isDateLocked(data, tx.date)) errors.push(`Transaction date ${tx.date} is in a locked period.`);
  for (const payment of tx.payments || []) {
    const paymentAmount = Number(payment.amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) errors.push('Payment amount must be greater than zero.');
    if (!options.allowLockedPeriod && isDateLocked(data, payment.date)) errors.push(`Payment date ${payment.date} is in a locked period.`);
  }
  return validation(errors);
}

export function validatePaymentInput(
  data: LedgerData,
  tx: Transaction,
  payment: Omit<InvoicePayment, 'id'>,
  options: { allowLockedPeriod?: boolean } = {},
): ValidationResult {
  const errors: string[] = [];
  const amount = Number(payment.amount);
  if (tx.voidedAt) errors.push('Cannot record a payment against a voided document.');
  if (!isInvoice(tx)) errors.push('Payments can only be recorded against invoices and bills.');
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Payment amount must be greater than zero.');
  if (Number.isFinite(amount) && amount - txBalance(tx, data) > 0.005) {
    errors.push('Payment amount cannot exceed the outstanding balance.');
  }
  if (!payment.accountId || !data.accounts.some((account) => account.id === payment.accountId)) {
    errors.push('Payment account is required.');
  }
  if (!options.allowLockedPeriod && isDateLocked(data, payment.date)) {
    errors.push(`Payment date ${payment.date} is in a locked period.`);
  }
  return validation(errors);
}

export function validateCreditAllocations(data: LedgerData, allocations: Array<Omit<CreditAllocation, 'id'>>, options: { allowLockedPeriod?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  const byCreditNote = new Map<string, number>();
  const byInvoice = new Map<string, number>();

  for (const allocation of allocations) {
    const amount = Number(allocation.amount);
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Credit allocation amount must be greater than zero.');
    if (!options.allowLockedPeriod && isDateLocked(data, allocation.date)) errors.push(`Credit allocation date ${allocation.date} is in a locked period.`);
    byCreditNote.set(allocation.creditNoteId, (byCreditNote.get(allocation.creditNoteId) || 0) + amount);
    byInvoice.set(allocation.invoiceId, (byInvoice.get(allocation.invoiceId) || 0) + amount);
  }

  for (const [creditNoteId, amount] of byCreditNote) {
    const creditNote = data.transactions.find((tx) => tx.id === creditNoteId);
    if (!creditNote || !isCreditNote(creditNote)) {
      errors.push(`Credit note ${creditNoteId} does not exist or is not a credit note.`);
      continue;
    }
    if (creditNote.voidedAt) {
      errors.push(`Credit note ${creditNoteId} is voided.`);
      continue;
    }
    if (amount - creditNoteBalance(creditNote, data) > 0.005) {
      errors.push(`Credit allocations exceed remaining credit note balance for ${creditNote.creditNoteNo || creditNote.id}.`);
    }
  }

  for (const [invoiceId, amount] of byInvoice) {
    const invoice = data.transactions.find((tx) => tx.id === invoiceId);
    if (!invoice || !isInvoice(invoice)) {
      errors.push(`Invoice ${invoiceId} does not exist or is not an open invoice/bill.`);
      continue;
    }
    if (invoice.voidedAt) {
      errors.push(`Invoice ${invoiceId} is voided.`);
      continue;
    }
    if (amount - txBalance(invoice, data) > 0.005) {
      errors.push(`Credit allocations exceed outstanding balance for ${invoice.invoiceNo || invoice.id}.`);
    }
  }

  return validation(errors);
}
