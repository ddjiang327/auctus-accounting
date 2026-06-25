import type { BasBasis, GsmMode, LedgerData, Period, Transaction } from '@auctus/shared-types';
import { inRange, periodRange, todayStr } from './dates.js';
import { contactName, isCreditNote, isInvoice, txBalance } from './documents.js';
import { gstSplit, txTotal } from './gst.js';

function effectiveGstMode(tx: Transaction, data: LedgerData) {
  return data.settings.gstEnabled ? tx.gstMode : null;
}

export function aggregate(data: LedgerData, period: Period) {
  const range = periodRange(period);
  let income = 0;
  let expense = 0;
  const byCat: Record<string, number> = {};
  for (const tx of data.transactions) {
    if (tx.voidedAt) continue;
    if (!inRange(tx.date, range)) continue;
    const mode = effectiveGstMode(tx, data);
    const split = gstSplit(tx.amount, mode, data.settings.gstRate);
    const amount = (!mode || mode === 'free') ? txTotal(tx, data) : split.net;
    if (tx.type === 'income') income += amount;
    if (tx.type === 'expense') {
      expense += amount;
      if (tx.categoryId) byCat[tx.categoryId] = (byCat[tx.categoryId] || 0) + amount;
    }
  }
  return { income, expense, balance: income - expense, byCat };
}

export function gstAggregate(data: LedgerData, period: Period) {
  const range = periodRange(period);
  let collected = 0;
  let paid = 0;
  let salesNet = 0;
  let purchasesNet = 0;
  for (const tx of data.transactions) {
    if (tx.voidedAt) continue;
    const mode = effectiveGstMode(tx, data);
    if (!inRange(tx.date, range) || tx.type === 'transfer' || !mode || mode === 'free') continue;
    const split = gstSplit(tx.amount, mode, data.settings.gstRate);
    const sign = isCreditNote(tx) ? -1 : 1;
    if (tx.type === 'income') {
      collected += sign * split.gst;
      salesNet += sign * split.net;
    }
    if (tx.type === 'expense') {
      paid += sign * split.gst;
      purchasesNet += sign * split.net;
    }
  }
  return { collected, paid, net: collected - paid, salesNet, purchasesNet };
}

export interface BasLineItem {
  id: string;
  date: string;
  party: string;
  reference: string;
  gstMode: GsmMode;
  isCreditNote: boolean;
  netAmount: number;
  gstAmount: number;
  grossAmount: number;
}

export interface BasReport {
  from: string;
  to: string;
  salesGross: number;
  salesNet: number;
  gstCollected: number;
  purchasesGross: number;
  purchasesNet: number;
  gstPaid: number;
  netGst: number;
  gstFreeIncome: number;
  gstFreePurchases: number;
  salesLines: BasLineItem[];
  purchasesLines: BasLineItem[];
}

function basBasis(data: LedgerData, basis?: BasBasis) {
  return basis || data.settings.basBasis || 'cash';
}

function addBasLine(
  lines: BasLineItem[],
  tx: Transaction,
  data: LedgerData,
  date: string,
  amount: number,
  sign: number,
  settlementGross: boolean,
) {
  const rate = data.settings.gstRate || 0.1;
  const split = basAmountSplit(amount, tx.gstMode, rate, settlementGross);
  const party = contactName(data, tx.contactId, tx.party);
  const reference = tx.invoiceNo || tx.creditNoteNo || '';
  const line: BasLineItem = {
    id: `${tx.id}:${date}:${amount}`,
    date,
    party,
    reference,
    gstMode: tx.gstMode || null,
    isCreditNote: isCreditNote(tx),
    netAmount: +(sign * split.net).toFixed(2),
    gstAmount: +(sign * split.gst).toFixed(2),
    grossAmount: +(sign * split.total).toFixed(2),
  };
  lines.push(line);
  return line;
}

function basAmountSplit(amount: number, mode: GsmMode | undefined, rate: number, settlementGross: boolean) {
  if (!settlementGross || !mode || mode === 'free') return gstSplit(amount, mode, rate);
  const total = Number(amount) || 0;
  const gst = +(total * rate / (1 + rate)).toFixed(2);
  return { net: +(total - gst).toFixed(2), gst, total, mode };
}

export function basReport(data: LedgerData, from: string, to: string): BasReport {
  let salesGross = 0, salesNet = 0, gstCollected = 0, gstFreeIncome = 0;
  let purchasesGross = 0, purchasesNet = 0, gstPaid = 0, gstFreePurchases = 0;
  const salesLines: BasLineItem[] = [];
  const purchasesLines: BasLineItem[] = [];
  const rate = data.settings.gstRate || 0.1;
  const basis = basBasis(data);

  for (const tx of data.transactions) {
    if (tx.voidedAt || tx.type === 'transfer') continue;
    if (!data.settings.gstEnabled || !tx.gstMode) continue;
    const rows: Array<{ date: string; amount: number; sign: number; settlementGross: boolean }> = [];
    if (basis === 'accrual' || (!isInvoice(tx) && !isCreditNote(tx))) {
      rows.push({ date: tx.date, amount: tx.amount, sign: isCreditNote(tx) ? -1 : 1, settlementGross: false });
    } else if (isInvoice(tx)) {
      for (const payment of tx.payments || []) {
        if (payment.voidedAt) continue;
        rows.push({ date: payment.date, amount: payment.amount, sign: 1, settlementGross: true });
      }
    } else if (isCreditNote(tx)) {
      for (const allocation of data.creditAllocations || []) {
        if (allocation.creditNoteId !== tx.id) continue;
        rows.push({ date: allocation.date, amount: allocation.amount, sign: -1, settlementGross: true });
      }
    }

    for (const row of rows) {
      if (row.date < from || row.date > to) continue;
      const split = basAmountSplit(row.amount, tx.gstMode, rate, row.settlementGross);
      const isFree = tx.gstMode === 'free';
      const line = addBasLine(tx.type === 'income' ? salesLines : purchasesLines, tx, data, row.date, row.amount, row.sign, row.settlementGross);

      if (tx.type === 'income') {
        salesGross += row.sign * split.total;
        salesNet += row.sign * split.net;
        gstCollected += row.sign * split.gst;
        if (isFree) gstFreeIncome += row.sign * split.total;
      } else {
        purchasesGross += row.sign * split.total;
        purchasesNet += row.sign * split.net;
        gstPaid += row.sign * split.gst;
        if (isFree) gstFreePurchases += row.sign * split.total;
      }
      line.id = `${line.id}:${salesLines.length + purchasesLines.length}`;
    }
  }

  return {
    from, to,
    salesGross: +salesGross.toFixed(2),
    salesNet: +salesNet.toFixed(2),
    gstCollected: +gstCollected.toFixed(2),
    purchasesGross: +purchasesGross.toFixed(2),
    purchasesNet: +purchasesNet.toFixed(2),
    gstPaid: +gstPaid.toFixed(2),
    netGst: +(gstCollected - gstPaid).toFixed(2),
    gstFreeIncome: +gstFreeIncome.toFixed(2),
    gstFreePurchases: +gstFreePurchases.toFixed(2),
    salesLines: salesLines.sort((a, b) => a.date.localeCompare(b.date)),
    purchasesLines: purchasesLines.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function arApAging(data: LedgerData, type: 'income' | 'expense', refDate = todayStr()) {
  const buckets = [
    { key: 'current', label: 'Current', from: -Infinity, to: 0, amount: 0 },
    { key: '1_30', label: '1-30', from: 1, to: 30, amount: 0 },
    { key: '31_60', label: '31-60', from: 31, to: 60, amount: 0 },
    { key: '61_90', label: '61-90', from: 61, to: 90, amount: 0 },
    { key: '90_plus', label: '90+', from: 91, to: Infinity, amount: 0 },
  ];
  const rows = data.transactions
    .filter((tx) => isInvoice(tx) && tx.type === type && txBalance(tx, data) > 0.005)
    .map((tx) => {
      const dueDate = tx.dueDate || tx.date;
      const daysPastDue = Math.floor((new Date(refDate).getTime() - new Date(dueDate).getTime()) / 86400000);
      const balance = txBalance(tx, data);
      const bucket = buckets.find((item) => daysPastDue >= item.from && daysPastDue <= item.to) || buckets[buckets.length - 1];
      bucket.amount += balance;
      return { tx, dueDate, daysPastDue, balance, bucket: bucket.key };
    })
    .sort((a, b) => b.daysPastDue - a.daysPastDue || a.dueDate.localeCompare(b.dueDate));
  return { buckets, rows, total: buckets.reduce((sum, bucket) => sum + bucket.amount, 0) };
}
