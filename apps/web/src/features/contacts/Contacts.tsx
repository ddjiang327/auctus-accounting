import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { paymentTermsLabel, uid } from '../../domain/accounting';
import type { Contact, ContactType, LedgerData, PaymentTerms } from '../../domain/models';

interface ContactsProps {
  data: LedgerData;
  onSaveContact: (contact: Contact) => void;
  canWrite?: boolean;
}

const contactTypes: ContactType[] = ['customer', 'supplier', 'both'];
const paymentTerms: PaymentTerms[] = ['due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60'];

export function Contacts({ data, onSaveContact, canWrite = true }: ContactsProps) {
  const [filter, setFilter] = useState<ContactType | 'all'>('all');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const contacts = useMemo(() => {
    return [...data.contacts]
      .filter((contact) => !contact.archivedAt)
      .filter((contact) => filter === 'all' || contact.type === filter || contact.type === 'both')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.contacts, filter]);

  function openNewContact(type: ContactType = 'customer') {
    setEditing({
      id: '',
      type,
      name: '',
      paymentTerms: 'due_on_receipt',
      createdAt: new Date().toISOString(),
    });
    setModalOpen(true);
  }

  function openEditContact(contact: Contact) {
    setEditing(contact);
    setModalOpen(true);
  }

  function saveContact(contact: Contact) {
    onSaveContact(contact);
    setModalOpen(false);
    setEditing(null);
  }

  const customers = data.contacts.filter((contact) => !contact.archivedAt && (contact.type === 'customer' || contact.type === 'both')).length;
  const suppliers = data.contacts.filter((contact) => !contact.archivedAt && (contact.type === 'supplier' || contact.type === 'both')).length;

  return (
    <section className="view">
      <header className="large-header">
        <h1>Contacts</h1>
        <p>{customers} customers · {suppliers} suppliers</p>
      </header>

      <div className="toolbar-row">
        <div className="seg-control compact-control">
          {(['all', 'customer', 'supplier', 'both'] as Array<ContactType | 'all'>).map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
              {item === 'all' ? 'All' : item === 'both' ? 'Both' : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        {canWrite ? <button className="small-action" onClick={() => openNewContact(filter === 'supplier' ? 'supplier' : 'customer')}>Add Contact</button> : null}
      </div>

      <div className="list desktop-table">
        {contacts.length ? contacts.map((contact) => (
          <button key={contact.id} className="list-row" onClick={canWrite ? () => openEditContact(contact) : undefined}>
            <span className="icon blue">{contact.name.slice(0, 1).toUpperCase()}</span>
            <span className="row-body">
              <b>{contact.name}</b>
              <small>{contact.abn ? `ABN ${contact.abn}` : contact.email || contact.phone || 'No contact details'}</small>
            </span>
            <span className="row-right wide">
              <b>{contact.type}</b>
              <small>{paymentTermsLabel(contact.paymentTerms)}</small>
            </span>
          </button>
        )) : <div className="empty-card flat">No contacts yet</div>}
      </div>

      {canWrite ? (
        <ContactModal
          open={modalOpen}
          contact={editing}
          onClose={() => setModalOpen(false)}
          onSave={saveContact}
        />
      ) : null}
    </section>
  );
}

function ContactModal({
  open,
  contact,
  onClose,
  onSave,
}: {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onSave: (contact: Contact) => void;
}) {
  const [type, setType] = useState<ContactType>('customer');
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [terms, setTerms] = useState<PaymentTerms>('due_on_receipt');

  useEffect(() => {
    if (!open) return;
    setType(contact?.type || 'customer');
    setName(contact?.name || '');
    setAbn(contact?.abn || '');
    setEmail(contact?.email || '');
    setPhone(contact?.phone || '');
    setAddress(contact?.address || '');
    setTerms(contact?.paymentTerms || 'due_on_receipt');
  }, [contact, open]);

  function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      window.alert('Contact name is required.');
      return;
    }
    onSave({
      id: contact?.id || uid('c'),
      type,
      name: trimmedName,
      abn: abn.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      paymentTerms: terms,
      createdAt: contact?.createdAt || new Date().toISOString(),
      archivedAt: contact?.archivedAt,
    });
  }

  return (
    <Modal
      open={open}
      title={contact?.id ? 'Edit Contact' : 'New Contact'}
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit}>Save Contact</button>}
    >
      <div className="seg-control">
        {contactTypes.map((item) => (
          <button key={item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>
            {item === 'both' ? 'Both' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <div className="form-card">
        <label>Name <input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>ABN <input value={abn} onChange={(event) => setAbn(event.target.value)} /></label>
        <label>Email <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Phone <input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>Address <input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        <label>Payment Terms <select value={terms} onChange={(event) => setTerms(event.target.value as PaymentTerms)}>
          {paymentTerms.map((item) => <option key={item} value={item}>{paymentTermsLabel(item)}</option>)}
        </select></label>
      </div>
    </Modal>
  );
}
