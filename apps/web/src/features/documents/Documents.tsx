import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { contactName, creditNoteAllocated, creditNoteBalance, fmtMoney, getAccount, getCategory, invoiceStatus, isCreditNote, isInvoice, todayStr, txBalance, txGst, txPaid, txTotal } from '../../domain/accounting';
import type { CreditAllocation, LedgerData, Transaction } from '../../domain/models';

type DocumentTab = 'invoices' | 'bills';
type DocumentMode = 'combined' | 'sales' | 'purchases';
type DocumentFilter = 'all' | 'outstanding' | 'overdue' | 'paid';

interface DocumentsProps {
  mode?: DocumentMode;
  data: LedgerData;
  onCreateDocument: (kind: DocumentTab) => void;
  onCreateCreditNote: (kind: DocumentTab) => void;
  onEditTransaction: (tx: Transaction) => void;
  onRecordPayment: (tx: Transaction) => void;
  onApplyCredit: (allocations: Array<Omit<CreditAllocation, 'id'>>) => boolean;
  canWrite?: boolean;
}

export function Documents({ mode = 'combined', data, onCreateDocument, onCreateCreditNote, onEditTransaction, onRecordPayment, onApplyCredit, canWrite = true }: DocumentsProps) {
  const fixedTab: DocumentTab | null = mode === 'sales' ? 'invoices' : mode === 'purchases' ? 'bills' : null;
  const [activeTab, setActiveTab] = useState<DocumentTab>('invoices');
  const [filter, setFilter] = useState<DocumentFilter>('outstanding');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applyingCredit, setApplyingCredit] = useState<Transaction | null>(null);
  const tab = fixedTab || activeTab;
  const type = tab === 'invoices' ? 'income' : 'expense';
  const title = tab === 'invoices' ? 'Invoices' : 'Bills';
  const pageTitle = mode === 'sales' ? 'Sales' : mode === 'purchases' ? 'Purchases' : 'Invoices / Bills';

  const documents = useMemo(() => data.transactions
    .filter((tx) => isInvoice(tx) && tx.type === type)
    .sort((a, b) => ((b.date + b.id).localeCompare(a.date + a.id))), [data.transactions, type]);
  const creditNotes = useMemo(() => data.transactions
    .filter((tx) => isCreditNote(tx) && tx.type === type)
    .sort((a, b) => ((b.date + b.id).localeCompare(a.date + a.id))), [data.transactions, type]);

  const filtered = documents.filter((tx) => {
    const balance = txBalance(tx, data);
    const dueDate = tx.dueDate || tx.date;
    if (filter === 'outstanding') return balance > 0.005;
    if (filter === 'overdue') return balance > 0.005 && dueDate < todayStr();
    if (filter === 'paid') return balance <= 0.005;
    return true;
  });

  const outstanding = documents.reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const overdue = documents.reduce((sum, tx) => {
    const balance = txBalance(tx, data);
    return balance > 0.005 && (tx.dueDate || tx.date) < todayStr() ? sum + balance : sum;
  }, 0);
  const paid = documents.reduce((sum, tx) => sum + txPaid(tx), 0);
  const selected = selectedId ? data.transactions.find((tx) => tx.id === selectedId && isInvoice(tx)) : null;
  const pageSubtitle = mode === 'sales'
    ? `${documents.length} invoices and customer credits`
    : mode === 'purchases'
      ? `${documents.length} bills and supplier credits`
      : `${documents.length} ${title.toLowerCase()} tracked`;

  if (selected) {
    return (
      <DocumentDetail
        data={data}
        tx={selected}
        onBack={() => setSelectedId(null)}
        onEditTransaction={onEditTransaction}
        onRecordPayment={onRecordPayment}
        canWrite={canWrite}
      />
    );
  }

  return (
    <section className="view">
      <header className="large-header split-header">
        <div>
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>
        {canWrite ? (
          <div className="detail-actions">
            <button className="primary secondary-action" onClick={() => onCreateCreditNote(tab)}>
              {tab === 'invoices' ? 'New Credit Note' : 'New Supplier Credit'}
            </button>
            <button className={tab === 'invoices' ? 'primary success' : 'primary'} onClick={() => onCreateDocument(tab)}>
              {tab === 'invoices' ? 'New Invoice' : 'New Bill'}
            </button>
          </div>
        ) : null}
      </header>

      <div className="toolbar-row">
        {mode === 'combined' ? (
          <div className="seg-control compact-control">
            <button className={tab === 'invoices' ? 'active' : ''} onClick={() => {
              setActiveTab('invoices');
              setFilter('outstanding');
              setSelectedId(null);
            }}>Invoices</button>
            <button className={tab === 'bills' ? 'active' : ''} onClick={() => {
              setActiveTab('bills');
              setFilter('outstanding');
              setSelectedId(null);
            }}>Bills</button>
          </div>
        ) : <span />}
        <div className="seg-control compact-control document-filter">
          {(['outstanding', 'overdue', 'paid', 'all'] as DocumentFilter[]).map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
              {filterLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-grid three">
        <div className="stat-card"><span>Outstanding</span><strong className={type}>{fmtMoney(outstanding)}</strong></div>
        <div className="stat-card"><span>Overdue</span><strong className="overdue">{fmtMoney(overdue)}</strong></div>
        <div className="stat-card"><span>Paid</span><strong>{fmtMoney(paid)}</strong></div>
      </div>

      <div className="section-header">
        <h3>{filterLabel(filter)} {title}</h3>
        {canWrite ? <button className="small-action" onClick={() => onCreateDocument(tab)}>{tab === 'invoices' ? 'Create Invoice' : 'Enter Bill'}</button> : null}
      </div>

      <div className="list compact">
        {filtered.length ? filtered.map((tx) => (
          <DocumentRow
            key={tx.id}
            data={data}
            tx={tx}
            onOpenDetail={setSelectedId}
            onEditTransaction={onEditTransaction}
            onRecordPayment={onRecordPayment}
            canWrite={canWrite}
          />
        )) : <div className="empty-card flat">No {filter === 'all' ? title.toLowerCase() : `${filterLabel(filter).toLowerCase()} ${title.toLowerCase()}`}</div>}
      </div>

      <div className="section-header">
        <h3>{tab === 'invoices' ? 'Credit Notes' : 'Supplier Credits'}</h3>
        {canWrite ? <button className="small-action" onClick={() => onCreateCreditNote(tab)}>{tab === 'invoices' ? 'Create Credit Note' : 'Enter Supplier Credit'}</button> : null}
      </div>
      <div className="list compact">
        {creditNotes.length ? creditNotes.map((tx) => (
          <CreditNoteRow
            key={tx.id}
            data={data}
            tx={tx}
            onEditTransaction={onEditTransaction}
            onApplyCredit={setApplyingCredit}
            canWrite={canWrite}
          />
        )) : <div className="empty-card flat">No {tab === 'invoices' ? 'credit notes' : 'supplier credits'}</div>}
      </div>

      {canWrite ? (
        <CreditApplicationModal
          open={!!applyingCredit}
          data={data}
          type={type}
          creditNote={applyingCredit}
          onClose={() => setApplyingCredit(null)}
          onSave={(allocations) => {
            if (onApplyCredit(allocations)) setApplyingCredit(null);
          }}
        />
      ) : null}
    </section>
  );
}

function DocumentRow({ data, tx, onOpenDetail, onEditTransaction, onRecordPayment, canWrite = true }: {
  data: LedgerData;
  tx: Transaction;
  onOpenDetail: (id: string) => void;
  onEditTransaction: (tx: Transaction) => void;
  onRecordPayment: (tx: Transaction) => void;
  canWrite?: boolean;
}) {
  const category = getCategory(data, tx.categoryId);
  const status = invoiceStatus(tx, data);
  const balance = txBalance(tx, data);
  const party = contactName(data, tx.contactId, tx.party) || (tx.type === 'income' ? 'Customer' : 'Supplier');
  const actionLabel = tx.type === 'income' ? 'Receive' : 'Pay';

  return (
    <div className="list-row document-row">
      <button className="icon" style={{ backgroundColor: category?.color || '#8E8E93' }} onClick={() => onOpenDetail(tx.id)}>
        {tx.type === 'income' ? 'INV' : 'BIL'}
      </button>
      <button className="row-body document-main" onClick={() => onOpenDetail(tx.id)}>
        <b>{tx.invoiceNo || (tx.type === 'income' ? 'Invoice' : 'Bill')} · {party}</b>
        <small>{category?.name || 'Uncategorised'} · Issued {tx.date} · Due {tx.dueDate || tx.date}</small>
      </button>
      <div className="document-status">
        <span className={`status-pill ${status.tone}`}>{status.label}</span>
        <small>Total {fmtMoney(txTotal(tx, data))}</small>
      </div>
      <div className="row-right wide">
        <b>{fmtMoney(balance)}</b>
        <small>Paid {fmtMoney(txPaid(tx))}</small>
      </div>
      <div className="row-actions">
        {canWrite ? <button onClick={() => onEditTransaction(tx)}>Edit</button> : null}
        {canWrite && balance > 0.005 ? <button className={tx.type === 'income' ? 'success' : 'primary'} onClick={() => onRecordPayment(tx)}>{actionLabel}</button> : null}
      </div>
    </div>
  );
}

function CreditNoteRow({ data, tx, onEditTransaction, onApplyCredit, canWrite = true }: {
  data: LedgerData;
  tx: Transaction;
  onEditTransaction: (tx: Transaction) => void;
  onApplyCredit: (tx: Transaction) => void;
  canWrite?: boolean;
}) {
  const category = getCategory(data, tx.categoryId);
  const party = contactName(data, tx.contactId, tx.party) || (tx.type === 'income' ? 'Customer' : 'Supplier');
  const total = txTotal(tx, data);
  const allocated = creditNoteAllocated(data, tx.id);
  const remaining = creditNoteBalance(tx, data);
  return (
    <div className="list-row document-row">
      <button className="icon orange" onClick={canWrite ? () => onEditTransaction(tx) : undefined}>{tx.type === 'income' ? 'CN' : 'SC'}</button>
      <button className="row-body document-main" onClick={canWrite ? () => onEditTransaction(tx) : undefined}>
        <b>{tx.creditNoteNo || (tx.type === 'income' ? 'Credit Note' : 'Supplier Credit')} · {party}</b>
        <small>{category?.name || 'Uncategorised'} · Issued {tx.date}</small>
      </button>
      <div className="document-status">
        <span className={`status-pill ${remaining > 0.005 ? 'due' : 'paid'}`}>{remaining > 0.005 ? 'Open' : 'Applied'}</span>
        <small>Total {fmtMoney(total)}</small>
      </div>
      <div className="row-right wide">
        <b>{fmtMoney(remaining)}</b>
        <small>Allocated {fmtMoney(allocated)}</small>
      </div>
      <div className="row-actions">
        {canWrite ? <button onClick={() => onEditTransaction(tx)}>Edit</button> : null}
        {canWrite && remaining > 0.005 ? <button className="success" onClick={() => onApplyCredit(tx)}>Apply</button> : null}
      </div>
    </div>
  );
}

function buildEmailDraft(data: LedgerData, tx: Transaction): { subject: string; body: string; email: string } {
  const business = data.settings.businessProfile;
  const contact = data.contacts.find((c) => c.id === tx.contactId);
  const docNo = tx.invoiceNo || 'Invoice';
  const due = tx.dueDate || tx.date;
  const total = txTotal(tx, data);
  const balance = txBalance(tx, data);
  const recipientName = contactName(data, tx.contactId, tx.party) || 'Customer';

  const subject = `${docNo} from ${business.name || 'Us'} – Due ${due}`;

  const lines = [
    `Dear ${recipientName},`,
    '',
    `Please find attached ${docNo} for ${fmtMoney(total)}.`,
    `Amount due: ${fmtMoney(balance)}`,
    `Due date: ${due}`,
    '',
  ];
  if (business.paymentInstructions) {
    lines.push('Payment instructions:');
    lines.push(business.paymentInstructions);
    lines.push('');
  }
  lines.push("If you have any questions, please don't hesitate to contact us.");
  lines.push('');
  lines.push('Kind regards,');
  lines.push(business.name || '');
  if (business.email) lines.push(business.email);
  if (business.phone) lines.push(business.phone);

  return { subject, body: lines.join('\n'), email: contact?.email || '' };
}

function DocumentDetail({ data, tx, onBack, onEditTransaction, onRecordPayment, canWrite = true }: {
  data: LedgerData;
  tx: Transaction;
  onBack: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onRecordPayment: (tx: Transaction) => void;
  canWrite?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const status = invoiceStatus(tx, data);
  const category = getCategory(data, tx.categoryId);
  const party = contactName(data, tx.contactId, tx.party) || (tx.type === 'income' ? 'Customer' : 'Supplier');
  const total = txTotal(tx, data);
  const gst = txGst(tx, data);
  const paid = txPaid(tx);
  const balance = txBalance(tx, data);
  const net = total - gst;
  const payments = (tx.payments || []).filter((payment) => !payment.voidedAt);
  const documentLabel = tx.type === 'income' ? 'Invoice' : 'Bill';
  const actionLabel = tx.type === 'income' ? 'Receive Payment' : 'Pay Bill';

  if (previewOpen) {
    return (
      <section className="view document-preview-view">
        <div className="preview-toolbar no-print">
          <button className="text-button back-button" onClick={() => setPreviewOpen(false)}>Back to detail</button>
          <div className="detail-actions">
            <button className="primary" onClick={() => window.print()}>Print / Save PDF</button>
          </div>
        </div>
        <InvoicePreview data={data} tx={tx} />
      </section>
    );
  }

  return (
    <section className="view document-detail-view">
      <button className="text-button back-button" onClick={onBack}>Back to list</button>
      <header className="document-detail-hero">
        <div>
          <span className="top-kicker">{documentLabel}</span>
          <h1>{tx.invoiceNo || documentLabel}</h1>
          <p>{party}</p>
        </div>
        <div className="detail-actions">
          <span className={`status-pill ${status.tone}`}>{status.label}</span>
          <button className="primary secondary-action" onClick={() => setPreviewOpen(true)}>Preview / PDF</button>
          {tx.type === 'income' ? (
            <button className="primary secondary-action" onClick={() => {
              const { subject, body, email } = buildEmailDraft(data, tx);
              if (email) {
                window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
              } else {
                navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 2000);
              }
            }}>{emailCopied ? 'Copied!' : '✉ Email'}</button>
          ) : null}
          {canWrite ? <button className="primary" onClick={() => onEditTransaction(tx)}>Edit</button> : null}
          {canWrite && balance > 0.005 ? <button className={tx.type === 'income' ? 'primary success' : 'primary'} onClick={() => onRecordPayment(tx)}>{actionLabel}</button> : null}
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-panel balance-panel">
          <span>Balance Due</span>
          <strong className={balance > 0.005 ? status.tone : 'paid'}>{fmtMoney(balance)}</strong>
          <div className="detail-metrics">
            <div><small>Total</small><b>{fmtMoney(total)}</b></div>
            <div><small>Paid</small><b>{fmtMoney(paid)}</b></div>
            <div><small>GST</small><b>{fmtMoney(gst)}</b></div>
          </div>
        </div>

        <div className="detail-panel">
          <h3>Document Details</h3>
          <div className="detail-table">
            <DetailRow label="Contact" value={party} />
            <DetailRow label="Category" value={category?.name || 'Uncategorised'} />
            <DetailRow label="Issued" value={tx.date} />
            <DetailRow label="Due" value={tx.dueDate || tx.date} />
            <DetailRow label="Terms" value={tx.paymentTerms || 'due_on_receipt'} />
            <DetailRow label="Status" value={status.label} tone={status.tone} />
          </div>
        </div>

        <div className="detail-panel">
          <h3>GST Summary</h3>
          <div className="detail-table">
            <DetailRow label="Net amount" value={fmtMoney(net)} />
            <DetailRow label="GST" value={fmtMoney(gst)} />
            <DetailRow label="Gross total" value={fmtMoney(total)} />
          </div>
        </div>

        <div className="detail-panel wide-card">
          <h3>Payment History</h3>
          <div className="detail-table">
            {payments.length ? payments.map((payment) => {
              const account = getAccount(data, payment.accountId);
              return (
                <DetailRow
                  key={payment.id}
                  label={`${payment.date} · ${account?.name || 'Account'}`}
                  value={fmtMoney(payment.amount)}
                />
              );
            }) : <p className="muted detail-empty">No payments recorded</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function InvoicePreview({ data, tx }: { data: LedgerData; tx: Transaction }) {
  const profile = data.settings.businessProfile;
  const category = getCategory(data, tx.categoryId);
  const party = contactName(data, tx.contactId, tx.party) || (tx.type === 'income' ? 'Customer' : 'Supplier');
  const contact = data.contacts.find((item) => item.id === tx.contactId);
  const total = txTotal(tx, data);
  const gst = txGst(tx, data);
  const net = total - gst;
  const paid = txPaid(tx);
  const balance = txBalance(tx, data);
  const documentLabel = tx.type === 'income' ? 'Tax Invoice' : 'Bill';
  const recipientLabel = tx.type === 'income' ? 'Bill To' : 'Supplier';

  return (
    <article className="invoice-preview print-area">
      <header className="invoice-preview-header">
        <div className="invoice-brand">
          <span className="invoice-logo">{profile.logoText || profile.name.slice(0, 1) || 'A'}</span>
          <div>
            <b>{profile.name || 'Auctus'}</b>
            {profile.abn ? <small>ABN {profile.abn}</small> : null}
          </div>
        </div>
        <div className="invoice-title">
          <h1>{documentLabel}</h1>
          <b>{tx.invoiceNo || (tx.type === 'income' ? 'Invoice' : 'Bill')}</b>
        </div>
      </header>

      <section className="invoice-address-grid">
        <div>
          <span>{recipientLabel}</span>
          <b>{party}</b>
          {contact?.abn ? <small>ABN {contact.abn}</small> : null}
          {contact?.email ? <small>{contact.email}</small> : null}
          {contact?.address ? <small>{contact.address}</small> : null}
        </div>
        <div>
          <span>From</span>
          <b>{profile.name || 'Auctus'}</b>
          {profile.email ? <small>{profile.email}</small> : null}
          {profile.phone ? <small>{profile.phone}</small> : null}
          {profile.address ? <small>{profile.address}</small> : null}
        </div>
        <div className="invoice-dates">
          <DetailRow label="Issued" value={tx.date} />
          <DetailRow label="Due" value={tx.dueDate || tx.date} />
          <DetailRow label="Terms" value={tx.paymentTerms || 'due_on_receipt'} />
        </div>
      </section>

      <section className="invoice-line-table">
        <div className="invoice-line-head">
          <span>Description</span>
          <span>Net</span>
          <span>GST</span>
          <span>Total</span>
        </div>
        <div className="invoice-line-row">
          <span>{category?.name || tx.note || 'Services'}</span>
          <span>{fmtMoney(net)}</span>
          <span>{fmtMoney(gst)}</span>
          <span>{fmtMoney(total)}</span>
        </div>
      </section>

      <section className="invoice-total-box">
        <DetailRow label="Subtotal" value={fmtMoney(net)} />
        <DetailRow label="GST" value={fmtMoney(gst)} />
        <DetailRow label="Total" value={fmtMoney(total)} />
        <DetailRow label="Paid" value={fmtMoney(paid)} />
        <div className="invoice-balance-row">
          <span>Balance Due</span>
          <b>{fmtMoney(balance)}</b>
        </div>
      </section>

      {tx.type === 'income' && profile.paymentInstructions ? (
        <section className="invoice-note">
          <b>Payment Instructions</b>
          <p>{profile.paymentInstructions}</p>
        </section>
      ) : null}

      {profile.invoiceFooter ? <footer className="invoice-footer">{profile.invoiceFooter}</footer> : null}
    </article>
  );
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

function CreditApplicationModal({ open, data, type, creditNote, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  type: 'income' | 'expense';
  creditNote: Transaction | null;
  onClose: () => void;
  onSave: (allocations: Array<Omit<CreditAllocation, 'id'>>) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  if (!creditNote) return null;
  const cn = creditNote;
  const remaining = creditNoteBalance(cn, data);
  const openInvoices = data.transactions
    .filter((tx) => isInvoice(tx) && tx.type === type && txBalance(tx, data) > 0.005)
    .filter((tx) => !cn.contactId || !tx.contactId || tx.contactId === cn.contactId)
    .sort((a, b) => ((a.dueDate || a.date) + a.id).localeCompare((b.dueDate || b.date) + b.id));
  const entered = Object.values(amounts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const docNo = cn.creditNoteNo || (type === 'income' ? 'Credit Note' : 'Supplier Credit');

  function updateAmount(invoiceId: string, value: string) {
    setAmounts((current) => ({ ...current, [invoiceId]: value }));
  }

  function submit() {
    const allocations = openInvoices.flatMap((tx) => {
      const amount = Number(amounts[tx.id]) || 0;
      if (amount <= 0) return [];
      return [{ creditNoteId: cn.id, invoiceId: tx.id, amount: +amount.toFixed(2), date: date || todayStr() }];
    });
    if (!allocations.length) return;
    onSave(allocations);
    setAmounts({});
  }

  return (
    <Modal
      open={open}
      title={`Apply ${docNo}`}
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit}>Apply Credit</button>}
    >
      <div className="form-card">
        <label>Date <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Available <span className="setting-value">{fmtMoney(remaining)}</span></label>
        <label>Entered <span className={entered > remaining + 0.005 ? 'setting-value expense' : 'setting-value'}>{fmtMoney(entered)}</span></label>
      </div>
      <div className="list modal-list">
        {openInvoices.length ? openInvoices.map((tx) => {
          const balance = txBalance(tx, data);
          const party = contactName(data, tx.contactId, tx.party) || (type === 'income' ? 'Customer' : 'Supplier');
          return (
            <div key={tx.id} className="list-row allocation-row">
              <span className="row-body">
                <b>{tx.invoiceNo || (type === 'income' ? 'Invoice' : 'Bill')} · {party}</b>
                <small>Due {tx.dueDate || tx.date} · Outstanding {fmtMoney(balance)}</small>
              </span>
              <input
                className="allocation-input"
                type="number"
                min={0}
                max={Math.min(balance, remaining)}
                step={0.01}
                value={amounts[tx.id] || ''}
                onChange={(event) => updateAmount(tx.id, event.target.value)}
                placeholder="0.00"
              />
            </div>
          );
        }) : <div className="empty-card flat">No open {type === 'income' ? 'invoices' : 'bills'} to apply this credit to</div>}
      </div>
    </Modal>
  );
}

function filterLabel(filter: DocumentFilter) {
  if (filter === 'outstanding') return 'Outstanding';
  if (filter === 'overdue') return 'Overdue';
  if (filter === 'paid') return 'Paid';
  return 'All';
}
