import { fmtMoney, getCategory, invoiceStatus, isInvoice, txBalance, txPaid } from '../../domain/accounting';
import type { LedgerData, Transaction } from '../../domain/models';
import { TransactionList } from '../dashboard/Dashboard';

interface ActivityProps {
  data: LedgerData;
  onEditTransaction: (tx: Transaction) => void;
  onRecordPayment: (tx: Transaction) => void;
  canWrite?: boolean;
}

export function Activity({ data, onEditTransaction, onRecordPayment, canWrite = true }: ActivityProps) {
  const outstanding = data.transactions
    .filter((tx) => isInvoice(tx) && txBalance(tx, data) > 0)
    .sort((a, b) => ((a.dueDate || a.date) + a.id).localeCompare((b.dueDate || b.date) + b.id));
  const receivable = outstanding.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const payable = outstanding.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + txBalance(tx, data), 0);

  return (
    <section className="view">
      <header className="large-header">
        <h1>Activity</h1>
        <p>{data.transactions.length} entries</p>
      </header>
      <div className="section-header"><h3>Outstanding</h3></div>
      <div className="stats-grid">
        <div className="stat-card"><span>To Receive</span><strong className="income">{fmtMoney(receivable)}</strong></div>
        <div className="stat-card"><span>To Pay</span><strong className="expense">{fmtMoney(payable)}</strong></div>
      </div>
      <div className="list compact">
        {outstanding.length ? outstanding.map((tx) => {
          const cat = getCategory(data, tx.categoryId);
          const status = invoiceStatus(tx, data);
          return (
            <div key={tx.id} className="list-row">
              <span className="icon" style={{ backgroundColor: cat?.color || '#8E8E93' }}>{cat?.icon || '📄'}</span>
              <span className="row-body">
                <b>{tx.party || (tx.type === 'income' ? 'Customer' : 'Supplier')}</b>
                <small className={status.tone}>{status.label} · Due {tx.dueDate || tx.date} · Paid ${txPaid(tx).toFixed(2)}</small>
              </span>
              <span className="row-actions">
                <b>{fmtMoney(txBalance(tx, data))}</b>
                {canWrite ? (
                  <button className={tx.type === 'income' ? 'success' : 'primary'} onClick={() => onRecordPayment(tx)}>
                    {tx.type === 'income' ? 'Receive' : 'Pay'}
                  </button>
                ) : null}
              </span>
            </div>
          );
        }) : <div className="empty-card flat">No outstanding invoices</div>}
      </div>
      <div className="section-header"><h3>All Transactions</h3></div>
      {!data.transactions.length ? (
        <div className="empty-helper">
          Activity will list every sale, purchase, transfer, invoice, bill, payment and credit note after the first transaction is saved.
        </div>
      ) : null}
      <TransactionList data={data} transactions={[...data.transactions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))} onEditTransaction={onEditTransaction} canEditTransactions={canWrite} />
    </section>
  );
}
