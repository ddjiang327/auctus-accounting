import { DEFAULT_DATA } from '../data/defaultData';
import type { LedgerData } from '../domain/models';

const STORAGE_KEY = 'auctus_react_data_v1';
const LEGACY_STORAGE_KEY = 'ledger_au_data_v1';

function cloneDefault(): LedgerData {
  return JSON.parse(JSON.stringify(DEFAULT_DATA)) as LedgerData;
}

export function normalizeData(raw: Partial<LedgerData> | null | undefined): LedgerData {
  const base = cloneDefault();
  if (!raw) return base;
  const data = {
    ...base,
    ...raw,
    meta: { ...base.meta, ...(raw.meta || {}), version: 2 },
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      gstRate: 0.1,
      inventoryStateVersion: raw.settings?.inventoryStateVersion || 1,
      payrollStateVersion: raw.settings?.payrollStateVersion || 1,
    },
    accounts: raw.accounts?.length ? raw.accounts : base.accounts,
    chartOfAccounts: raw.chartOfAccounts?.length ? raw.chartOfAccounts : base.chartOfAccounts,
    categories: {
      expense: raw.categories?.expense?.length ? raw.categories.expense : base.categories.expense,
      income: raw.categories?.income?.length ? raw.categories.income : base.categories.income,
    },
    transactions: raw.transactions || [],
    budgets: raw.budgets || [],
    contacts: raw.contacts || [],
    manualJournals: raw.manualJournals || [],
    creditAllocations: raw.creditAllocations || [],
    periodLocks: raw.periodLocks || [],
    bankReconciliations: raw.bankReconciliations || [],
    bankFeedItems: raw.bankFeedItems || [],
    recurringTemplates: raw.recurringTemplates || [],
    auditLog: raw.auditLog || [],
    products: raw.products || [],
    inventoryItems: raw.inventoryItems || [],
    inventoryMovements: raw.inventoryMovements || [],
    employees: raw.employees || [],
    payRuns: raw.payRuns || [],
    remittances: raw.remittances || [],
    stpSubmissions: raw.stpSubmissions || [],
    purchaseOrders: raw.purchaseOrders || [],
    fixedAssets: raw.fixedAssets || [],
    depreciationRuns: raw.depreciationRuns || [],
  };
  data.accounts = data.accounts.map((account) => {
    if (account.chartAccountId) return account;
    const fallbackCode = account.type === 'cash' ? '1000'
      : account.type === 'bank' ? (account.name.toLowerCase().includes('saving') ? '1020' : '1010')
      : account.type === 'credit' ? '2200'
      : account.type === 'investment' ? '1400'
      : account.type === 'loan' ? '2500'
      : '1010';
    const chartAccountId = data.chartOfAccounts.find((chart) => chart.code === fallbackCode)?.id
      || data.chartOfAccounts.find((chart) => chart.code === '1010')?.id
      || data.chartOfAccounts[0]?.id
      || '';
    return { ...account, chartAccountId };
  });
  data.transactions = data.transactions.map((tx) => {
    if (tx.type === 'transfer') return tx;
    const clearingChartAccountId = tx.clearingChartAccountId || (tx.entryMode === 'invoice'
      ? data.chartOfAccounts.find((account) => account.code === (tx.type === 'income' ? '1100' : '2000'))?.id
      : undefined);
    if (tx.chartAccountId) return { ...tx, clearingChartAccountId };
    if (tx.type === 'income') {
      const cat = [...data.categories.income, ...data.categories.expense].find((item) => item.id === tx.categoryId);
      const code = cat?.id === 'i_rent' ? '4110' : cat?.id === 'i_int' ? '4100' : '4010';
      return { ...tx, chartAccountId: data.chartOfAccounts.find((account) => account.code === code)?.id, clearingChartAccountId };
    }
    const map: Record<string, string> = { e_rent: '7010', e_util: '7020', e_phone: '7020', e_tax: '8010', e_build: '7030', e_fuel: '6020' };
    const code = tx.categoryId ? map[tx.categoryId] : undefined;
    return { ...tx, chartAccountId: data.chartOfAccounts.find((account) => account.code === code)?.id || data.chartOfAccounts.find((account) => account.code === '7030')?.id, clearingChartAccountId };
  });
  return data;
}

export function loadLedgerData(): LedgerData {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeData(JSON.parse(current) as LedgerData);

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = normalizeData(JSON.parse(legacy) as LedgerData);
      saveLedgerData(migrated);
      return migrated;
    }
  } catch (error) {
    console.warn('Failed to load ledger data', error);
  }
  return cloneDefault();
}

export function saveLedgerData(data: LedgerData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetLedgerData() {
  const data = cloneDefault();
  saveLedgerData(data);
  return data;
}
