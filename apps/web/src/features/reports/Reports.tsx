import { aggregate, basReport, fmt, fmtMoney, getCategory, inventoryValuation, isInvoice, periodRange, totalAssets, txBalance } from '../../domain/accounting';
import type { LedgerData, Period } from '../../domain/models';

interface ReportsProps {
  data: LedgerData;
  period: Period;
  onPeriodChange: (period: Period) => void;
}

const periods: Period[] = ['week', 'month', 'quarter', 'year'];

export function Reports({ data, period, onPeriodChange }: ReportsProps) {
  const [fromDate, toDate] = basDatesForPeriod(period);
  const bas = basReport(data, fromDate, toDate);
  const pl = aggregate(data, period);
  const bs = totalAssets(data);
  const receivable = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'income').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const payable = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'expense').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const expenseCats = Object.entries(pl.byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const valuation = (data.products || []).length > 0 ? inventoryValuation(data) : [];

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
          <h3>Profit & Loss</h3>
          <div className="report-table">
            <ReportRow label="Income" value={`+${fmt(pl.income)}`} tone="income" />
            <ReportRow label="Purchases" value={`-${fmt(pl.expense)}`} tone="expense" />
            <ReportRow label="Net Profit / Loss" value={fmtMoney(pl.balance)} tone={pl.balance >= 0 ? 'income' : 'expense'} />
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
                  label={`${row.product.name}${row.product.sku ? ` · ${row.product.sku}` : ''} — ${row.quantity.toFixed(2)} ${row.product.unitOfMeasure || 'unit'} @ ${fmtMoney(row.avgCost)}`}
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
