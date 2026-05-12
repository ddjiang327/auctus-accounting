import { useEffect, useState } from 'react';
import { AppLock } from './components/AppLock';
import { Shell, type ViewKey } from './components/Shell';
import { accountBalance, auditEntry, dueDateForTerms, fmt, formatCreditNumber, formatDocumentNumber, isDateLocked, latestLockedThrough, todayStr, txBalance, uid, validateCreditAllocations, validatePaymentInput, validateTransactionInput } from './domain/accounting';
import type { Account, BankFeedItem, BankReconciliation, BusinessProfile, Category, Contact, CreditAllocation, LedgerData, ManualJournal, Period, Transaction } from './domain/models';
import { AuctusApiError, auctusApi, isAuctusApiConfigured, getBusinesses, selectBusiness, getSelectedBusinessId, devAutoSignIn, logout, type BusinessSummary } from './api/auctusApi';
import { getCurrentUser } from './api/supabaseClient';
import { Activity } from './features/activity/Activity';
import { TransactionModal } from './features/activity/TransactionModal';
import { Accounts } from './features/accounts/Accounts';
import { Dashboard } from './features/dashboard/Dashboard';
import { Contacts } from './features/contacts/Contacts';
import { Documents } from './features/documents/Documents';
import { Journals } from './features/journals/Journals';
import { Reports } from './features/reports/Reports';
import { Settings } from './features/settings/Settings';
import { ledgerDataAdapter } from './storage/ledgerDataAdapter';
import { clearLockState, loadLockState, saveLockState } from './storage/lockStore';
import { AuthScreen } from './components/AuthScreen';
import { WorkspaceSelector } from './components/WorkspaceSelector';
import { permissionsForRole } from './domain/permissions';
import { AppAlertsProvider } from './components/AppAlerts';

type AuthPhase = 'checking' | 'login' | 'workspace' | 'app';
type AppMode = 'local' | 'cloud';
type SyncState = 'idle' | 'syncing' | 'error';
type SyncError = { message: string; nonce: number };

export default function App() {
  const [data, setData] = useState<LedgerData>(() => ledgerDataAdapter.load());
  const [lockState, setLockState] = useState(() => loadLockState());
  const [locked, setLocked] = useState(() => loadLockState().enabled);
  const [view, setView] = useState<ViewKey>('dashboard');
  const [period, setPeriod] = useState<Period>('month');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txDefaults, setTxDefaults] = useState<Partial<Transaction> | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);

  const [authPhase, setAuthPhase] = useState<AuthPhase>('checking');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessSummary | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const [initialLedgerLoaded, setInitialLedgerLoaded] = useState(() => !isAuctusApiConfigured());

  const mode: AppMode = isAuctusApiConfigured() ? 'cloud' : 'local';
  const permissions = permissionsForRole(selectedBusiness?.role, mode);

  useEffect(() => {
    if (mode !== 'cloud') {
      setAuthPhase('app');
      return;
    }

    async function initAuth() {
      try {
        if (import.meta.env.DEV) {
          const session = await devAutoSignIn();
          if (session) {
            await loadWorkspaces();
            return;
          }
        }

        const user = await getCurrentUser();
        if (!user) {
          setAuthPhase('login');
          return;
        }

        await loadWorkspaces();
      } catch {
        setAuthPhase('login');
      }
    }

    initAuth();
  }, [mode]);

  function reportError(error: unknown, fallbackMessage = 'Request failed.') {
    if (error instanceof AuctusApiError && error.statusCode === 401) {
      setAuthNotice('Session expired. Please sign in again.');
      void handleLogout();
      return;
    }

    const message = error instanceof AuctusApiError && error.statusCode === 403
      ? 'You do not have permission to perform this action.'
      : error instanceof AuctusApiError && error.statusCode === 0
        ? 'Cannot reach the server. Check your connection and retry.'
        : error instanceof Error
          ? error.message
          : fallbackMessage;

    setSyncState('error');
    setSyncError({ message, nonce: Date.now() });
  }

  async function loadWorkspaces() {
    try {
      const list = await getBusinesses();
      setBusinesses(list);

      const savedId = getSelectedBusinessId();
      const match = savedId ? list.find((b) => b.id === savedId) : undefined;

      if (match) {
        setSelectedBusiness(match);
        setInitialLedgerLoaded(false);
        setAuthPhase('app');
      } else if (list.length === 1) {
        handleSelectBusiness(list[0]);
      } else {
        setAuthPhase('workspace');
      }
    } catch (error) {
      reportError(error, 'Failed to load workspaces');
      setAuthPhase('login');
    }
  }

  function handleAuthenticated() {
    setAuthNotice(null);
    loadWorkspaces();
  }

  function handleSelectBusiness(business: BusinessSummary) {
    selectBusiness(business.id);
    setBusinesses((current) => current.some((item) => item.id === business.id) ? current : [...current, business]);
    setSelectedBusiness(business);
    setInitialLedgerLoaded(false);
    setAuthPhase('app');
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // ignore
    }
    setSelectedBusiness(null);
    setBusinesses([]);
    setInitialLedgerLoaded(false);
    setAuthPhase('login');
  }

  function handleSwitchWorkspace() {
    setAuthPhase('workspace');
  }

  useEffect(() => {
    if (mode !== 'cloud' || authPhase !== 'app' || !selectedBusiness) return;
    refreshRemoteLedger();
  }, [mode, authPhase, selectedBusiness?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'cloud' && !initialLedgerLoaded) return;
    ledgerDataAdapter.save(data);
  }, [data, initialLedgerLoaded, mode]);

  function updateData(next: LedgerData) {
    setData(next);
  }

  async function refreshRemoteLedger() {
    setSyncState('syncing');
    setSyncError(null);
    try {
      const next = await auctusApi.loadLedger();
      setData(next);
      ledgerDataAdapter.save(next);
      setInitialLedgerLoaded(true);
      setSyncState('idle');
    } catch (error) {
      reportError(error, 'Sync failed');
    }
  }

  function dismissSyncError() {
    setSyncState('idle');
    setSyncError(null);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function describeBackupCandidate(raw: string) {
    const parsed = JSON.parse(raw) as unknown;
    const payload = parsed && typeof parsed === 'object' && 'ledger' in parsed
      ? (parsed as { ledger?: unknown }).ledger
      : parsed;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Backup file must contain a ledger object or Auctus backup envelope.');
    }
    const ledger = payload as Partial<LedgerData>;
    if (!ledger.settings || !Array.isArray(ledger.accounts) || !ledger.categories || !Array.isArray(ledger.transactions)) {
      throw new Error('Backup file is missing required ledger sections.');
    }
    return {
      transactions: ledger.transactions.length,
      accounts: ledger.accounts.length,
      contacts: Array.isArray(ledger.contacts) ? ledger.contacts.length : 0,
    };
  }

  function openNewTransaction() {
    setEditingTx(null);
    setTxDefaults(null);
    setTxModalOpen(true);
  }

  function openNewDocument(kind: 'invoices' | 'bills') {
    const type = kind === 'invoices' ? 'income' : 'expense';
    const today = new Date().toISOString().slice(0, 10);
    setEditingTx(null);
    setTxDefaults({
      type,
      entryMode: 'invoice',
      date: today,
      dueDate: dueDateForTerms(today, 'due_on_receipt'),
      paymentTerms: 'due_on_receipt',
      invoiceNo: mode === 'cloud' ? undefined : formatDocumentNumber(data, type),
      categoryId: type === 'income'
        ? data.categories.income.find((category) => !category.archivedAt)?.id
        : data.categories.expense.find((category) => !category.archivedAt)?.id,
      accountId: data.accounts[0]?.id,
      gstMode: data.settings.gstEnabled ? 'inc' : null,
    });
    setTxModalOpen(true);
  }

  function openNewCreditNote(kind: 'invoices' | 'bills') {
    const type = kind === 'invoices' ? 'income' : 'expense';
    const today = new Date().toISOString().slice(0, 10);
    setEditingTx(null);
    setTxDefaults({
      type,
      entryMode: 'credit_note',
      date: today,
      creditNoteNo: mode === 'cloud' ? undefined : formatCreditNumber(data, type),
      categoryId: type === 'income'
        ? data.categories.income.find((category) => !category.archivedAt)?.id
        : data.categories.expense.find((category) => !category.archivedAt)?.id,
      accountId: data.accounts[0]?.id,
      gstMode: data.settings.gstEnabled ? 'inc' : null,
    });
    setTxModalOpen(true);
  }

  function openEditTransaction(tx: Transaction) {
    setEditingTx(tx);
    setTxDefaults(null);
    setTxModalOpen(true);
  }

  async function saveTransaction(tx: Transaction) {
    if (mode === 'cloud') {
      const existing = data.transactions.find((item) => item.id === tx.id);
      if (existing) {
        try {
          const existingPaymentIds = new Set(existing.payments?.map((p) => p.id) || []);
          const newPayments = (tx.payments || [])
            .filter((payment) => !existingPaymentIds.has(payment.id))
            .map((payment) => ({
              amount: payment.amount,
              date: payment.date,
              accountId: payment.accountId,
            }));
          await auctusApi.updateTransaction(tx, newPayments);
          await refreshRemoteLedger();
          setTxModalOpen(false);
          setEditingTx(null);
          setTxDefaults(null);
        } catch (error) {
          reportError(error, 'Transaction update failed.');
        }
        return;
      }
      try {
        const created = await auctusApi.createTransaction(tx);
        for (const payment of tx.payments || []) {
          await auctusApi.recordPayment(created.id, {
            amount: payment.amount,
            date: payment.date,
            accountId: payment.accountId,
          });
        }
        await refreshRemoteLedger();
        setTxModalOpen(false);
        setEditingTx(null);
        setTxDefaults(null);
      } catch (error) {
        reportError(error, 'Transaction save failed.');
      }
      return;
    }

    const existing = data.transactions.find((item) => item.id === tx.id);
    if (existing && isDateLocked(data, existing.date)) {
      reportError(new Error(`This document or transaction is dated ${existing.date}, which is in a locked period. It cannot be edited.`));
      return;
    }
    const validation = validateTransactionInput(data, tx);
    if (!validation.ok) {
      reportError(new Error(validation.errors.join('\n')));
      return;
    }
    setData((current) => {
      const exists = current.transactions.some((item) => item.id === tx.id);
      const nextSettings = { ...current.settings };
      const documentNumber = tx.creditNoteNo || tx.invoiceNo || tx.note || tx.id;
      if (!exists && tx.entryMode === 'invoice') {
        if (tx.type === 'income') nextSettings.nextInvoiceNumber = (nextSettings.nextInvoiceNumber || 1) + 1;
        if (tx.type === 'expense') nextSettings.nextBillNumber = (nextSettings.nextBillNumber || 1) + 1;
      }
      if (!exists && tx.entryMode === 'credit_note') {
        if (tx.type === 'income') nextSettings.nextCreditNoteNumber = (nextSettings.nextCreditNoteNumber || 1) + 1;
        if (tx.type === 'expense') nextSettings.nextSupplierCreditNumber = (nextSettings.nextSupplierCreditNumber || 1) + 1;
      }
      return {
        ...current,
        settings: nextSettings,
        transactions: exists
          ? current.transactions.map((item) => item.id === tx.id ? tx : item)
          : [...current.transactions, tx],
        auditLog: [
          ...(current.auditLog || []),
          auditEntry(exists ? 'update' : 'create', 'transaction', tx.id, `${transactionAuditLabel(tx)} ${documentNumber}`),
        ],
      };
    });
    setTxModalOpen(false);
    setEditingTx(null);
    setTxDefaults(null);
  }

  async function saveAccount(account: Account) {
    if (mode === 'cloud') {
      const exists = data.accounts.some((item) => item.id === account.id);
      if (exists) await auctusApi.updatePaymentAccount(account);
      else await auctusApi.createPaymentAccount(account);
      await refreshRemoteLedger();
      return;
    }

    setData((current) => {
      const exists = current.accounts.some((item) => item.id === account.id);
      return {
        ...current,
        accounts: exists
          ? current.accounts.map((item) => item.id === account.id ? account : item)
          : [...current.accounts, account],
      };
    });
  }

  async function archiveAccount(accountId: string) {
    if (mode === 'cloud') {
      await auctusApi.archivePaymentAccount(accountId);
      await refreshRemoteLedger();
      return;
    }

    setData((current) => ({
      ...current,
      accounts: current.accounts.filter((item) => item.id !== accountId),
      auditLog: [
        ...(current.auditLog || []),
        auditEntry('archive', 'payment_account', accountId, 'Archived payment account'),
      ],
    }));
  }

  async function importBankFeedItems(accountId: string, items: BankFeedItem[]) {
    if (mode !== 'cloud') return;
    await auctusApi.importBankFeedItems(accountId, items);
    await refreshRemoteLedger();
  }

  async function matchBankFeedItem(itemId: string, sourceId?: string) {
    if (mode !== 'cloud') return;
    await auctusApi.matchBankFeedItem(itemId, sourceId);
    await refreshRemoteLedger();
  }

  async function ignoreBankFeedItem(itemId: string) {
    if (mode !== 'cloud') return;
    await auctusApi.ignoreBankFeedItem(itemId);
    await refreshRemoteLedger();
  }

  async function unignoreBankFeedItem(itemId: string) {
    if (mode !== 'cloud') return;
    await auctusApi.unignoreBankFeedItem(itemId);
    await refreshRemoteLedger();
  }

  async function recordBankFeedItem(item: BankFeedItem, transaction: Transaction) {
    if (mode !== 'cloud') return;
    const created = await auctusApi.createTransaction(transaction);
    await auctusApi.matchBankFeedItem(item.id, created.id);
    await refreshRemoteLedger();
  }

  async function finalizeBankReconciliation(reconciliation: BankReconciliation) {
    if (mode !== 'cloud') return;
    await auctusApi.finalizeBankReconciliation(reconciliation);
    await refreshRemoteLedger();
  }

  async function voidBankReconciliation(reconciliation: BankReconciliation) {
    if (mode !== 'cloud') return;
    await auctusApi.voidBankReconciliation(reconciliation.id);
    await refreshRemoteLedger();
  }

  async function saveContact(contact: Contact) {
    if (mode === 'cloud') {
      try {
        const exists = data.contacts.some((item) => item.id === contact.id);
        if (exists) await auctusApi.updateContact(contact);
        else await auctusApi.createContact(contact);
        await refreshRemoteLedger();
      } catch (error) {
        reportError(error, 'Contact save failed.');
      }
      return;
    }

    setData((current) => {
      const exists = current.contacts.some((item) => item.id === contact.id);
      return {
        ...current,
        contacts: exists
          ? current.contacts.map((item) => item.id === contact.id ? contact : item)
          : [...current.contacts, contact],
      };
    });
  }

  function applyCreditAllocations(allocations: Array<Omit<CreditAllocation, 'id'>>) {
    if (mode === 'cloud') {
      const result = validateCreditAllocations(data, allocations);
      if (!result.ok) {
        reportError(new Error(result.errors.join('\n')));
        return false;
      }
      Promise.all(allocations.map((allocation) => auctusApi.createCreditAllocation(allocation)))
        .then(() => refreshRemoteLedger())
        .catch((error) => {
          reportError(error, 'Credit allocation failed.');
        });
      return true;
    }

    const result = validateCreditAllocations(data, allocations);
    if (!result.ok) {
      reportError(new Error(result.errors.join('\n')));
      return false;
    }
    setData((current) => {
      const savedAllocations = allocations.map((allocation) => ({ ...allocation, id: uid('ca') }));
      const total = savedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      const creditNoteIds = Array.from(new Set(savedAllocations.map((allocation) => allocation.creditNoteId))).join(', ');
      return {
        ...current,
        creditAllocations: [
          ...current.creditAllocations,
          ...savedAllocations,
        ],
        auditLog: [
          ...(current.auditLog || []),
          auditEntry('apply', 'credit_allocation', savedAllocations.map((allocation) => allocation.id).join(','), `${savedAllocations.length} allocation(s), ${fmt(total)} total, credit note(s): ${creditNoteIds}`),
        ],
      };
    });
    return true;
  }

  function recordPayment(tx: Transaction) {
    const balance = txBalance(tx, data);
    const raw = window.prompt(`${tx.type === 'income' ? 'Receive payment' : 'Pay invoice'}\nBalance: $${fmt(balance)}`, balance.toFixed(2));
    if (raw === null) return;
    const amount = Number(raw);
    if (!amount || amount <= 0 || amount > balance + 0.005) return;
    const date = window.prompt('Payment date', new Date().toISOString().slice(0, 10));
    if (date === null) return;
    const paymentDate = date || new Date().toISOString().slice(0, 10);
    const payment = {
      amount: +amount.toFixed(2),
      date: paymentDate,
      accountId: tx.accountId || data.accounts[0]?.id || '',
    };
    const validation = validatePaymentInput(data, tx, payment);
    if (!validation.ok) {
      reportError(new Error(validation.errors.join('\n')));
      return;
    }
    if (mode === 'cloud') {
      auctusApi.recordPayment(tx.id, payment)
        .then(() => refreshRemoteLedger())
        .catch((error) => {
          reportError(error, 'Payment record failed.');
        });
      return;
    }
    setData((current) => {
      const paymentId = uid('p');
      return {
        ...current,
        transactions: current.transactions.map((item) => {
          if (item.id !== tx.id) return item;
          return {
            ...item,
            payments: [
              ...(item.payments || []),
              {
                ...payment,
                id: paymentId,
              },
            ],
          };
        }),
        auditLog: [
          ...(current.auditLog || []),
          auditEntry('record', 'payment', paymentId, `${tx.type === 'income' ? 'Received' : 'Paid'} ${fmt(payment.amount)} for ${tx.invoiceNo || tx.id} on ${payment.date}`),
        ],
      };
    });
  }

  function resetData() {
    if (mode === 'cloud') {
      if (!window.confirm('Reset backend ledger data to the default accounting foundation? This replaces transactions, contacts, accounts, journals, bank feed rows, reconciliations and period locks.')) return;
      auctusApi.resetLedger()
        .then((next) => {
          setData(next);
          ledgerDataAdapter.save(next);
        })
        .catch((error) => {
          reportError(error, 'Backend reset failed.');
        });
      return;
    }

    if (!window.confirm('Reset local React app data?')) return;
    const next = ledgerDataAdapter.reset();
    setData({
      ...next,
      auditLog: [
        ...(next.auditLog || []),
        auditEntry('reset', 'ledger_data', 'local', 'Reset local browser data to default ledger'),
      ],
    });
  }

  async function updateBusinessSettings(settings: Partial<LedgerData['settings']>) {
    if (mode === 'cloud') {
      await auctusApi.updateBusinessSettings(settings);
      await refreshRemoteLedger();
      return;
    }

    setData((current) => ({
      ...current,
      settings: { ...current.settings, ...settings },
      auditLog: [
        ...(current.auditLog || []),
        auditEntry('update', 'settings', 'business_settings', 'Updated business settings'),
      ],
    }));
  }

  async function updateBusinessProfile(businessProfile: BusinessProfile) {
    if (mode === 'cloud') {
      await auctusApi.updateBusinessProfile(businessProfile);
      await refreshRemoteLedger();
      return;
    }

    setData((current) => ({
      ...current,
      settings: { ...current.settings, businessProfile },
      auditLog: [
        ...(current.auditLog || []),
        auditEntry('update', 'settings', 'business_profile', 'Updated business profile'),
      ],
    }));
  }

  async function saveCategory(category: Category, type: 'income' | 'expense') {
    if (mode === 'cloud') {
      const exists = [...data.categories.income, ...data.categories.expense].some((item) => item.id === category.id);
      if (exists) {
        await auctusApi.updateCategory({ ...category, type });
      } else {
        await auctusApi.createCategory(type, category);
      }
      await refreshRemoteLedger();
      return;
    }

    const exists = [...data.categories.income, ...data.categories.expense].some((item) => item.id === category.id);
    setData((current) => {
      const nextTarget = exists
        ? current.categories[type].map((item) => item.id === category.id ? category : item)
        : [...current.categories[type], category];
      return {
        ...current,
        categories: {
          expense: type === 'expense' ? nextTarget : current.categories.expense,
          income: type === 'income' ? nextTarget : current.categories.income,
        },
        auditLog: [
          ...(current.auditLog || []),
          auditEntry(exists ? 'update' : 'create', 'category', category.id, category.name),
        ],
      };
    });
  }

  async function archiveCategory(categoryId: string) {
    if (mode === 'cloud') {
      await auctusApi.archiveCategory(categoryId);
      await refreshRemoteLedger();
      return;
    }

    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      categories: {
        income: current.categories.income.map((item) => item.id === categoryId ? { ...item, archivedAt: now } : item),
        expense: current.categories.expense.map((item) => item.id === categoryId ? { ...item, archivedAt: now } : item),
      },
      auditLog: [
        ...(current.auditLog || []),
        auditEntry('archive', 'category', categoryId, 'Archived category'),
      ],
    }));
  }

  async function createPeriodLock(lockedThrough: string, note: string) {
    if (mode === 'cloud') {
      await auctusApi.createPeriodLock(lockedThrough, note);
      await refreshRemoteLedger();
      return;
    }

    const lock = { id: uid('lock_'), lockedThrough, note, createdAt: new Date().toISOString() };
    setData((current) => ({
      ...current,
      periodLocks: [...(current.periodLocks || []), lock],
      auditLog: [
        ...(current.auditLog || []),
        auditEntry('lock', 'period', lock.id, `Locked through ${lockedThrough}${note ? ` · ${note}` : ''}`),
      ],
    }));
  }

  async function saveManualJournal(journal: ManualJournal) {
    if (mode === 'cloud') {
      const exists = data.manualJournals.some((item) => item.id === journal.id);
      if (exists) await auctusApi.updateManualJournal(journal);
      else await auctusApi.createManualJournal(journal);
      await refreshRemoteLedger();
      return;
    }

    const existingJournal = data.manualJournals.find((item) => item.id === journal.id);
    if (existingJournal && isDateLocked(data, existingJournal.date)) {
      reportError(new Error(`Manual journals dated ${existingJournal.date} cannot be changed because the period is locked.`));
      return;
    }
    if (isDateLocked(data, journal.date)) {
      reportError(new Error(`Manual journals dated ${journal.date} cannot be posted because the period is locked.`));
      return;
    }
    const exists = data.manualJournals.some((item) => item.id === journal.id);
    setData((current) => ({
      ...current,
      manualJournals: exists
        ? current.manualJournals.map((item) => item.id === journal.id ? { ...journal, updatedAt: new Date().toISOString() } : item)
        : [...(current.manualJournals || []), journal],
      auditLog: [...(current.auditLog || []), auditEntry(exists ? 'update' : 'create', 'manual_journal', journal.id, journal.memo)],
    }));
  }

  async function voidManualJournal(journal: ManualJournal) {
    if (mode === 'cloud') {
      await auctusApi.voidManualJournal(journal.id);
      await refreshRemoteLedger();
      return;
    }

    if (isDateLocked(data, journal.date)) {
      reportError(new Error(`Manual journal dated ${journal.date} cannot be voided because the period is locked.`));
      return;
    }
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      manualJournals: current.manualJournals.map((item) => item.id === journal.id ? { ...item, voidedAt: now } : item),
      auditLog: [...(current.auditLog || []), auditEntry('void', 'manual_journal', journal.id, journal.memo)],
    }));
  }

  async function reverseManualJournal(journal: ManualJournal) {
    if (mode === 'cloud') {
      await auctusApi.reverseManualJournal(journal.id);
      await refreshRemoteLedger();
      return;
    }

    if (isDateLocked(data, todayStr())) {
      reportError(new Error('Cannot post a reversal dated today because the period is locked.'));
      return;
    }
    const now = new Date().toISOString();
    const reversal: ManualJournal = {
      id: uid('mj_'),
      date: todayStr(),
      memo: `Reversal - ${journal.memo}`,
      lines: journal.lines.map((line) => ({ chartAccountId: line.chartAccountId, debit: line.credit, credit: line.debit })),
      createdAt: now,
      reversalOf: journal.id,
    };
    setData((current) => ({
      ...current,
      manualJournals: current.manualJournals.map((item) => item.id === journal.id ? { ...item, reversedAt: now } : item).concat(reversal),
      auditLog: [...(current.auditLog || []), auditEntry('reverse', 'manual_journal', journal.id, reversal.memo)],
    }));
  }

  async function clearPeriodLocks() {
    if (!window.confirm('Clear all period locks? This allows editing previously closed periods and will be recorded in the audit log.')) return;

    if (mode === 'cloud') {
      await auctusApi.clearPeriodLocks();
      await refreshRemoteLedger();
      return;
    }

    setData((current) => ({
      ...current,
      periodLocks: [],
      auditLog: [
        ...(current.auditLog || []),
        auditEntry('unlock', 'period', 'all', `Cleared locks through ${latestLockedThrough(current) || 'none'}`),
      ],
    }));
  }

  function backupData() {
    Promise.resolve(mode === 'cloud' ? auctusApi.exportBackup() : ledgerDataAdapter.exportBackup(data))
      .then((blob) => {
        downloadBlob(blob, `auctus-backup-${new Date().toISOString().slice(0, 10)}.json`);
      })
      .catch((error) => {
        reportError(error, 'Backup failed.');
      });
  }

  function restoreData(file: File) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = String(event.target?.result || '');
        const summary = describeBackupCandidate(raw);
        if (mode === 'cloud') {
          if (!window.confirm(`Restore backup with ${summary.transactions} transactions, ${summary.accounts} accounts and ${summary.contacts} contacts to this backend workspace? A safety backup of the current workspace will be downloaded first.`)) return;
          auctusApi.exportBackup()
            .then((blob) => {
              downloadBlob(blob, `auctus-pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
              return auctusApi.restoreBackup(raw);
            })
            .then((restored) => {
              setData(restored);
              ledgerDataAdapter.save(restored);
              setInitialLedgerLoaded(true);
            })
            .catch((error) => {
              reportError(error instanceof Error ? new Error(`Restore failed: ${error.message}`) : error, 'Restore failed');
            });
          return;
        }

        const restored = ledgerDataAdapter.importBackup(raw);
        if (!window.confirm(`Restore backup with ${summary.transactions} transactions, ${summary.accounts} accounts and ${summary.contacts} contacts? A safety backup of current local data will be downloaded first.`)) return;
        downloadBlob(ledgerDataAdapter.exportBackup(data), `auctus-pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        setData({
          ...restored,
          auditLog: [
            ...(restored.auditLog || []),
            auditEntry('restore', 'ledger_data', file.name || 'backup', `Restored backup with ${restored.transactions.length} transactions`),
          ],
        });
      } catch (error) {
        reportError(error instanceof Error ? new Error(`Restore failed: ${error.message}`) : error, 'Restore failed');
      }
    };
    reader.readAsText(file);
  }

  function transactionAuditLabel(tx: Transaction) {
    if (tx.entryMode === 'credit_note') return tx.type === 'income' ? 'Customer credit note' : 'Supplier credit';
    if (tx.entryMode === 'invoice') return tx.type === 'income' ? 'Invoice' : 'Bill';
    if (tx.type === 'transfer') return 'Transfer';
    return tx.type === 'income' ? 'Income transaction' : 'Expense transaction';
  }

  function enableLock() {
    const pin = window.prompt('Set app PIN');
    if (!pin) return;
    if (pin.length < 4) {
      reportError(new Error('PIN must be at least 4 characters.'));
      return;
    }
    const next = { enabled: true, pin };
    saveLockState(next);
    setLockState(next);
    setLocked(true);
  }

  function disableLock() {
    const pin = window.prompt('Enter current PIN to disable app lock');
    if (pin !== lockState.pin) {
      reportError(new Error('Wrong PIN'));
      return;
    }
    clearLockState();
    const next = { enabled: false, pin: '' };
    setLockState(next);
    setLocked(false);
  }

  function unlock(pin: string) {
    if (pin !== lockState.pin) return false;
    setLocked(false);
    return true;
  }

  if (locked && lockState.enabled) {
    return <AppLock onUnlock={unlock} />;
  }

  if (authPhase === 'checking') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="brand-mark">A</span>
            <div>
              <b>Auctus</b>
              <small>Loading…</small>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authPhase === 'login') {
    return <AuthScreen onAuthenticated={handleAuthenticated} notice={authNotice} />;
  }

  if (authPhase === 'workspace') {
    return <WorkspaceSelector businesses={businesses} onSelect={handleSelectBusiness} onLogout={handleLogout} />;
  }

  if (mode === 'cloud' && !initialLedgerLoaded) {
    return (
      <div className="auth-screen">
        <div className="auth-card recovery-card">
          <div className="auth-brand">
            <img src="/logo-mark.svg" className="brand-mark" alt="Auctus" />
            <div>
              <b>{selectedBusiness?.name || 'Auctus'}</b>
              <small>{syncState === 'error' ? 'Could not load workspace data' : 'Loading workspace data…'}</small>
            </div>
          </div>
          {syncState === 'error' && syncError ? <div className="auth-error">{syncError.message}</div> : null}
          <div className="workspace-actions">
            <button className="btn-secondary" onClick={handleSwitchWorkspace}>Switch Workspace</button>
            <button className="btn-primary" onClick={refreshRemoteLedger}>{syncState === 'syncing' ? 'Loading…' : 'Retry'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppAlertsProvider reportError={reportError}>
      <Shell
        view={view}
        onViewChange={setView}
        onAdd={permissions.canWriteAccounting ? openNewTransaction : undefined}
        mode={mode}
        businessName={selectedBusiness?.name}
        userRole={selectedBusiness?.role}
        syncState={syncState}
        syncError={syncError?.message || null}
        onDismissSyncError={dismissSyncError}
        onRetrySync={mode === 'cloud' ? refreshRemoteLedger : undefined}
        onLogout={mode === 'cloud' ? handleLogout : undefined}
        onSwitchWorkspace={mode === 'cloud' ? handleSwitchWorkspace : undefined}
      >
      {view === 'dashboard' ? <Dashboard data={data} onEditTransaction={openEditTransaction} canEditTransactions={permissions.canWriteAccounting} /> : null}
      {view === 'activity' ? <Activity data={data} onEditTransaction={openEditTransaction} onRecordPayment={recordPayment} canWrite={permissions.canWriteAccounting} /> : null}
      {view === 'sales' ? (
        <Documents
          mode="sales"
          data={data}
          onCreateDocument={openNewDocument}
          onCreateCreditNote={openNewCreditNote}
          onEditTransaction={openEditTransaction}
          onRecordPayment={recordPayment}
          onApplyCredit={applyCreditAllocations}
          canWrite={permissions.canWriteAccounting}
        />
      ) : null}
      {view === 'purchases' ? (
        <Documents
          mode="purchases"
          data={data}
          onCreateDocument={openNewDocument}
          onCreateCreditNote={openNewCreditNote}
          onEditTransaction={openEditTransaction}
          onRecordPayment={recordPayment}
          onApplyCredit={applyCreditAllocations}
          canWrite={permissions.canWriteAccounting}
        />
      ) : null}
      {view === 'contacts' ? <Contacts data={data} onSaveContact={saveContact} canWrite={permissions.canWriteAccounting} /> : null}
      {view === 'accounts' ? (
        <Accounts
          data={data}
          onSaveAccount={saveAccount}
          onArchiveAccount={archiveAccount}
          onDataChange={updateData}
          onImportBankFeedItems={mode === 'cloud' ? importBankFeedItems : undefined}
          onMatchBankFeedItem={mode === 'cloud' ? matchBankFeedItem : undefined}
          onIgnoreBankFeedItem={mode === 'cloud' ? ignoreBankFeedItem : undefined}
          onUnignoreBankFeedItem={mode === 'cloud' ? unignoreBankFeedItem : undefined}
          onRecordBankFeedItem={mode === 'cloud' ? recordBankFeedItem : undefined}
          onFinalizeBankReconciliation={mode === 'cloud' ? finalizeBankReconciliation : undefined}
          onVoidBankReconciliation={mode === 'cloud' ? voidBankReconciliation : undefined}
          canWrite={permissions.canWriteAccounting}
        />
      ) : null}
      {view === 'reports' ? <Reports data={data} period={period} onPeriodChange={setPeriod} /> : null}
      {view === 'journals' ? (
        <Journals
          data={data}
          onSaveJournal={saveManualJournal}
          onVoidJournal={voidManualJournal}
          onReverseJournal={reverseManualJournal}
          canWrite={permissions.canWriteAccounting}
        />
      ) : null}
      {view === 'settings' ? (
        <Settings
          data={data}
          onUpdateSettings={updateBusinessSettings}
          onUpdateBusinessProfile={updateBusinessProfile}
          onCreatePeriodLock={createPeriodLock}
          onClearPeriodLocks={clearPeriodLocks}
          onReset={resetData}
          remoteMode={mode === 'cloud'}
          lockEnabled={lockState.enabled}
          onEnableLock={enableLock}
          onDisableLock={disableLock}
          onLockNow={() => setLocked(true)}
          onBackup={backupData}
          onRestore={restoreData}
          onSaveCategory={saveCategory}
          onArchiveCategory={archiveCategory}
          permissions={permissions}
        />
      ) : null}
      <TransactionModal
        open={txModalOpen}
        data={data}
        transaction={editingTx}
        defaults={txDefaults}
        onClose={() => {
          setTxModalOpen(false);
          setTxDefaults(null);
        }}
        onSave={saveTransaction}
      />
      <footer className="dev-watermark">
        Cash accounts: {data.accounts.map((account) => `${account.name} ${accountBalance(data, account.id).toFixed(2)}`).join(' · ')}
      </footer>
      </Shell>
    </AppAlertsProvider>
  );
}
