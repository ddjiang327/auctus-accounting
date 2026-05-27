import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_DATA } from '../data/defaultData';
import type { LedgerData } from '../domain/models';

const STORAGE_KEY = 'auctus_mobile_data_v1';

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
      businessProfile: { ...base.settings.businessProfile, ...(raw.settings?.businessProfile || {}) },
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
    recurringTemplates: raw.recurringTemplates || [],
    bankReconciliations: (raw.bankReconciliations || []).map((item) => ({
      ...item,
      bookBalance: item.bookBalance ?? item.statementBalance,
      difference: item.difference ?? 0,
      finalizedAt: item.finalizedAt || item.createdAt || new Date().toISOString(),
    })),
    bankFeedItems: raw.bankFeedItems || [],
    auditLog: raw.auditLog || [],
    products: raw.products || [],
    inventoryItems: raw.inventoryItems || [],
    inventoryMovements: raw.inventoryMovements || [],
  };
  for (const defaultAccount of DEFAULT_CHART_OF_ACCOUNTS) {
    if (!data.chartOfAccounts.some((account) => account.code === defaultAccount.code)) {
      data.chartOfAccounts.push(defaultAccount);
    }
  }
  data.accounts = data.accounts.map((account) => {
    if (account.chartAccountId) return account;
    const fallbackCode = account.type === 'cash' ? '1000'
      : account.type === 'bank' ? (account.name.toLowerCase().includes('saving') ? '1020' : '1010')
      : account.type === 'credit' ? '2200'
      : account.type === 'investment' ? '1400'
      : account.type === 'loan' ? '2500'
      : '1010';
    return { ...account, chartAccountId: data.chartOfAccounts.find((chart) => chart.code === fallbackCode)?.id || data.chartOfAccounts.find((chart) => chart.code === '1010')?.id || '' };
  });
  data.transactions = data.transactions.map((tx) => {
    if (tx.type === 'transfer') return tx;
    const clearingChartAccountId = tx.clearingChartAccountId || (tx.entryMode === 'invoice'
      || tx.entryMode === 'credit_note'
      ? data.chartOfAccounts.find((account) => account.code === (tx.type === 'income' ? '1100' : '2000'))?.id
      : undefined);
    const payments = (tx.payments || []).map((payment) => ({
      ...payment,
      receiptNo: tx.type === 'income' && !payment.receiptNo
        ? `${data.settings.receiptPrefix || 'REC-'}${payment.id.slice(-6).toUpperCase()}`
        : payment.receiptNo,
      receiptCreatedAt: tx.type === 'income' ? (payment.receiptCreatedAt || payment.date) : payment.receiptCreatedAt,
    }));
    if (tx.chartAccountId) return { ...tx, clearingChartAccountId, payments: tx.payments ? payments : tx.payments };
    if (tx.type === 'income') {
      const cat = [...data.categories.income, ...data.categories.expense].find((item) => item.id === tx.categoryId);
      const code = cat?.id === 'i_rent' ? '4110' : cat?.id === 'i_int' ? '4100' : '4010';
      return { ...tx, chartAccountId: data.chartOfAccounts.find((account) => account.code === code)?.id, clearingChartAccountId, payments: tx.payments ? payments : tx.payments };
    }
    const map: Record<string, string> = { e_rent: '7010', e_util: '7020', e_phone: '7020', e_tax: '8010', e_build: '7030', e_fuel: '6020' };
    const code = tx.categoryId ? map[tx.categoryId] : undefined;
    return { ...tx, chartAccountId: data.chartOfAccounts.find((account) => account.code === code)?.id || data.chartOfAccounts.find((account) => account.code === '7030')?.id, clearingChartAccountId, payments: tx.payments ? payments : tx.payments };
  });
  return data;
}

export async function loadLedgerData(): Promise<LedgerData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    return normalizeData(JSON.parse(raw) as LedgerData);
  } catch {
    return cloneDefault();
  }
}

export async function saveLedgerData(data: LedgerData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function resetLedgerData() {
  const data = cloneDefault();
  await saveLedgerData(data);
  return data;
}

export async function exportLedgerBackup(data: LedgerData) {
  const fileUri = `${FileSystem.cacheDirectory}auctus-backup-${new Date().toISOString().slice(0, 10)}.json`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Back up Auctus' });
  }
}

export async function importLedgerBackup() {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
  return normalizeData(JSON.parse(raw) as LedgerData);
}

const MODE_PREFERENCE_KEY = 'auctus_mode_preference';

export async function getModePreference(): Promise<'local' | 'cloud' | null> {
  try {
    const val = await AsyncStorage.getItem(MODE_PREFERENCE_KEY);
    if (val === 'local' || val === 'cloud') return val;
    return null;
  } catch {
    return null;
  }
}

export async function setModePreference(mode: 'local' | 'cloud') {
  await AsyncStorage.setItem(MODE_PREFERENCE_KEY, mode);
}

export async function clearModePreference() {
  await AsyncStorage.removeItem(MODE_PREFERENCE_KEY);
}
