import type { CreditAllocation, InventoryMovement, InvoicePayment, LedgerData, PurchaseOrder, Transaction } from '@auctus/shared-types';
import { creditNoteBalance, isCreditNote, isInvoice, txBalance } from './documents.js';
import { computeInventoryItems } from './inventory.js';
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
  if (tx.type === 'income' && tx.productId && !tx.voidedAt) {
    const quantity = Number(tx.productQty || 1);
    const onHand = computeInventoryItems(data).find((item) => item.productId === tx.productId)?.quantity || 0;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push('Product quantity must be greater than zero.');
    } else if (quantity - onHand > 0.005) {
      const product = data.products?.find((item) => item.id === tx.productId);
      errors.push(`Insufficient stock for ${product?.name || tx.productId}. Available ${onHand}.`);
    }
  }
  return validation(errors);
}

export function validateInventoryMovementInput(data: LedgerData, movement: InventoryMovement): ValidationResult {
  const errors: string[] = [];
  const quantity = Number(movement.quantity);
  const unitCost = Number(movement.unitCost);
  if (!movement.productId || !data.products?.some((product) => product.id === movement.productId && !product.archivedAt)) {
    errors.push('Product is required.');
  }
  if (!Number.isFinite(quantity) || quantity === 0) {
    errors.push('Inventory quantity must not be zero.');
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    errors.push('Inventory unit cost must be zero or greater.');
  }
  if (movement.type === 'sale') {
    const onHand = computeInventoryItems(data).find((item) => item.productId === movement.productId)?.quantity || 0;
    const saleQty = Math.abs(quantity);
    if (saleQty - onHand > 0.005) {
      const product = data.products?.find((item) => item.id === movement.productId);
      errors.push(`Insufficient stock for ${product?.name || movement.productId}. Available ${onHand}.`);
    }
  }
  if (movement.type === 'adjustment' && quantity < 0) {
    const onHand = computeInventoryItems(data).find((item) => item.productId === movement.productId)?.quantity || 0;
    const reduction = Math.abs(quantity);
    if (reduction - onHand > 0.005) {
      const product = data.products?.find((item) => item.id === movement.productId);
      errors.push(`Adjustment would make ${product?.name || movement.productId} stock negative. Available ${onHand}.`);
    }
  }
  return validation(errors);
}

export function validatePurchaseOrderInput(data: LedgerData, po: Pick<PurchaseOrder, 'lines'>): ValidationResult {
  const errors: string[] = [];
  if (!po.lines.length) {
    errors.push('Purchase order must have at least one line.');
  }
  po.lines.forEach((line, index) => {
    const lineName = `Line ${index + 1}`;
    if (!line.productId || !data.products?.some((product) => product.id === line.productId && !product.archivedAt)) {
      errors.push(`${lineName}: product is required.`);
    }
    if (!Number.isFinite(Number(line.orderedQty)) || Number(line.orderedQty) <= 0) {
      errors.push(`${lineName}: ordered quantity must be greater than zero.`);
    }
    if (!Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0) {
      errors.push(`${lineName}: unit cost must be zero or greater.`);
    }
    if (!Number.isFinite(Number(line.receivedQty)) || Number(line.receivedQty) < 0) {
      errors.push(`${lineName}: received quantity must be zero or greater.`);
    }
    if (Number(line.receivedQty) - Number(line.orderedQty) > 0.005) {
      errors.push(`${lineName}: received quantity cannot exceed ordered quantity.`);
    }
  });
  return validation(errors);
}

export function validatePurchaseOrderReceiptInput(
  data: LedgerData,
  po: PurchaseOrder,
  receiptQtys: Record<number, number>,
): ValidationResult {
  const errors = validatePurchaseOrderInput(data, po).errors;
  if (po.status !== 'sent') {
    errors.push('Only sent purchase orders can be received.');
  }

  let totalReceivedNow = 0;
  po.lines.forEach((line, index) => {
    const qty = Number(receiptQtys[index] || 0);
    const remaining = Number(line.orderedQty) - Number(line.receivedQty || 0);
    const lineName = `Line ${index + 1}`;
    if (!Number.isFinite(qty) || qty < 0) {
      errors.push(`${lineName}: receive quantity must be zero or greater.`);
      return;
    }
    if (qty - remaining > 0.005) {
      errors.push(`${lineName}: receive quantity cannot exceed remaining quantity ${remaining}.`);
    }
    totalReceivedNow += qty;
  });

  if (totalReceivedNow <= 0) {
    errors.push('Receive at least one item.');
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
