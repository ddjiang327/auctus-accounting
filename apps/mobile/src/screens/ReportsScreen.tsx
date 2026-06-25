import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ActionButton, Card, Header, Screen, SectionTitle, colors } from '../components/ui';
import { SelectField } from '../components/SelectField';
import { aggregate, arApAging, auditEntry, basReport, contactName, financialPosition, fmt, fmtMoney, inRange, isCreditNote, isDateLocked, isInvoice, journalEntriesInRange, periodRange, todayStr, trialBalance, txBalance, txGst, txPaid, txPayments, txTotal, uid } from '../domain/accounting';
import type { BasLineItem, BasReport } from '../domain/accounting';
import type { GsmMode, JournalLine, LedgerData, ManualJournal, Period } from '../domain/models';
import { shareCsv, toCsv } from '../utils/csvExport';

export function ReportsScreen({ data, onDataChange }: { data: LedgerData; onDataChange: (data: LedgerData) => void }) {
  const [period, setPeriod] = useState<Period>('month');
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<ManualJournal | null>(null);
  const [basOpen, setBasOpen] = useState(false);
  const summary = aggregate(data, period);
  const position = financialPosition(data);
  const range = periodRange(period);
  const basFrom = formatDate(range[0]);
  const basTo = formatDate(addDays(range[1], -1));
  const bas = basReport(data, basFrom, basTo);
  const receivable = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'income').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const payable = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'expense').reduce((sum, tx) => sum + txBalance(tx, data), 0);

  const byChart: Record<string, number> = {};
  for (const entry of journalEntriesInRange(data, range)) {
    for (const line of entry.lines) {
      const account = data.chartOfAccounts.find((item) => item.id === line.chartAccountId);
      if (!account || (account.class !== 'revenue' && account.class !== 'expense')) continue;
      const net = line.debit - line.credit;
      const amount = account.normalBalance === 'debit' ? net : -net;
      byChart[account.id] = (byChart[account.id] || 0) + amount;
    }
  }
  const chartRows = Object.entries(byChart).sort((a, b) => b[1] - a[1]);

  let inflow = 0, outflow = 0, transfers = 0;
  for (const tx of data.transactions) {
    if (isInvoice(tx)) {
      for (const payment of txPayments(tx, data)) {
        if (!inRange(payment.date || tx.date, range)) continue;
        if (tx.type === 'income') inflow += Number(payment.amount) || 0;
        if (tx.type === 'expense') outflow += Number(payment.amount) || 0;
      }
    } else if (inRange(tx.date, range)) {
      if (tx.type === 'income') inflow += txTotal(tx, data);
      if (tx.type === 'expense') outflow += txTotal(tx, data);
      if (tx.type === 'transfer') transfers += Number(tx.amount) || 0;
    }
  }

  return (
    <Screen>
      <Header title="Reports" subtitle={`${period[0].toUpperCase()}${period.slice(1)} accounting view`} />
      <View style={styles.segment}>
        {(['week', 'month', 'quarter', 'year'] as Period[]).map((item) => (
          <Pressable key={item} style={[styles.segBtn, period === item && styles.segActive]} onPress={() => setPeriod(item)}>
            <Text>{item}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sectionRow}>
        <SectionTitle>BAS Summary</SectionTitle>
        <Pressable style={styles.viewBtn} onPress={() => setBasOpen(true)}>
          <Text style={styles.viewBtnText}>Full Report</Text>
        </Pressable>
      </View>
      <Card>
        <ReportLine label="G1 Total sales incl. GST" value={fmtMoney(bas.salesGross)} />
        <ReportLine label="1A GST on sales" value={`+${fmt(bas.gstCollected)}`} tone="green" />
        <ReportLine label="G11 Purchases incl. GST" value={fmtMoney(bas.purchasesGross)} />
        <ReportLine label="1B GST on purchases" value={`-${fmt(bas.gstPaid)}`} tone="red" />
        <ReportLine label={`Net GST ${bas.netGst >= 0 ? 'payable' : 'refundable'}`} value={fmtMoney(Math.abs(bas.netGst))} tone={bas.netGst >= 0 ? 'red' : 'green'} />
      </Card>
      <SectionTitle>CSV Export</SectionTitle>
      <View style={styles.exportRow}>
        <View style={{ flex: 1 }}>
          <ActionButton tone="gray" onPress={() => shareCsv(`transactions-${todayStr()}.csv`, buildTransactionsCsv(data))}>Transactions CSV</ActionButton>
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton tone="gray" onPress={() => shareCsv(`general-ledger-all-${todayStr()}.csv`, buildGeneralLedgerCsv(data))}>Ledger CSV</ActionButton>
        </View>
      </View>
      <SectionTitle>Profit & Loss</SectionTitle>
      <Card>
        <ReportLine label="Total Income" value={`+${fmt(summary.income)}`} tone="green" />
        <ReportLine label="Total Purchases" value={`-${fmt(summary.expense)}`} tone="red" />
        <ReportLine label="Net Profit / Loss" value={fmtMoney(summary.balance)} tone={summary.balance >= 0 ? 'green' : 'red'} />
      </Card>
      <SectionTitle>Balance Sheet</SectionTitle>
      <Card>
        <ReportLine label="Assets" value={fmtMoney(position.assets)} tone="green" />
        <ReportLine label="Liabilities" value={fmtMoney(position.liabilities)} tone="red" />
        <ReportLine label="Equity" value={fmtMoney(position.equity)} />
        <ReportLine label="Current Earnings" value={fmtMoney(position.netIncome)} tone={position.netIncome >= 0 ? 'green' : 'red'} />
        <ReportLine label="Total Equity" value={fmtMoney(position.totalEquity)} />
        <ReportLine label="Outstanding Receivables" value={fmtMoney(receivable)} />
        <ReportLine label="Outstanding Payables" value={fmtMoney(payable)} />
        {Math.abs(position.check) > 0.01 ? <ReportLine label="Balance Check Difference" value={fmtMoney(position.check)} tone="red" /> : null}
      </Card>
      <SectionTitle>Cash Flow</SectionTitle>
      <Card>
        <ReportLine label="Operating inflow" value={`+${fmt(inflow)}`} tone="green" />
        <ReportLine label="Operating outflow" value={`-${fmt(outflow)}`} tone="red" />
        <ReportLine label="Transfers" value={fmtMoney(transfers)} />
        <ReportLine label="Net Cash Flow" value={fmtMoney(inflow - outflow)} tone={inflow - outflow >= 0 ? 'green' : 'red'} />
      </Card>
      <SectionTitle>Activity by Chart Account</SectionTitle>
      <Card>
        {chartRows.length ? chartRows.map(([accountId, amount]) => {
          const account = data.chartOfAccounts.find((item) => item.id === accountId);
          const label = account ? `${account.code} · ${account.name}` : 'Unassigned';
          return <ReportLine key={accountId} label={label} value={fmtMoney(amount)} tone={account?.class === 'revenue' ? 'green' : account?.class === 'expense' ? 'red' : undefined} />;
        }) : <Text style={styles.muted}>No spending data</Text>}
      </Card>
      <AgingReport data={data} />
      <View style={styles.sectionRow}>
        <SectionTitle>General Ledger</SectionTitle>
        <Pressable style={styles.viewBtn} onPress={() => setLedgerOpen(true)}>
          <Text style={styles.viewBtnText}>View</Text>
        </Pressable>
      </View>
      <Pressable style={styles.addJournalBtn} onPress={() => setJournalOpen(true)}>
        <Text style={styles.viewBtnText}>New Manual Journal</Text>
      </Pressable>
      <ManualJournalList
        data={data}
        onEdit={(journal) => { setEditingJournal(journal); setJournalOpen(true); }}
        onDelete={(journal) => {
          if (isDateLocked(data, journal.date)) {
            Alert.alert('Period locked', `Manual journal dated ${journal.date} cannot be deleted.`);
            return;
          }
          onDataChange({
            ...data,
            manualJournals: data.manualJournals.map((item) => item.id === journal.id ? { ...item, voidedAt: new Date().toISOString() } : item),
            auditLog: [...(data.auditLog || []), auditEntry('void', 'manual_journal', journal.id, journal.memo)],
          });
        }}
        onReverse={(journal) => {
          if (isDateLocked(data, todayStr())) {
            Alert.alert('Period locked', 'Cannot post a reversal dated today because the period is locked.');
            return;
          }
          const reversal: ManualJournal = {
            id: uid('mj_'),
            date: todayStr(),
            memo: `Reversal - ${journal.memo}`,
            lines: journal.lines.map((line) => ({ chartAccountId: line.chartAccountId, debit: line.credit, credit: line.debit })),
            createdAt: new Date().toISOString(),
            reversalOf: journal.id,
          };
          onDataChange({
            ...data,
            manualJournals: data.manualJournals.map((item) => item.id === journal.id ? { ...item, reversedAt: reversal.createdAt } : item).concat(reversal),
            auditLog: [...(data.auditLog || []), auditEntry('reverse', 'manual_journal', journal.id, reversal.memo)],
          });
        }}
      />
      <TrialBalance data={data} />
      <PeriodLedgerModal
        open={ledgerOpen}
        data={data}
        range={range}
        title={period[0].toUpperCase() + period.slice(1)}
        onClose={() => setLedgerOpen(false)}
      />
      <BASReportModal open={basOpen} data={data} onClose={() => setBasOpen(false)} />
      <ManualJournalModal
        open={journalOpen}
        data={data}
        journal={editingJournal}
        onClose={() => { setJournalOpen(false); setEditingJournal(null); }}
        onSave={(journal) => {
          const existingJournal = data.manualJournals.find((item) => item.id === journal.id);
          if (existingJournal && isDateLocked(data, existingJournal.date)) {
            Alert.alert('Period locked', `Manual journals dated ${existingJournal.date} cannot be changed because the period is locked.`);
            return;
          }
          if (isDateLocked(data, journal.date)) {
            Alert.alert('Period locked', `Manual journals dated ${journal.date} cannot be posted because the period is locked.`);
            return;
          }
          const exists = data.manualJournals.some((item) => item.id === journal.id);
          onDataChange({
            ...data,
            manualJournals: exists
              ? data.manualJournals.map((item) => item.id === journal.id ? { ...journal, updatedAt: new Date().toISOString() } : item)
              : [...(data.manualJournals || []), journal],
            auditLog: [...(data.auditLog || []), auditEntry(exists ? 'update' : 'create', 'manual_journal', journal.id, journal.memo)],
          });
          setEditingJournal(null);
          setJournalOpen(false);
        }}
      />
    </Screen>
  );
}

function ManualJournalList({ data, onEdit, onDelete, onReverse }: {
  data: LedgerData;
  onEdit: (journal: ManualJournal) => void;
  onDelete: (journal: ManualJournal) => void;
  onReverse: (journal: ManualJournal) => void;
}) {
  const rows = [...(data.manualJournals || [])]
    .filter((journal) => !journal.voidedAt)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 6);
  if (!rows.length) return null;
  return (
    <>
      <SectionTitle>Manual Journals</SectionTitle>
      <Card>
        {rows.map((journal) => {
          const debit = journal.lines.reduce((sum, line) => sum + line.debit, 0);
          return (
            <View key={journal.id} style={styles.manualJournalRow}>
              <Pressable style={styles.manualJournalBody} onPress={() => onEdit(journal)}>
                <Text style={styles.jeDate}>{journal.date}</Text>
                <Text style={styles.jeMemo} numberOfLines={1}>{journal.memo}</Text>
                <Text style={styles.agingDetail}>{journal.lines.length} lines · {fmtMoney(debit)}{journal.reversedAt ? ' · Reversed' : ''}</Text>
              </Pressable>
              <View style={styles.manualActions}>
                {!journal.reversedAt && !journal.reversalOf ? <ActionButton tone="gray" onPress={() => onReverse(journal)}>Reverse</ActionButton> : null}
                <ActionButton tone="red" onPress={() => onDelete(journal)}>Void</ActionButton>
              </View>
            </View>
          );
        })}
      </Card>
    </>
  );
}

function AgingReport({ data }: { data: LedgerData }) {
  const ar = arApAging(data, 'income');
  const ap = arApAging(data, 'expense');
  return (
    <>
      <View style={styles.sectionRow}>
        <SectionTitle>AR Aging</SectionTitle>
        <Pressable style={styles.viewBtn} onPress={() => shareCsv(`ar-aging-${todayStr()}.csv`, buildAgingCsv(data, 'income'))}>
          <Text style={styles.viewBtnText}>CSV</Text>
        </Pressable>
      </View>
      <Card>
        <ReportLine label="Total Receivable" value={fmtMoney(ar.total)} tone="green" />
        {ar.buckets.map((bucket) => <ReportLine key={bucket.key} label={bucket.label} value={fmtMoney(bucket.amount)} />)}
        {ar.rows.slice(0, 4).map(({ tx, dueDate, daysPastDue, balance }) => (
          <Text key={tx.id} style={styles.agingDetail}>{contactName(data, tx.contactId, tx.party) || 'Customer'} · Due {dueDate} · {daysPastDue > 0 ? `${daysPastDue} days late` : 'Current'} · {fmtMoney(balance)}</Text>
        ))}
      </Card>
      <View style={styles.sectionRow}>
        <SectionTitle>AP Aging</SectionTitle>
        <Pressable style={styles.viewBtn} onPress={() => shareCsv(`ap-aging-${todayStr()}.csv`, buildAgingCsv(data, 'expense'))}>
          <Text style={styles.viewBtnText}>CSV</Text>
        </Pressable>
      </View>
      <Card>
        <ReportLine label="Total Payable" value={fmtMoney(ap.total)} tone="red" />
        {ap.buckets.map((bucket) => <ReportLine key={bucket.key} label={bucket.label} value={fmtMoney(bucket.amount)} />)}
        {ap.rows.slice(0, 4).map(({ tx, dueDate, daysPastDue, balance }) => (
          <Text key={tx.id} style={styles.agingDetail}>{contactName(data, tx.contactId, tx.party) || 'Supplier'} · Due {dueDate} · {daysPastDue > 0 ? `${daysPastDue} days late` : 'Current'} · {fmtMoney(balance)}</Text>
        ))}
      </Card>
    </>
  );
}

function buildTransactionsCsv(data: LedgerData) {
  const headers = ['Date', 'Type', 'Mode', 'Status', 'Number', 'Credit No', 'Contact', 'Account', 'Chart Account', 'GST Mode', 'Amount', 'GST', 'Total', 'Paid', 'Balance', 'Note'];
  const rows = data.transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((tx) => {
      const account = data.accounts.find((item) => item.id === tx.accountId);
      const chart = data.chartOfAccounts.find((item) => item.id === tx.chartAccountId);
      const number = tx.invoiceNo || '';
      return [
        tx.date,
        tx.type,
        tx.entryMode || 'cash',
        tx.voidedAt ? 'voided' : isCreditNote(tx) ? 'credit_note' : isInvoice(tx) && txBalance(tx, data) <= 0.005 ? 'paid' : tx.docStatus || '',
        number,
        tx.creditNoteNo || '',
        contactName(data, tx.contactId, tx.party),
        account?.name || '',
        chart ? `${chart.code} ${chart.name}` : '',
        tx.gstMode || '',
        tx.amount,
        txGst(tx, data),
        txTotal(tx, data),
        txPaid(tx),
        isInvoice(tx) ? txBalance(tx, data) : '',
        tx.note || '',
      ];
    });
  return toCsv(headers, rows);
}

function buildGeneralLedgerCsv(data: LedgerData, entries = journalEntriesInRange(data, periodRange('all'))) {
  const headers = ['Date', 'Entry ID', 'Source ID', 'Memo', 'Account Code', 'Account Name', 'Debit', 'Credit'];
  const rows = entries.flatMap((entry) => entry.lines.map((line) => {
    const account = data.chartOfAccounts.find((item) => item.id === line.chartAccountId);
    return [entry.date, entry.id, entry.sourceId, entry.memo, account?.code || '', account?.name || '', line.debit, line.credit];
  }));
  return toCsv(headers, rows);
}

function buildAgingCsv(data: LedgerData, type: 'income' | 'expense') {
  const aging = arApAging(data, type);
  const headers = ['Kind', 'Customer/Supplier', 'Document No', 'Issue Date', 'Due Date', 'Days Past Due', 'Bucket', 'Balance'];
  const rows = [
    ...aging.buckets.map((bucket) => ['Bucket', bucket.label, '', '', '', '', bucket.key, bucket.amount]),
    ...aging.rows.map(({ tx, dueDate, daysPastDue, balance, bucket }) => [
      type === 'income' ? 'AR' : 'AP',
      contactName(data, tx.contactId, tx.party),
      tx.invoiceNo || '',
      tx.date,
      dueDate,
      daysPastDue,
      bucket,
      balance,
    ]),
  ];
  return toCsv(headers, rows);
}

export function ManualJournalModal({ open, data, journal, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  journal?: ManualJournal | null;
  onClose: () => void;
  onSave: (journal: ManualJournal) => void;
}) {
  const blankLines = () => [
    { chartAccountId: data.chartOfAccounts[0]?.id || '', debit: '', credit: '' },
    { chartAccountId: data.chartOfAccounts[1]?.id || data.chartOfAccounts[0]?.id || '', debit: '', credit: '' },
  ];
  const [date, setDate] = useState(journal?.date || todayStr());
  const [memo, setMemo] = useState(journal?.memo || '');
  const [lines, setLines] = useState<Array<{ chartAccountId: string; debit: string; credit: string }>>(blankLines());
  useEffect(() => {
    if (!open) return;
    setDate(journal?.date || todayStr());
    setMemo(journal?.memo || '');
    setLines(journal
      ? journal.lines.map((line) => ({ chartAccountId: line.chartAccountId, debit: line.debit ? String(line.debit) : '', credit: line.credit ? String(line.credit) : '' }))
      : blankLines());
  }, [journal, open]);
  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

  function updateLine(index: number, patch: Partial<{ chartAccountId: string; debit: string; credit: string }>) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  function submit() {
    const parsed = lines
      .map((line) => ({ chartAccountId: line.chartAccountId, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 }))
      .filter((line) => line.chartAccountId && (line.debit > 0 || line.credit > 0));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Invalid date', 'Use YYYY-MM-DD.'); return; }
    if (parsed.length < 2) { Alert.alert('Journal incomplete', 'Use at least two posting lines.'); return; }
    if (parsed.some((line) => line.debit > 0 && line.credit > 0)) { Alert.alert('Invalid line', 'A line cannot have both debit and credit.'); return; }
    const debit = parsed.reduce((sum, line) => sum + line.debit, 0);
    const credit = parsed.reduce((sum, line) => sum + line.credit, 0);
    if (Math.abs(debit - credit) > 0.005) { Alert.alert('Out of balance', 'Total debits must equal total credits.'); return; }
    onSave({ id: journal?.id || uid('mj_'), date, memo: memo.trim() || 'Manual journal', lines: parsed, createdAt: journal?.createdAt || new Date().toISOString(), reversalOf: journal?.reversalOf, reversedAt: journal?.reversedAt });
    setMemo('');
    setLines(blankLines());
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title={journal ? 'Edit Manual Journal' : 'Manual Journal'} subtitle="Post balanced debit and credit lines" />
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Date YYYY-MM-DD" />
          <TextInput style={styles.input} value={memo} onChangeText={setMemo} placeholder="Memo" />
          {lines.map((line, index) => (
            <View key={index} style={styles.journalLineEditor}>
              <SelectField
                label={`Line ${index + 1} Account`}
                value={line.chartAccountId}
                options={data.chartOfAccounts.map((account) => ({ value: account.id, label: `${account.code} · ${account.name}`, detail: account.group }))}
                onChange={(chartAccountId) => updateLine(index, { chartAccountId })}
              />
              <View style={styles.amountInputs}>
                <TextInput style={[styles.input, styles.amountInput]} value={line.debit} onChangeText={(debit) => updateLine(index, { debit, credit: debit ? '' : line.credit })} placeholder="Debit" keyboardType="decimal-pad" />
                <TextInput style={[styles.input, styles.amountInput]} value={line.credit} onChangeText={(credit) => updateLine(index, { credit, debit: credit ? '' : line.debit })} placeholder="Credit" keyboardType="decimal-pad" />
              </View>
            </View>
          ))}
          <Pressable style={styles.addJournalBtn} onPress={() => setLines([...lines, { chartAccountId: data.chartOfAccounts[0]?.id || '', debit: '', credit: '' }])}>
            <Text style={styles.viewBtnText}>Add Line</Text>
          </Pressable>
          <ReportLine label="Debit Total" value={fmtMoney(totalDebit)} />
          <ReportLine label="Credit Total" value={fmtMoney(totalCredit)} />
          <ActionButton onPress={submit}>Post Journal</ActionButton>
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PeriodLedgerModal({ open, data, range, title, onClose }: {
  open: boolean;
  data: LedgerData;
  range: readonly [Date, Date];
  title: string;
  onClose: () => void;
}) {
  const entries = journalEntriesInRange(data, range);
  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title="General Ledger" subtitle={`${entries.length} entries · ${title}`} />
          <ActionButton tone="gray" onPress={() => shareCsv(`general-ledger-${title.toLowerCase()}-${todayStr()}.csv`, buildGeneralLedgerCsv(data, entries))}>Export CSV</ActionButton>
          {entries.length === 0 ? (
            <Text style={styles.empty}>No entries for this period</Text>
          ) : entries.map((entry) => (
            <View key={entry.id} style={styles.jeEntry}>
              <View style={styles.jeHead}>
                <Text style={styles.jeDate}>{entry.date}</Text>
                <Text style={styles.jeMemo}>{entry.memo}</Text>
              </View>
              {entry.lines.map((line, i) => {
                const account = data.chartOfAccounts.find((a) => a.id === line.chartAccountId);
                const isDr = line.debit > 0;
                return (
                  <View key={i} style={styles.jeLine}>
                    <Text style={[styles.jeSide, isDr ? styles.blue : styles.green]}>{isDr ? 'Dr' : 'Cr'}</Text>
                    <Text style={styles.jeAccount} numberOfLines={1}>
                      {account ? `${account.code} · ${account.name}` : 'Unknown'}
                    </Text>
                    <Text style={[styles.jeAmt, isDr ? styles.blue : styles.green]}>
                      {fmt(isDr ? line.debit : line.credit)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
          <View style={{ height: 10 }} />
          <ActionButton tone="gray" onPress={onClose}>Close</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function TrialBalance({ data }: { data: LedgerData }) {
  const rows = trialBalance(data);
  const totalDr = rows.reduce((s, r) => s + r.debit, 0);
  const totalCr = rows.reduce((s, r) => s + r.credit, 0);
  if (!rows.length) return null;
  return (
    <>
      <SectionTitle>Trial Balance</SectionTitle>
      <Card>
        <View style={styles.tbHeader}>
          <Text style={[styles.tbCell, { flex: 3 }]}>ACCOUNT</Text>
          <Text style={[styles.tbCell, styles.tbNum]}>DEBIT</Text>
          <Text style={[styles.tbCell, styles.tbNum]}>CREDIT</Text>
        </View>
        {rows.map(({ account, debit, credit }) => (
          <View key={account.id} style={styles.tbRow}>
            <Text style={[styles.tbAccount, { flex: 3 }]} numberOfLines={1}>{account.code} · {account.name}</Text>
            <Text style={[styles.tbNum, debit > 0 && styles.blue]}>{debit > 0 ? fmt(debit) : '–'}</Text>
            <Text style={[styles.tbNum, credit > 0 && styles.green]}>{credit > 0 ? fmt(credit) : '–'}</Text>
          </View>
        ))}
        <View style={[styles.tbRow, styles.tbTotalRow]}>
          <Text style={[styles.tbAccount, { flex: 3 }]}>Total</Text>
          <Text style={[styles.tbNum, styles.tbTotal, Math.abs(totalDr - totalCr) > 0.01 && styles.red]}>{fmt(totalDr)}</Text>
          <Text style={[styles.tbNum, styles.tbTotal, Math.abs(totalDr - totalCr) > 0.01 && styles.red]}>{fmt(totalCr)}</Text>
        </View>
        {Math.abs(totalDr - totalCr) > 0.01 ? (
          <Text style={[styles.muted, { marginTop: 6, fontSize: 12 }]}>⚠ Out of balance by {fmtMoney(Math.abs(totalDr - totalCr))}</Text>
        ) : null}
      </Card>
    </>
  );
}

// ─── BAS Report helpers ───────────────────────────────────────────────────────

function gstModeLabel(mode: GsmMode) {
  if (mode === 'inc') return 'GST Inc';
  if (mode === 'exc') return 'GST Exc';
  if (mode === 'free') return 'GST Free';
  return 'No GST';
}

function lastQuarterRange() {
  const m = new Date().getMonth(); const y = new Date().getFullYear();
  let sm: number, em: number, qy = y;
  if (m >= 6 && m <= 8) { sm = 3; em = 5; }
  else if (m >= 9) { sm = 6; em = 8; }
  else if (m >= 3) { sm = 0; em = 2; }
  else { sm = 9; em = 11; qy = y - 1; }
  return { from: new Date(qy, sm, 1).toISOString().slice(0, 10), to: new Date(qy, em + 1, 0).toISOString().slice(0, 10) };
}

function currentQuarterRange() {
  const m = new Date().getMonth(); const y = new Date().getFullYear();
  let sm: number, em: number;
  if (m >= 9) { sm = 9; em = 11; }
  else if (m >= 6) { sm = 6; em = 8; }
  else if (m >= 3) { sm = 3; em = 5; }
  else { sm = 0; em = 2; }
  return { from: new Date(y, sm, 1).toISOString().slice(0, 10), to: new Date(y, em + 1, 0).toISOString().slice(0, 10) };
}

function currentFyRange() {
  const m = new Date().getMonth(); const y = new Date().getFullYear();
  const s = m >= 6 ? y : y - 1;
  return { from: new Date(s, 6, 1).toISOString().slice(0, 10), to: new Date(s + 1, 5, 30).toISOString().slice(0, 10) };
}

function lastFyRange() {
  const m = new Date().getMonth(); const y = new Date().getFullYear();
  const s = (m >= 6 ? y : y - 1) - 1;
  return { from: new Date(s, 6, 1).toISOString().slice(0, 10), to: new Date(s + 1, 5, 30).toISOString().slice(0, 10) };
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function basBasisLabel(data: LedgerData) {
  return data.settings.basBasis === 'accrual' ? 'Accrual basis' : 'Cash basis';
}

function buildCsv(report: BasReport, profile: { name: string; abn?: string }, basisLabel: string): string {
  const Q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const N = (n: number) => n.toFixed(2);
  const L = (...cells: string[]) => cells.join(',');
  const rows: string[] = [];
  rows.push(Q('Business Activity Statement'));
  rows.push(L(Q('Business'), Q(profile.name)));
  if (profile.abn) rows.push(L(Q('ABN'), Q(profile.abn)));
  rows.push(L(Q('Period'), Q(`${report.from} to ${report.to}`)));
  rows.push(L(Q('Basis'), Q(basisLabel)));
  rows.push(L(Q('Generated'), Q(new Date().toISOString().slice(0, 10))));
  rows.push('');
  rows.push(Q('SUMMARY'));
  rows.push(L(Q('G1 Total sales incl. GST'), N(report.salesGross)));
  rows.push(L(Q('1A GST on sales (collected)'), N(report.gstCollected)));
  rows.push(L(Q('Sales net excl. GST'), N(report.salesNet)));
  rows.push(L(Q('G11 Total purchases incl. GST'), N(report.purchasesGross)));
  rows.push(L(Q('1B GST credits (ITC)'), N(report.gstPaid)));
  rows.push(L(Q('Purchases net excl. GST'), N(report.purchasesNet)));
  rows.push(L(Q(report.netGst >= 0 ? 'Net GST payable' : 'Net GST refundable'), N(Math.abs(report.netGst))));
  rows.push('');
  rows.push(Q('SALES DETAIL'));
  rows.push(L(Q('Date'), Q('Party'), Q('Reference'), Q('GST Code'), Q('Net'), Q('GST'), Q('Gross')));
  for (const l of report.salesLines) rows.push(L(Q(l.date), Q(l.party), Q(l.reference), Q(gstModeLabel(l.gstMode)), N(l.netAmount), N(l.gstAmount), N(l.grossAmount)));
  rows.push('');
  rows.push(Q('PURCHASES DETAIL'));
  rows.push(L(Q('Date'), Q('Party'), Q('Reference'), Q('GST Code'), Q('Net'), Q('GST'), Q('Gross')));
  for (const l of report.purchasesLines) rows.push(L(Q(l.date), Q(l.party), Q(l.reference), Q(gstModeLabel(l.gstMode)), N(l.netAmount), N(l.gstAmount), N(l.grossAmount)));
  return rows.join('\n');
}

function buildHtml(report: BasReport, profile: { name: string; abn?: string }, basisLabel: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const M = (n: number) => `$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signed = (n: number) => n < 0 ? `<span style="color:#C0392B">(${M(n)})</span>` : M(n);
  const salesRows = report.salesLines.map((l) =>
    `<tr><td>${esc(l.date)}</td><td>${esc(l.party || '—')}</td><td>${esc(l.reference)}</td><td>${esc(gstModeLabel(l.gstMode))}</td><td class="r">${signed(l.netAmount)}</td><td class="r">${M(l.gstAmount)}</td><td class="r">${signed(l.grossAmount)}</td></tr>`
  ).join('');
  const purchRows = report.purchasesLines.map((l) =>
    `<tr><td>${esc(l.date)}</td><td>${esc(l.party || '—')}</td><td>${esc(l.reference)}</td><td>${esc(gstModeLabel(l.gstMode))}</td><td class="r">${signed(l.netAmount)}</td><td class="r">${M(l.gstAmount)}</td><td class="r">${signed(l.grossAmount)}</td></tr>`
  ).join('');
  const detailTable = (rows: string, net: number, gst: number, gross: number) => rows
    ? `<table><tr><th>Date</th><th>Party</th><th>Ref</th><th>GST</th><th class="r">Net</th><th class="r">GST</th><th class="r">Gross</th></tr>${rows}<tr class="tot"><td colspan="4">Total</td><td class="r">${M(net)}</td><td class="r">${M(gst)}</td><td class="r">${M(gross)}</td></tr></table>`
    : '<p class="muted">No transactions in this period.</p>';
  const netLabel = report.netGst >= 0 ? 'Net GST payable' : 'Net GST refundable';
  const netColor = report.netGst >= 0 ? '#C0392B' : '#27AE60';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BAS Report</title><style>
body{font-family:-apple-system,Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#1A1916;font-size:13px}
h1{font-size:26px;font-weight:900;margin:0 0 4px}
.meta{color:#6A6560;margin-bottom:28px;font-size:12px}
h2{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#6A6560;border-bottom:1px solid #E0DDD8;padding-bottom:6px;margin:24px 0 10px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{font-size:10px;font-weight:800;text-transform:uppercase;color:#6A6560;text-align:left;padding:6px 0;border-bottom:2px solid #E0DDD8}
td{padding:7px 0;border-bottom:1px solid #F0EDE8;vertical-align:top;font-size:12px}
.r{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.sum td:first-child{font-weight:600;padding-left:4px}.code{font-size:10px;font-weight:900;color:#6A6560;background:#F0EDE8;padding:1px 5px;border-radius:4px;margin-right:6px}
.net td{font-weight:900;font-size:16px;border-top:2px solid #1A1916;border-bottom:0;padding-top:10px}
.tot td{font-weight:900;border-top:2px solid #E0DDD8;border-bottom:0}
hr{border:0;border-top:1px solid #E0DDD8;margin:6px 0}
.muted{color:#6A6560;font-size:12px}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #E0DDD8;color:#6A6560;font-size:11px}
@media print{@page{margin:14mm}body{max-width:100%}}
</style></head><body>
<h1>Business Activity Statement</h1>
<p class="meta">${esc(profile.name)}${profile.abn ? ` &nbsp;·&nbsp; ABN ${esc(profile.abn)}` : ''} &nbsp;·&nbsp; Period <strong>${esc(report.from)}</strong> to <strong>${esc(report.to)}</strong> &nbsp;·&nbsp; ${esc(basisLabel)} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-AU')}</p>
<h2>Summary</h2>
<table class="sum">
<tr><td><span class="code">G1</span> Total sales (incl. GST)</td><td class="r">${M(report.salesGross)}</td></tr>
<tr><td><span class="code">1A</span> GST on sales (collected)</td><td class="r" style="color:#27AE60">${M(report.gstCollected)}</td></tr>
<tr><td style="padding-left:20px;color:#6A6560;font-size:12px">Sales net (excl. GST)</td><td class="r" style="color:#6A6560;font-size:12px">${M(report.salesNet)}</td></tr>
<tr><td colspan="2"><hr></td></tr>
<tr><td><span class="code">G11</span> Total purchases (incl. GST)</td><td class="r">${M(report.purchasesGross)}</td></tr>
<tr><td><span class="code">1B</span> GST credits (ITC)</td><td class="r" style="color:#C0392B">${M(report.gstPaid)}</td></tr>
<tr><td style="padding-left:20px;color:#6A6560;font-size:12px">Purchases net (excl. GST)</td><td class="r" style="color:#6A6560;font-size:12px">${M(report.purchasesNet)}</td></tr>
<tr class="net"><td>${esc(netLabel)}</td><td class="r" style="color:${netColor}">${M(Math.abs(report.netGst))}</td></tr>
</table>
<h2>Sales Detail (${report.salesLines.length} transactions)</h2>
${detailTable(salesRows, report.salesNet, report.gstCollected, report.salesGross)}
<h2>Purchases Detail (${report.purchasesLines.length} transactions)</h2>
${detailTable(purchRows, report.purchasesNet, report.gstPaid, report.purchasesGross)}
<div class="footer">Generated by Auctus &nbsp;·&nbsp; ${esc(basisLabel)} &nbsp;·&nbsp; Verify with your tax agent before lodging. Not a substitute for professional advice.</div>
</body></html>`;
}

// ─── BAS Report Modal ─────────────────────────────────────────────────────────

function BASReportModal({ open, data, onClose }: { open: boolean; data: LedgerData; onClose: () => void }) {
  const defaultRange = lastQuarterRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [busy, setBusy] = useState(false);

  const report = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
    return basReport(data, from, to);
  }, [data, from, to]);

  const profile = data.settings.businessProfile;
  const basisLabel = basBasisLabel(data);

  async function shareFile(content: string, filename: string, mimeType: string) {
    setBusy(true);
    try {
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType, dialogTitle: `Share ${filename}` });
      } else {
        Alert.alert('Sharing unavailable', 'File sharing is not supported on this device.');
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  const QUICK_RANGES = [
    { label: 'Last Qtr', fn: lastQuarterRange },
    { label: 'This Qtr', fn: currentQuarterRange },
    { label: 'This FY', fn: currentFyRange },
    { label: 'Last FY', fn: lastFyRange },
  ];

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          {/* Header */}
          <View style={styles.basTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.basTitle}>BAS Report</Text>
              <Text style={styles.basSub}>{basisLabel} · Australian GST</Text>
            </View>
            <ActionButton tone="gray" onPress={onClose}>Close</ActionButton>
          </View>

          {/* Date range */}
          <Card>
            <View style={styles.dateRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput style={styles.dateInput} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput style={styles.dateInput} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />
              </View>
            </View>
            <View style={styles.quickRow}>
              {QUICK_RANGES.map(({ label, fn }) => (
                <Pressable key={label} style={styles.quickBtn} onPress={() => { const r = fn(); setFrom(r.from); setTo(r.to); }}>
                  <Text style={styles.quickBtnText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          {!report ? (
            <Text style={[styles.muted, { textAlign: 'center', paddingVertical: 24 }]}>Enter a valid date range to generate the report.</Text>
          ) : (
            <>
              {/* Summary */}
              <SectionTitle>BAS Summary</SectionTitle>
              <Card>
                <BasSummaryRow code="G1" label="Total sales (incl. GST)" value={report.salesGross} />
                <BasSummaryRow code="1A" label="GST on sales (collected)" value={report.gstCollected} tone="green" />
                <BasSummaryRow code="" label="Sales net (excl. GST)" value={report.salesNet} muted />
                <View style={styles.separator} />
                <BasSummaryRow code="G11" label="Total purchases (incl. GST)" value={report.purchasesGross} />
                <BasSummaryRow code="1B" label="GST credits (ITC)" value={report.gstPaid} tone="red" />
                <BasSummaryRow code="" label="Purchases net (excl. GST)" value={report.purchasesNet} muted />
                <View style={styles.separator} />
                <BasSummaryRow
                  code=""
                  label={report.netGst >= 0 ? 'Net GST payable ▼' : 'Net GST refundable ▲'}
                  value={Math.abs(report.netGst)}
                  tone={report.netGst >= 0 ? 'red' : 'green'}
                  large
                />
              </Card>

              {/* Sales detail */}
              <SectionTitle>Sales ({report.salesLines.length} transactions)</SectionTitle>
              <Card>
                {report.salesLines.length ? (
                  <>
                    <BasDetailHeader />
                    {report.salesLines.map((line) => <BasDetailRow key={line.id} line={line} />)}
                    <BasDetailTotal label="Total" net={report.salesNet} gst={report.gstCollected} gross={report.salesGross} />
                  </>
                ) : <Text style={styles.muted}>No taxable sales in this period.</Text>}
              </Card>

              {/* Purchases detail */}
              <SectionTitle>Purchases ({report.purchasesLines.length} transactions)</SectionTitle>
              <Card>
                {report.purchasesLines.length ? (
                  <>
                    <BasDetailHeader />
                    {report.purchasesLines.map((line) => <BasDetailRow key={line.id} line={line} />)}
                    <BasDetailTotal label="Total" net={report.purchasesNet} gst={report.gstPaid} gross={report.purchasesGross} />
                  </>
                ) : <Text style={styles.muted}>No taxable purchases in this period.</Text>}
              </Card>

              {/* Export */}
              <SectionTitle>Export</SectionTitle>
              <View style={styles.exportRow}>
                <View style={{ flex: 1 }}>
                  <ActionButton tone="blue" onPress={() => shareFile(buildCsv(report, profile, basisLabel), `bas-${from}-${to}.csv`, 'text/csv')}>
                    {busy ? '…' : 'Export CSV'}
                  </ActionButton>
                </View>
                <View style={{ flex: 1 }}>
                  <ActionButton onPress={() => shareFile(buildHtml(report, profile, basisLabel), `bas-${from}-${to}.html`, 'text/html')}>
                    {busy ? '…' : 'Share HTML / PDF'}
                  </ActionButton>
                </View>
              </View>
              <Text style={[styles.muted, styles.exportNote]}>HTML can be opened in Safari/Chrome and printed as PDF</Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function BasSummaryRow({ code, label, value, tone, large, muted }: { code: string; label: string; value: number; tone?: 'green' | 'red'; large?: boolean; muted?: boolean }) {
  return (
    <View style={styles.basRow}>
      <View style={styles.basRowLeft}>
        {code ? <Text style={styles.basCode}>{code}</Text> : <View style={{ width: 36 }} />}
        <Text style={[styles.basLabel, muted && styles.muted, large && styles.basLabelLarge]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.basValue, tone === 'green' && styles.green, tone === 'red' && styles.red, large && styles.basValueLarge]}>
        {fmtMoney(value)}
      </Text>
    </View>
  );
}

function BasDetailHeader() {
  return (
    <View style={styles.detailHeader}>
      <Text style={[styles.detailHead, { flex: 1.2 }]}>DATE</Text>
      <Text style={[styles.detailHead, { flex: 2 }]}>PARTY / REF</Text>
      <Text style={[styles.detailHead, styles.detailR]}>NET</Text>
      <Text style={[styles.detailHead, styles.detailR]}>GST</Text>
      <Text style={[styles.detailHead, styles.detailR]}>GROSS</Text>
    </View>
  );
}

function BasDetailRow({ line }: { line: BasLineItem }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailText, { flex: 1.2 }]}>{line.date}</Text>
      <View style={{ flex: 2, minWidth: 0 }}>
        <Text style={styles.detailText} numberOfLines={1}>{line.party || '—'}{line.isCreditNote ? ' ↩' : ''}</Text>
        {line.reference ? <Text style={styles.detailSub}>{line.reference} · {gstModeLabel(line.gstMode)}</Text> : null}
      </View>
      <Text style={[styles.detailAmt, line.netAmount < 0 && styles.red]}>{fmtMoney(line.netAmount)}</Text>
      <Text style={styles.detailAmt}>{fmtMoney(line.gstAmount)}</Text>
      <Text style={[styles.detailAmt, styles.detailAmtBold]}>{fmtMoney(line.grossAmount)}</Text>
    </View>
  );
}

function BasDetailTotal({ label, net, gst, gross }: { label: string; net: number; gst: number; gross: number }) {
  return (
    <View style={[styles.detailRow, styles.detailTotalRow]}>
      <Text style={[styles.detailText, { flex: 1.2 }, styles.detailTotal]}>{label}</Text>
      <View style={{ flex: 2 }} />
      <Text style={[styles.detailAmt, styles.detailTotal]}>{fmtMoney(net)}</Text>
      <Text style={[styles.detailAmt, styles.detailTotal]}>{fmtMoney(gst)}</Text>
      <Text style={[styles.detailAmt, styles.detailAmtBold, styles.detailTotal]}>{fmtMoney(gross)}</Text>
    </View>
  );
}

function ReportLine({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone === 'green' && styles.green, tone === 'red' && styles.red]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 12, padding: 2 },
  segBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  segActive: { backgroundColor: '#F8F6F2' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  rowLabel: { flex: 1, color: colors.text, fontWeight: '600' },
  rowValue: { fontWeight: '900', color: colors.text },
  green: { color: colors.green },
  red: { color: colors.red },
  blue: { color: colors.blue },
  muted: { color: colors.muted },
  tbHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  tbCell: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  tbRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  tbTotalRow: { borderBottomWidth: 0, marginTop: 2 },
  tbAccount: { fontSize: 13, fontWeight: '600', color: colors.text },
  tbNum: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'right' },
  tbTotal: { fontWeight: '900' },
  // General Ledger section
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.blue },
  viewBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  addJournalBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.blue, alignItems: 'center', marginBottom: 8 },
  agingDetail: { color: colors.muted, fontSize: 12, fontWeight: '600', paddingTop: 6 },
  // PeriodLedgerModal
  modal: { flex: 1, backgroundColor: colors.bg },
  modalBody: { padding: 16, gap: 10 },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  journalLineEditor: { gap: 8, backgroundColor: '#F8F6F2', borderRadius: 12, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  amountInputs: { flexDirection: 'row', gap: 8 },
  amountInput: { flex: 1 },
  manualJournalRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 8 },
  manualJournalBody: { gap: 2 },
  manualActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 32 },
  jeEntry: { backgroundColor: '#F8F6F2', borderRadius: 12, overflow: 'hidden', marginBottom: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.07)' },
  jeHead: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  jeDate: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  jeMemo: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 1 },
  jeLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  jeSide: { width: 22, fontSize: 12, fontWeight: '900' },
  jeAccount: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  jeAmt: { fontSize: 13, fontWeight: '800' },
  // BAS Report Modal
  basTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  basTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  basSub: { fontSize: 13, color: colors.muted, fontWeight: '600', marginTop: 2 },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  dateInput: { backgroundColor: '#F8F6F2', borderRadius: 10, padding: 10, fontSize: 15, fontWeight: '700', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  quickBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.blue },
  quickBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 6 },
  basRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  basRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6, minWidth: 0 },
  basCode: { fontSize: 10, fontWeight: '900', color: colors.muted, backgroundColor: '#F0EDE8', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', width: 30, textAlign: 'center' },
  basLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  basLabelLarge: { fontSize: 15, fontWeight: '900' },
  basValue: { fontSize: 14, fontWeight: '800', color: colors.text },
  basValueLarge: { fontSize: 16, fontWeight: '900' },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportNote: { fontSize: 12, textAlign: 'center', paddingVertical: 6 },
  detailHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 2, borderColor: colors.line, gap: 4 },
  detailHead: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  detailR: { flex: 1, textAlign: 'right' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 4 },
  detailText: { fontSize: 12, fontWeight: '600', color: colors.text },
  detailSub: { fontSize: 11, color: colors.muted, fontWeight: '600', marginTop: 1 },
  detailAmt: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'right' },
  detailAmtBold: { fontWeight: '900' },
  detailTotalRow: { borderBottomWidth: 0, borderTopWidth: 2, borderTopColor: colors.line, marginTop: 2 },
  detailTotal: { fontWeight: '900', fontSize: 13 },
});
