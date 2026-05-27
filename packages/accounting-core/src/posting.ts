import type { ChartAccount, InvoicePayment, JournalEntry, LedgerData, Transaction } from '@auctus/shared-types';
import { allInventoryJournalEntries } from './inventory.js';
import { getAccount, getCategory, gstCollectedAccountId, gstPaidAccountId, openingBalanceEquityId } from './accounts.js';
import { inRange } from './dates.js';
import { contactName, isCreditNote, isInvoice } from './documents.js';
import { gstSplit, txTotal } from './gst.js';

function effectiveGstMode(tx: Transaction, data: LedgerData) {
  return data.settings.gstEnabled ? tx.gstMode : null;
}

export function accountBalance(data: LedgerData, accId: string) {
  const acc = getAccount(data, accId);
  if (!acc) return 0;
  const chart = data.chartOfAccounts.find((account) => account.id === acc.chartAccountId);
  const balance = accountLedgerBalance(data, acc.chartAccountId);
  return chart?.normalBalance === 'credit' ? -balance : balance;
}

export function totalAssets(data: LedgerData) {
  const position = financialPosition(data);
  return { assets: position.assets, liabilities: position.liabilities, net: position.net };
}

export function txJournalEntry(tx: Transaction, data: LedgerData): JournalEntry | null {
  if (tx.voidedAt) return null;
  const total = txTotal(tx, data);
  const mode = effectiveGstMode(tx, data);
  const split = gstSplit(tx.amount, mode, data.settings.gstRate);
  const net = (!mode || mode === 'free') ? total : split.net;
  const gst = (!mode || mode === 'free') ? 0 : split.gst;

  if (tx.type === 'transfer') {
    const from = getAccount(data, tx.accountId);
    const to = getAccount(data, tx.accountToId);
    if (!from?.chartAccountId || !to?.chartAccountId) return null;
    const amount = Number(tx.amount) || 0;
    const lineForDisplayChange = (chartAccountId: string, delta: number) => delta >= 0
      ? { chartAccountId, debit: Math.abs(delta), credit: 0 }
      : { chartAccountId, debit: 0, credit: Math.abs(delta) };
    return {
      id: `je_${tx.id}`,
      date: tx.date,
      memo: 'Transfer',
      sourceId: tx.id,
      lines: [
        lineForDisplayChange(to.chartAccountId, amount),
        lineForDisplayChange(from.chartAccountId, -amount),
      ],
    };
  }

  if (!tx.chartAccountId) return null;

  if (isCreditNote(tx)) {
    if (!tx.clearingChartAccountId) return null;
    const party = contactName(data, tx.contactId, tx.party);
    const label = `${tx.type === 'income' ? 'Credit Note' : 'Supplier Credit'}${tx.creditNoteNo ? ' #' + tx.creditNoteNo : ''}${party ? ' – ' + party : ''}`;
    if (tx.type === 'income') {
      const lines: JournalEntry['lines'] = [{ chartAccountId: tx.chartAccountId, debit: net, credit: 0 }];
      const gstAccount = gstCollectedAccountId(data);
      if (gst > 0 && gstAccount) lines.push({ chartAccountId: gstAccount, debit: gst, credit: 0 });
      lines.push({ chartAccountId: tx.clearingChartAccountId, debit: 0, credit: total });
      return { id: `je_${tx.id}`, date: tx.date, memo: label, sourceId: tx.id, lines };
    }
    const lines: JournalEntry['lines'] = [{ chartAccountId: tx.clearingChartAccountId, debit: total, credit: 0 }];
    lines.push({ chartAccountId: tx.chartAccountId, debit: 0, credit: net });
    const gstAccount = gstPaidAccountId(data);
    if (gst > 0 && gstAccount) lines.push({ chartAccountId: gstAccount, debit: 0, credit: gst });
    return { id: `je_${tx.id}`, date: tx.date, memo: label, sourceId: tx.id, lines };
  }

  if (isInvoice(tx)) {
    if (!tx.clearingChartAccountId) return null;
    const party = contactName(data, tx.contactId, tx.party);
    const label = `${tx.type === 'income' ? 'Invoice' : 'Bill'}${tx.invoiceNo ? ' #' + tx.invoiceNo : ''}${party ? ' – ' + party : ''}`;
    if (tx.type === 'income') {
      const lines = [{ chartAccountId: tx.clearingChartAccountId, debit: total, credit: 0 }, { chartAccountId: tx.chartAccountId, debit: 0, credit: net }];
      const gstAccount = gstCollectedAccountId(data);
      if (gst > 0 && gstAccount) lines.push({ chartAccountId: gstAccount, debit: 0, credit: gst });
      return { id: `je_${tx.id}`, date: tx.date, memo: label, sourceId: tx.id, lines };
    }
    const lines = [{ chartAccountId: tx.chartAccountId, debit: net, credit: 0 }];
    const gstAccount = gstPaidAccountId(data);
    if (gst > 0 && gstAccount) lines.push({ chartAccountId: gstAccount, debit: gst, credit: 0 });
    lines.push({ chartAccountId: tx.clearingChartAccountId, debit: 0, credit: total });
    return { id: `je_${tx.id}`, date: tx.date, memo: label, sourceId: tx.id, lines };
  }

  const account = getAccount(data, tx.accountId);
  if (!account?.chartAccountId) return null;
  const memo = tx.note || getCategory(data, tx.categoryId)?.name || (tx.type === 'income' ? 'Income' : 'Expense');
  if (tx.type === 'income') {
    const lines = [{ chartAccountId: account.chartAccountId, debit: total, credit: 0 }, { chartAccountId: tx.chartAccountId, debit: 0, credit: net }];
    const gstAccount = gstCollectedAccountId(data);
    if (gst > 0 && gstAccount) lines.push({ chartAccountId: gstAccount, debit: 0, credit: gst });
    return { id: `je_${tx.id}`, date: tx.date, memo, sourceId: tx.id, lines };
  }
  const lines = [{ chartAccountId: tx.chartAccountId, debit: net, credit: 0 }];
  const gstAccount = gstPaidAccountId(data);
  if (gst > 0 && gstAccount) lines.push({ chartAccountId: gstAccount, debit: gst, credit: 0 });
  lines.push({ chartAccountId: account.chartAccountId, debit: 0, credit: total });
  return { id: `je_${tx.id}`, date: tx.date, memo, sourceId: tx.id, lines };
}

export function openingBalanceEntries(data: LedgerData): JournalEntry[] {
  const equityId = openingBalanceEquityId(data);
  if (!equityId) return [];
  return data.accounts
    .filter((account) => account.chartAccountId && Math.abs(Number(account.initBalance) || 0) > 0.005)
    .map((account) => {
      const balance = Number(account.initBalance) || 0;
      const amount = Math.abs(balance);
      const accountLine = balance >= 0
        ? { chartAccountId: account.chartAccountId, debit: amount, credit: 0 }
        : { chartAccountId: account.chartAccountId, debit: 0, credit: amount };
      const equityLine = balance >= 0
        ? { chartAccountId: equityId, debit: 0, credit: amount }
        : { chartAccountId: equityId, debit: amount, credit: 0 };
      return {
        id: `je_open_${account.id}`,
        date: data.meta.createdAt.slice(0, 10),
        memo: `Opening balance - ${account.name}`,
        sourceId: `opening_${account.id}`,
        lines: [accountLine, equityLine],
      };
    });
}

export function paymentJournalEntry(tx: Transaction, payment: InvoicePayment, data: LedgerData): JournalEntry | null {
  if (!tx.clearingChartAccountId) return null;
  const payAccount = getAccount(data, payment.accountId);
  if (!payAccount?.chartAccountId) return null;
  const party = contactName(data, tx.contactId, tx.party);
  const memo = `Payment ${tx.type === 'income' ? 'received' : 'made'}${party ? ' – ' + party : ''}`;
  return tx.type === 'income'
    ? { id: `je_${payment.id}`, date: payment.date, memo, sourceId: payment.id, lines: [{ chartAccountId: payAccount.chartAccountId, debit: payment.amount, credit: 0 }, { chartAccountId: tx.clearingChartAccountId, debit: 0, credit: payment.amount }] }
    : { id: `je_${payment.id}`, date: payment.date, memo, sourceId: payment.id, lines: [{ chartAccountId: tx.clearingChartAccountId, debit: payment.amount, credit: 0 }, { chartAccountId: payAccount.chartAccountId, debit: 0, credit: payment.amount }] };
}

export function allJournalEntries(data: LedgerData): JournalEntry[] {
  const entries: JournalEntry[] = [...openingBalanceEntries(data)];
  for (const journal of data.manualJournals || []) {
    if (journal.voidedAt) continue;
    entries.push({
      id: `je_${journal.id}`,
      date: journal.date,
      memo: journal.memo || 'Manual journal',
      sourceId: journal.id,
      lines: journal.lines,
    });
  }
  for (const tx of data.transactions) {
    if (tx.voidedAt) continue;
    const entry = txJournalEntry(tx, data);
    if (entry) entries.push(entry);
    if (isInvoice(tx)) {
      for (const payment of tx.payments || []) {
        if (payment.voidedAt) continue;
        const pe = paymentJournalEntry(tx, payment, data);
        if (pe) entries.push(pe);
      }
    }
  }
  for (const entry of allInventoryJournalEntries(data)) {
    entries.push(entry);
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export interface ChartAccountBalance {
  account: ChartAccount;
  debit: number;
  credit: number;
  balance: number;
}

export function chartAccountBalances(data: LedgerData): ChartAccountBalance[] {
  const totals: Record<string, { debit: number; credit: number }> = {};
  for (const entry of allJournalEntries(data)) {
    for (const line of entry.lines) {
      if (!totals[line.chartAccountId]) totals[line.chartAccountId] = { debit: 0, credit: 0 };
      totals[line.chartAccountId].debit += Number(line.debit) || 0;
      totals[line.chartAccountId].credit += Number(line.credit) || 0;
    }
  }
  return data.chartOfAccounts
    .filter((account) => totals[account.id])
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((account) => {
      const total = totals[account.id];
      const net = total.debit - total.credit;
      const balance = account.normalBalance === 'debit' ? net : -net;
      return { account, debit: total.debit, credit: total.credit, balance };
    });
}

export function accountLedgerBalance(data: LedgerData, chartAccountId: string) {
  return chartAccountBalances(data).find((row) => row.account.id === chartAccountId)?.balance || 0;
}

export function financialPosition(data: LedgerData) {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let expenses = 0;
  for (const row of chartAccountBalances(data)) {
    const amount = row.balance;
    if (row.account.class === 'asset') assets += amount;
    if (row.account.class === 'liability') liabilities += amount;
    if (row.account.class === 'equity') equity += amount;
    if (row.account.class === 'revenue') revenue += amount;
    if (row.account.class === 'expense') expenses += amount;
  }
  const netIncome = revenue - expenses;
  return {
    assets,
    liabilities,
    equity,
    revenue,
    expenses,
    netIncome,
    totalEquity: equity + netIncome,
    check: assets - liabilities - equity - netIncome,
    net: assets - liabilities,
  };
}

export interface LedgerRow {
  id: string;
  sourceId: string;
  date: string;
  memo: string;
  debit: number;
  credit: number;
  balance: number;
}

export function chartAccountLedger(data: LedgerData, chartAccountId: string): LedgerRow[] {
  const account = data.chartOfAccounts.find((a) => a.id === chartAccountId);
  if (!account) return [];
  let balance = 0;
  return allJournalEntries(data)
    .filter((e) => e.lines.some((l) => l.chartAccountId === chartAccountId))
    .map((entry) => {
      const line = entry.lines
        .filter((l) => l.chartAccountId === chartAccountId)
        .reduce((sum, item) => ({ chartAccountId, debit: sum.debit + item.debit, credit: sum.credit + item.credit }), { chartAccountId, debit: 0, credit: 0 });
      const net = line.debit - line.credit;
      balance += account.normalBalance === 'debit' ? net : -net;
      return { id: entry.id, sourceId: entry.sourceId, date: entry.date, memo: entry.memo, debit: line.debit, credit: line.credit, balance };
    });
}

export function journalEntriesInRange(data: LedgerData, range: readonly [Date, Date]): JournalEntry[] {
  return allJournalEntries(data).filter((entry) => inRange(entry.date, range));
}

export function trialBalance(data: LedgerData): Array<{ account: ChartAccount; debit: number; credit: number }> {
  return chartAccountBalances(data)
    .filter((row) => Math.abs(row.balance) > 0.005)
    .map(({ account, balance }) => {
      const debit = account.normalBalance === 'debit' ? balance : -balance;
      return { account, debit: debit > 0 ? debit : 0, credit: debit < 0 ? Math.abs(debit) : 0 };
    });
}
