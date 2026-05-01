import type { Account, ChartAccount, LedgerData, TransactionType } from '@auctus/shared-types';

export function getAccount(data: LedgerData, id?: string) {
  return data.accounts.find((account) => account.id === id);
}

export function getCategory(data: LedgerData, id?: string) {
  return [...data.categories.expense, ...data.categories.income].find((category) => category.id === id);
}

export function chartAccountName(data: LedgerData, id?: string) {
  const account = data.chartOfAccounts.find((item) => item.id === id);
  return account ? `${account.code} · ${account.name}` : 'Unassigned';
}

const SYSTEM_CHART_ACCOUNT_CODES = new Set(['1100', '1130', '2000', '2130', '3150']);

export function isSystemChartAccount(account?: ChartAccount | null) {
  return !!account && SYSTEM_CHART_ACCOUNT_CODES.has(account.code);
}

export function chartAccountSort(a: ChartAccount, b: ChartAccount) {
  const group = a.group.localeCompare(b.group);
  if (group !== 0) return group;
  return a.code.localeCompare(b.code);
}

export function chartAccountHasHistory(data: LedgerData, chartAccountId: string) {
  const linkedPaymentAccounts = data.accounts.filter((account) => account.chartAccountId === chartAccountId);
  if (linkedPaymentAccounts.some((account) => Math.abs(Number(account.initBalance) || 0) > 0.005)) return true;
  const linkedPaymentIds = new Set(linkedPaymentAccounts.map((account) => account.id));
  if (data.transactions.some((tx) =>
    tx.chartAccountId === chartAccountId ||
    tx.clearingChartAccountId === chartAccountId ||
    (tx.accountId && linkedPaymentIds.has(tx.accountId)) ||
    (tx.accountToId && linkedPaymentIds.has(tx.accountToId)) ||
    (tx.payments || []).some((payment) => linkedPaymentIds.has(payment.accountId))
  )) return true;
  if ((data.manualJournals || []).some((journal) => journal.lines.some((line) => line.chartAccountId === chartAccountId))) return true;
  if ((data.bankReconciliations || []).some((reconciliation) => linkedPaymentIds.has(reconciliation.accountId))) return true;
  if ((data.bankFeedItems || []).some((item) => linkedPaymentIds.has(item.accountId))) return true;
  return false;
}

export function clearingAccountId(data: LedgerData, type: TransactionType) {
  if (type === 'income') return data.chartOfAccounts.find((account) => account.code === '1100')?.id || '';
  if (type === 'expense') return data.chartOfAccounts.find((account) => account.code === '2000')?.id || '';
  return '';
}

export function chartAccountByCode(data: LedgerData, code: string) {
  return data.chartOfAccounts.find((account) => account.code === code);
}

export function openingBalanceEquityId(data: LedgerData) {
  return chartAccountByCode(data, '3150')?.id || chartAccountByCode(data, '3000')?.id || '';
}

export function gstPaidAccountId(data: LedgerData) {
  return chartAccountByCode(data, '1130')?.id || '';
}

export function gstCollectedAccountId(data: LedgerData) {
  return chartAccountByCode(data, '2130')?.id || chartAccountByCode(data, '2120')?.id || '';
}

export function defaultChartAccountId(data: LedgerData, type: TransactionType, categoryId?: string) {
  if (type === 'income') {
    const cat = getCategory(data, categoryId);
    if (cat?.chartAccountId) return cat.chartAccountId;
    if (cat?.id === 'i_rent') return data.chartOfAccounts.find((account) => account.code === '4110')?.id || '';
    if (cat?.id === 'i_int') return data.chartOfAccounts.find((account) => account.code === '4100')?.id || '';
    return data.chartOfAccounts.find((account) => account.code === '4010')?.id || data.chartOfAccounts.find((account) => account.class === 'revenue')?.id || '';
  }
  if (type === 'expense') {
    const cat = getCategory(data, categoryId);
    if (cat?.chartAccountId) return cat.chartAccountId;
    const map: Record<string, string> = { e_rent: '7010', e_util: '7020', e_phone: '7020', e_tax: '8010', e_build: '7030', e_fuel: '6020' };
    const code = cat?.id ? map[cat.id] : undefined;
    return data.chartOfAccounts.find((account) => account.code === code)?.id || data.chartOfAccounts.find((account) => account.code === '7030')?.id || data.chartOfAccounts.find((account) => account.class === 'expense')?.id || '';
  }
  return '';
}

export function accountTypeLabel(account: Account) {
  const labels: Record<string, string> = {
    cash: 'Cash',
    bank: 'Bank Account',
    ewallet: 'Digital Wallet',
    credit: 'Credit Card',
    investment: 'Investment',
    loan: 'Loan',
    other: 'Other',
  };
  return labels[account.type] || account.type;
}
