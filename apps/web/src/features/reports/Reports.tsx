import { useMemo, useState } from 'react';
import { aggregate, allJournalEntries, basReport, contactName, fmt, fmtMoney, getCategory, inventoryValuation, isInvoice, journalEntriesInRange, periodRange, todayStr, totalAssets, txBalance } from '../../domain/accounting';
import type { Budget, Category, ChartAccount, LedgerData, Period } from '../../domain/models';

interface ReportsProps {
  data: LedgerData;
  period: Period;
  onPeriodChange: (period: Period) => void;
  onDataChange?: (data: LedgerData) => void;
}

const periods: Period[] = ['week', 'month', 'quarter', 'year'];

interface PLRow { account: ChartAccount; balance: number; }
interface PLData {
  revenue: PLRow[];
  cogs: PLRow[];
  expenses: PLRow[];
  expenseGroups: Record<string, PLRow[]>;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
}

function buildPL(data: LedgerData, fromDate: string, toDate: string): PLData {
  const range = [new Date(fromDate + 'T00:00:00'), new Date(toDate + 'T23:59:59')] as const;
  const entries = journalEntriesInRange(data, range);

  const totals: Record<string, { debit: number; credit: number }> = {};
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!totals[line.chartAccountId]) totals[line.chartAccountId] = { debit: 0, credit: 0 };
      totals[line.chartAccountId].debit += Number(line.debit) || 0;
      totals[line.chartAccountId].credit += Number(line.credit) || 0;
    }
  }

  const rows = data.chartOfAccounts
    .filter((acc) => (acc.class === 'revenue' || acc.class === 'expense') && totals[acc.id])
    .map((acc) => {
      const t = totals[acc.id];
      const net = t.debit - t.credit;
      const balance = acc.normalBalance === 'debit' ? net : -net;
      return { account: acc, balance };
    })
    .filter((r) => Math.abs(r.balance) > 0.005)
    .sort((a, b) => a.account.code.localeCompare(b.account.code));

  const revenue = rows.filter((r) => r.account.class === 'revenue');
  const cogs = rows.filter((r) => r.account.class === 'expense' && r.account.group === 'Cost of Goods Sold');
  const expenses = rows.filter((r) => r.account.class === 'expense' && r.account.group !== 'Cost of Goods Sold');

  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const totalCogs = cogs.reduce((s, r) => s + r.balance, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0);
  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalExpenses;

  const expenseGroups: Record<string, PLRow[]> = {};
  for (const row of expenses) {
    const g = row.account.group || 'Other Expenses';
    if (!expenseGroups[g]) expenseGroups[g] = [];
    expenseGroups[g].push(row);
  }

  return { revenue, cogs, expenses, expenseGroups, totalRevenue, totalCogs, grossProfit, totalExpenses, netProfit };
}

const PERIOD_MONTHS: Record<Period, number> = { week: 7 / 30, month: 1, quarter: 3, year: 12, today: 1 / 30, all: 12 };

export function Reports({ data, period, onPeriodChange, onDataChange }: ReportsProps) {
  const [fromDate, toDate] = basDatesForPeriod(period);
  const bas = basReport(data, fromDate, toDate);
  const pl = aggregate(data, period);
  const bs = totalAssets(data);
  const receivable = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'income').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const payable = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'expense').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const expenseCats = Object.entries(pl.byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const valuation = (data.products || []).length > 0 ? inventoryValuation(data) : [];

  const plData = useMemo(() => buildPL(data, fromDate, toDate), [data, fromDate, toDate]);

  return (
    <section className="view">
      <header className="large-header">
        <h1>Reports</h1>
        <p>Accounting view · BAS-ready</p>
      </header>
      <div className="seg-control">
        {periods.map((item) => <button key={item} className={period === item ? 'active' : ''} onClick={() => onPeriodChange(item)}>{item}</button>)}
      </div>
      <div className="report-card highlight report-hero">
        <span>Net GST {bas.netGst >= 0 ? 'Payable' : 'Refundable'}</span>
        <strong>{fmtMoney(Math.abs(bas.netGst))}</strong>
        <small>{data.settings.basBasis || 'cash'} basis · {bas.from} to {bas.to}</small>
      </div>

      {/* Full P&L */}
      <div className="report-card wide-card pl-card">
        <div className="pl-header">
          <h3>Profit & Loss</h3>
          <span className="pl-period">{fromDate} – {toDate}</span>
        </div>

        {plData.totalRevenue === 0 && plData.totalExpenses === 0 ? (
          <p className="muted" style={{ padding: '12px 0' }}>No income or expense transactions in this period.</p>
        ) : (
          <>
            <PLSection title="Revenue">
              {plData.revenue.map((r) => (
                <PLAccountRow key={r.account.id} code={r.account.code} name={r.account.name} amount={r.balance} />
              ))}
              <PLTotalRow label="Total Revenue" amount={plData.totalRevenue} tone="income" />
            </PLSection>

            {plData.cogs.length > 0 && (
              <PLSection title="Cost of Goods Sold">
                {plData.cogs.map((r) => (
                  <PLAccountRow key={r.account.id} code={r.account.code} name={r.account.name} amount={r.balance} />
                ))}
                <PLTotalRow label="Gross Profit" amount={plData.grossProfit} tone={plData.grossProfit >= 0 ? 'income' : 'expense'} />
              </PLSection>
            )}

            {plData.expenses.length > 0 && (
              <PLSection title="Operating Expenses">
                {Object.entries(plData.expenseGroups).map(([group, rows]) => (
                  <div key={group} className="pl-group">
                    <div className="pl-group-label">{group}</div>
                    {rows.map((r) => (
                      <PLAccountRow key={r.account.id} code={r.account.code} name={r.account.name} amount={r.balance} indent />
                    ))}
                  </div>
                ))}
                <PLTotalRow label="Total Expenses" amount={plData.totalExpenses} tone="expense" />
              </PLSection>
            )}

            <div className="pl-net-row">
              <span>Net Profit / (Loss)</span>
              <strong className={plData.netProfit >= 0 ? 'income' : 'expense'}>{fmtMoney(plData.netProfit)}</strong>
            </div>
          </>
        )}
      </div>

      <CashFlowCard data={data} fromDate={fromDate} toDate={toDate} />

      {onDataChange ? (
        <BudgetVsActualCard data={data} period={period} byCat={pl.byCat} onDataChange={onDataChange} />
      ) : null}

      <div className="reports-grid">
        <div className="report-card">
          <h3>BAS Summary</h3>
          <div className="report-table">
            <ReportRow label="G1 Total sales" value={fmtMoney(bas.salesGross)} />
            <ReportRow label="GST-free sales" value={fmtMoney(bas.gstFreeIncome)} />
            <ReportRow label="1A GST collected" value={`+${fmt(bas.gstCollected)}`} tone="income" />
            <ReportRow label="G11 Purchases" value={fmtMoney(bas.purchasesGross)} />
            <ReportRow label="GST-free purchases" value={fmtMoney(bas.gstFreePurchases)} />
            <ReportRow label="1B GST paid" value={`-${fmt(bas.gstPaid)}`} tone="expense" />
          </div>
        </div>
        <div className="report-card">
          <h3>Balance Sheet</h3>
          <div className="report-table">
            <ReportRow label="Assets" value={fmtMoney(bs.assets)} tone="income" />
            <ReportRow label="Liabilities" value={fmtMoney(bs.liabilities)} tone="expense" />
            <ReportRow label="Invoices Receivable" value={fmtMoney(receivable)} />
            <ReportRow label="Bills Payable" value={fmtMoney(payable)} />
            <ReportRow label="Equity" value={fmtMoney(bs.net)} tone={bs.net >= 0 ? 'income' : 'expense'} />
          </div>
        </div>
        <div className="report-card">
          <h3>Spending by Category</h3>
          <div className="report-table">
            {expenseCats.length ? expenseCats.map(([catId, amount]) => {
              const cat = getCategory(data, catId);
              return <ReportRow key={catId} label={`${cat?.icon || ''} ${cat?.name || catId}`} value={fmtMoney(amount)} />;
            }) : <p className="muted">No spending data</p>}
          </div>
        </div>
        <div className="report-card wide-card">
          <h3>BAS Detail</h3>
          <div className="report-table">
            {[...bas.salesLines, ...bas.purchasesLines].length ? [...bas.salesLines, ...bas.purchasesLines].slice(0, 8).map((line) => (
              <ReportRow
                key={line.id}
                label={`${line.date} ${line.party || line.reference || 'Transaction'}`}
                value={`${line.gstAmount >= 0 ? '+' : '-'}${fmt(Math.abs(line.gstAmount))}`}
                tone={line.gstAmount >= 0 ? 'income' : 'expense'}
              />
            )) : <p className="muted">No BAS lines for this period</p>}
          </div>
        </div>
        {valuation.length > 0 ? (
          <div className="report-card wide-card">
            <h3>Inventory Valuation</h3>
            <div className="report-table">
              {valuation.map((row) => (
                <ReportRow
                  key={row.product.id}
                  label={`${row.product.name}${row.product.sku ? ' · ' + row.product.sku : ''} — ${row.quantity.toFixed(2)} ${row.product.unitOfMeasure || 'unit'} @ ${fmtMoney(row.avgCost)}`}
                  value={fmtMoney(row.totalValue)}
                />
              ))}
              <ReportRow label="Total stock value" value={fmtMoney(valuation.reduce((s, r) => s + r.totalValue, 0))} tone="income" />
            </div>
          </div>
        ) : null}
      </div>

      <AgeingReport data={data} />
    </section>
  );
}

// ─── Cash Flow Statement ──────────────────────────────────────────────────────

interface CashFlowLine { label: string; amount: number; }
interface CashFlowData {
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  netOperating: number;
  netInvesting: number;
  netFinancing: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
}

function classifyCashLine(chartAcc: ChartAccount): 'operating' | 'investing' | 'financing' | 'skip' {
  if (chartAcc.class === 'revenue' || chartAcc.class === 'expense') return 'operating';
  if (chartAcc.class === 'asset') {
    const name = chartAcc.name.toLowerCase();
    const group = (chartAcc.group || '').toLowerCase();
    if (group.includes('current') || name.includes('receivable') || name.includes('inventory') || name.includes('prepaid') || name.includes('gst')) return 'operating';
    return 'investing';
  }
  if (chartAcc.class === 'liability') {
    const name = chartAcc.name.toLowerCase();
    const group = (chartAcc.group || '').toLowerCase();
    if (group.includes('current') || name.includes('payable') || name.includes('gst') || name.includes('tax') || name.includes('accrued')) return 'operating';
    return 'financing';
  }
  if (chartAcc.class === 'equity') return 'financing';
  return 'skip';
}

function buildCashFlow(data: LedgerData, fromDate: string, toDate: string): CashFlowData {
  const cashChartIds = new Set(
    data.accounts
      .filter((a) => ['cash', 'bank', 'ewallet'].includes(a.type) && a.chartAccountId)
      .map((a) => a.chartAccountId)
  );
  const chartMap = Object.fromEntries(data.chartOfAccounts.map((a) => [a.id, a]));
  const entries = allJournalEntries(data);

  let openingCash = 0;
  const operatingMap: Record<string, number> = {};
  const investingMap: Record<string, number> = {};
  const financingMap: Record<string, number> = {};

  for (const entry of entries) {
    const entryDate = entry.date.slice(0, 10);
    const cashNet = entry.lines
      .filter((l) => cashChartIds.has(l.chartAccountId))
      .reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);

    if (Math.abs(cashNet) < 0.005) continue;

    if (entryDate < fromDate) { openingCash += cashNet; continue; }
    if (entryDate > toDate) continue;

    const nonCashLines = entry.lines.filter((l) => !cashChartIds.has(l.chartAccountId));
    if (nonCashLines.length === 0) continue;

    const totalMag = nonCashLines.reduce((s, l) => s + Math.abs((Number(l.debit) || 0) - (Number(l.credit) || 0)), 0);

    for (const line of nonCashLines) {
      const chartAcc = chartMap[line.chartAccountId];
      if (!chartAcc) continue;
      const mag = Math.abs((Number(line.debit) || 0) - (Number(line.credit) || 0));
      const contrib = totalMag > 0 ? cashNet * (mag / totalMag) : 0;
      const section = classifyCashLine(chartAcc);
      if (section === 'skip') continue;
      const label = chartAcc.name;
      if (section === 'operating') operatingMap[label] = (operatingMap[label] || 0) + contrib;
      else if (section === 'investing') investingMap[label] = (investingMap[label] || 0) + contrib;
      else financingMap[label] = (financingMap[label] || 0) + contrib;
    }
  }

  const toLines = (map: Record<string, number>): CashFlowLine[] =>
    Object.entries(map)
      .map(([label, amount]) => ({ label, amount }))
      .filter((r) => Math.abs(r.amount) > 0.005)
      .sort((a, b) => b.amount - a.amount);

  const operating = toLines(operatingMap);
  const investing = toLines(investingMap);
  const financing = toLines(financingMap);
  const netOperating = operating.reduce((s, r) => s + r.amount, 0);
  const netInvesting = investing.reduce((s, r) => s + r.amount, 0);
  const netFinancing = financing.reduce((s, r) => s + r.amount, 0);
  const netChange = netOperating + netInvesting + netFinancing;

  return { operating, investing, financing, netOperating, netInvesting, netFinancing, netChange, openingCash, closingCash: openingCash + netChange };
}

function CashFlowCard({ data, fromDate, toDate }: { data: LedgerData; fromDate: string; toDate: string }) {
  const cf = useMemo(() => buildCashFlow(data, fromDate, toDate), [data, fromDate, toDate]);
  const hasCash = data.accounts.some((a) => ['cash', 'bank', 'ewallet'].includes(a.type) && a.chartAccountId);
  if (!hasCash) return null;

  return (
    <div className="report-card wide-card pl-card">
      <div className="pl-header">
        <h3>Cash Flow Statement</h3>
        <span className="pl-period">{fromDate} – {toDate}</span>
      </div>

      <CashFlowSection title="Operating Activities" lines={cf.operating} netLabel="Net cash from operating" net={cf.netOperating} />
      <CashFlowSection title="Investing Activities" lines={cf.investing} netLabel="Net cash from investing" net={cf.netInvesting} />
      <CashFlowSection title="Financing Activities" lines={cf.financing} netLabel="Net cash from financing" net={cf.netFinancing} />

      <div className="cf-summary">
        <div className="cf-summary-row">
          <span>Net increase / (decrease) in cash</span>
          <strong className={cf.netChange >= 0 ? 'income' : 'expense'}>{cf.netChange >= 0 ? fmtMoney(cf.netChange) : `(${fmtMoney(-cf.netChange)})`}</strong>
        </div>
        <div className="cf-summary-row muted-row">
          <span>Opening cash balance</span>
          <span>{fmtMoney(cf.openingCash)}</span>
        </div>
        <div className="cf-summary-row">
          <span><strong>Closing cash balance</strong></span>
          <strong>{fmtMoney(cf.closingCash)}</strong>
        </div>
      </div>
    </div>
  );
}

function CashFlowSection({ title, lines, netLabel, net }: { title: string; lines: CashFlowLine[]; netLabel: string; net: number }) {
  if (lines.length === 0 && Math.abs(net) < 0.005) return null;
  return (
    <div className="pl-section">
      <div className="pl-section-title">{title}</div>
      {lines.map((line) => (
        <div key={line.label} className="pl-account-row">
          <span className="pl-name">{line.label}</span>
          <span className={`pl-amount ${line.amount < 0 ? 'expense' : ''}`}>
            {line.amount >= 0 ? fmtMoney(line.amount) : `(${fmtMoney(-line.amount)})`}
          </span>
        </div>
      ))}
      <div className="pl-total-row">
        <span>{netLabel}</span>
        <strong className={net >= 0 ? 'income' : 'expense'}>{net >= 0 ? fmtMoney(net) : `(${fmtMoney(-net)})`}</strong>
      </div>
    </div>
  );
}

// ─── Budget vs Actual ─────────────────────────────────────────────────────────

interface BudgetRow { cat: Category; budget: number; actual: number; }

function BudgetVsActualCard({ data, period, byCat, onDataChange }: {
  data: LedgerData;
  period: Period;
  byCat: Record<string, number>;
  onDataChange: (data: LedgerData) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const multiplier = PERIOD_MONTHS[period] ?? 1;

  const rows = useMemo((): BudgetRow[] => {
    const allCats = [...data.categories.expense];
    const seen = new Set<string>();
    const result: BudgetRow[] = [];

    for (const cat of allCats) {
      if (cat.archivedAt) continue;
      seen.add(cat.id);
      const budgetEntry = data.budgets.find((b) => b.categoryId === cat.id);
      const monthlyBudget = budgetEntry?.amount ?? 0;
      const actual = byCat[cat.id] ?? 0;
      if (monthlyBudget === 0 && actual === 0) continue;
      result.push({ cat, budget: monthlyBudget * multiplier, actual });
    }

    for (const [catId, actual] of Object.entries(byCat)) {
      if (seen.has(catId)) continue;
      const cat = getCategory(data, catId);
      if (!cat) continue;
      result.push({ cat, budget: 0, actual });
    }

    return result.sort((a, b) => b.actual - a.actual);
  }, [data, byCat, multiplier]);

  if (rows.length === 0) return null;

  function saveBudget(catId: string, val: string) {
    const amount = parseFloat(val) || 0;
    const existing = data.budgets.find((b) => b.categoryId === catId);
    let budgets: Budget[];
    if (existing) {
      budgets = data.budgets.map((b) => b.categoryId === catId ? { ...b, amount } : b);
    } else {
      budgets = [...data.budgets, { id: `bgt-${catId}`, categoryId: catId, amount }];
    }
    onDataChange({ ...data, budgets });
    setEditing(null);
  }

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  return (
    <div className="report-card wide-card budget-card">
      <div className="pl-header">
        <h3>Budget vs Actual</h3>
        <span className="pl-period">Click budget amount to edit · monthly amounts</span>
      </div>
      <div className="budget-table-wrap">
        <table className="budget-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Budget</th>
              <th className="num">Actual</th>
              <th className="num">Variance</th>
              <th className="budget-bar-col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cat, budget, actual }) => {
              const variance = budget - actual;
              const pct = budget > 0 ? Math.min(actual / budget, 1) : 0;
              const tone = budget === 0 ? 'neutral' : actual > budget ? 'over' : actual / budget > 0.8 ? 'warn' : 'ok';
              return (
                <tr key={cat.id}>
                  <td className="budget-cat-name">{cat.icon} {cat.name}</td>
                  <td className="num budget-editable">
                    {editing === cat.id ? (
                      <input
                        className="budget-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editVal}
                        autoFocus
                        onChange={(e) => setEditVal(e.target.value)}
                        onBlur={() => saveBudget(cat.id, editVal)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(cat.id, editVal); if (e.key === 'Escape') setEditing(null); }}
                      />
                    ) : (
                      <button className="budget-amount-btn" onClick={() => { setEditing(cat.id); setEditVal(budget > 0 ? String((budget / multiplier).toFixed(2)) : ''); }}>
                        {budget > 0 ? fmtMoney(budget) : <span className="muted">Set</span>}
                      </button>
                    )}
                  </td>
                  <td className="num">{fmtMoney(actual)}</td>
                  <td className={`num budget-variance ${tone}`}>{budget > 0 ? (variance >= 0 ? fmtMoney(variance) : `(${fmtMoney(-variance)})`) : '—'}</td>
                  <td className="budget-bar-col">
                    {budget > 0 ? (
                      <div className="budget-bar-track">
                        <div className={`budget-bar-fill ${tone}`} style={{ width: `${pct * 100}%` }} />
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="budget-totals">
              <td><strong>Total</strong></td>
              <td className="num"><strong>{totalBudget > 0 ? fmtMoney(totalBudget) : '—'}</strong></td>
              <td className="num"><strong>{fmtMoney(totalActual)}</strong></td>
              <td className={`num budget-variance ${totalBudget > 0 && totalActual > totalBudget ? 'over' : 'ok'}`}>
                <strong>{totalBudget > 0 ? (totalBudget - totalActual >= 0 ? fmtMoney(totalBudget - totalActual) : `(${fmtMoney(totalActual - totalBudget)})`) : '—'}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PLSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pl-section">
      <div className="pl-section-title">{title}</div>
      {children}
    </div>
  );
}

function PLAccountRow({ code, name, amount, indent }: { code: string; name: string; amount: number; indent?: boolean }) {
  return (
    <div className={`pl-account-row${indent ? ' pl-indent' : ''}`}>
      <span className="pl-code">{code}</span>
      <span className="pl-name">{name}</span>
      <span className="pl-amount">{fmtMoney(amount)}</span>
    </div>
  );
}

function PLTotalRow({ label, amount, tone }: { label: string; amount: number; tone?: 'income' | 'expense' }) {
  return (
    <div className="pl-total-row">
      <span>{label}</span>
      <strong className={tone}>{fmtMoney(amount)}</strong>
    </div>
  );
}

function ReportRow({ label, value, tone }: { label: string; value: string; tone?: 'income' | 'expense' }) {
  return (
    <div className="report-row">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

function basDatesForPeriod(period: Period) {
  const [start, end] = periodRange(period);
  const to = new Date(end);
  to.setDate(to.getDate() - 1);
  return [start.toISOString().slice(0, 10), to.toISOString().slice(0, 10)] as const;
}

// ─── Ageing Report ────────────────────────────────────────────────────────────

interface AgeingBuckets { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; }
interface AgeingRow { key: string; name: string; buckets: AgeingBuckets; total: number; }

function daysBetween(dateStr: string, today: string): number {
  return Math.floor((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000);
}

function bucket(days: number): keyof AgeingBuckets {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90plus';
}

function buildAgeing(data: LedgerData, type: 'income' | 'expense'): AgeingRow[] {
  const today = todayStr();
  const map: Record<string, AgeingRow> = {};

  for (const tx of data.transactions) {
    if (!isInvoice(tx) || tx.type !== type || tx.voidedAt) continue;
    const balance = txBalance(tx, data);
    if (balance < 0.005) continue;

    const due = tx.dueDate || tx.date;
    const days = daysBetween(due, today);
    const b = bucket(days);

    const key = tx.contactId || tx.party || 'Unknown';
    const name = contactName(data, tx.contactId, tx.party) || 'Unknown';
    if (!map[key]) map[key] = { key, name, buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }, total: 0 };
    map[key].buckets[b] += balance;
    map[key].total += balance;
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
}

function AgeingReport({ data }: { data: LedgerData }) {
  const ar = useMemo(() => buildAgeing(data, 'income'), [data]);
  const ap = useMemo(() => buildAgeing(data, 'expense'), [data]);
  if (ar.length === 0 && ap.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {ar.length > 0 && <AgeingTable title="Receivables Ageing" rows={ar} />}
      {ap.length > 0 && <AgeingTable title="Payables Ageing" rows={ap} />}
    </div>
  );
}

function AgeingTable({ title, rows }: { title: string; rows: AgeingRow[] }) {
  const totals: AgeingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const r of rows) {
    for (const k of Object.keys(totals) as (keyof AgeingBuckets)[]) totals[k] += r.buckets[k];
  }
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="report-card wide-card" style={{ marginBottom: 16 }}>
      <div className="pl-header">
        <h3>{title}</h3>
        <span className="pl-period">As of today</span>
      </div>
      <div className="ageing-table-wrap">
        <table className="ageing-table">
          <thead>
            <tr>
              <th>Customer / Supplier</th>
              <th className="num">Current</th>
              <th className="num">1–30 days</th>
              <th className="num">31–60 days</th>
              <th className="num">61–90 days</th>
              <th className="num aged">90+ days</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.name}</td>
                <td className="num">{r.buckets.current > 0 ? fmtMoney(r.buckets.current) : '—'}</td>
                <td className="num">{r.buckets.d1_30 > 0 ? fmtMoney(r.buckets.d1_30) : '—'}</td>
                <td className="num">{r.buckets.d31_60 > 0 ? <span className="age-warn">{fmtMoney(r.buckets.d31_60)}</span> : '—'}</td>
                <td className="num">{r.buckets.d61_90 > 0 ? <span className="age-alert">{fmtMoney(r.buckets.d61_90)}</span> : '—'}</td>
                <td className="num aged">{r.buckets.d90plus > 0 ? <span className="age-danger">{fmtMoney(r.buckets.d90plus)}</span> : '—'}</td>
                <td className="num"><strong>{fmtMoney(r.total)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ageing-totals">
              <td><strong>Total</strong></td>
              <td className="num"><strong>{fmtMoney(totals.current)}</strong></td>
              <td className="num"><strong>{fmtMoney(totals.d1_30)}</strong></td>
              <td className="num"><strong>{fmtMoney(totals.d31_60)}</strong></td>
              <td className="num"><strong>{fmtMoney(totals.d61_90)}</strong></td>
              <td className="num aged"><strong>{fmtMoney(totals.d90plus)}</strong></td>
              <td className="num"><strong>{fmtMoney(grandTotal)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
