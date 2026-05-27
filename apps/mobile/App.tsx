import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, colors } from './src/components/ui';
import type { CreditNoteAllocation, PaymentAllocation } from './src/components/InvoiceList';
import { PaymentModal } from './src/components/PaymentModal';
import { TransactionForm } from './src/components/TransactionForm';
import { advanceRecurringDate, auditEntry, dueDateForTerms, isDateLocked, todayStr, uid, validateCreditAllocations, validateTransactionInput } from './src/domain/accounting';
import type { Contact, CreditAllocation, EntryMode, LedgerData, RecurringTemplate, Transaction, TransactionType } from './src/domain/models';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ModeSelectorScreen } from './src/screens/ModeSelectorScreen';
import { PurchasesScreen } from './src/screens/PurchasesScreen';
import { ManualJournalModal, ReportsScreen } from './src/screens/ReportsScreen';
import { SalesScreen } from './src/screens/SalesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WorkspaceSelectorScreen } from './src/screens/WorkspaceSelectorScreen';
import { AiEntrySheet } from './src/features/ai/AiEntrySheet';
import { disableLock, enableLock, loadLockEnabled, tryBiometricUnlock, verifyPin } from './src/storage/secureLock';
import { clearModePreference, exportLedgerBackup, getModePreference, importLedgerBackup, loadLedgerData, resetLedgerData, saveLedgerData, setModePreference } from './src/storage/mobileStore';
import type { BusinessSummary } from './src/api/cloudApi';
import { getAccessToken, getSelectedBusinessId, listBusinesses, loadLedger, saveLedger, setSelectedBusinessId, signOut } from './src/api/cloudApi';
import { isCloudConfigured } from './src/api/cloudConfig';

type Tab = 'home' | 'sales' | 'purchases' | 'accounts' | 'reports' | 'settings';
type AuthPhase = 'checking' | 'login' | 'mode-select' | 'workspace' | 'app';
type SyncState = 'idle' | 'syncing' | 'error';

function formatReceiptNumber(data: LedgerData) {
  return `${data.settings.receiptPrefix || 'REC-'}${String(data.settings.nextReceiptNumber || 1).padStart(4, '0')}`;
}

export default function App() {
  const [authPhase, setAuthPhase] = useState<AuthPhase>('checking');
  const [appMode, setAppMode] = useState<'local' | 'cloud'>('local');
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessSummary | null>(null);
  const [data, setData] = useState<LedgerData | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncError, setSyncError] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [locked, setLocked] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [pin, setPin] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [manualJournalOpen, setManualJournalOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [newEntryType, setNewEntryType] = useState<TransactionType | undefined>(undefined);
  const [newEntryMode, setNewEntryMode] = useState<EntryMode | undefined>(undefined);
  const [payingTx, setPayingTx] = useState<Transaction | null>(null);
  const hasProcessedRecurring = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextCloudSave = useRef(false);

  useEffect(() => {
    loadLockEnabled().then(async (enabled) => {
      setLockEnabled(enabled);
      if (!enabled) return;
      if (await tryBiometricUnlock()) return;
      setLocked(true);
    });

    async function init() {
      if (!isCloudConfigured()) {
        setData(await loadLedgerData());
        setAppMode('local');
        setAuthPhase('app');
        return;
      }
      const modePref = await getModePreference();
      if (modePref === 'local') {
        setData(await loadLedgerData());
        setAppMode('local');
        setAuthPhase('app');
        return;
      }
      if (!modePref) {
        setAuthPhase('mode-select');
        return;
      }
      const token = await getAccessToken();
      if (!token) { setAuthPhase('login'); return; }
      try {
        const list = await listBusinesses();
        setBusinesses(list);
        const storedId = await getSelectedBusinessId();
        const resolvedId = (storedId && list.some((b) => b.id === storedId))
          ? storedId
          : list.length === 1 ? list[0].id : null;
        const resolvedBusiness = resolvedId ? list.find((business) => business.id === resolvedId) : undefined;
        if (resolvedBusiness) {
          await selectBusiness(resolvedBusiness, list);
        } else {
          setAuthPhase('workspace');
        }
      } catch {
        setAuthPhase('login');
      }
    }

    init().catch(() => setAuthPhase('login'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectBusiness(business: BusinessSummary, list?: BusinessSummary[]) {
    setSelectedBusiness(business);
    setData(null);
    setSyncError('');
    setSyncState('syncing');
    await setSelectedBusinessId(business.id);
    if (list) setBusinesses(list);
    else setBusinesses((current) => current.some((item) => item.id === business.id) ? current : [...current, business]);
    try {
      const ledger = await loadLedger(business.id);
      skipNextCloudSave.current = true;
      setData(ledger);
      setSyncState('idle');
      setAppMode('cloud');
      setAuthPhase('app');
    } catch (error) {
      setSyncState('error');
      setSyncError(error instanceof Error ? error.message : 'Workspace data load failed');
      setAuthPhase('app');
    }
  }

  async function handleSignOut() {
    await signOut();
    setSelectedBusiness(null);
    setBusinesses([]);
    setData(null);
    setSyncError('');
    setSyncState('idle');
    setAuthPhase('login');
  }

  async function handleChooseLocal() {
    await setModePreference('local');
    setData(await loadLedgerData());
    setAppMode('local');
    setAuthPhase('app');
  }

  async function handleChooseCloud() {
    await setModePreference('cloud');
    setAppMode('cloud');
    setAuthPhase('login');
  }

  async function refreshWorkspaceList() {
    const list = await listBusinesses();
    setBusinesses(list);
    const storedId = await getSelectedBusinessId();
    const storedBusiness = storedId ? list.find((business) => business.id === storedId) : undefined;
    const resolvedBusiness = storedBusiness || (list.length === 1 ? list[0] : undefined);
    if (resolvedBusiness) await selectBusiness(resolvedBusiness, list);
    else setAuthPhase('workspace');
  }

  async function retryLoadSelectedBusiness() {
    if (!selectedBusiness) {
      setAuthPhase('workspace');
      return;
    }
    await selectBusiness(selectedBusiness);
  }

  useEffect(() => {
    if (!data || authPhase !== 'app') return;
    saveLedgerData(data);
    if (!isCloudConfigured() || !selectedBusiness) return;
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false;
      return;
    }
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      setSyncState('syncing');
      saveLedger(selectedBusiness.id, data)
        .then((saved) => {
          skipNextCloudSave.current = true;
          setData(saved);
          setSyncState('idle');
          setSyncError('');
        })
        .catch((error) => {
          setSyncState('error');
          setSyncError(error instanceof Error ? error.message : 'Cloud save failed');
        });
    }, 2000);
  }, [data, authPhase, selectedBusiness]);

  useEffect(() => {
    if (!data || hasProcessedRecurring.current) return;
    hasProcessedRecurring.current = true;
    const today = todayStr();
    const due = (data.recurringTemplates || []).filter(
      (t) => t.isActive && t.nextDate <= today && (!t.endDate || t.nextDate <= t.endDate)
    );
    if (!due.length) return;
    setData((current) => {
      if (!current) return current;
      const newTransactions = [...current.transactions];
      const newAuditLog = [...(current.auditLog || [])];
      const updatedTemplates = [...(current.recurringTemplates || [])];
      let settings = { ...current.settings };
      for (const template of due) {
        let date = template.nextDate;
        const tIdx = updatedTemplates.findIndex((t) => t.id === template.id);
        if (tIdx < 0) continue;
        while (date <= today) {
          if (template.endDate && date > template.endDate) break;
          if (isDateLocked(current, date)) {
            newAuditLog.push(auditEntry('skip', 'recurring_template', template.id, `Skipped locked recurring ${template.type} draft dated ${date}`));
            date = advanceRecurringDate(date, template.frequency);
            continue;
          }
          const invoiceNo = template.type === 'income'
            ? `${settings.invoicePrefix || 'INV-'}${String(settings.nextInvoiceNumber || 1).padStart(4, '0')}`
            : `${settings.billPrefix || 'BILL-'}${String(settings.nextBillNumber || 1).padStart(4, '0')}`;
          if (template.type === 'income') settings = { ...settings, nextInvoiceNumber: (settings.nextInvoiceNumber || 1) + 1 };
          else settings = { ...settings, nextBillNumber: (settings.nextBillNumber || 1) + 1 };
          const tx: Transaction = {
            id: uid('r'),
            type: template.type,
            amount: template.amount,
            entryMode: 'invoice',
            docStatus: 'draft',
            date,
            dueDate: template.paymentTerms ? dueDateForTerms(date, template.paymentTerms) : date,
            contactId: template.contactId,
            party: template.party,
            chartAccountId: template.chartAccountId,
            clearingChartAccountId: template.clearingChartAccountId,
            gstMode: template.gstMode,
            paymentTerms: template.paymentTerms,
            note: template.note,
            invoiceNo,
            recurringTemplateId: template.id,
            payments: [],
          };
          newTransactions.push(tx);
          newAuditLog.push(auditEntry('create', 'transaction', tx.id, `Auto-generated recurring ${template.type} draft dated ${date}`));
          date = advanceRecurringDate(date, template.frequency);
        }
        updatedTemplates[tIdx] = { ...updatedTemplates[tIdx], nextDate: date, lastGeneratedAt: new Date().toISOString() };
      }
      return { ...current, settings, transactions: newTransactions, recurringTemplates: updatedTemplates, auditLog: newAuditLog };
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authPhase === 'checking') {
    return <SafeAreaView style={styles.loading}><Text>Loading Auctus...</Text></SafeAreaView>;
  }

  if (authPhase === 'mode-select') {
    return <ModeSelectorScreen onChooseLocal={handleChooseLocal} onChooseCloud={handleChooseCloud} />;
  }

  if (authPhase === 'login') {
    return <LoginScreen onLoggedIn={async () => {
      try {
        await refreshWorkspaceList();
      } catch { setAuthPhase('login'); }
    }} />;
  }

  if (authPhase === 'workspace') {
    return <WorkspaceSelectorScreen
      businesses={businesses}
      onSelect={async (business) => selectBusiness(business)}
      onSignOut={handleSignOut}
    />;
  }

  if (isCloudConfigured() && !data) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.loadingTitle}>{selectedBusiness?.name || 'Auctus'}</Text>
        <Text style={styles.loadingText}>{syncState === 'error' ? syncError : 'Loading workspace data...'}</Text>
        <View style={styles.loadingActions}>
          <ActionButton tone="gray" onPress={() => setAuthPhase('workspace')}>Switch Workspace</ActionButton>
          <ActionButton onPress={retryLoadSelectedBusiness}>{syncState === 'syncing' ? 'Loading...' : 'Retry'}</ActionButton>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return <SafeAreaView style={styles.loading}><Text>Loading Auctus...</Text></SafeAreaView>;
  }

  function saveTx(tx: Transaction) {
    if (!data) return;
    const existingTx = data.transactions.find((item) => item.id === tx.id);
    if (existingTx && isDateLocked(data, existingTx.date)) {
      Alert.alert('Period locked', `Entries dated ${existingTx.date} cannot be changed because the period is locked.`);
      return;
    }
    if (isDateLocked(data, tx.date)) {
      Alert.alert('Period locked', `Entries dated ${tx.date} cannot be changed because the period is locked.`);
      return;
    }
    const validation = validateTransactionInput(data, tx);
    if (!validation.ok) {
      Alert.alert('Invalid transaction', validation.errors.join('\n'));
      return;
    }
    if (tx.entryMode === 'invoice' && tx.invoiceNo && data.transactions.some((item) => item.id !== tx.id && item.type === tx.type && item.invoiceNo === tx.invoiceNo)) {
      Alert.alert('Duplicate number', `${tx.invoiceNo} is already used.`);
      return;
    }
    if (tx.entryMode === 'credit_note' && tx.creditNoteNo && data.transactions.some((item) => item.id !== tx.id && item.type === tx.type && item.creditNoteNo === tx.creditNoteNo)) {
      Alert.alert('Duplicate number', `${tx.creditNoteNo} is already used.`);
      return;
    }
    setData((current) => {
      if (!current) return current;
      const exists = current.transactions.some((item) => item.id === tx.id);
      let nextSettings = !exists && tx.entryMode === 'invoice' && tx.type === 'income'
        ? { ...current.settings, nextInvoiceNumber: (current.settings.nextInvoiceNumber || 1) + 1 }
        : !exists && tx.entryMode === 'invoice' && tx.type === 'expense'
          ? { ...current.settings, nextBillNumber: (current.settings.nextBillNumber || 1) + 1 }
          : !exists && tx.entryMode === 'credit_note' && tx.type === 'income'
            ? { ...current.settings, nextCreditNoteNumber: (current.settings.nextCreditNoteNumber || 1) + 1 }
            : !exists && tx.entryMode === 'credit_note' && tx.type === 'expense'
              ? { ...current.settings, nextSupplierCreditNumber: (current.settings.nextSupplierCreditNumber || 1) + 1 }
              : current.settings;
      const preparedTx: Transaction = tx.type === 'income' && tx.payments?.length
        ? {
            ...tx,
            payments: tx.payments.map((payment) => {
              if (payment.receiptNo) return payment;
              const receiptNo = formatReceiptNumber({ ...current, settings: nextSettings });
              nextSettings = { ...nextSettings, nextReceiptNumber: (nextSettings.nextReceiptNumber || 1) + 1 };
              return { ...payment, receiptNo, receiptCreatedAt: payment.receiptCreatedAt || new Date().toISOString() };
            }),
          }
        : tx;
      return {
        ...current,
        settings: nextSettings,
        transactions: exists
          ? current.transactions.map((item) => item.id === tx.id ? preparedTx : item)
          : [...current.transactions, preparedTx],
        auditLog: [
          ...(current.auditLog || []),
          auditEntry(exists ? 'update' : 'create', 'transaction', tx.id, `${tx.type} dated ${tx.date}`),
        ],
      };
    });
    setFormOpen(false);
    setEditingTx(null);
    setNewEntryType(undefined);
    setNewEntryMode(undefined);
  }

  function savePayment(tx: Transaction, amount: number, date: string, accountId: string) {
    if (!data) return;
    if (isDateLocked(data, date)) {
      Alert.alert('Period locked', `Payments dated ${date} cannot be added because the period is locked.`);
      return;
    }
    setData((current) => {
      if (!current) return current;
      let settings = current.settings;
      const transactions = current.transactions.map((item) => {
        if (item.id !== tx.id) return item;
        const paymentId = uid('p');
        const payment = item.type === 'income'
          ? {
              id: paymentId,
              amount,
              date,
              accountId,
              receiptNo: formatReceiptNumber({ ...current, settings }),
              receiptCreatedAt: new Date().toISOString(),
            }
          : { id: paymentId, amount, date, accountId };
        if (item.type === 'income') settings = { ...settings, nextReceiptNumber: (settings.nextReceiptNumber || 1) + 1 };
        return { ...item, payments: [...(item.payments || []), payment] };
      });
      return {
        ...current,
        settings,
        transactions,
        auditLog: [...(current.auditLog || []), auditEntry('create', 'payment', tx.id, `Payment ${amount} dated ${date}`)],
      };
    });
    setPayingTx(null);
  }

  function voidPayment(tx: Transaction, paymentId: string) {
    if (!data) return;
    const payment = (tx.payments || []).find((p) => p.id === paymentId);
    if (!payment) return;
    if (isDateLocked(data, payment.date)) {
      Alert.alert('Period locked', `Payments dated ${payment.date} cannot be voided because the period is locked.`);
      return;
    }
    setData((current) => current ? {
      ...current,
      transactions: current.transactions.map((item) => item.id === tx.id
        ? { ...item, payments: (item.payments || []).map((p) => p.id === paymentId ? { ...p, voidedAt: new Date().toISOString() } : p) }
        : item),
      auditLog: [...(current.auditLog || []), auditEntry('void', 'payment', paymentId, `Payment ${payment.amount} dated ${payment.date} on ${tx.invoiceNo || tx.id}`)],
    } : current);
  }

  function voidTransaction(tx: Transaction) {
    if (!data) return;
    const lockedDate = [tx.date, ...(tx.payments || []).map((payment) => payment.date)].find((date) => isDateLocked(data, date));
    if (lockedDate) {
      Alert.alert('Period locked', `This document cannot be voided because ${lockedDate} is in a locked period.`);
      return;
    }
    setData({
      ...data,
      transactions: data.transactions.map((item) => item.id === tx.id ? { ...item, voidedAt: new Date().toISOString() } : item),
      auditLog: [...(data.auditLog || []), auditEntry('void', 'transaction', tx.id, `${tx.invoiceNo || tx.id} dated ${tx.date}`)],
    });
  }

  function saveAllocatedPayments(allocations: PaymentAllocation[]) {
    if (!data || !allocations.length) return;
    const lockedAllocation = allocations.find((allocation) => isDateLocked(data, allocation.date));
    if (lockedAllocation) {
      Alert.alert('Period locked', `Payments dated ${lockedAllocation.date} cannot be added because the period is locked.`);
      return;
    }
    setData((current) => {
      if (!current) return current;
      const allocationByTx = new Map<string, PaymentAllocation[]>();
      for (const allocation of allocations) {
        const list = allocationByTx.get(allocation.txId) || [];
        list.push(allocation);
        allocationByTx.set(allocation.txId, list);
      }
      let settings = current.settings;
      const transactions = current.transactions.map((tx) => {
        const txAllocations = allocationByTx.get(tx.id);
        if (!txAllocations?.length) return tx;
        const payments = txAllocations.map((allocation) => {
          const paymentId = uid('p');
          const payment = tx.type === 'income'
            ? {
                id: paymentId,
                amount: allocation.amount,
                date: allocation.date,
                accountId: allocation.accountId,
                receiptNo: formatReceiptNumber({ ...current, settings }),
                receiptCreatedAt: new Date().toISOString(),
              }
            : {
                id: paymentId,
                amount: allocation.amount,
                date: allocation.date,
                accountId: allocation.accountId,
              };
          if (tx.type === 'income') settings = { ...settings, nextReceiptNumber: (settings.nextReceiptNumber || 1) + 1 };
          return payment;
        });
        return {
          ...tx,
          payments: [
            ...(tx.payments || []),
            ...payments,
          ],
        };
      });
      return {
        ...current,
        settings,
        transactions,
        auditLog: [
          ...(current.auditLog || []),
          auditEntry('create', 'payment_allocation', allocations.map((item) => item.txId).join(','), `${allocations.length} allocations totaling ${allocations.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}`),
        ],
      };
    });
  }

  function saveCreditAllocations(allocations: CreditNoteAllocation[]) {
    if (!data || !allocations.length) return;
    const lockedAllocation = allocations.find((allocation) => isDateLocked(data, allocation.date));
    if (lockedAllocation) {
      Alert.alert('Period locked', `Credit applications dated ${lockedAllocation.date} cannot be added because the period is locked.`);
      return;
    }
    const records: CreditAllocation[] = allocations.map((a) => ({
      id: uid('ca'),
      creditNoteId: a.creditNoteId,
      invoiceId: a.invoiceId,
      amount: a.amount,
      date: a.date,
    }));
    const validation = validateCreditAllocations(data, records);
    if (!validation.ok) {
      Alert.alert('Invalid credit allocation', validation.errors.join('\n'));
      return;
    }
    setData((current) => current ? {
      ...current,
      creditAllocations: [...(current.creditAllocations || []), ...records],
      auditLog: [...(current.auditLog || []), auditEntry('create', 'credit_allocation', records[0].creditNoteId, `${records.length} allocation(s) applied`)],
    } : current);
  }

  function saveRecurringTemplate(template: RecurringTemplate) {
    if (!data) return;
    const exists = (data.recurringTemplates || []).some((t) => t.id === template.id);
    setData((current) => current ? {
      ...current,
      recurringTemplates: exists
        ? (current.recurringTemplates || []).map((t) => t.id === template.id ? template : t)
        : [...(current.recurringTemplates || []), template],
      auditLog: [...(current.auditLog || []), auditEntry(exists ? 'update' : 'create', 'recurring_template', template.id, `${template.frequency} ${template.type}${template.note ? ' - ' + template.note : ''}`)],
    } : current);
  }

  function deleteRecurringTemplate(templateId: string) {
    if (!data) return;
    setData((current) => current ? {
      ...current,
      recurringTemplates: (current.recurringTemplates || []).filter((t) => t.id !== templateId),
      auditLog: [...(current.auditLog || []), auditEntry('delete', 'recurring_template', templateId, 'Recurring schedule deleted')],
    } : current);
  }

  function toggleRecurringTemplate(templateId: string) {
    if (!data) return;
    setData((current) => current ? {
      ...current,
      recurringTemplates: (current.recurringTemplates || []).map((t) => t.id === templateId ? { ...t, isActive: !t.isActive } : t),
      auditLog: [...(current.auditLog || []), auditEntry('update', 'recurring_template', templateId, 'Recurring schedule toggled')],
    } : current);
  }

  function markSent(tx: Transaction) {
    if (!data) return;
    if (isDateLocked(data, tx.date)) {
      Alert.alert('Period locked', `Documents dated ${tx.date} cannot be changed because the period is locked.`);
      return;
    }
    setData((current) => current ? {
      ...current,
      transactions: current.transactions.map((item) => item.id === tx.id ? { ...item, docStatus: 'sent' as const } : item),
      auditLog: [...(current.auditLog || []), auditEntry('update', 'transaction', tx.id, `Marked as sent: ${tx.invoiceNo || tx.id}`)],
    } : current);
  }

  function saveContact(contact: Contact) {
    if (!data) return;
    const exists = data.contacts.some((item) => item.id === contact.id);
    setData({
      ...data,
      contacts: exists ? data.contacts.map((item) => item.id === contact.id ? contact : item) : [...(data.contacts || []), contact],
      auditLog: [...(data.auditLog || []), auditEntry(exists ? 'update' : 'create', 'contact', contact.id, contact.name)],
    });
  }

  function saveManualJournal(journal: LedgerData['manualJournals'][number]) {
    if (!data) return;
    if (isDateLocked(data, journal.date)) {
      Alert.alert('Period locked', `Manual journals dated ${journal.date} cannot be posted because the period is locked.`);
      return;
    }
    setData({
      ...data,
      manualJournals: [...(data.manualJournals || []), journal],
      auditLog: [...(data.auditLog || []), auditEntry('create', 'manual_journal', journal.id, `${journal.memo} dated ${journal.date}`)],
    });
    setManualJournalOpen(false);
  }

  async function unlockWithPin() {
    if (await verifyPin(pin)) { setLocked(false); setPin(''); }
    else { Alert.alert('Wrong PIN'); setPin(''); }
  }

  async function toggleLock() {
    if (lockEnabled) {
      await disableLock();
      setLockEnabled(false);
      setLocked(false);
      return;
    }
    Alert.prompt('Set App PIN', 'Use at least 4 digits.', async (value) => {
      if (!value || value.length < 4) { Alert.alert('PIN must be at least 4 characters.'); return; }
      await enableLock(value);
      setLockEnabled(true);
      setLocked(true);
    }, 'secure-text');
  }

  async function backup() {
    if (!data) return;
    await exportLedgerBackup(data);
  }

  async function restore() {
    try {
      const restored = await importLedgerBackup();
      if (!restored) return;
      Alert.alert('Restore backup?', `This will replace local data with ${restored.transactions.length} transactions.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => setData(restored) },
      ]);
    } catch (error) {
      Alert.alert('Restore failed', error instanceof Error ? error.message : 'Invalid backup file');
    }
  }

  if (locked) {
    return (
      <SafeAreaView style={styles.lockScreen}>
        <StatusBar style="light" />
        <View style={styles.lockPanel}>
          <Text style={styles.lockMark}>A</Text>
          <Text style={styles.lockTitle}>Auctus Locked</Text>
          <TextInput value={pin} onChangeText={setPin} placeholder="PIN" secureTextEntry keyboardType="number-pad" style={styles.pinInput} />
          <ActionButton onPress={unlockWithPin}>Unlock</ActionButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tab === 'home' && <HomeScreen data={data} onEdit={(tx) => { setNewEntryType(undefined); setEditingTx(tx); setFormOpen(true); }} />}
        {tab === 'sales' && <SalesScreen data={data} onEdit={(tx) => { setNewEntryType(undefined); setNewEntryMode(undefined); setEditingTx(tx); setFormOpen(true); }} onPay={setPayingTx} onNew={() => { setEditingTx(null); setNewEntryType('income'); setNewEntryMode(undefined); setFormOpen(true); }} onAllocate={saveAllocatedPayments} onSaveContact={saveContact} onVoid={voidTransaction} onMarkSent={markSent} onNewCredit={(type) => { setEditingTx(null); setNewEntryType(type); setNewEntryMode('credit_note'); setFormOpen(true); }} onApplyCredit={saveCreditAllocations} onVoidPayment={voidPayment} onSaveRecurring={saveRecurringTemplate} onDeleteRecurring={deleteRecurringTemplate} onToggleRecurring={toggleRecurringTemplate} />}
        {tab === 'purchases' && <PurchasesScreen data={data} onEdit={(tx) => { setNewEntryType(undefined); setNewEntryMode(undefined); setEditingTx(tx); setFormOpen(true); }} onPay={setPayingTx} onNew={() => { setEditingTx(null); setNewEntryType('expense'); setNewEntryMode(undefined); setFormOpen(true); }} onAllocate={saveAllocatedPayments} onSaveContact={saveContact} onVoid={voidTransaction} onMarkSent={markSent} onNewCredit={(type) => { setEditingTx(null); setNewEntryType(type); setNewEntryMode('credit_note'); setFormOpen(true); }} onApplyCredit={saveCreditAllocations} onVoidPayment={voidPayment} onSaveRecurring={saveRecurringTemplate} onDeleteRecurring={deleteRecurringTemplate} onToggleRecurring={toggleRecurringTemplate} />}
        {tab === 'accounts' && <AccountsScreen data={data} onDataChange={setData} />}
        {tab === 'reports' && <ReportsScreen data={data} onDataChange={setData} />}
        {tab === 'settings' && (
          <SettingsScreen
            data={data}
            onDataChange={setData}
            lockEnabled={lockEnabled}
            onToggleGst={() => setData({ ...data, settings: { ...data.settings, gstEnabled: !data.settings.gstEnabled } })}
            onToggleLock={toggleLock}
            onLockNow={() => setLocked(true)}
            onBackup={backup}
            onRestore={restore}
            onReset={async () => setData(await resetLedgerData())}
            onSignOut={appMode === 'cloud' ? handleSignOut : undefined}
            onSwitchWorkspace={appMode === 'cloud' ? () => setAuthPhase('workspace') : undefined}
            cloudAvailable={isCloudConfigured()}
            onSwitchToCloud={appMode === 'local' && isCloudConfigured() ? async () => { await clearModePreference(); setData(null); setAppMode('cloud'); setAuthPhase('mode-select'); } : undefined}
            cloudWorkspace={selectedBusiness ? `${selectedBusiness.name} · ${selectedBusiness.role}` : undefined}
            syncState={appMode === 'cloud' ? syncState : undefined}
            syncError={syncError || undefined}
          />
        )}
      </ScrollView>
      <View style={styles.tabBar}>
        {(['home', 'sales', 'purchases', 'accounts', 'reports', 'settings'] as Tab[]).map((item) => (
          <Pressable key={item} style={styles.tab} onPress={() => setTab(item)}>
            <Text style={[styles.tabText, tab === item && styles.activeTab]}>{item === 'purchases' ? 'Purch.' : item[0].toUpperCase() + item.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.aiFab} onPress={() => setAiOpen(true)}>
        <Text style={styles.fabText}>✨</Text>
      </Pressable>
      <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <AddEntryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onTransaction={() => { setAddOpen(false); setNewEntryType(undefined); setEditingTx(null); setFormOpen(true); }}
        onManualJournal={() => { setAddOpen(false); setManualJournalOpen(true); }}
      />
      <TransactionForm open={formOpen} data={data} tx={editingTx} initialType={newEntryType} initialEntryMode={newEntryMode} onClose={() => { setFormOpen(false); setNewEntryType(undefined); setNewEntryMode(undefined); }} onSave={saveTx} />
      <ManualJournalModal open={manualJournalOpen} data={data} onClose={() => setManualJournalOpen(false)} onSave={saveManualJournal} />
      <PaymentModal open={!!payingTx} data={data} tx={payingTx} onClose={() => setPayingTx(null)} onSave={savePayment} />
      {aiOpen && data && (
        <AiEntrySheet
          data={data}
          mode={appMode}
          getToken={getAccessToken}
          onParsed={(draft) => { setAiOpen(false); setEditingTx(null); if (draft.type) setNewEntryType(draft.type); setFormOpen(true); }}
          onClose={() => setAiOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

function AddEntryModal({ open, onClose, onTransaction, onManualJournal }: {
  open: boolean;
  onClose: () => void;
  onTransaction: () => void;
  onManualJournal: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade">
      <Pressable style={styles.addBackdrop} onPress={onClose}>
        <View style={styles.addSheet}>
          <Text style={styles.addTitle}>New Entry</Text>
          <Pressable style={styles.addOption} onPress={onTransaction}>
            <Text style={styles.addOptionTitle}>Transaction</Text>
            <Text style={styles.addOptionSub}>Sale, purchase, invoice, bill, or transfer</Text>
          </Pressable>
          <Pressable style={styles.addOption} onPress={onManualJournal}>
            <Text style={styles.addOptionTitle}>Manual Journal Entry</Text>
            <Text style={styles.addOptionSub}>Post balanced debit and credit lines</Text>
          </Pressable>
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 96 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 8 },
  loadingText: { color: colors.muted, textAlign: 'center', marginHorizontal: 28, marginBottom: 16 },
  loadingActions: { width: '80%', gap: 10 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, flexDirection: 'row', backgroundColor: '#F2F0EB', borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)', paddingBottom: 18 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  activeTab: { color: colors.blue },
  aiFab: { position: 'absolute', bottom: 80, right: 80, width: 48, height: 48, borderRadius: 24, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 5 },
  fab: { position: 'absolute', bottom: 58, alignSelf: 'center', width: 58, height: 58, borderRadius: 29, backgroundColor: '#1A1916', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  fabText: { color: '#FFFFFF', fontSize: 34, lineHeight: 38 },
  addBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  addSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  addTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  addOption: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  addOptionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  addOptionSub: { color: colors.muted, marginTop: 3, fontSize: 12, fontWeight: '600' },
  lockScreen: { flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockPanel: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center' },
  lockMark: { width: 58, height: 58, borderRadius: 16, backgroundColor: '#1A1916', color: '#F0EDE8', textAlign: 'center', lineHeight: 58, fontSize: 28, fontWeight: '900', overflow: 'hidden' },
  lockTitle: { marginVertical: 16, fontSize: 24, fontWeight: '900' },
  pinInput: { width: '100%', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, textAlign: 'center', marginBottom: 12 },
});
