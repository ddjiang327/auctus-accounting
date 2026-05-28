import { useMemo } from 'react';
import { aggregate, fmtMoney, getAccount, getCategory, inventoryValuation, invoiceStatus, isInvoice, todayStr, totalAssets, txBalance, txPaid, txTotal } from '../../domain/accounting';
import type { LedgerData, Transaction } from '../../domain/models';

interface DashboardProps {
  data: LedgerData;
  onEditTransaction: (tx: Transaction) => void;
  canEditTransactions?: boolean;
  onCreateTransaction?: () => void;
  onOpenContacts?: () => void;
  onOpenSettings?: () => void;
  onOpenDocuments?: () => void;
  onOpenInventory?: () => void;
}

export function Dashboard({ data, onEditTransaction, canEditTransactions = true, onCreateTransaction, onOpenContacts, onOpenSettings, onOpenDocuments, onOpenInventory }: DashboardProps) {
  const assets = totalAssets(data);
  const month = aggregate(data, 'month');
  const today = aggregate(data, 'today');
  const recent = [...data.transactions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 6);
  const isEmptyWorkspace = data.transactions.length === 0 && data.contacts.filter((c) => !c.archivedAt).length === 0;
  const now = todayStr();

  const sevenDaysLater = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const { receivable, overdueAmt, overdueCount, overdueInvoices, payable, dueSoonAmt, dueSoonCount } = useMemo(() => {
    const invoices = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'income' && !tx.voidedAt);
    const bills = data.transactions.filter((tx) => isInvoice(tx) && tx.type === 'expense' && !tx.voidedAt);

    const receivable = invoices.reduce((s, tx) => s + txBalance(tx, data), 0);

    const overdue = invoices.filter((tx) => txBalance(tx, data) > 0.005 && (tx.dueDate || tx.date) < now);
    const overdueAmt = overdue.reduce((s, tx) => s + txBalance(tx, data), 0);
    const overdueInvoices = overdue
      .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))
      .slice(0, 3);

    const payable = bills.reduce((s, tx) => s + txBalance(tx, data), 0);

    const dueSoon = bills.filter((tx) => {
      const due = tx.dueDate || tx.date;
      return txBalance(tx, data) > 0.005 && due >= now && due <= sevenDaysLater;
    });
    const dueSoonAmt = dueSoon.reduce((s, tx) => s + txBalance(tx, data), 0);

    return { receivable, overdueAmt, overdueCount: overdue.length, overdueInvoices, payable, dueSoonAmt, dueSoonCount: dueSoon.length };
  }, [data, now, sevenDaysLater]);

  const lowStockCount = useMemo(() => {
    if (!(data.products || []).some((p) => !p.archivedAt && p.reorderPoint != null)) return 0;
    return inventoryValuation(data).filter((r) => r.product.reorderPoint != null && r.quantity <= r.product.reorderPoint!).length;
  }, [data]);

  const hasAlerts = receivable > 0 || payable > 0 || lowStockCount > 0;

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

      {hasAlerts && (
        <div className="dash-alerts-section">
          <div className="section-header"><h3>At a Glance</h3></div>
          <div className="dash-alerts-grid">
            {receivable > 0 && (
              <button className="dash-alert-card" onClick={onOpenDocuments}>
                <span className="dash-alert-label">Invoices Receivable</span>
                <span className="dash-alert-value">{fmtMoney(receivable)}</span>
                {overdueAmt > 0 && (
                  <span className="dash-alert-sub overdue">{overdueCount} overdue · {fmtMoney(overdueAmt)}</span>
                )}
              </button>
            )}
            {payable > 0 && (
              <button className="dash-alert-card" onClick={onOpenDocuments}>
                <span className="dash-alert-label">Bills Payable</span>
                <span className="dash-alert-value">{fmtMoney(payable)}</span>
                {dueSoonCount > 0 && (
                  <span className="dash-alert-sub warning">{dueSoonCount} due within 7 days · {fmtMoney(dueSoonAmt)}</span>
                )}
              </button>
            )}
            {lowStockCount > 0 && (
              <button className="dash-alert-card" onClick={onOpenInventory}>
                <span className="dash-alert-label">Low Stock</span>
                <span className="dash-alert-value">{lowStockCount} product{lowStockCount > 1 ? 's' : ''}</span>
                <span className="dash-alert-sub warning">Below reorder point</span>
              </button>
            )}
          </div>

          {overdueInvoices.length > 0 && (
            <div className="dash-overdue-list">
              <div className="dash-overdue-title">Overdue Invoices</div>
              {overdueInvoices.map((tx) => (
                <button key={tx.id} className="dash-overdue-row" onClick={canEditTransactions ? () => onEditTransaction(tx) : onOpenDocuments}>
                  <span className="dash-overdue-party">{tx.party || 'Invoice'}</span>
                  <span className="dash-overdue-due">Due {tx.dueDate || tx.date}</span>
                  <span className="dash-overdue-bal overdue">{fmtMoney(txBalance(tx, data))}</span>
                </button>
              ))}
              {overdueCount > 3 && onOpenDocuments && (
                <button className="btn-link" style={{ fontSize: 12, marginTop: 4 }} onClick={onOpenDocuments}>
                  View all {overdueCount} overdue →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isEmptyWorkspace && canEditTransactions ? (
        <div className="onboarding-panel">
          <div>
            <span>Start here</span>
            <h3>Set up the first entries for this workspace</h3>
            <p>Add a customer or supplier, review categories, then record the first sale or purchase.</p>
          </div>
          <div className="onboarding-actions">
            {onCreateTransaction ? <button className="primary" onClick={onCreateTransaction}>Add Transaction</button> : null}
            {onOpenContacts ? <button className="primary secondary-action" onClick={onOpenContacts}>People List</button> : null}
            {onOpenSettings ? <button className="primary secondary-action" onClick={onOpenSettings}>Review Setup</button> : null}
          </div>
        </div>
      ) : null}

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
                {isInvoice(tx) ? `${tx.party || 'Invoice'} · Due ${tx.dueDate || tx.date}` : `${account?.name || ''}${tx.note ? ' · ' + tx.note : ''}`}
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
