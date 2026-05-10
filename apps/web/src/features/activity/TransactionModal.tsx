import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { dueDateForTerms, txBalance, txTotal, uid } from '../../domain/accounting';
import type { Contact, EntryMode, GsmMode, LedgerData, PaymentTerms, Transaction, TransactionType } from '../../domain/models';

interface TransactionModalProps {
  open: boolean;
  data: LedgerData;
  transaction?: Transaction | null;
  defaults?: Partial<Transaction> | null;
  onClose: () => void;
  onSave: (tx: Transaction) => void;
}

export function TransactionModal({ open, data, transaction, defaults, onClose, onSave }: TransactionModalProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [entryMode, setEntryMode] = useState<EntryMode>('cash');
  const [amount, setAmount] = useState('0');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountToId, setAccountToId] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [gstMode, setGstMode] = useState<GsmMode>('inc');
  const [contactId, setContactId] = useState('');
  const [party, setParty] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('due_on_receipt');
  const [dueDate, setDueDate] = useState('');
  const [paidNow, setPaidNow] = useState('');

  const existing = transaction || null;
  const activeCategories = (type === 'income' ? data.categories.income : data.categories.expense).filter((c) => !c.archivedAt);
  const existingCategory = existing?.categoryId
    ? (type === 'income' ? data.categories.income : data.categories.expense).find((category) => category.id === existing.categoryId)
    : undefined;
  const categories = existingCategory && existingCategory.archivedAt
    ? [existingCategory, ...activeCategories]
    : activeCategories;
  const contactOptions = data.contacts
    .filter((contact) => !contact.archivedAt)
    .filter((contact) => type === 'income'
      ? contact.type === 'customer' || contact.type === 'both'
      : contact.type === 'supplier' || contact.type === 'both')
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!open) return;
    const tx = transaction;
    const nextType = tx?.type || defaults?.type || 'expense';
    const nextEntryMode = tx?.entryMode || defaults?.entryMode || 'cash';
    const nextDate = tx?.date || defaults?.date || new Date().toISOString().slice(0, 10);
    const nextPaymentTerms = tx?.paymentTerms || defaults?.paymentTerms || 'due_on_receipt';
    setType(nextType);
    setEntryMode(nextEntryMode);
    setAmount(String(tx?.amount || defaults?.amount || 0));
    setCategoryId(tx?.categoryId || defaults?.categoryId || (nextType === 'income'
      ? data.categories.income.find((category) => !category.archivedAt)?.id
      : data.categories.expense.find((category) => !category.archivedAt)?.id) || '');
    setAccountId(tx?.accountId || defaults?.accountId || data.accounts[0]?.id || '');
    setAccountToId(tx?.accountToId || defaults?.accountToId || data.accounts[1]?.id || data.accounts[0]?.id || '');
    setDate(nextDate);
    setNote(tx?.note || defaults?.note || '');
    setGstMode(tx?.gstMode === undefined ? (defaults?.gstMode === undefined ? (data.settings.gstEnabled ? 'inc' : null) : defaults.gstMode) : tx.gstMode);
    setContactId(tx?.contactId || defaults?.contactId || '');
    setParty(tx?.party || defaults?.party || '');
    setInvoiceNo(tx?.invoiceNo || tx?.creditNoteNo || defaults?.invoiceNo || defaults?.creditNoteNo || '');
    setPaymentTerms(nextPaymentTerms);
    setDueDate(tx?.dueDate || defaults?.dueDate || dueDateForTerms(nextDate, nextPaymentTerms));
    setPaidNow('');
  }, [data.accounts, data.categories.expense, data.categories.income, data.settings.gstEnabled, defaults, open, transaction]);

  useEffect(() => {
    if (!contactId) return;
    const contact = data.contacts.find((item) => item.id === contactId);
    if (!contact) return;
    setParty(contact.name);
    if (!existing) setPaymentTerms(contact.paymentTerms);
  }, [contactId, data.contacts, existing]);

  useEffect(() => {
    if (paymentTerms !== 'custom') setDueDate(dueDateForTerms(date, paymentTerms));
  }, [date, paymentTerms]);

  const draft = useMemo<Transaction>(() => ({
    id: existing?.id || uid(),
    type,
    amount: Number(amount) || 0,
    accountId,
    accountToId,
    categoryId,
    date,
    note,
    gstMode,
    entryMode,
    contactId,
    party,
    invoiceNo,
    creditNoteNo: entryMode === 'credit_note' ? invoiceNo : undefined,
    paymentTerms,
    dueDate,
    payments: existing?.payments || [],
  }), [accountId, accountToId, amount, categoryId, contactId, date, dueDate, entryMode, existing?.id, existing?.payments, gstMode, invoiceNo, note, party, paymentTerms, type]);

    const total = txTotal(draft, data);
  const existingBalance = existing ? txBalance(existing, data) : total;
  const projectedPaid = (existing?.payments || []).reduce((sum, payment) => sum + payment.amount, 0) + (Number(paidNow) || 0);
  const isDocument = entryMode === 'invoice' || entryMode === 'credit_note';

  function submit() {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return;
    const tx: Transaction = {
      id: existing?.id || uid(),
      type,
      amount: numericAmount,
      accountId,
      date,
      note: note.trim(),
    };
    if (type === 'transfer') {
      tx.accountToId = accountToId;
    } else {
      tx.categoryId = categoryId;
      tx.gstMode = data.settings.gstEnabled ? gstMode : null;
      tx.entryMode = entryMode;
      if (isDocument) {
        const paid = Number(paidNow) || 0;
        const payments = [...(existing?.payments || [])];
        if (entryMode === 'invoice' && paid > 0) payments.push({ id: uid('p'), amount: paid, date, accountId });
        tx.contactId = contactId || undefined;
        tx.party = party.trim();
        if (entryMode === 'credit_note') {
          tx.creditNoteNo = invoiceNo.trim();
        } else {
          tx.invoiceNo = invoiceNo.trim();
        }
        tx.paymentTerms = paymentTerms;
        tx.dueDate = dueDate || dueDateForTerms(date, paymentTerms);
        if (entryMode === 'invoice') tx.payments = payments;
      }
    }
    onSave(tx);
  }

  return (
    <Modal
      open={open}
      title={existing ? 'Edit Transaction' : 'New Transaction'}
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit}>Save</button>}
    >
      <div className="seg-control">
        {(['expense', 'income', 'transfer'] as TransactionType[]).map((item) => (
          <button key={item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>
            {item === 'expense' ? 'Purchase' : item === 'income' ? 'Sale' : 'Transfer'}
          </button>
        ))}
      </div>
      {type !== 'transfer' ? (
        <div className="seg-control">
          <button className={entryMode === 'cash' ? 'active' : ''} onClick={() => setEntryMode('cash')}>Paid Now</button>
          <button className={entryMode === 'invoice' ? 'active' : ''} onClick={() => setEntryMode('invoice')}>Invoice</button>
          <button className={entryMode === 'credit_note' ? 'active' : ''} onClick={() => setEntryMode('credit_note')}>
            {type === 'income' ? 'Credit Note' : 'Supplier Credit'}
          </button>
        </div>
      ) : null}
      <div className="form-card">
        <label>Amount <input type="number" value={amount} min={0} step={0.01} onChange={(event) => setAmount(event.target.value)} /></label>
        {type !== 'transfer' ? (
          <label>Category <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}{cat.archivedAt ? ' (archived)' : ''}</option>)}</select></label>
        ) : null}
        <label>{type === 'transfer' ? 'From' : 'Account'} <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.icon} {account.name}</option>)}</select></label>
        {type === 'transfer' ? <label>To <select value={accountToId} onChange={(event) => setAccountToId(event.target.value)}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.icon} {account.name}</option>)}</select></label> : null}
        <label>Date <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Note <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" /></label>
      </div>
      {type !== 'transfer' && data.settings.gstEnabled ? (
        <div className="form-card">
          <label>GST <select value={gstMode || ''} onChange={(event) => setGstMode((event.target.value || null) as GsmMode)}>
            <option value="inc">Inc GST</option>
            <option value="exc">+ GST</option>
            <option value="free">GST-Free</option>
            <option value="">No GST</option>
          </select></label>
        </div>
      ) : null}
      {type !== 'transfer' && isDocument ? (
        <div className="form-card">
          {contactOptions.length ? (
            <label>{type === 'income' ? 'Customer' : 'Supplier'} <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">Manual entry</option>
              {contactOptions.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </select></label>
          ) : null}
          <label>{contactOptions.length ? 'Name Override' : type === 'income' ? 'Customer' : 'Supplier'} <input value={party} onChange={(event) => {
            setParty(event.target.value);
            setContactId(matchContact(contactOptions, event.target.value)?.id || '');
          }} /></label>
          <label>{entryMode === 'credit_note' ? 'Credit No.' : 'Invoice No.'} <input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} /></label>
          {entryMode === 'invoice' ? (
            <>
              <label>Terms <select value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value as PaymentTerms)}>
                <option value="due_on_receipt">Due on receipt</option>
                <option value="net_7">Net 7</option>
                <option value="net_14">Net 14</option>
                <option value="net_30">Net 30</option>
                <option value="net_60">Net 60</option>
                <option value="custom">Custom due date</option>
              </select></label>
              <label>Due Date <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <label>Paid Now <input type="number" value={paidNow} min={0} max={existingBalance} step={0.01} onChange={(event) => setPaidNow(event.target.value)} /></label>
            </>
          ) : null}
          <div className="invoice-mini">
            <span>Total {total.toFixed(2)}</span>
            <span>{entryMode === 'credit_note' ? 'Allocated 0.00' : `Paid ${projectedPaid.toFixed(2)}`}</span>
            <b>{entryMode === 'credit_note' ? `Available ${total.toFixed(2)}` : `Balance ${Math.max(0, total - projectedPaid).toFixed(2)}`}</b>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function matchContact(contacts: Contact[], name: string) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return contacts.find((contact) => contact.name.trim().toLowerCase() === normalized);
}
