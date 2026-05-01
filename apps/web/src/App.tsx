import { useEffect, useState } from 'react';
import { AppLock } from './components/AppLock';
import { Shell, type ViewKey } from './components/Shell';
import { accountBalance, auditEntry, dueDateForTerms, fmt, formatCreditNumber, formatDocumentNumber, isDateLocked, latestLockedThrough, todayStr, txBalance, uid, validateCreditAllocations, validatePaymentInput, validateTransactionInput } from './domain/accounting';
import type { Account, BankFeedItem, BankReconciliation, BusinessProfile, Category, Contact, CreditAllocation, LedgerData, ManualJournal, Period, Transaction } from './domain/models';
import { auctusApi, isAuctusApiConfigured } from './api/auctusApi';
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

export default function App() {
  const [data, setData] = useState<LedgerData>(() => ledgerDataAdapter.load());
  const [lockState, setLockState] = useState(() => loadLockState());
  const [locked, setLocked] = useState(() => loadLockState().enabled);
  const [view, setView] = useState<ViewKey>('dashboard');
  const [period, setPeriod] = useState<Period>('month');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txDefaults, setTxDefaults] = useState<Partial<Transaction> | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [remoteMode] = useState(() => isAuctusApiConfigured());

  useEffect(() => {
    ledgerDataAdapter.save(data);
  }, [data]);

  useEffect(() => {
    if (!remoteMode) return;
    refreshRemoteLedger().catch((error) => {
      window.alert(error instanceof Error ? `Backend sync failed: ${error.message}` : 'Backend sync failed');
    });
  }, [remoteMode]);

  function updateData(next: LedgerData) {
    setData(next);
  }

  async function refreshRemoteLedger() {
    const next = await auctusApi.loadLedger();
    setData(next);
    ledgerDataAdapter.save(next);
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
      invoiceNo: remoteMode ? undefined : formatDocumentNumber(data, type),
      categoryId: type === 'income' ? data.categories.income[0]?.id : data.categories.expense[0]?.id,
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
      creditNoteNo: remoteMode ? undefined : formatCreditNumber(data, type),
      categoryId: type === 'income' ? data.categories.income[0]?.id : data.categories.expense[0]?.id,
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
    if (remoteMode) {
      const existing = data.transactions.find((item) => item.id === tx.id);
      if (existing) {
        try {
          await auctusApi.updateTransaction(tx);
          const existingPaymentIds = new Set(existing.payments?.map((p) => p.id) || []);
          for (const payment of tx.payments || []) {
            if (!existingPaymentIds.has(payment.id)) {
              await auctusApi.recordPayment(tx.id, {
                amount: payment.amount,
                date: payment.date,
                accountId: payment.accountId,
              });
            }
          }
          await refreshRemoteLedger();
          setTxModalOpen(false);
          setEditingTx(null);
          setTxDefaults(null);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Transaction update failed.');
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
        window.alert(error instanceof Error ? error.message : 'Transaction save failed.');
      }
      return;
    }

    const existing = data.transactions.find((item) => item.id === tx.id);
    if (existing && isDateLocked(data, existing.date)) {
      window.alert(`This document or transaction is dated ${existing.date}, which is in a locked period. It cannot be edited.`);
      return;
    }
    const validation = validateTransactionInput(data, tx);
    if (!validation.ok) {
      window.alert(validation.errors.join('\n'));
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
    if (remoteMode) {
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

  async function importBankFeedItems(accountId: string, items: BankFeedItem[]) {
    if (!remoteMode) return;
    await auctusApi.importBankFeedItems(accountId, items);
    await refreshRemoteLedger();
  }

  async function matchBankFeedItem(itemId: string, sourceId?: string) {
    if (!remoteMode) return;
    await auctusApi.matchBankFeedItem(itemId, sourceId);
    await refreshRemoteLedger();
  }

  async function ignoreBankFeedItem(itemId: string) {
    if (!remoteMode) return;
    await auctusApi.ignoreBankFeedItem(itemId);
    await refreshRemoteLedger();
  }

  async function unignoreBankFeedItem(itemId: string) {
    if (!remoteMode) return;
    await auctusApi.unignoreBankFeedItem(itemId);
    await refreshRemoteLedger();
  }

  async function recordBankFeedItem(item: BankFeedItem, transaction: Transaction) {
    if (!remoteMode) return;
    const created = await auctusApi.createTransaction(transaction);
    await auctusApi.matchBankFeedItem(item.id, created.id);
    await refreshRemoteLedger();
  }

  async function finalizeBankReconciliation(reconciliation: BankReconciliation) {
    if (!remoteMode) return;
    await auctusApi.finalizeBankReconciliation(reconciliation);
    await refreshRemoteLedger();
  }

  async function voidBankReconciliation(reconciliation: BankReconciliation) {
    if (!remoteMode) return;
    await auctusApi.voidBankReconciliation(reconciliation.id);
    await refreshRemoteLedger();
  }

  async function saveContact(contact: Contact) {
    if (remoteMode) {
      try {
        const exists = data.contacts.some((item) => item.id === contact.id);
        if (exists) await auctusApi.updateContact(contact);
        else await auctusApi.createContact(contact);
        await refreshRemoteLedger();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Contact save failed.');
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
    if (remoteMode) {
      const result = validateCreditAllocations(data, allocations);
      if (!result.ok) {
        window.alert(result.errors.join('\n'));
        return false;
      }
      Promise.all(allocations.map((allocation) => auctusApi.createCreditAllocation(allocation)))
        .then(() => refreshRemoteLedger())
        .catch((error) => {
          window.alert(error instanceof Error ? error.message : 'Credit allocation failed.');
        });
      return true;
    }

    const result = validateCreditAllocations(data, allocations);
    if (!result.ok) {
      window.alert(result.errors.join('\n'));
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
      window.alert(validation.errors.join('\n'));
      return;
    }
    if (remoteMode) {
      auctusApi.recordPayment(tx.id, payment)
        .then(() => refreshRemoteLedger())
        .catch((error) => {
          window.alert(error instanceof Error ? error.message : 'Payment record failed.');
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
    if (remoteMode) {
      if (!window.confirm('Reset backend ledger data to the default accounting foundation? This replaces transactions, contacts, accounts, journals, bank feed rows, reconciliations and period locks.')) return;
      auctusApi.resetLedger()
        .then((next) => {
          setData(next);
          ledgerDataAdapter.save(next);
        })
        .catch((error) => {
          window.alert(error instanceof Error ? error.message : 'Backend reset failed.');
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
    if (remoteMode) {
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
    if (remoteMode) {
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
    if (remoteMode) {
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
    if (remoteMode) {
      await auctusApi.archiveCategory(categoryId);
      await refreshRemoteLedger();
      return;
    }

    setData((current) => ({
      ...current,
      categories: {
        income: current.categories.income.filter((item) => item.id !== categoryId),
        expense: current.categories.expense.filter((item) => item.id !== categoryId),
      },
      auditLog: [
        ...(current.auditLog || []),
        auditEntry('archive', 'category', categoryId, 'Archived category'),
      ],
    }));
  }

  async function createPeriodLock(lockedThrough: string, note: string) {
    if (remoteMode) {
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
    if (remoteMode) {
      const exists = data.manualJournals.some((item) => item.id === journal.id);
      if (exists) await auctusApi.updateManualJournal(journal);
      else await auctusApi.createManualJournal(journal);
      await refreshRemoteLedger();
      return;
    }

    const existingJournal = data.manualJournals.find((item) => item.id === journal.id);
    if (existingJournal && isDateLocked(data, existingJournal.date)) {
      window.alert(`Manual journals dated ${existingJournal.date} cannot be changed because the period is locked.`);
      return;
    }
    if (isDateLocked(data, journal.date)) {
      window.alert(`Manual journals dated ${journal.date} cannot be posted because the period is locked.`);
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
    if (remoteMode) {
      await auctusApi.voidManualJournal(journal.id);
      await refreshRemoteLedger();
      return;
    }

    if (isDateLocked(data, journal.date)) {
      window.alert(`Manual journal dated ${journal.date} cannot be voided because the period is locked.`);
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
    if (remoteMode) {
      await auctusApi.reverseManualJournal(journal.id);
      await refreshRemoteLedger();
      return;
    }

    if (isDateLocked(data, todayStr())) {
      window.alert('Cannot post a reversal dated today because the period is locked.');
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

    if (remoteMode) {
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
    Promise.resolve(remoteMode ? auctusApi.exportBackup() : ledgerDataAdapter.exportBackup(data))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `auctus-backup-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      })
      .catch((error) => {
        window.alert(error instanceof Error ? error.message : 'Backup failed.');
      });
  }

  function restoreData(file: File) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = String(event.target?.result || '');
        if (remoteMode) {
          if (!window.confirm('Restore this backup to the backend workspace? This replaces current ledger data and keeps the server audit trail.')) return;
          auctusApi.restoreBackup(raw)
            .then((restored) => {
              setData(restored);
              ledgerDataAdapter.save(restored);
            })
            .catch((error) => {
              window.alert(error instanceof Error ? `Restore failed: ${error.message}` : 'Restore failed');
            });
          return;
        }

        const restored = ledgerDataAdapter.importBackup(raw);
        if (!window.confirm(`Restore backup with ${restored.transactions.length} transactions? This replaces local data.`)) return;
        setData({
          ...restored,
          auditLog: [
            ...(restored.auditLog || []),
            auditEntry('restore', 'ledger_data', file.name || 'backup', `Restored backup with ${restored.transactions.length} transactions`),
          ],
        });
      } catch (error) {
        window.alert(error instanceof Error ? `Restore failed: ${error.message}` : 'Restore failed');
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
      window.alert('PIN must be at least 4 characters.');
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
      window.alert('Wrong PIN');
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

  return (
    <Shell view={view} onViewChange={setView} onAdd={openNewTransaction}>
      {view === 'dashboard' ? <Dashboard data={data} onEditTransaction={openEditTransaction} /> : null}
      {view === 'activity' ? <Activity data={data} onEditTransaction={openEditTransaction} onRecordPayment={recordPayment} /> : null}
      {view === 'sales' ? (
        <Documents
          mode="sales"
          data={data}
          onCreateDocument={openNewDocument}
          onCreateCreditNote={openNewCreditNote}
          onEditTransaction={openEditTransaction}
          onRecordPayment={recordPayment}
          onApplyCredit={applyCreditAllocations}
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
        />
      ) : null}
      {view === 'contacts' ? <Contacts data={data} onSaveContact={saveContact} /> : null}
      {view === 'accounts' ? (
        <Accounts
          data={data}
          onSaveAccount={saveAccount}
          onDataChange={updateData}
          onImportBankFeedItems={remoteMode ? importBankFeedItems : undefined}
          onMatchBankFeedItem={remoteMode ? matchBankFeedItem : undefined}
          onIgnoreBankFeedItem={remoteMode ? ignoreBankFeedItem : undefined}
          onUnignoreBankFeedItem={remoteMode ? unignoreBankFeedItem : undefined}
          onRecordBankFeedItem={remoteMode ? recordBankFeedItem : undefined}
          onFinalizeBankReconciliation={remoteMode ? finalizeBankReconciliation : undefined}
          onVoidBankReconciliation={remoteMode ? voidBankReconciliation : undefined}
        />
      ) : null}
      {view === 'reports' ? <Reports data={data} period={period} onPeriodChange={setPeriod} /> : null}
      {view === 'journals' ? (
        <Journals
          data={data}
          onSaveJournal={saveManualJournal}
          onVoidJournal={voidManualJournal}
          onReverseJournal={reverseManualJournal}
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
          remoteMode={remoteMode}
          lockEnabled={lockState.enabled}
          onEnableLock={enableLock}
          onDisableLock={disableLock}
          onLockNow={() => setLocked(true)}
          onBackup={backupData}
          onRestore={restoreData}
          onSaveCategory={saveCategory}
          onArchiveCategory={archiveCategory}
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
  );
}
