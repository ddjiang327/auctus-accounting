import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAppAlerts } from '../../components/AppAlerts';
import { chartAccountName, latestLockedThrough, todayStr } from '../../domain/accounting';
import type { BasBasis, BusinessProfile, Category, LedgerData } from '../../domain/models';
import type { UiPermissions } from '../../domain/permissions';

interface SettingsProps {
  data: LedgerData;
  onUpdateSettings: (settings: Partial<LedgerData['settings']>) => void | Promise<void>;
  onUpdateBusinessProfile: (profile: BusinessProfile) => void | Promise<void>;
  onCreatePeriodLock: (lockedThrough: string, note: string) => void | Promise<void>;
  onClearPeriodLocks: () => void;
  onReset: () => void;
  remoteMode?: boolean;
  cloudAvailable?: boolean;
  onSwitchToCloud?: () => void;
  lockEnabled: boolean;
  onEnableLock: () => void;
  onDisableLock: () => void;
  onLockNow: () => void;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onSaveCategory: (category: Category, type: 'income' | 'expense') => void | Promise<void>;
  onArchiveCategory: (categoryId: string) => void | Promise<void>;
  permissions: UiPermissions;
}

export function Settings({
  data,
  onUpdateSettings,
  onUpdateBusinessProfile,
  onCreatePeriodLock,
  onClearPeriodLocks,
  onReset,
  remoteMode = false,
  cloudAvailable = false,
  onSwitchToCloud,
  lockEnabled,
  onEnableLock,
  onDisableLock,
  onLockNow,
  onBackup,
  onRestore,
  onSaveCategory,
  onArchiveCategory,
  permissions,
}: SettingsProps) {
  const { reportError } = useAppAlerts();
  const [periodLockOpen, setPeriodLockOpen] = useState(false);
  const [numberingOpen, setNumberingOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const lockedThrough = latestLockedThrough(data);
  const profile = data.settings.businessProfile;
  const activeCategoryCount = data.categories.income.filter((category) => !category.archivedAt).length
    + data.categories.expense.filter((category) => !category.archivedAt).length;
  const backupStats = [
    `${data.transactions.length} transactions`,
    `${data.contacts.length} contacts`,
    `${data.accounts.length} accounts`,
  ].join(' · ');

  function runSettingsAction(action: () => void | Promise<void>) {
    Promise.resolve(action()).catch((error) => {
      reportError(error instanceof Error ? error : new Error('Settings update failed.'));
    });
  }

  return (
    <section className="view">
      <header className="large-header">
        <h1>Settings</h1>
        <p>Accounting controls, GST, data and app lock</p>
      </header>
      {permissions.canManageSettings ? (
        <div className="list">
          <button className="list-row" onClick={() => runSettingsAction(() => onUpdateSettings({ gstEnabled: !data.settings.gstEnabled }))}>
            <span className="icon blue">%</span>
            <span className="row-body"><b>Track GST</b><small>Show GST on sales and purchases</small></span>
            <span className={`toggle ${data.settings.gstEnabled ? 'on' : ''}`} />
          </button>
          <div className="list-row">
            <span className="icon blue">BAS</span>
            <span className="row-body"><b>BAS Basis</b><small>Controls GST report timing</small></span>
            <select
              className="inline-input"
              value={data.settings.basBasis || 'cash'}
              onChange={(event) => {
                const basBasis = event.target.value as BasBasis;
                runSettingsAction(() => onUpdateSettings({ basBasis }));
              }}
            >
              <option value="cash">Cash</option>
              <option value="accrual">Accrual</option>
            </select>
          </div>
          <div className="list-row">
            <span className="icon orange">GST</span>
            <span className="row-body"><b>GST Rate</b><small>Fixed for Australia</small></span>
            <strong className="setting-value">10%</strong>
          </div>
        </div>
      ) : null}

      {permissions.canManagePeriodLocks || permissions.canManageSettings ? (
        <>
          <div className="section-header"><h3>Accounting Controls</h3></div>
          <div className="list">
            {permissions.canManagePeriodLocks ? (
              <button className="list-row" onClick={() => setPeriodLockOpen(true)}>
                <span className="icon blue">✓</span>
                <span className="row-body"><b>Period Lock</b><small>{lockedThrough ? `Locked through ${lockedThrough}` : 'No locked accounting period'}</small></span>
                <span className="row-right wide"><b>{lockedThrough || 'Open'}</b><small>Closed period</small></span>
              </button>
            ) : null}
            {permissions.canManageSettings ? (
              <button className="list-row" onClick={() => setNumberingOpen(true)}>
                <span className="icon orange">#</span>
                <span className="row-body"><b>Document Numbering</b><small>Invoice, bill, credit note and receipt sequences</small></span>
                <span className="row-right wide"><b>{data.settings.invoicePrefix}{data.settings.nextInvoiceNumber}</b><small>{data.settings.billPrefix}{data.settings.nextBillNumber}</small></span>
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {permissions.canWriteAccounting ? (
        <>
          <div className="section-header"><h3>Categories</h3></div>
          <div className="list">
            <button className="list-row" onClick={() => setCategoriesOpen(true)}>
              <span className="icon orange">🏷</span>
              <span className="row-body"><b>Manage Categories</b><small>Income and expense categories</small></span>
              <span className="row-right wide"><b>{activeCategoryCount}</b><small>Active</small></span>
            </button>
          </div>
        </>
      ) : null}

      {permissions.canManageSettings ? (
        <>
          <div className="section-header"><h3>Business</h3></div>
          <button className="business-profile-card" onClick={() => setBusinessOpen(true)}>
            <span className="business-mark">{profile.logoText || profile.name.slice(0, 1) || 'A'}</span>
            <span className="business-profile-body">
              <b>{profile.name || 'Business Profile'}</b>
              <small>{[profile.abn ? `ABN ${profile.abn}` : '', profile.email, profile.phone].filter(Boolean).join(' · ') || 'Add ABN, contact details and invoice text'}</small>
              {profile.address ? <em>{profile.address}</em> : null}
            </span>
            <span className="row-right wide"><b>Edit</b><small>Invoices & bills</small></span>
          </button>
        </>
      ) : null}

      <div className="section-header"><h3>Security</h3></div>
      <div className="list">
        <button className="list-row" onClick={lockEnabled ? onDisableLock : onEnableLock}>
          <span className="icon blue">🔒</span>
          <span className="row-body"><b>App Lock</b><small>{lockEnabled ? 'PIN lock is enabled' : 'Protect this browser with a PIN'}</small></span>
          <span className={`toggle ${lockEnabled ? 'on' : ''}`} />
        </button>
        {lockEnabled ? (
          <button className="list-row" onClick={onLockNow}>
            <span className="icon orange">↩</span>
            <span className="row-body"><b>Lock Now</b><small>Require PIN before using Auctus again</small></span>
          </button>
        ) : null}
      </div>

      {permissions.canManageLedgerData ? (
        <>
          <div className="section-header"><h3>Data</h3></div>
          <div className="data-panel">
            <div className="data-panel-head">
              <span className="icon blue">↓</span>
              <span>
                <b>{remoteMode ? 'Backend Backup' : 'Local Backup'}</b>
                <small>{backupStats}</small>
              </span>
            </div>
            <div className="data-actions">
              <button className="primary" onClick={onBackup}>Download Backup</button>
              <label className="secondary file-action">
                Restore Backup
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onRestore(file);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
            <p className="data-note">Download Backup saves a JSON copy of this workspace. Restoring a file first downloads a safety backup of the current workspace, then replaces this workspace with the selected file.</p>
            <p className="data-note">Backup files include settings, contacts, accounts, invoices, bills, journals, reconciliations and audit log entries.</p>
          </div>
          {!remoteMode && cloudAvailable && onSwitchToCloud ? (
            <div className="list compact-danger-list">
              <button className="list-row" onClick={onSwitchToCloud}>
                <span className="icon"><Cloud size={16} /></span>
                <span className="row-body"><b>Switch to Cloud Mode</b><small>Sign in to sync data across devices. Your local data will remain on this browser.</small></span>
              </button>
            </div>
          ) : null}
          <div className="list compact-danger-list">
            <button className="list-row danger-row" onClick={onReset}>
              <span className="icon red">!</span>
              <span className="row-body"><b>{remoteMode ? 'Reset Backend Ledger' : 'Reset Local Data'}</b><small>{remoteMode ? 'Deletes this workspace ledger and rebuilds the default chart after confirmation. Download a backup first.' : "Clears this browser's local app data after confirmation. Download a backup first if needed."}</small></span>
            </button>
          </div>
        </>
      ) : null}

      {permissions.canManagePeriodLocks ? <PeriodLockModal
        open={periodLockOpen}
        data={data}
        onClose={() => setPeriodLockOpen(false)}
        onSave={(nextLockedThrough, note) => {
          return Promise.resolve(onCreatePeriodLock(nextLockedThrough, note)).then(() => {
            setPeriodLockOpen(false);
          }).catch((error) => {
            reportError(error instanceof Error ? error : new Error('Period lock save failed.'));
          });
        }}
        onClear={() => {
          onClearPeriodLocks();
        }}
      /> : null}
      {permissions.canManageSettings ? <NumberingModal
        open={numberingOpen}
        data={data}
        onClose={() => setNumberingOpen(false)}
        onSave={(settings) => {
          return Promise.resolve(onUpdateSettings(settings)).then(() => {
            setNumberingOpen(false);
          }).catch((error) => {
            reportError(error instanceof Error ? error : new Error('Document numbering save failed.'));
          });
        }}
      /> : null}
      {permissions.canManageSettings ? <BusinessProfileModal
        open={businessOpen}
        profile={profile}
        onClose={() => setBusinessOpen(false)}
        onSave={(businessProfile) => {
          return Promise.resolve(onUpdateBusinessProfile(businessProfile)).then(() => {
            setBusinessOpen(false);
          }).catch((error) => {
            reportError(error instanceof Error ? error : new Error('Business profile save failed.'));
          });
        }}
      /> : null}
      {permissions.canWriteAccounting ? <CategoriesModal
        open={categoriesOpen}
        data={data}
        onClose={() => setCategoriesOpen(false)}
        onSave={async (category, type) => {
          try {
            await onSaveCategory(category, type);
          } catch (error) {
            reportError(error instanceof Error ? error : new Error('Category save failed.'));
          }
        }}
        onArchive={async (categoryId) => {
          try {
            await onArchiveCategory(categoryId);
          } catch (error) {
            reportError(error instanceof Error ? error : new Error('Category archive failed.'));
          }
        }}
      /> : null}
    </section>
  );
}

function BusinessProfileModal({ open, profile, onClose, onSave }: {
  open: boolean;
  profile: BusinessProfile;
  onClose: () => void;
  onSave: (profile: BusinessProfile) => void | Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [invoiceFooter, setInvoiceFooter] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(profile.name || '');
    setAbn(profile.abn || '');
    setEmail(profile.email || '');
    setPhone(profile.phone || '');
    setAddress(profile.address || '');
    setPaymentInstructions(profile.paymentInstructions || '');
    setInvoiceFooter(profile.invoiceFooter || '');
  }, [open, profile]);

  function submit() {
    if (saving) return;
    if (!name.trim()) {
      reportError(new Error('Business name is required.'));
      return;
    }
    setSaving(true);
    Promise.resolve(onSave({
      ...profile,
      name: name.trim(),
      logoText: profile.logoText || name.trim().slice(0, 1).toUpperCase(),
      abn: abn.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      paymentInstructions: paymentInstructions.trim() || undefined,
      invoiceFooter: invoiceFooter.trim() || undefined,
    })).finally(() => setSaving(false));
  }

  return (
    <Modal
      open={open}
      title="Business Profile"
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Business Profile'}</button>}
    >
      <div className="business-modal-summary">
        <span className="business-mark">{profile.logoText || name.slice(0, 1) || 'A'}</span>
        <span>
          <b>Used on invoices, bills and printable documents</b>
          <small>Keep these details aligned with your registered business and customer-facing payment instructions.</small>
        </span>
      </div>
      <div className="form-card business-form">
        <label>Business Name <input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>ABN <input value={abn} onChange={(event) => setAbn(event.target.value)} /></label>
        <label>Email <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Phone <input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="textarea-label">Address <textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={3} /></label>
        <label className="textarea-label">Payment Instructions <textarea value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} rows={4} /></label>
        <label className="textarea-label">Invoice Footer <textarea value={invoiceFooter} onChange={(event) => setInvoiceFooter(event.target.value)} rows={3} /></label>
      </div>
    </Modal>
  );
}

type NumberingSettings = Pick<
  LedgerData['settings'],
  | 'invoicePrefix'
  | 'billPrefix'
  | 'creditNotePrefix'
  | 'supplierCreditPrefix'
  | 'receiptPrefix'
  | 'nextInvoiceNumber'
  | 'nextBillNumber'
  | 'nextCreditNoteNumber'
  | 'nextSupplierCreditNumber'
  | 'nextReceiptNumber'
>;

function NumberingModal({ open, data, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onSave: (settings: NumberingSettings) => void | Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const [saving, setSaving] = useState(false);
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [billPrefix, setBillPrefix] = useState('');
  const [creditNotePrefix, setCreditNotePrefix] = useState('');
  const [supplierCreditPrefix, setSupplierCreditPrefix] = useState('');
  const [receiptPrefix, setReceiptPrefix] = useState('');
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('');
  const [nextBillNumber, setNextBillNumber] = useState('');
  const [nextCreditNoteNumber, setNextCreditNoteNumber] = useState('');
  const [nextSupplierCreditNumber, setNextSupplierCreditNumber] = useState('');
  const [nextReceiptNumber, setNextReceiptNumber] = useState('');

  useEffect(() => {
    if (!open) return;
    setInvoicePrefix(data.settings.invoicePrefix || 'INV-');
    setBillPrefix(data.settings.billPrefix || 'BILL-');
    setCreditNotePrefix(data.settings.creditNotePrefix || 'CN-');
    setSupplierCreditPrefix(data.settings.supplierCreditPrefix || 'SC-');
    setReceiptPrefix(data.settings.receiptPrefix || 'REC-');
    setNextInvoiceNumber(String(data.settings.nextInvoiceNumber || 1));
    setNextBillNumber(String(data.settings.nextBillNumber || 1));
    setNextCreditNoteNumber(String(data.settings.nextCreditNoteNumber || 1));
    setNextSupplierCreditNumber(String(data.settings.nextSupplierCreditNumber || 1));
    setNextReceiptNumber(String(data.settings.nextReceiptNumber || 1));
  }, [data, open]);

  function positiveInteger(value: string) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function submit() {
    if (saving) return;
    const invoice = positiveInteger(nextInvoiceNumber);
    const bill = positiveInteger(nextBillNumber);
    const credit = positiveInteger(nextCreditNoteNumber);
    const supplierCredit = positiveInteger(nextSupplierCreditNumber);
    const receipt = positiveInteger(nextReceiptNumber);
    if (!invoice || !bill || !credit || !supplierCredit || !receipt) {
      reportError(new Error('Next numbers must be whole numbers above zero.'));
      return;
    }
    setSaving(true);
    Promise.resolve(onSave({
      invoicePrefix,
      billPrefix,
      creditNotePrefix,
      supplierCreditPrefix,
      receiptPrefix,
      nextInvoiceNumber: invoice,
      nextBillNumber: bill,
      nextCreditNoteNumber: credit,
      nextSupplierCreditNumber: supplierCredit,
      nextReceiptNumber: receipt,
    })).finally(() => setSaving(false));
  }

  return (
    <Modal
      open={open}
      title="Document Numbering"
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Numbering'}</button>}
    >
      <div className="form-card">
        <label>Invoice Prefix <input value={invoicePrefix} onChange={(event) => setInvoicePrefix(event.target.value)} /></label>
        <label>Next Invoice No. <input type="number" min={1} step={1} value={nextInvoiceNumber} onChange={(event) => setNextInvoiceNumber(event.target.value)} /></label>
        <label>Bill Prefix <input value={billPrefix} onChange={(event) => setBillPrefix(event.target.value)} /></label>
        <label>Next Bill No. <input type="number" min={1} step={1} value={nextBillNumber} onChange={(event) => setNextBillNumber(event.target.value)} /></label>
        <label>Credit Note Prefix <input value={creditNotePrefix} onChange={(event) => setCreditNotePrefix(event.target.value)} /></label>
        <label>Next Credit Note No. <input type="number" min={1} step={1} value={nextCreditNoteNumber} onChange={(event) => setNextCreditNoteNumber(event.target.value)} /></label>
        <label>Supplier Credit Prefix <input value={supplierCreditPrefix} onChange={(event) => setSupplierCreditPrefix(event.target.value)} /></label>
        <label>Next Supplier Credit No. <input type="number" min={1} step={1} value={nextSupplierCreditNumber} onChange={(event) => setNextSupplierCreditNumber(event.target.value)} /></label>
        <label>Receipt Prefix <input value={receiptPrefix} onChange={(event) => setReceiptPrefix(event.target.value)} /></label>
        <label>Next Receipt No. <input type="number" min={1} step={1} value={nextReceiptNumber} onChange={(event) => setNextReceiptNumber(event.target.value)} /></label>
      </div>
    </Modal>
  );
}

function PeriodLockModal({ open, data, onClose, onSave, onClear }: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onSave: (lockedThrough: string, note: string) => void | Promise<void>;
  onClear: () => void | Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [lockedThrough, setLockedThrough] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setLockedThrough(latestLockedThrough(data) || todayStr());
    setNote('');
  }, [data, open]);

  function submit() {
    if (saving || clearing) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lockedThrough)) {
      reportError(new Error('Use YYYY-MM-DD for the lock date.'));
      return;
    }
    setSaving(true);
    Promise.resolve(onSave(lockedThrough, note.trim())).finally(() => setSaving(false));
  }

  function clearLocks() {
    if (saving || clearing) return;
    setClearing(true);
    Promise.resolve(onClear()).finally(() => setClearing(false));
  }

  return (
    <Modal
      open={open}
      title="Period Lock"
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit} disabled={saving || clearing}>{saving ? 'Saving…' : 'Save Period Lock'}</button>}
    >
      <div className="form-card">
        <label>Current Lock <strong className="setting-value">{latestLockedThrough(data) || 'None'}</strong></label>
        <label>Locked Through <input value={lockedThrough} onChange={(event) => setLockedThrough(event.target.value)} /></label>
        <label>Note <input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      </div>
      <div className="empty-card modal-note">
        The lock closes all dates on or before the selected day. Users cannot create or edit transactions, invoice payments, journals, reconciliations, or document changes in the locked period. Use a later date or clear the lock to make changes.
      </div>
      {(data.periodLocks || []).length ? (
        <div className="modal-list">
          <button className="primary danger-action wide" onClick={clearLocks} disabled={saving || clearing}>{clearing ? 'Clearing…' : 'Clear Period Locks'}</button>
        </div>
      ) : null}
    </Modal>
  );
}


const categoryColors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#5856D6', '#5AC8FA', '#8E8E93', '#FF6B6B', '#FF2D55', '#4ECDC4', '#AF52DE', '#FF6482', '#FFCC00', '#0099FF'];

function CategoriesModal({ open, data, onClose, onSave, onArchive }: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onSave: (category: Category, type: 'income' | 'expense') => void | Promise<void>;
  onArchive: (categoryId: string) => void | Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const [tab, setTab] = useState<'income' | 'expense'>('expense');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(categoryColors[0]);
  const [chartAccountId, setChartAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const chartAccounts = data.chartOfAccounts.filter((account) => tab === 'income' ? account.class === 'revenue' : account.class === 'expense');
  const defaultChartAccountId = chartAccounts[0]?.id || '';

  useEffect(() => {
    if (!open) return;
    setTab('expense');
    setEditingId(null);
    setName('');
    setIcon('🏷');
    setColor(categoryColors[0]);
    setChartAccountId(data.chartOfAccounts.find((account) => account.class === 'expense')?.id || '');
  }, [data.chartOfAccounts, open]);

  useEffect(() => {
    setEditingId(null);
    setName('');
    setIcon(tab === 'income' ? '💰' : '🏷');
    setColor(categoryColors[0]);
    setChartAccountId(defaultChartAccountId);
  }, [defaultChartAccountId, tab]);

  const categories = data.categories[tab].filter((c) => !c.archivedAt);
  const editingCategory = editingId ? categories.find((c) => c.id === editingId) : null;
  const accountLabel = tab === 'income' ? 'Revenue Chart Account' : 'Expense Chart Account';
  const categoryAccountName = (category: Category) => {
    const account = data.chartOfAccounts.find((item) => item.id === category.chartAccountId);
    return account ? `${account.code} · ${account.name}` : 'No chart account';
  };

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setChartAccountId(category.chartAccountId || defaultChartAccountId);
  }

  async function submit() {
    if (saving || archiving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      reportError(new Error('Category name is required.'));
      return;
    }
    setSaving(true);
    try {
      await onSave(
        {
          id: editingCategory?.id || `cat_${Math.random().toString(36).slice(2, 9)}`,
          name: trimmedName,
          icon: icon.trim() || '🏷',
          color,
          chartAccountId: chartAccountId || undefined,
        },
        tab,
      );
      setEditingId(null);
      setName('');
      setIcon(tab === 'income' ? '💰' : '🏷');
      setColor(categoryColors[0]);
      setChartAccountId(defaultChartAccountId);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!editingCategory || saving || archiving) return;
    const usageCount = data.transactions.filter((tx) => tx.categoryId === editingCategory.id).length;
    const usageNote = usageCount > 0
      ? `\n\n${usageCount} transaction${usageCount === 1 ? '' : 's'} use this category — they will continue to display correctly.`
      : '';
    if (!window.confirm(`Archive "${editingCategory.name}"? It will no longer appear in pickers for new transactions.${usageNote}`)) return;
    setArchiving(true);
    try {
      await onArchive(editingCategory.id);
      setEditingId(null);
      setName('');
      setIcon(tab === 'income' ? '💰' : '🏷');
      setColor(categoryColors[0]);
      setChartAccountId(defaultChartAccountId);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Categories"
      onClose={onClose}
      footer={(
        <>
          <button className="primary wide" onClick={submit} disabled={saving || archiving}>{saving ? 'Saving…' : editingCategory ? 'Save Category' : 'Add Category'}</button>
          {editingCategory ? (
            <>
              <button className="primary secondary-action" onClick={() => {
                setEditingId(null);
                setName('');
                setIcon(tab === 'income' ? '💰' : '🏷');
                setColor(categoryColors[0]);
                setChartAccountId(defaultChartAccountId);
              }} disabled={saving || archiving}>New</button>
              <button className="primary danger-action" onClick={handleArchive} disabled={saving || archiving}>{archiving ? 'Archiving…' : 'Archive'}</button>
            </>
          ) : null}
        </>
      )}
    >
      <div className="seg-control">
        {(['expense', 'income'] as const).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="list compact">
        {categories.length ? categories.map((category) => (
          <button
            key={category.id}
            className="list-row"
            onClick={() => startEdit(category)}
          >
            <span className="icon" style={{ backgroundColor: category.color }}>{category.icon}</span>
            <span className="row-body"><b>{category.name}</b><small>{categoryAccountName(category)}</small></span>
            <span className="row-right"><small>{editingId === category.id ? 'Editing' : 'Edit'}</small></span>
          </button>
        )) : <div className="empty-card flat">No {tab} categories</div>}
      </div>
      <div className="section-header modal-section"><h3>{editingCategory ? 'Edit Category' : 'New Category'}</h3></div>
      <div className="form-card">
        <label>Name <input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Icon <input value={icon} maxLength={4} onChange={(event) => setIcon(event.target.value)} /></label>
        <label>{accountLabel}
          <select value={chartAccountId} onChange={(event) => setChartAccountId(event.target.value)}>
            {chartAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="empty-card modal-note">
        {tab === 'income'
          ? 'Income categories post to revenue accounts only.'
          : 'Expense categories post to expense accounts only.'}
      </div>
      <div className="swatch-row">
        {categoryColors.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={c}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
    </Modal>
  );
}
