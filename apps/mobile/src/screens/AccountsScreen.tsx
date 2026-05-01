import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, Header, ListRow, Screen, SectionTitle, colors } from '../components/ui';
import { SelectField } from '../components/SelectField';
import { accountBalance, auditEntry, bankFeedFingerprint, chartAccountHasHistory, chartAccountLedger, chartAccountName, chartAccountSort, fmt, fmtMoney, isDateLocked, isInvoice, isSystemChartAccount, latestLockedThrough, reconciliationRows, todayStr, totalAssets, uid } from '../domain/accounting';
import type { Account, BankFeedItem, BankReconciliation, ChartAccount, ChartAccountClass, LedgerData, Transaction } from '../domain/models';
import { importBankStatementCsv, type ParsedBankCsvRow } from '../utils/bankCsvImport';

function groupChartAccounts(accounts: ChartAccount[]) {
  const groups = new Map<string, ChartAccount[]>();
  for (const account of [...accounts].sort(chartAccountSort)) {
    const list = groups.get(account.group) || [];
    list.push(account);
    groups.set(account.group, list);
  }
  return Array.from(groups.entries()).map(([group, groupedAccounts]) => ({ group, accounts: groupedAccounts }));
}

function paymentAccountHasHistory(data: LedgerData, accountId: string) {
  const account = data.accounts.find((item) => item.id === accountId);
  if (!account) return false;
  if (Math.abs(Number(account.initBalance) || 0) > 0.005) return true;
  if (data.transactions.some((tx) =>
    tx.accountId === accountId ||
    tx.accountToId === accountId ||
    (tx.payments || []).some((payment) => payment.accountId === accountId)
  )) return true;
  if ((data.bankReconciliations || []).some((reconciliation) => reconciliation.accountId === accountId)) return true;
  if ((data.bankFeedItems || []).some((item) => item.accountId === accountId)) return true;
  return false;
}

export function AccountsScreen({ data, onDataChange }: { data: LedgerData; onDataChange: (data: LedgerData) => void }) {
  const totals = totalAssets(data);
  const [mode, setMode] = useState<'balances' | 'chart'>('balances');
  const [chartTab, setChartTab] = useState<ChartAccountClass>('asset');
  const [ledgerAccount, setLedgerAccount] = useState<ChartAccount | null>(null);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [editingPaymentAccount, setEditingPaymentAccount] = useState<Account | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [bankFeedOpen, setBankFeedOpen] = useState(false);
  const [accountFormOpen, setAccountFormOpen] = useState(false);

  const classes: Array<{ key: ChartAccountClass; title: string }> = [
    { key: 'asset', title: 'Assets' },
    { key: 'liability', title: 'Liabilities' },
    { key: 'equity', title: 'Equity' },
    { key: 'revenue', title: 'Revenue' },
    { key: 'expense', title: 'Expenses' },
  ];
  const lockedThrough = latestLockedThrough(data);
  const openingRows = data.accounts.filter((account) => Math.abs(Number(account.initBalance) || 0) > 0.005);
  const openingEquity = openingRows.reduce((sum, account) => sum + (Number(account.initBalance) || 0), 0);

  function chartAccountUsedInLockedPeriod(chartAccountId: string) {
    if (!lockedThrough) return false;
    if (data.accounts.some((account) => account.chartAccountId === chartAccountId && (Number(account.initBalance) || 0) !== 0)) return true;
    if (data.transactions.some((tx) => tx.date <= lockedThrough && (tx.chartAccountId === chartAccountId || tx.clearingChartAccountId === chartAccountId || data.accounts.some((account) => (tx.accountId === account.id || tx.accountToId === account.id) && account.chartAccountId === chartAccountId) || (isInvoice(tx) && (tx.payments || []).some((payment) => data.accounts.some((account) => payment.accountId === account.id && account.chartAccountId === chartAccountId)))))) return true;
    return (data.manualJournals || []).some((journal) => !journal.voidedAt && journal.date <= lockedThrough && journal.lines.some((line) => line.chartAccountId === chartAccountId));
  }

  return (
    <Screen>
      <Header title="Accounts" subtitle="Financial accounts and chart of accounts" />
      <Card tone="green">
        <Text style={styles.heroLabel}>NET WORTH</Text>
        <Text style={styles.heroValue}>{fmtMoney(totals.net)}</Text>
      </Card>
      <View style={styles.segment}>
        <Pressable style={[styles.segBtn, mode === 'balances' && styles.segActive]} onPress={() => setMode('balances')}><Text>Balances</Text></Pressable>
        <Pressable style={[styles.segBtn, mode === 'chart' && styles.segActive]} onPress={() => setMode('chart')}><Text>Chart</Text></Pressable>
      </View>
      {mode === 'balances' ? (
        <>
          <SectionTitle>Payment Accounts</SectionTitle>
          {data.accounts.map((account) => (
            <ListRow
              key={account.id}
              icon={account.icon}
              color={account.color}
              title={account.name}
              subtitle={`${account.type} · Opening ${fmtMoney(account.initBalance)} · ${chartAccountName(data, account.chartAccountId)}`}
              right={<Text style={styles.amount}>{fmtMoney(accountBalance(data, account.id))}</Text>}
              onPress={() => setEditingPaymentAccount(account)}
            />
          ))}
          <SectionTitle>Opening Balance Review</SectionTitle>
          <Card>
            <Text style={styles.cardLine}>Opening entries: {openingRows.length}</Text>
            <Text style={[styles.cardLine, Math.abs(openingEquity) > 0.005 && styles.warnText]}>
              Opening Balance Equity offset: {fmtMoney(openingEquity)}
            </Text>
            {openingRows.length ? openingRows.map((account) => (
              <View key={account.id} style={styles.openingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerMemo}>{account.name}</Text>
                  <Text style={styles.ledgerDate}>{chartAccountName(data, account.chartAccountId)}</Text>
                </View>
                <Text style={styles.amount}>{fmtMoney(account.initBalance)}</Text>
              </View>
            )) : <Text style={styles.emptySmall}>No opening balances recorded</Text>}
            <Text style={styles.helperText}>Opening balances post against Opening Balance Equity and are included in the ledger from the data creation date.</Text>
          </Card>
          <SectionTitle>Bank Reconciliation</SectionTitle>
          <ListRow
            icon="✓"
            color={colors.green}
            title="Reconcile Account"
            subtitle={`${(data.bankReconciliations || []).length} saved reconciliations`}
            onPress={() => setReconcileOpen(true)}
          />
          <ListRow
            icon="CSV"
            color={colors.blue}
            title="Bank Feed / Import CSV"
            subtitle={`${(data.bankFeedItems || []).filter((item) => !item.reconciledAt && !item.ignoredAt).length} imported items pending`}
            onPress={() => setBankFeedOpen(true)}
          />
          <PaymentAccountLinkForm
            open={!!editingPaymentAccount}
            data={data}
            account={editingPaymentAccount}
            onClose={() => setEditingPaymentAccount(null)}
            onSave={(accountId, chartAccountId) => {
              const paymentAccount = data.accounts.find((account) => account.id === accountId);
              if (paymentAccount && paymentAccount.chartAccountId !== chartAccountId && paymentAccountHasHistory(data, accountId)) {
                Alert.alert('Account has history', 'This payment account has opening balances, transactions, payments, or reconciliations and cannot be relinked.');
                return;
              }
              onDataChange({ ...data, accounts: data.accounts.map((a) => a.id === accountId ? { ...a, chartAccountId } : a) });
              setEditingPaymentAccount(null);
            }}
          />
          <ReconciliationModal
            open={reconcileOpen}
            data={data}
            onClose={() => setReconcileOpen(false)}
            onSave={(reconciliation) => {
              if (isDateLocked(data, reconciliation.statementDate)) {
                Alert.alert('Period locked', `Reconciliations dated ${reconciliation.statementDate} cannot be finalized because the period is locked.`);
                return;
              }
              onDataChange({
                ...data,
                bankReconciliations: [...(data.bankReconciliations || []), reconciliation],
                auditLog: [...(data.auditLog || []), auditEntry('finalize', 'bank_reconciliation', reconciliation.id, `Statement ${reconciliation.statementDate}`)],
              });
              setReconcileOpen(false);
            }}
            onVoid={(reconciliation) => {
              if (isDateLocked(data, reconciliation.statementDate)) {
                Alert.alert('Period locked', `Reconciliations dated ${reconciliation.statementDate} cannot be voided because the period is locked.`);
                return;
              }
              onDataChange({
                ...data,
                bankReconciliations: data.bankReconciliations.map((item) => item.id === reconciliation.id ? { ...item, voidedAt: new Date().toISOString() } : item),
                auditLog: [...(data.auditLog || []), auditEntry('void', 'bank_reconciliation', reconciliation.id, `Statement ${reconciliation.statementDate}`)],
              });
            }}
          />
          <BankFeedModal
            open={bankFeedOpen}
            data={data}
            onClose={() => setBankFeedOpen(false)}
            onDataChange={onDataChange}
          />
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
            {classes.map((klass) => (
              <Pressable key={klass.key} style={[styles.tab, chartTab === klass.key && styles.tabActive]} onPress={() => setChartTab(klass.key)}>
                <Text style={[styles.tabText, chartTab === klass.key && styles.tabTextActive]}>{klass.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.sectionRow}>
            <SectionTitle>{classes.find((k) => k.key === chartTab)?.title}</SectionTitle>
            <Pressable style={styles.addBtn} onPress={() => { setEditingAccount(null); setAccountFormOpen(true); }}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </Pressable>
          </View>
          {groupChartAccounts(data.chartOfAccounts.filter((a) => a.class === chartTab)).map(({ group, accounts }) => (
            <View key={group}>
              <Text style={styles.groupTitle}>{group}</Text>
              {accounts.map((account) => {
                const system = isSystemChartAccount(account);
                const history = chartAccountHasHistory(data, account.id);
                return (
                  <ListRow
                    key={account.id}
                    icon={account.code.slice(0, 1)}
                    color={account.isContra ? colors.orange : chartTab === 'asset' ? colors.green : chartTab === 'liability' ? colors.red : chartTab === 'equity' ? colors.purple : chartTab === 'revenue' ? colors.blue : colors.orange}
                    title={`${account.code} · ${account.name}`}
                    subtitle={`${account.normalBalance}${account.isContra ? ' · contra' : ''}${system ? ' · system locked' : history ? ' · has history' : ''}`}
                    onPress={() => setLedgerAccount(account)}
                  />
                );
              })}
            </View>
          ))}
          <LedgerModal
            open={!!ledgerAccount}
            account={ledgerAccount}
            data={data}
            onClose={() => setLedgerAccount(null)}
            canEdit={!isSystemChartAccount(ledgerAccount)}
            onEdit={(account) => { setLedgerAccount(null); setEditingAccount(account); setAccountFormOpen(true); }}
          />
          <ChartAccountForm
            open={accountFormOpen}
            accountClass={editingAccount?.class || chartTab}
            account={editingAccount}
            hasHistory={!!editingAccount && chartAccountHasHistory(data, editingAccount.id)}
            isSystem={isSystemChartAccount(editingAccount)}
            onClose={() => setAccountFormOpen(false)}
            onSave={(account) => {
              const exists = data.chartOfAccounts.some((item) => item.id === account.id);
              if (exists && isSystemChartAccount(data.chartOfAccounts.find((item) => item.id === account.id))) {
                Alert.alert('System account locked', 'System accounts are required for AR/AP, GST, and opening balance postings and cannot be edited.');
                return;
              }
              if (data.chartOfAccounts.some((item) => item.id !== account.id && item.code === account.code)) {
                Alert.alert('Duplicate code', `${account.code} is already used by another chart account.`);
                return;
              }
              if (exists && chartAccountUsedInLockedPeriod(account.id)) {
                Alert.alert('Period locked', 'This chart account is used in a locked period and cannot be changed.');
                return;
              }
              onDataChange({
                ...data,
                chartOfAccounts: exists
                  ? data.chartOfAccounts.map((item) => item.id === account.id ? account : item)
                  : [...data.chartOfAccounts, account],
                auditLog: [...(data.auditLog || []), auditEntry(exists ? 'update' : 'create', 'chart_account', account.id, `${account.code} · ${account.name}`)],
              });
              setAccountFormOpen(false);
            }}
            onDelete={(account) => {
              if (isSystemChartAccount(account)) {
                Alert.alert('System account locked', 'System accounts are required by the ledger and cannot be deleted.');
                return;
              }
              if (data.accounts.some((paymentAccount) => paymentAccount.chartAccountId === account.id)) {
                Alert.alert('Account linked', 'This chart account is linked to a payment account. Relink the payment account before deleting it.');
                return;
              }
              if (chartAccountHasHistory(data, account.id)) {
                Alert.alert('Account has history', 'This chart account has opening balances, transactions, payments, journals, or reconciliations and cannot be deleted.');
                return;
              }
              if (chartAccountUsedInLockedPeriod(account.id)) {
                Alert.alert('Period locked', 'This chart account is used in a locked period and cannot be deleted.');
                return;
              }
              onDataChange({
                ...data,
                chartOfAccounts: data.chartOfAccounts.filter((item) => item.id !== account.id),
                auditLog: [...(data.auditLog || []), auditEntry('delete', 'chart_account', account.id, `${account.code} · ${account.name}`)],
              });
              setAccountFormOpen(false);
            }}
          />
        </>
      )}
    </Screen>
  );
}

type ReconRow = ReturnType<typeof reconciliationRows>[number];

function dateDistanceDays(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function sourceLabel(data: LedgerData, sourceId?: string) {
  if (!sourceId) return 'No match';
  const tx = data.transactions.find((item) => item.id === sourceId);
  if (tx) return tx.invoiceNo || tx.creditNoteNo || tx.note || tx.party || tx.id;
  for (const item of data.transactions) {
    const payment = (item.payments || []).find((p) => p.id === sourceId);
    if (payment) return `${item.invoiceNo || item.party || item.id} payment`;
  }
  if (sourceId.startsWith('opening_')) return 'Opening balance';
  return sourceId;
}

function matchBankFeedItems(data: LedgerData, accountId: string, items: BankFeedItem[]) {
  const used = new Set((data.bankFeedItems || [])
    .filter((item) => item.accountId === accountId && item.matchedSourceId && !item.ignoredAt)
    .map((item) => item.matchedSourceId as string));
  const rows = reconciliationRows(data, accountId, '9999-12-31')
    .filter((row) => !used.has(row.sourceId));

  return items.map((item) => {
    if (item.matchedSourceId || item.ignoredAt || item.reconciledAt) return item;
    const candidates = rows
      .filter((row) => Math.abs(row.movement - item.amount) <= 0.01 && dateDistanceDays(row.date, item.date) <= 7)
      .map((row) => {
        const dateScore = 10 - dateDistanceDays(row.date, item.date);
        const memo = row.memo.toLowerCase();
        const desc = item.description.toLowerCase();
        const textScore = desc && memo && (desc.includes(memo) || memo.includes(desc)) ? 5 : 0;
        return { row, score: dateScore + textScore };
      })
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) return item;
    if (candidates.length > 1 && Math.abs(candidates[0].score - candidates[1].score) < 0.01) return item;
    used.add(candidates[0].row.sourceId);
    return { ...item, matchedSourceId: candidates[0].row.sourceId };
  });
}

function buildBankFeedItems(accountId: string, rows: ParsedBankCsvRow[], existingHashes: Set<string>) {
  const now = new Date().toISOString();
  return rows.map((row) => {
    const rawHash = bankFeedFingerprint(accountId, row.date, row.amount, row.description, row.reference);
    return {
      id: uid('bf_'),
      accountId,
      date: row.date,
      description: row.description,
      amount: row.amount,
      reference: row.reference,
      rawHash,
      importedAt: now,
    };
  }).filter((item) => !existingHashes.has(item.rawHash));
}

function matchedRowsTotal(rows: ReconRow[], sourceIds: Set<string>) {
  return rows.filter((row) => sourceIds.has(row.sourceId)).reduce((sum, row) => sum + row.movement, 0);
}

function ReconciliationModal({ open, data, onClose, onSave, onVoid }: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onSave: (reconciliation: BankReconciliation) => void;
  onVoid: (reconciliation: BankReconciliation) => void;
}) {
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [statementDate, setStatementDate] = useState(todayStr());
  const [statementBalance, setStatementBalance] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const account = data.accounts.find((item) => item.id === accountId);
  const rows = reconciliationRows(data, accountId, statementDate);
  const selectedSet = new Set(selected);
  const priorReconciliations = (data.bankReconciliations || []).filter((reconciliation) => reconciliation.accountId === accountId && !reconciliation.voidedAt);
  const priorCleared = new Set(priorReconciliations.flatMap((reconciliation) => reconciliation.clearedSourceIds));
  const allAccountRows = account?.chartAccountId
    ? chartAccountLedger(data, account.chartAccountId)
      .filter((row) => row.date <= statementDate)
      .map((row) => {
        const chart = data.chartOfAccounts.find((item) => item.id === account.chartAccountId);
        const movement = chart?.normalBalance === 'credit' ? row.credit - row.debit : row.debit - row.credit;
        return { ...row, movement };
      })
    : [];
  const priorClearedTotal = allAccountRows.filter((row) => priorCleared.has(row.sourceId)).reduce((sum, row) => sum + row.movement, 0);
  const clearedTotal = rows.filter((row) => selectedSet.has(row.sourceId)).reduce((sum, row) => sum + row.movement, 0);
  const bookBalance = priorClearedTotal + clearedTotal;
  const difference = (Number(statementBalance) || 0) - bookBalance;
  const history = [...(data.bankReconciliations || [])]
    .filter((reconciliation) => reconciliation.accountId === accountId)
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate) || b.id.localeCompare(a.id));

  function toggle(sourceId: string) {
    setSelected((current) => current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId]);
  }

  function submit() {
    if (!accountId) { Alert.alert('Account required', 'Select an account to reconcile.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) { Alert.alert('Invalid date', 'Use YYYY-MM-DD.'); return; }
    if (isDateLocked(data, statementDate)) {
      Alert.alert('Period locked', `Reconciliations dated ${statementDate} cannot be finalized because the period is locked.`);
      return;
    }
    const balance = Number(statementBalance);
    if (!Number.isFinite(balance)) { Alert.alert('Invalid balance', 'Enter the statement ending balance.'); return; }
    if (Math.abs(difference) > 0.01) { Alert.alert('Reconciliation out of balance', 'The difference must be zero before finalizing.'); return; }
    const now = new Date().toISOString();
    onSave({ id: uid('rec_'), accountId, statementDate, statementBalance: balance, bookBalance, difference, clearedSourceIds: selected, createdAt: now, finalizedAt: now });
    setSelected([]);
    setStatementBalance('');
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title="Bank Reconciliation" subtitle="Clear items against a bank statement" />
          <SelectField
            label="Payment Account"
            value={accountId}
            options={data.accounts.map((account) => ({ value: account.id, label: `${account.icon} ${account.name}`, detail: chartAccountName(data, account.chartAccountId) }))}
            onChange={(value) => { setAccountId(value); setSelected([]); }}
          />
          <TextInput style={styles.input} value={statementDate} onChangeText={(value) => { setStatementDate(value); setSelected([]); }} placeholder="Statement date YYYY-MM-DD" />
          <TextInput style={styles.input} value={statementBalance} onChangeText={setStatementBalance} placeholder="Statement ending balance" keyboardType="decimal-pad" />
          <Card>
            <Text style={styles.cardLine}>Previously cleared balance: {fmtMoney(priorClearedTotal)}</Text>
            <Text style={styles.cardLine}>Selected cleared movement: {fmtMoney(clearedTotal)}</Text>
            <Text style={styles.cardLine}>Book balance after clearing: {fmtMoney(bookBalance)}</Text>
            <Text style={[styles.cardLine, Math.abs(difference) > 0.01 && styles.redText]}>Difference: {fmtMoney(difference)}</Text>
          </Card>
          <SectionTitle>History</SectionTitle>
          {history.length ? history.slice(0, 5).map((reconciliation) => (
            <View key={reconciliation.id} style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerMemo}>{reconciliation.statementDate} · {fmtMoney(reconciliation.statementBalance)}</Text>
                <Text style={styles.ledgerDate}>{reconciliation.voidedAt ? 'Voided' : `Finalized ${reconciliation.finalizedAt.slice(0, 10)}`}</Text>
              </View>
              {!reconciliation.voidedAt ? <ActionButton tone="red" onPress={() => onVoid(reconciliation)}>Void</ActionButton> : null}
            </View>
          )) : <Text style={styles.empty}>No reconciliation history</Text>}
          <SectionTitle>Uncleared Items</SectionTitle>
          {rows.length ? rows.map((row) => (
            <Pressable key={row.sourceId} style={[styles.reconRow, selectedSet.has(row.sourceId) && styles.reconRowActive]} onPress={() => toggle(row.sourceId)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerDate}>{row.date}</Text>
                <Text style={styles.ledgerMemo} numberOfLines={1}>{row.memo}</Text>
              </View>
              <Text style={[styles.ledgerNum, row.movement < 0 && styles.redText]}>{fmtMoney(row.movement)}</Text>
            </Pressable>
          )) : <Text style={styles.empty}>No uncleared items through this date</Text>}
          <ActionButton onPress={submit}>Save Reconciliation</ActionButton>
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function BankFeedModal({ open, data, onClose, onDataChange }: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onDataChange: (data: LedgerData) => void;
}) {
  const [accountId, setAccountId] = useState(data.accounts.find((account) => account.type === 'bank')?.id || data.accounts[0]?.id || '');
  const accountItems = (data.bankFeedItems || [])
    .filter((item) => item.accountId === accountId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const activeItems = accountItems.filter((item) => !item.reconciledAt && !item.ignoredAt);
  const matchedItems = activeItems.filter((item) => item.matchedSourceId);
  const unmatchedItems = activeItems.filter((item) => !item.matchedSourceId);
  const cleared = new Set((data.bankReconciliations || [])
    .filter((reconciliation) => reconciliation.accountId === accountId && !reconciliation.voidedAt)
    .flatMap((reconciliation) => reconciliation.clearedSourceIds));
  const clearableItems = matchedItems.filter((item) => item.matchedSourceId && !cleared.has(item.matchedSourceId));

  async function importCsv() {
    try {
      const rows = await importBankStatementCsv();
      if (!rows) return;
      if (!rows.length) {
        Alert.alert('No rows found', 'The CSV must include a date column and either amount or debit/credit columns.');
        return;
      }
      const existingHashes = new Set((data.bankFeedItems || []).map((item) => item.rawHash));
      const newItems = buildBankFeedItems(accountId, rows, existingHashes);
      if (!newItems.length) {
        Alert.alert('Nothing imported', 'All CSV rows were already imported for this account.');
        return;
      }
      const matched = matchBankFeedItems(data, accountId, newItems);
      onDataChange({
        ...data,
        bankFeedItems: [...(data.bankFeedItems || []), ...matched],
        auditLog: [...(data.auditLog || []), auditEntry('import', 'bank_feed', accountId, `${matched.length} CSV rows imported; ${matched.filter((item) => item.matchedSourceId).length} matched`)],
      });
      Alert.alert('Import complete', `${matched.length} rows imported. ${matched.filter((item) => item.matchedSourceId).length} matched automatically.`);
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Unable to read CSV file.');
    }
  }

  function rematch() {
    const rematched = matchBankFeedItems(data, accountId, activeItems);
    const matchedCount = rematched.filter((item, index) => !activeItems[index].matchedSourceId && item.matchedSourceId).length;
    onDataChange({
      ...data,
      bankFeedItems: (data.bankFeedItems || []).map((item) => rematched.find((candidate) => candidate.id === item.id) || item),
      auditLog: [...(data.auditLog || []), auditEntry('match', 'bank_feed', accountId, `${matchedCount} bank feed rows matched`)],
    });
  }

  function clearMatched() {
    if (!clearableItems.length) {
      Alert.alert('No matched items', 'Import or match bank feed rows before clearing.');
      return;
    }
    const sourceIds = new Set(clearableItems.map((item) => item.matchedSourceId as string));
    const rows = reconciliationRows(data, accountId, '9999-12-31');
    const total = matchedRowsTotal(rows, sourceIds);
    const statementDate = clearableItems.map((item) => item.date).sort((a, b) => b.localeCompare(a))[0] || todayStr();
    if (isDateLocked(data, statementDate)) {
      Alert.alert('Period locked', `Matched bank feed rows dated through ${statementDate} cannot be cleared because the period is locked.`);
      return;
    }
    const now = new Date().toISOString();
    const reconciliation: BankReconciliation = {
      id: uid('rec_'),
      accountId,
      statementDate,
      statementBalance: total,
      bookBalance: total,
      difference: 0,
      clearedSourceIds: Array.from(sourceIds),
      createdAt: now,
      finalizedAt: now,
    };
    onDataChange({
      ...data,
      bankReconciliations: [...(data.bankReconciliations || []), reconciliation],
      bankFeedItems: (data.bankFeedItems || []).map((item) => sourceIds.has(item.matchedSourceId || '') ? { ...item, reconciledAt: now } : item),
      auditLog: [...(data.auditLog || []), auditEntry('finalize', 'bank_feed_reconciliation', reconciliation.id, `${clearableItems.length} matched bank feed rows cleared`)],
    });
  }

  function ignoreItem(itemId: string) {
    const now = new Date().toISOString();
    onDataChange({
      ...data,
      bankFeedItems: (data.bankFeedItems || []).map((item) => item.id === itemId ? { ...item, ignoredAt: now } : item),
      auditLog: [...(data.auditLog || []), auditEntry('ignore', 'bank_feed_item', itemId, 'Bank feed row marked reviewed')],
    });
  }

  function recordUnmatched(item: BankFeedItem) {
    if (isDateLocked(data, item.date)) {
      Alert.alert('Period locked', `Bank feed rows dated ${item.date} cannot create entries because the period is locked.`);
      return;
    }
    const type = item.amount >= 0 ? 'income' : 'expense';
    const chartCode = type === 'income' ? '4010' : '7030';
    const tx: Transaction = {
      id: uid('bf_tx_'),
      type,
      amount: Math.abs(item.amount),
      accountId,
      categoryId: type === 'income' ? 'i_other' : 'e_other',
      chartAccountId: data.chartOfAccounts.find((account) => account.code === chartCode)?.id,
      date: item.date,
      note: item.description,
      gstMode: null,
    };
    onDataChange({
      ...data,
      transactions: [...data.transactions, tx],
      bankFeedItems: (data.bankFeedItems || []).map((feed) => feed.id === item.id ? { ...feed, matchedSourceId: tx.id } : feed),
      auditLog: [...(data.auditLog || []), auditEntry('create', 'transaction', tx.id, `Created from bank feed ${item.description}`)],
    });
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title="Bank Feed" subtitle="Import statement CSV and match ledger activity" />
          <SelectField
            label="Payment Account"
            value={accountId}
            options={data.accounts.filter((account) => account.type === 'bank' || account.type === 'cash' || account.type === 'credit').map((account) => ({ value: account.id, label: `${account.icon} ${account.name}`, detail: chartAccountName(data, account.chartAccountId) }))}
            onChange={setAccountId}
          />
          <Card>
            <Text style={styles.cardLine}>Imported rows pending: {activeItems.length}</Text>
            <Text style={styles.cardLine}>Matched: {matchedItems.length}</Text>
            <Text style={[styles.cardLine, unmatchedItems.length > 0 && styles.warnText]}>Unmatched: {unmatchedItems.length}</Text>
          </Card>
          <ActionButton onPress={importCsv}>Import Bank CSV</ActionButton>
          <ActionButton tone="gray" onPress={rematch}>Re-run Auto Match</ActionButton>
          <ActionButton tone="green" onPress={clearMatched}>Clear Matched Items</ActionButton>
          <SectionTitle>Matched</SectionTitle>
          {matchedItems.length ? matchedItems.slice(0, 40).map((item) => (
            <View key={item.id} style={styles.feedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerDate}>{item.date} · {sourceLabel(data, item.matchedSourceId)}</Text>
                <Text style={styles.ledgerMemo} numberOfLines={1}>{item.description}</Text>
              </View>
              <Text style={[styles.ledgerNum, item.amount < 0 && styles.redText]}>{fmtMoney(item.amount)}</Text>
            </View>
          )) : <Text style={styles.emptySmall}>No matched imported rows</Text>}
          <SectionTitle>Unmatched</SectionTitle>
          {unmatchedItems.length ? unmatchedItems.slice(0, 40).map((item) => (
            <View key={item.id} style={styles.feedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerDate}>{item.date}{item.reference ? ` · ${item.reference}` : ''}</Text>
                <Text style={styles.ledgerMemo} numberOfLines={1}>{item.description}</Text>
              </View>
              <Text style={[styles.ledgerNum, item.amount < 0 && styles.redText]}>{fmtMoney(item.amount)}</Text>
              <Pressable style={styles.miniBtn} onPress={() => recordUnmatched(item)}>
                <Text style={styles.miniText}>Record</Text>
              </Pressable>
              <Pressable style={styles.miniBtn} onPress={() => ignoreItem(item.id)}>
                <Text style={styles.miniText}>Reviewed</Text>
              </Pressable>
            </View>
          )) : <Text style={styles.emptySmall}>No unmatched imported rows</Text>}
          <ActionButton tone="gray" onPress={onClose}>Close</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function LedgerModal({ open, account, data, onClose, canEdit, onEdit }: {
  open: boolean;
  account: ChartAccount | null;
  data: LedgerData;
  onClose: () => void;
  canEdit: boolean;
  onEdit: (account: ChartAccount) => void;
}) {
  if (!account) return null;
  const rows = chartAccountLedger(data, account.id);
  const currentBalance = rows.length ? rows[rows.length - 1].balance : 0;

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title={`${account.code} · ${account.name}`} subtitle={`${account.group} · ${account.normalBalance} normal`} />
          <Card tone={account.class === 'revenue' ? 'green' : account.class === 'expense' ? undefined : undefined}>
            <Text style={styles.ledgerBalLabel}>BALANCE</Text>
            <Text style={[styles.ledgerBalValue, currentBalance < 0 && styles.redText]}>{fmtMoney(currentBalance)}</Text>
          </Card>
          <View style={styles.ledgerHeader}>
            <Text style={[styles.ledgerCol, { flex: 2 }]}>DATE / MEMO</Text>
            <Text style={[styles.ledgerCol, styles.ledgerNum]}>DEBIT</Text>
            <Text style={[styles.ledgerCol, styles.ledgerNum]}>CREDIT</Text>
            <Text style={[styles.ledgerCol, styles.ledgerNum]}>BAL</Text>
          </View>
          {rows.length === 0 ? (
            <Text style={styles.empty}>No activity on this account</Text>
          ) : rows.map((row) => (
            <View key={row.id} style={styles.ledgerRow}>
              <View style={{ flex: 2 }}>
                <Text style={styles.ledgerDate}>{row.date}</Text>
                <Text style={styles.ledgerMemo} numberOfLines={1}>{row.memo}</Text>
              </View>
              <Text style={[styles.ledgerNum, styles.drText]}>{row.debit > 0 ? fmt(row.debit) : '–'}</Text>
              <Text style={[styles.ledgerNum, styles.crText]}>{row.credit > 0 ? fmt(row.credit) : '–'}</Text>
              <Text style={[styles.ledgerNum, row.balance < 0 && styles.redText]}>{fmtMoney(row.balance)}</Text>
            </View>
          ))}
          <View style={{ height: 8 }} />
          {canEdit ? <ActionButton onPress={() => onEdit(account)}>Edit Account</ActionButton> : (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>System account locked</Text>
            </View>
          )}
          <View style={{ height: 10 }} />
          <ActionButton tone="gray" onPress={onClose}>Close</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ChartAccountForm({ open, accountClass, account, hasHistory, isSystem, onClose, onSave, onDelete }: {
  open: boolean;
  accountClass: ChartAccountClass;
  account: ChartAccount | null;
  hasHistory: boolean;
  isSystem: boolean;
  onClose: () => void;
  onSave: (account: ChartAccount) => void;
  onDelete: (account: ChartAccount) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [normalBalance, setNormalBalance] = useState<'debit' | 'credit'>('debit');
  const [isContra, setIsContra] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(account?.code || '');
    setName(account?.name || '');
    setGroup(account?.group || '');
    setNormalBalance(account?.normalBalance || (accountClass === 'asset' || accountClass === 'expense' ? 'debit' : 'credit'));
    setIsContra(!!account?.isContra);
  }, [account, accountClass, open]);

  function submit() {
    if (!code.trim() || !name.trim()) { Alert.alert('Missing details', 'Code and name are required.'); return; }
    onSave({
      id: account?.id || uid('coa_'),
      code: code.trim(),
      name: name.trim(),
      class: account?.class || accountClass,
      group: group.trim() || `${accountClass[0].toUpperCase()}${accountClass.slice(1)}`,
      normalBalance,
      isContra,
    });
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title={account ? 'Edit Account' : 'New Account'} subtitle={`${accountClass[0].toUpperCase()}${accountClass.slice(1)} chart account`} />
          {isSystem ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>System account locked: required for AR/AP, GST, or opening balance postings.</Text>
            </View>
          ) : null}
          <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Code, e.g. 7050" keyboardType="number-pad" editable={!isSystem} />
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Account name" editable={!isSystem} />
          <TextInput style={styles.input} value={group} onChangeText={setGroup} placeholder="Group, e.g. General & Administrative" editable={!isSystem} />
          <Text style={styles.fieldLabel}>Normal Balance</Text>
          <View style={styles.segment}>
            <Pressable style={[styles.segBtn, normalBalance === 'debit' && styles.segActive]} onPress={() => !isSystem && setNormalBalance('debit')}><Text>Debit</Text></Pressable>
            <Pressable style={[styles.segBtn, normalBalance === 'credit' && styles.segActive]} onPress={() => !isSystem && setNormalBalance('credit')}><Text>Credit</Text></Pressable>
          </View>
          <Text style={styles.fieldLabel}>Contra Account</Text>
          <View style={styles.segment}>
            <Pressable style={[styles.segBtn, !isContra && styles.segActive]} onPress={() => !isSystem && setIsContra(false)}><Text>No</Text></Pressable>
            <Pressable style={[styles.segBtn, isContra && styles.segActive]} onPress={() => !isSystem && setIsContra(true)}><Text>Yes</Text></Pressable>
          </View>
          {!isSystem ? <ActionButton onPress={submit}>Save Account</ActionButton> : null}
          {account ? (
            <>
              <View style={{ height: 2 }} />
              <ActionButton tone="red" onPress={() => onDelete(account)}>{isSystem ? 'Cannot Delete: System' : hasHistory ? 'Cannot Delete: Has History' : 'Delete Account'}</ActionButton>
            </>
          ) : null}
          <View style={{ height: 10 }} />
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PaymentAccountLinkForm({ open, data, account, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  account: Account | null;
  onClose: () => void;
  onSave: (accountId: string, chartAccountId: string) => void;
}) {
  const [chartAccountId, setChartAccountId] = useState('');

  useEffect(() => {
    if (!open || !account) return;
    setChartAccountId(account.chartAccountId);
  }, [account, open]);

  if (!account) return null;
  const choices = data.chartOfAccounts.filter((chart) =>
    account.type === 'credit' || account.type === 'loan' ? chart.class === 'liability' : chart.class === 'asset'
  );

  function submit() {
    if (!chartAccountId) {
      Alert.alert('Chart account required', 'Please select a chart account before saving.');
      return;
    }
    onSave(account!.id, chartAccountId);
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title="Link Payment Account" subtitle={account.name} />
          <Card>
            <Text style={styles.cardLine}>Payment account: {account.icon} {account.name}</Text>
            <Text style={styles.cardLine}>Current balance: {fmtMoney(accountBalance(data, account.id))}</Text>
          </Card>
          <SelectField
            label="Chart Account"
            value={chartAccountId}
            options={choices.map((chart) => ({ value: chart.id, label: `${chart.code} · ${chart.name}`, detail: chart.group }))}
            onChange={setChartAccountId}
          />
          <ActionButton onPress={submit}>Save Link</ActionButton>
          <View style={{ height: 10 }} />
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  heroLabel: { color: '#F0EDE8', opacity: 0.55, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heroValue: { color: '#F0EDE8', marginTop: 4, fontSize: 34, fontWeight: '900' },
  segment: { flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 12, padding: 2 },
  segBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  segActive: { backgroundColor: '#F8F6F2' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.blue },
  addBtnText: { color: '#FFFFFF', fontWeight: '900' },
  tabs: { marginBottom: 4 },
  tabsContent: { gap: 8, paddingVertical: 10 },
  tab: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line },
  tabActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  tabText: { color: colors.text, fontWeight: '800' },
  tabTextActive: { color: '#F0EDE8' },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  warnText: { color: colors.orange },
  openingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  emptySmall: { color: colors.muted, fontSize: 12, fontWeight: '600', paddingVertical: 8 },
  helperText: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 8 },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalBody: { padding: 16, gap: 12 },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  fieldLabel: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  cardLine: { paddingVertical: 7, fontWeight: '700', color: colors.text },
  groupTitle: { color: colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginTop: 8, marginBottom: 2 },
  infoBox: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  infoText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  // Ledger modal
  ledgerBalLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  ledgerBalValue: { marginTop: 4, fontSize: 28, fontWeight: '900', color: colors.text },
  redText: { color: colors.red },
  ledgerHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  ledgerCol: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F8F6F2', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 4 },
  reconRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line, borderRadius: 10, gap: 4 },
  reconRowActive: { borderColor: colors.green, backgroundColor: '#E8F0EA' },
  feedRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line, borderRadius: 10, gap: 8 },
  miniBtn: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#E0DDD8' },
  miniText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#F8F6F2', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  ledgerDate: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  ledgerMemo: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 1 },
  ledgerNum: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'right' },
  drText: { color: colors.blue },
  crText: { color: colors.green },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 24 },
});
