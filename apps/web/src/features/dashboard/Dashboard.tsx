import { aggregate, fmtMoney, getAccount, getCategory, invoiceStatus, isInvoice, totalAssets, txBalance, txPaid, txTotal } from '../../domain/accounting';
import type { LedgerData, Transaction } from '../../domain/models';

interface DashboardProps {
  data: LedgerData;
  onEditTransaction: (tx: Transaction) => void;
  canEditTransactions?: boolean;
}

export function Dashboard({ data, onEditTransaction, canEditTransactions = true }: DashboardProps) {
  const assets = totalAssets(data);
  const month = aggregate(data, 'month');
  const today = aggregate(data, 'today');
  const recent = [...data.transactions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 6);

  return (
    <section className="view">
      <header className="large-header">
        <h1>Auctus</h1>
        <p>Trace, Track, Grow</p>
      </header>
      <div className="hero-card dashboard-summary">
        <span>NET WORTH</span>
        <strong>{fmtMoney(assets.net)}</strong>
        <div className="hero-grid">
          <div><small>Income</small><b>{fmtMoney(month.income)}</b></div>
          <div><small>Purchases</small><b>{fmtMoney(month.expense)}</b></div>
          <div><small>Net</small><b>{fmtMoney(month.balance)}</b></div>
        </div>
      </div>
      <div className="stats-grid dashboard-cards">
        <div className="stat-card"><span>Today's Spend</span><strong className="expense">{fmtMoney(today.expense)}</strong></div>
        <div className="stat-card"><span>Today's Income</span><strong className="income">{fmtMoney(today.income)}</strong></div>
      </div>
      <div className="section-header"><h3>Recent Transactions</h3></div>
      <TransactionList data={data} transactions={recent} onEditTransaction={onEditTransaction} canEditTransactions={canEditTransactions} />
    </section>
  );
}

export function TransactionList({ data, transactions, onEditTransaction, canEditTransactions = true }: DashboardProps & { transactions: Transaction[] }) {
  if (!transactions.length) {
    return <div className="empty-card">No transactions yet</div>;
  }
  return (
    <div className="list">
      {transactions.map((tx) => {
        const cat = getCategory(data, tx.categoryId);
        const account = getAccount(data, tx.accountId);
        const total = txTotal(tx, data);
        const status = invoiceStatus(tx, data);
        return (
          <button key={tx.id} className="list-row" onClick={canEditTransactions ? () => onEditTransaction(tx) : undefined}>
            <span className="icon" style={{ backgroundColor: cat?.color || '#8E8E93' }}>{tx.type === 'transfer' ? '↔️' : cat?.icon || '📄'}</span>
            <span className="row-body">
              <b>{tx.type === 'transfer' ? 'Transfer' : cat?.name || 'Other'}</b>
              <small>
                {isInvoice(tx) ? `${tx.party || 'Invoice'} · Due ${tx.dueDate || tx.date}` : `${account?.name || ''}${tx.note ? ` · ${tx.note}` : ''}`}
              </small>
            </span>
            <span className="row-right">
              <b className={tx.type}>{tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{fmtMoney(total).replace('$', '')}</b>
              {isInvoice(tx) ? <small className={status.tone}>Paid ${txPaid(tx).toFixed(2)} · Bal ${txBalance(tx, data).toFixed(2)}</small> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
