import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Header, Screen, SectionTitle, colors } from '../components/ui';
import { TransactionRows } from '../components/TransactionRows';
import { accountBalance, aggregate, basReport, contactName, fmtMoney, isCreditNote, isInvoice, periodRange, todayStr, totalAssets, txBalance, txGst, txTotal } from '../domain/accounting';
import type { LedgerData, Transaction } from '../domain/models';

export function HomeScreen({ data, onEdit }: { data: LedgerData; onEdit: (tx: Transaction) => void }) {
  const totals = totalAssets(data);
  const month = aggregate(data, 'month');
  const gstRange = periodRange('quarter');
  const bas = basReport(data, formatDate(gstRange[0]), formatDate(addDays(gstRange[1], -1)));
  const cashBalance = data.accounts
    .filter((account) => account.type === 'cash' || account.type === 'bank' || account.type === 'ewallet')
    .reduce((sum, account) => sum + accountBalance(data, account.id), 0);
  const openInvoices = data.transactions.filter((tx) => isInvoice(tx) && txBalance(tx, data) > 0.005);
  const receivables = openInvoices.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const payables = openInvoices.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const today = todayStr();
  const overdueIncome = openInvoices.filter((tx) => tx.type === 'income' && (tx.dueDate || tx.date) < today);
  const overdueExpense = openInvoices.filter((tx) => tx.type === 'expense' && (tx.dueDate || tx.date) < today);
  const overdueTotal = [...overdueIncome, ...overdueExpense].reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const trend = monthlyTrend(data, 6);
  const maxTrend = Math.max(1, ...trend.map((item) => Math.max(item.income, item.expense, Math.abs(item.profit))));
  const recent = data.transactions
    .filter((tx) => !tx.voidedAt)
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
    .slice(0, 6);
  return (
    <Screen>
      <Header title="Auctus" subtitle="Trace, Track, Grow" />
      <Card tone="hero">
        <Text style={styles.heroLabel}>NET WORTH</Text>
        <Text style={styles.heroValue}>{fmtMoney(totals.net)}</Text>
        <View style={styles.heroRow}>
          <Text style={styles.heroSub}>Income {fmtMoney(month.income)}</Text>
          <Text style={styles.heroSub}>Purchases {fmtMoney(month.expense)}</Text>
          <Text style={styles.heroSub}>P&L {fmtMoney(month.balance)}</Text>
        </View>
      </Card>
      <View style={styles.metricGrid}>
        <MetricCard label="Cash Balance" value={fmtMoney(cashBalance)} tone="green" />
        <MetricCard label={bas.netGst >= 0 ? 'GST Payable' : 'GST Refund'} value={fmtMoney(Math.abs(bas.netGst))} tone={bas.netGst >= 0 ? 'red' : 'green'} />
      </View>
      <SectionTitle>Receivables / Payables</SectionTitle>
      <View style={styles.metricGrid}>
        <MetricCard label="Receivables" value={fmtMoney(receivables)} detail={`${overdueIncome.length} overdue`} tone="green" />
        <MetricCard label="Payables" value={fmtMoney(payables)} detail={`${overdueExpense.length} overdue`} tone="red" />
      </View>
      <View style={styles.overduePanel}>
        <View style={styles.overdueHeader}>
          <Text style={styles.panelTitle}>Overdue</Text>
          <Text style={[styles.panelTotal, overdueTotal > 0 && styles.redText]}>{fmtMoney(overdueTotal)}</Text>
        </View>
        {[...overdueIncome, ...overdueExpense]
          .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))
          .slice(0, 5)
          .map((tx) => (
            <Pressable key={tx.id} style={styles.overdueRow} onPress={() => onEdit(tx)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.overdueTitle} numberOfLines={1}>{tx.invoiceNo || contactName(data, tx.contactId, tx.party) || tx.note || tx.id}</Text>
                <Text style={styles.overdueSub}>{tx.type === 'income' ? 'Invoice' : 'Bill'} · Due {tx.dueDate || tx.date}</Text>
              </View>
              <Text style={[styles.overdueAmount, tx.type === 'expense' && styles.redText]}>{fmtMoney(txBalance(tx, data))}</Text>
            </Pressable>
          ))}
        {!overdueIncome.length && !overdueExpense.length ? <Text style={styles.emptySmall}>No overdue invoices or bills</Text> : null}
      </View>
      <SectionTitle>Monthly P&L Trend</SectionTitle>
      <View style={styles.trendPanel}>
        {trend.map((item) => (
          <View key={item.key} style={styles.trendRow}>
            <Text style={styles.trendLabel}>{item.label}</Text>
            <View style={styles.trendBars}>
              <View style={[styles.trendBar, styles.incomeBar, { flex: item.income / maxTrend }]} />
              <View style={[styles.trendBar, styles.expenseBar, { flex: item.expense / maxTrend }]} />
              <View style={[styles.trendBar, item.profit >= 0 ? styles.profitBar : styles.lossBar, { flex: Math.abs(item.profit) / maxTrend }]} />
            </View>
            <Text style={[styles.trendValue, item.profit < 0 && styles.redText]}>{fmtMoney(item.profit)}</Text>
          </View>
        ))}
        <View style={styles.legendRow}>
          <Legend color={colors.green} label="Income" />
          <Legend color={colors.orange} label="Expense" />
          <Legend color={colors.blue} label="Profit" />
        </View>
      </View>
      <SectionTitle>Recent Transactions</SectionTitle>
      <TransactionRows data={data} txs={recent} onEdit={onEdit} />
    </Screen>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'green' | 'red' }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'green' && styles.greenText, tone === 'red' && styles.redText]}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function monthlyTrend(data: LedgerData, count: number) {
  const now = new Date();
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const summary = monthlySummary(data, start, end);
    return {
      key,
      label: date.toLocaleDateString('en-AU', { month: 'short' }),
      income: summary.income,
      expense: summary.expense,
      profit: summary.balance,
    };
  });
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

function monthlySummary(data: LedgerData, start: Date, end: Date) {
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  let income = 0;
  let expense = 0;
  for (const tx of data.transactions) {
    if (tx.voidedAt || tx.type === 'transfer' || tx.date < startStr || tx.date >= endStr) continue;
    const sign = isCreditNote(tx) ? -1 : 1;
    const net = txTotal(tx, data) - txGst(tx, data);
    if (tx.type === 'income') income += sign * net;
    if (tx.type === 'expense') expense += sign * net;
  }
  return { income, expense, balance: income - expense };
}

const styles = StyleSheet.create({
  heroLabel: { color: '#F0EDE8', opacity: 0.55, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heroValue: { color: '#F0EDE8', marginTop: 4, fontSize: 36, fontWeight: '800' },
  heroRow: { flexDirection: 'row', gap: 20, marginTop: 16, flexWrap: 'wrap' },
  heroSub: { color: '#F0EDE8', opacity: 0.7, fontWeight: '700', fontSize: 13 },
  metricGrid: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  metricCard: { flex: 1, minHeight: 92, backgroundColor: '#F8F6F2', borderRadius: 8, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, justifyContent: 'space-between' },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  metricValue: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 8 },
  metricDetail: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  greenText: { color: colors.green },
  redText: { color: colors.red },
  overduePanel: { backgroundColor: '#F8F6F2', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, overflow: 'hidden', marginBottom: 4 },
  overdueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  panelTotal: { color: colors.text, fontSize: 15, fontWeight: '900' },
  overdueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  overdueTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  overdueSub: { color: colors.muted, marginTop: 2, fontSize: 11, fontWeight: '700' },
  overdueAmount: { color: colors.green, fontSize: 13, fontWeight: '900' },
  emptySmall: { color: colors.muted, fontSize: 12, fontWeight: '700', padding: 12 },
  trendPanel: { backgroundColor: '#F8F6F2', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 12, gap: 9, marginBottom: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trendLabel: { width: 34, color: colors.muted, fontSize: 12, fontWeight: '900' },
  trendBars: { flex: 1, height: 28, flexDirection: 'row', alignItems: 'stretch', gap: 3 },
  trendBar: { minWidth: 3, borderRadius: 4 },
  incomeBar: { backgroundColor: colors.green },
  expenseBar: { backgroundColor: colors.orange },
  profitBar: { backgroundColor: colors.blue },
  lossBar: { backgroundColor: colors.red },
  trendValue: { width: 86, textAlign: 'right', color: colors.text, fontSize: 12, fontWeight: '900' },
  legendRow: { flexDirection: 'row', gap: 14, paddingTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
});
