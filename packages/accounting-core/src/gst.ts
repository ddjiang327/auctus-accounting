import type { GsmMode, LedgerData, Transaction } from '@auctus/shared-types';

export function gstSplit(amount: number, mode: GsmMode | undefined, rate: number) {
  amount = Number(amount) || 0;
  rate = Number(rate) || 0;
  if (mode === 'inc') {
    const gst = +(amount * rate / (1 + rate)).toFixed(2);
    return { net: +(amount - gst).toFixed(2), gst, total: amount, mode };
  }
  if (mode === 'exc') {
    const gst = +(amount * rate).toFixed(2);
    return { net: amount, gst, total: +(amount + gst).toFixed(2), mode };
  }
  return { net: amount, gst: 0, total: amount, mode: mode || null };
}

function effectiveGstMode(tx: Transaction, data: LedgerData) {
  return data.settings.gstEnabled ? tx.gstMode : null;
}

export function txTotal(tx: Transaction, data: LedgerData) {
  if (tx.voidedAt) return 0;
  const mode = effectiveGstMode(tx, data);
  if (!mode || mode === 'free') return Number(tx.amount) || 0;
  return gstSplit(tx.amount, mode, data.settings.gstRate).total;
}

export function txGst(tx: Transaction, data: LedgerData) {
  if (tx.voidedAt) return 0;
  const mode = effectiveGstMode(tx, data);
  if (!mode || mode === 'free') return 0;
  return gstSplit(tx.amount, mode, data.settings.gstRate).gst;
}
