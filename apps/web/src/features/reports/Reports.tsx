import { useMemo } from 'react';
import { aggregate, basReport, fmt, fmtMoney, getCategory, inventoryValuation, isInvoice, journalEntriesInRange, periodRange, totalAssets, txBalance } from '../../domain/accounting';
import type { ChartAccount, LedgerData, Period } from '../../domain/models';

interface ReportsProps {
  data: LedgerData;
  period: Period;
  onPeriodChange: (period: Period) => void;
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

export function Reports({ data, period, onPeriodChange }: ReportsProps) {
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
    </section>
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
