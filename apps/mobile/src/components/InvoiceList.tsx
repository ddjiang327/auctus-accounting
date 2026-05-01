import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ContactModal } from './ContactModal';
import { RecurringModal } from './RecurringModal';
import { ActionButton, Card, ListRow, SectionTitle, colors } from './ui';
import { chartAccountName, contactName, creditNoteBalance, fmtMoney, getAccount, getCategory, isCreditNote, invoiceStatus, isDateLocked, isInvoice, todayStr, txBalance, txGst, txJournalEntry, txPaid, txTotal } from '../domain/accounting';
import type { Contact, InvoicePayment, LedgerData, RecurringFrequency, RecurringTemplate, Transaction, TransactionType } from '../domain/models';
import { shareCsv, toCsv } from '../utils/csvExport';

type InvoiceFilter = 'open' | 'overdue' | 'partial' | 'unpaid' | 'closed' | 'all';
type WorkspaceView = 'documents' | 'contacts';
type ContactDetailView = 'items' | 'statement';
export type PaymentAllocation = { txId: string; amount: number; date: string; accountId: string };
export type CreditNoteAllocation = { creditNoteId: string; invoiceId: string; amount: number; date: string };

export function InvoiceWorkspace({
  data,
  type,
  title,
  contactTitle,
  openLabel,
  paidLabel,
  newLabel,
  onEdit,
  onPay,
  onNew,
  onAllocate,
  onSaveContact,
  onVoid,
  onMarkSent,
  onNewCredit,
  onApplyCredit,
  onVoidPayment,
  onSaveRecurring,
  onDeleteRecurring,
  onToggleRecurring,
}: {
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  title: string;
  contactTitle: string;
  openLabel: string;
  paidLabel: string;
  newLabel: string;
  onEdit: (tx: Transaction) => void;
  onPay: (tx: Transaction) => void;
  onNew: () => void;
  onAllocate: (allocations: PaymentAllocation[]) => void;
  onSaveContact: (contact: Contact) => void;
  onVoid: (tx: Transaction) => void;
  onMarkSent: (tx: Transaction) => void;
  onNewCredit: (type: Extract<TransactionType, 'income' | 'expense'>) => void;
  onApplyCredit: (allocations: CreditNoteAllocation[]) => void;
  onVoidPayment: (tx: Transaction, paymentId: string) => void;
  onSaveRecurring: (template: RecurringTemplate) => void;
  onDeleteRecurring: (templateId: string) => void;
  onToggleRecurring: (templateId: string) => void;
}) {
  const [view, setView] = useState<WorkspaceView>('documents');
  const [filter, setFilter] = useState<InvoiceFilter>('open');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [applyCreditTx, setApplyCreditTx] = useState<Transaction | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const invoices = data.transactions
    .filter((tx) => isInvoice(tx) && tx.type === type)
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const creditNotes = data.transactions
    .filter((tx) => isCreditNote(tx) && tx.type === type)
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const openInvoices = invoices.filter((tx) => txBalance(tx, data) > 0.005);
  const closedInvoices = invoices.filter((tx) => txBalance(tx, data) <= 0.005);
  const overdueInvoices = openInvoices.filter((tx) => invoiceStatus(tx, data).tone === 'overdue');
  const partialInvoices = openInvoices.filter((tx) => txPaid(tx) > 0.005);
  const unpaidInvoices = openInvoices.filter((tx) => txPaid(tx) <= 0.005);
  const visible = filter === 'open'
    ? openInvoices
    : filter === 'overdue'
      ? overdueInvoices
      : filter === 'partial'
        ? partialInvoices
        : filter === 'unpaid'
          ? unpaidInvoices
          : filter === 'closed'
            ? closedInvoices
            : invoices;
  const openTotal = openInvoices.reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const paidTotal = invoices.reduce((sum, tx) => sum + txPaid(tx), 0);
  const openCreditNotes = creditNotes.filter((tx) => creditNoteBalance(tx, data) > 0.005);
  const recurringTemplates = (data.recurringTemplates || []).filter((t) => t.type === type);

  return (
    <>
      <View style={styles.topActions}>
        <View style={styles.segmentFlex}>
          {(['documents', 'contacts'] as WorkspaceView[]).map((item) => (
            <Pressable key={item} style={[styles.segBtn, view === item && styles.segActive]} onPress={() => setView(item)}>
              <Text>{item === 'documents' ? title : contactTitle}</Text>
            </Pressable>
          ))}
        </View>
        <ActionButton tone={type === 'income' ? 'green' : 'blue'} onPress={onNew}>{newLabel}</ActionButton>
      </View>
      <View style={styles.statsRow}>
        <Card><Text style={styles.muted}>{openLabel}</Text><Text style={type === 'income' ? styles.greenText : styles.redText}>{fmtMoney(openTotal)}</Text></Card>
        <Card><Text style={styles.muted}>{paidLabel}</Text><Text style={styles.blueText}>{fmtMoney(paidTotal)}</Text></Card>
      </View>
      <View style={styles.statsRow}>
        <Card><Text style={styles.muted}>Overdue</Text><Text style={styles.redText}>{overdueInvoices.length}</Text></Card>
        <Card><Text style={styles.muted}>{title}</Text><Text style={styles.blueText}>{invoices.length}</Text></Card>
      </View>
      {view === 'documents' ? (
        <>
          <View style={styles.filterGrid}>
            {(['open', 'overdue', 'partial', 'unpaid', 'closed', 'all'] as InvoiceFilter[]).map((item) => (
              <Pressable key={item} style={[styles.filterChip, filter === item && styles.segActive]} onPress={() => setFilter(item)}>
                <Text style={styles.filterText}>{filterLabel(item)}</Text>
              </Pressable>
            ))}
          </View>
          <SectionTitle>{filterLabel(filter)} {title}</SectionTitle>
          <View style={styles.wrap}>
            {visible.length ? visible.map((tx) => (
              <InvoiceRow key={tx.id} data={data} tx={tx} type={type} onOpen={setDetailTx} onPay={onPay} onVoidPayment={onVoidPayment} />
            )) : <Text style={styles.empty}>No {filterLabel(filter).toLowerCase()} {title.toLowerCase()}</Text>}
          </View>
          <View style={styles.creditHeader}>
            <SectionTitle>{type === 'income' ? 'Credit Notes' : 'Supplier Credits'}</SectionTitle>
            <Pressable style={styles.miniBtn} onPress={() => onNewCredit(type)}>
              <Text style={styles.miniText}>+ New</Text>
            </Pressable>
          </View>
          <View style={styles.wrap}>
            {creditNotes.length ? creditNotes.map((tx) => (
              <CreditNoteRow key={tx.id} data={data} tx={tx} type={type} onApply={openCreditNotes.some((cn) => cn.id === tx.id) ? setApplyCreditTx : undefined} />
            )) : <Text style={styles.empty}>No {type === 'income' ? 'credit notes' : 'supplier credits'}</Text>}
          </View>
          <View style={styles.creditHeader}>
            <SectionTitle>Recurring</SectionTitle>
            <Pressable style={styles.miniBtn} onPress={() => { setEditingTemplate(null); setRecurringOpen(true); }}>
              <Text style={styles.miniText}>+ New</Text>
            </Pressable>
          </View>
          <View style={styles.wrap}>
            {recurringTemplates.length ? recurringTemplates.map((template) => (
              <RecurringRow
                key={template.id}
                data={data}
                type={type}
                template={template}
                onEdit={() => { setEditingTemplate(template); setRecurringOpen(true); }}
                onToggle={() => onToggleRecurring(template.id)}
                onDelete={() => Alert.alert(
                  'Delete schedule?',
                  'Already-generated drafts will not be affected.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDeleteRecurring(template.id) },
                  ]
                )}
              />
            )) : <Text style={styles.empty}>No recurring {type === 'income' ? 'invoices' : 'bills'}</Text>}
          </View>
        </>
      ) : (
        <ContactLedger
          data={data}
          type={type}
          title={contactTitle}
          invoices={invoices}
          selectedContactId={selectedContactId}
          onSelect={setSelectedContactId}
          onEdit={onEdit}
          onPay={onPay}
          onAllocate={onAllocate}
          onSaveContact={onSaveContact}
          onOpenDetail={setDetailTx}
          onVoidPayment={onVoidPayment}
        />
      )}
      <InvoiceDetailModal
        open={!!detailTx}
        data={data}
        tx={detailTx}
        type={type}
        onClose={() => setDetailTx(null)}
        onEdit={(tx) => {
          setDetailTx(null);
          onEdit(tx);
        }}
        onPay={(tx) => {
          setDetailTx(null);
          onPay(tx);
        }}
        onVoid={(tx) => {
          Alert.alert(`Void ${type === 'income' ? 'invoice' : 'bill'}?`, 'This removes it from ledger and reports but keeps the audit trail.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Void', style: 'destructive', onPress: () => { setDetailTx(null); onVoid(tx); } },
          ]);
        }}
        onMarkSent={(tx) => {
          onMarkSent(tx);
          setDetailTx(null);
        }}
        onVoidPayment={onVoidPayment}
      />
      <CreditApplicationModal
        open={!!applyCreditTx}
        data={data}
        type={type}
        creditNote={applyCreditTx}
        openInvoices={openInvoices}
        onClose={() => setApplyCreditTx(null)}
        onSave={(allocations) => {
          onApplyCredit(allocations);
          setApplyCreditTx(null);
        }}
      />
      <RecurringModal
        open={recurringOpen}
        data={data}
        type={type}
        template={editingTemplate}
        onClose={() => setRecurringOpen(false)}
        onSave={(template) => {
          onSaveRecurring(template);
          setRecurringOpen(false);
        }}
      />
    </>
  );
}

function filterLabel(filter: InvoiceFilter) {
  if (filter === 'partial') return 'Partially Paid';
  if (filter === 'unpaid') return 'Unpaid';
  return filter[0].toUpperCase() + filter.slice(1);
}

function CreditNoteRow({ data, tx, type, onApply }: {
  data: LedgerData;
  tx: Transaction;
  type: Extract<TransactionType, 'income' | 'expense'>;
  onApply?: (tx: Transaction) => void;
}) {
  const total = txTotal(tx, data);
  const remaining = creditNoteBalance(tx, data);
  const party = contactName(data, tx.contactId, tx.party) || (type === 'income' ? 'Customer' : 'Supplier');
  const docNo = tx.creditNoteNo || (type === 'income' ? 'Credit Note' : 'Supplier Credit');
  const applied = +(total - remaining).toFixed(2);
  return (
    <ListRow
      icon="CN"
      color={type === 'income' ? colors.purple : colors.orange}
      title={party}
      subtitle={`${docNo} · ${tx.date} · ${remaining > 0.005 ? 'Available' : 'Fully Applied'}`}
      right={
        <View style={styles.rightBox}>
          <Text style={styles.totalText}>{fmtMoney(total)}</Text>
          <Text style={styles.paidText}>Applied {fmtMoney(applied)}</Text>
          <Text style={[styles.balanceText, remaining > 0.005 && styles.green]}>Remaining {fmtMoney(remaining)}</Text>
          {onApply ? (
            <ActionButton tone={type === 'income' ? 'green' : 'blue'} onPress={() => onApply(tx)}>Apply</ActionButton>
          ) : null}
        </View>
      }
    />
  );
}

function InvoiceRow({ data, tx, type, onOpen, onPay, onVoidPayment }: {
  data: LedgerData;
  tx: Transaction;
  type: Extract<TransactionType, 'income' | 'expense'>;
  onOpen: (tx: Transaction) => void;
  onPay: (tx: Transaction) => void;
  onVoidPayment: (tx: Transaction, paymentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = getCategory(data, tx.categoryId);
  const status = invoiceStatus(tx, data);
  const total = txTotal(tx, data);
  const paid = txPaid(tx);
  const balance = txBalance(tx, data);
  const party = contactName(data, tx.contactId, tx.party) || (type === 'income' ? 'Customer' : 'Supplier');
  const subtitle = `${tx.recurringTemplateId ? '↻ ' : ''}${tx.invoiceNo || 'No number'} · Due ${tx.dueDate || tx.date} · ${status.label}`;
  return (
    <View>
      <ListRow
        icon={cat?.icon || (type === 'income' ? '$' : 'B')}
        color={
          status.tone === 'overdue' ? colors.red :
          status.tone === 'draft' ? colors.muted :
          status.tone === 'sent' ? colors.blue :
          status.tone === 'viewed' ? colors.purple :
          type === 'income' ? colors.green : colors.orange
        }
        title={party}
        subtitle={subtitle}
        right={
          <View style={styles.rightBox}>
            <Text style={styles.totalText}>{fmtMoney(total)}</Text>
            <Text style={styles.paidText}>Paid {fmtMoney(paid)}</Text>
            <Text style={[styles.balanceText, balance > 0.005 && (type === 'income' ? styles.green : styles.red)]}>Bal {fmtMoney(balance)}</Text>
            <View style={styles.rowActions}>
              <Pressable style={styles.miniBtn} onPress={() => onOpen(tx)}><Text style={styles.miniText}>View</Text></Pressable>
              {(tx.payments || []).length ? <Pressable style={styles.miniBtn} onPress={() => setExpanded(!expanded)}><Text style={styles.miniText}>Payments</Text></Pressable> : null}
            </View>
            {balance > 0.005 ? <ActionButton tone={type === 'income' ? 'green' : 'blue'} onPress={() => onPay(tx)}>{type === 'income' ? 'Receive' : 'Pay'}</ActionButton> : null}
          </View>
        }
        onPress={() => onOpen(tx)}
      />
      {expanded ? <PaymentHistory data={data} tx={tx} onVoidPayment={(p) => onVoidPayment(tx, p.id)} /> : null}
    </View>
  );
}

function PaymentHistory({ data, tx, onReceipt, onVoidPayment }: {
  data: LedgerData;
  tx: Transaction;
  onReceipt?: (payment: InvoicePayment) => void;
  onVoidPayment?: (payment: InvoicePayment) => void;
}) {
  const payments = tx.payments || [];
  if (!payments.length) {
    return <View style={styles.detailPanel}><Text style={styles.emptySmall}>No payments recorded</Text></View>;
  }
  return (
    <View style={styles.detailPanel}>
      {payments.map((payment) => {
        const account = getAccount(data, payment.accountId);
        const voided = !!payment.voidedAt;
        const locked = isDateLocked(data, payment.date);
        return (
          <View key={payment.id} style={styles.paymentLine}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.paymentText, voided && styles.paymentVoided]}>
                {payment.date} · {account?.name || 'Account'}{voided ? ' · VOIDED' : ''}
              </Text>
            </View>
            <Text style={[styles.paymentAmount, voided && styles.paymentVoided]}>{fmtMoney(payment.amount)}</Text>
            {onReceipt && !voided ? (
              <Pressable style={styles.miniBtn} onPress={() => onReceipt(payment)}>
                <Text style={styles.miniText}>Receipt</Text>
              </Pressable>
            ) : null}
            {onVoidPayment && !voided && !locked ? (
              <Pressable style={styles.miniBtn} onPress={() => {
                Alert.alert(
                  'Void this payment?',
                  `${fmtMoney(payment.amount)} on ${payment.date} will be reversed. This cannot be undone.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Void', style: 'destructive', onPress: () => onVoidPayment(payment) },
                  ]
                );
              }}>
                <Text style={[styles.miniText, styles.voidText]}>Void</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function statusChipStyle(tone: string) {
  if (tone === 'paid') return { bg: '#3D7856', text: '#FFFFFF' };
  if (tone === 'overdue') return { bg: '#8A4A3A', text: '#FFFFFF' };
  if (tone === 'sent') return { bg: '#4A5568', text: '#FFFFFF' };
  if (tone === 'viewed') return { bg: '#6B5B95', text: '#FFFFFF' };
  return { bg: '#E0DDD8', text: '#6A6560' };
}

function InvoiceDetailModal({ open, data, tx, type, onClose, onEdit, onPay, onVoid, onMarkSent, onVoidPayment }: {
  open: boolean;
  data: LedgerData;
  tx: Transaction | null;
  type: Extract<TransactionType, 'income' | 'expense'>;
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onPay: (tx: Transaction) => void;
  onVoid: (tx: Transaction) => void;
  onMarkSent: (tx: Transaction) => void;
  onVoidPayment: (tx: Transaction, paymentId: string) => void;
}) {
  const [printOpen, setPrintOpen] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<InvoicePayment | null>(null);
  if (!tx) return null;
  const party = contactName(data, tx.contactId, tx.party) || (type === 'income' ? 'Customer' : 'Supplier');
  const status = invoiceStatus(tx, data);
  const total = txTotal(tx, data);
  const paid = txPaid(tx);
  const balance = txBalance(tx, data);
  const gst = txGst(tx, data);
  const journal = txJournalEntry(tx, data);
  const chip = statusChipStyle(status.tone);
  const canMarkSent = type === 'income' && (tx.docStatus === undefined || tx.docStatus === 'draft');
  return (
    <Modal visible={open} animationType="slide">
      <ScrollView style={styles.detailScreen} contentContainerStyle={styles.detailBody}>
        <View style={styles.detailTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.detailTitleRow}>
              <Text style={styles.detailTitle}>{tx.invoiceNo || (type === 'income' ? 'Invoice' : 'Bill')}</Text>
              <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
                <Text style={[styles.statusChipText, { color: chip.text }]}>{status.label}</Text>
              </View>
            </View>
            <Text style={styles.detailSub}>{party}</Text>
          </View>
          <ActionButton tone="gray" onPress={onClose}>Close</ActionButton>
        </View>
        <Card>
          <View style={styles.metricGrid}>
            <View><Text style={styles.muted}>Total</Text><Text style={styles.totalLarge}>{fmtMoney(total)}</Text></View>
            <View><Text style={styles.muted}>Paid</Text><Text style={styles.blueText}>{fmtMoney(paid)}</Text></View>
            <View><Text style={styles.muted}>Balance</Text><Text style={balance > 0.005 ? (type === 'income' ? styles.greenText : styles.redText) : styles.blueText}>{fmtMoney(balance)}</Text></View>
          </View>
        </Card>
        <SectionTitle>Document</SectionTitle>
        <View style={styles.detailCard}>
          <DetailLine label={type === 'income' ? 'Customer' : 'Supplier'} value={party} />
          <DetailLine label="Issue Date" value={tx.date} />
          <DetailLine label="Due Date" value={tx.dueDate || tx.date} />
          <DetailLine label={type === 'income' ? 'Revenue Account' : 'Expense Account'} value={chartAccountName(data, tx.chartAccountId)} />
          <DetailLine label={type === 'income' ? 'Receivable Account' : 'Payable Account'} value={chartAccountName(data, tx.clearingChartAccountId)} />
          <DetailLine label="GST" value={gst ? fmtMoney(gst) : 'None'} />
          {tx.note ? <DetailLine label="Note" value={tx.note} /> : null}
        </View>
        <SectionTitle>Payments</SectionTitle>
        <View style={styles.wrap}>
          <PaymentHistory
            data={data}
            tx={tx}
            onReceipt={type === 'income' ? setReceiptPayment : undefined}
            onVoidPayment={(p) => onVoidPayment(tx, p.id)}
          />
        </View>
        <SectionTitle>Journal Impact</SectionTitle>
        <View style={styles.detailCard}>
          {journal?.lines.length ? journal.lines.map((line, index) => (
            <View key={`${line.chartAccountId}_${index}`} style={styles.journalLine}>
              <Text style={styles.journalAccount}>{chartAccountName(data, line.chartAccountId)}</Text>
              <Text style={styles.journalAmount}>Dr {line.debit ? fmtMoney(line.debit) : '-'}</Text>
              <Text style={styles.journalAmount}>Cr {line.credit ? fmtMoney(line.credit) : '-'}</Text>
            </View>
          )) : <Text style={styles.emptySmall}>No journal entry</Text>}
        </View>
        <View style={styles.detailActions}>
          <ActionButton onPress={() => onEdit(tx)}>Edit</ActionButton>
          {canMarkSent ? <ActionButton onPress={() => onMarkSent(tx)}>Mark as Sent</ActionButton> : null}
          <ActionButton tone="gray" onPress={() => setPrintOpen(true)}>Print View</ActionButton>
          {balance > 0.005 ? <ActionButton tone={type === 'income' ? 'green' : 'blue'} onPress={() => onPay(tx)}>{type === 'income' ? 'Receive' : 'Pay'}</ActionButton> : null}
          <ActionButton tone="red" onPress={() => onVoid(tx)}>Void</ActionButton>
        </View>
        <ReceiptModal open={!!receiptPayment} data={data} tx={tx} payment={receiptPayment} onClose={() => setReceiptPayment(null)} />
        <InvoicePrintModal open={printOpen} data={data} tx={tx} type={type} onClose={() => setPrintOpen(false)} />
      </ScrollView>
    </Modal>
  );
}

function ReceiptModal({ open, data, tx, payment, onClose }: {
  open: boolean;
  data: LedgerData;
  tx: Transaction | null;
  payment: InvoicePayment | null;
  onClose: () => void;
}) {
  if (!tx || !payment) return null;
  const profile = data.settings.businessProfile;
  const party = contactName(data, tx.contactId, tx.party) || 'Customer';
  const contact = (data.contacts || []).find((item) => item.id === tx.contactId);
  const account = getAccount(data, payment.accountId);
  const receiptRef = payment.receiptNo || `REC-${payment.id.slice(-6).toUpperCase()}`;
  return (
    <Modal visible={open} animationType="slide">
      <ScrollView style={styles.printScreen} contentContainerStyle={styles.printBody}>
        <View style={styles.printToolbar}>
          <Text style={styles.printToolbarText}>Payment Receipt</Text>
          <ActionButton tone="gray" onPress={onClose}>Close</ActionButton>
        </View>
        <View style={styles.printPage}>
          <View style={styles.printHeader}>
            <View style={styles.brandRow}>
              <View style={styles.printLogo}>
                {profile.logoUri ? <Image source={{ uri: profile.logoUri }} style={styles.printLogoImage} resizeMode="contain" /> : <Text style={styles.printLogoText}>{profile.logoText || profile.name?.slice(0, 1) || 'A'}</Text>}
              </View>
              <View>
                <Text style={styles.printBusiness}>{profile.name}</Text>
                {profile.abn ? <Text style={styles.printMuted}>ABN {profile.abn}</Text> : null}
                {profile.address ? <Text style={styles.printMuted}>{profile.address}</Text> : null}
                {profile.email || profile.phone ? <Text style={styles.printMuted}>{[profile.email, profile.phone].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            </View>
            <View style={styles.printDocBox}>
              <Text style={styles.printHeading}>RECEIPT</Text>
              <Text style={styles.printMuted}>{receiptRef}</Text>
            </View>
          </View>
          <View style={styles.printMetaGrid}>
            <View>
              <Text style={styles.printLabel}>Received From</Text>
              <Text style={styles.printStrong}>{party}</Text>
              {contact?.abn ? <Text style={styles.printMuted}>ABN {contact.abn}</Text> : null}
              {contact?.address ? <Text style={styles.printMuted}>{contact.address}</Text> : null}
              {contact?.email ? <Text style={styles.printMuted}>{contact.email}</Text> : null}
            </View>
            <View style={styles.printDates}>
              <DetailLine label="Receipt Date" value={payment.date} />
              <DetailLine label="Generated" value={(payment.receiptCreatedAt || payment.date).slice(0, 10)} />
              <DetailLine label="Invoice" value={tx.invoiceNo || '—'} />
              <DetailLine label="Account" value={account?.name || '—'} />
            </View>
          </View>
          <View style={styles.printTable}>
            <View style={styles.printTableHead}>
              <Text style={[styles.printCell, styles.printDesc]}>Description</Text>
              <Text style={styles.printCell}>Amount</Text>
            </View>
            <View style={styles.printTableRow}>
              <Text style={[styles.printCell, styles.printDesc]}>
                {tx.note || (tx.invoiceNo ? `Payment for ${tx.invoiceNo}` : 'Payment received')}
              </Text>
              <Text style={styles.printCell}>{fmtMoney(payment.amount)}</Text>
            </View>
          </View>
          <View style={styles.printTotals}>
            <PrintTotal label="Amount Received" value={fmtMoney(payment.amount)} strong />
          </View>
          {profile.invoiceFooter ? <Text style={styles.printFooter}>{profile.invoiceFooter}</Text> : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

function InvoicePrintModal({ open, data, tx, type, onClose }: {
  open: boolean;
  data: LedgerData;
  tx: Transaction;
  type: Extract<TransactionType, 'income' | 'expense'>;
  onClose: () => void;
}) {
  const profile = data.settings.businessProfile;
  const party = contactName(data, tx.contactId, tx.party) || (type === 'income' ? 'Customer' : 'Supplier');
  const contact = (data.contacts || []).find((item) => item.id === tx.contactId);
  const gst = txGst(tx, data);
  const total = txTotal(tx, data);
  const subtotal = +(total - gst).toFixed(2);
  const paid = txPaid(tx);
  const balance = txBalance(tx, data);
  const heading = type === 'income' ? 'TAX INVOICE' : 'BILL';
  return (
    <Modal visible={open} animationType="slide">
      <ScrollView style={styles.printScreen} contentContainerStyle={styles.printBody}>
        <View style={styles.printToolbar}>
          <Text style={styles.printToolbarText}>Print-ready view</Text>
          <ActionButton tone="gray" onPress={onClose}>Close</ActionButton>
        </View>
        <View style={styles.printPage}>
          <View style={styles.printHeader}>
            <View style={styles.brandRow}>
              <View style={styles.printLogo}>
                {profile.logoUri ? <Image source={{ uri: profile.logoUri }} style={styles.printLogoImage} resizeMode="contain" /> : <Text style={styles.printLogoText}>{profile.logoText || profile.name.slice(0, 1) || 'A'}</Text>}
              </View>
              <View>
                <Text style={styles.printBusiness}>{profile.name}</Text>
                {profile.abn ? <Text style={styles.printMuted}>ABN {profile.abn}</Text> : null}
                {profile.address ? <Text style={styles.printMuted}>{profile.address}</Text> : null}
                {profile.email || profile.phone ? <Text style={styles.printMuted}>{[profile.email, profile.phone].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            </View>
            <View style={styles.printDocBox}>
              <Text style={styles.printHeading}>{heading}</Text>
              <Text style={styles.printMuted}>{tx.invoiceNo || 'No number'}</Text>
            </View>
          </View>
          <View style={styles.printMetaGrid}>
            <View>
              <Text style={styles.printLabel}>{type === 'income' ? 'Bill To' : 'Supplier'}</Text>
              <Text style={styles.printStrong}>{party}</Text>
              {contact?.abn ? <Text style={styles.printMuted}>ABN {contact.abn}</Text> : null}
              {contact?.address ? <Text style={styles.printMuted}>{contact.address}</Text> : null}
              {contact?.email ? <Text style={styles.printMuted}>{contact.email}</Text> : null}
            </View>
            <View style={styles.printDates}>
              <DetailLine label="Issue Date" value={tx.date} />
              <DetailLine label="Due Date" value={tx.dueDate || tx.date} />
              <DetailLine label="Terms" value={tx.paymentTerms || 'due_on_receipt'} />
            </View>
          </View>
          <View style={styles.printTable}>
            <View style={styles.printTableHead}>
              <Text style={[styles.printCell, styles.printDesc]}>Description</Text>
              <Text style={styles.printCell}>Amount</Text>
            </View>
            <View style={styles.printTableRow}>
              <Text style={[styles.printCell, styles.printDesc]}>{tx.note || chartAccountName(data, tx.chartAccountId)}</Text>
              <Text style={styles.printCell}>{fmtMoney(subtotal)}</Text>
            </View>
          </View>
          <View style={styles.printTotals}>
            <PrintTotal label="Subtotal" value={fmtMoney(subtotal)} />
            <PrintTotal label="GST" value={fmtMoney(gst)} />
            <PrintTotal label="Total" value={fmtMoney(total)} strong />
            <PrintTotal label="Paid" value={fmtMoney(paid)} />
            <PrintTotal label="Balance Due" value={fmtMoney(balance)} strong />
          </View>
          {profile.paymentInstructions ? (
            <View style={styles.printNote}>
              <Text style={styles.printLabel}>Payment Instructions</Text>
              <Text style={styles.printMuted}>{profile.paymentInstructions}</Text>
            </View>
          ) : null}
          {profile.invoiceFooter ? <Text style={styles.printFooter}>{profile.invoiceFooter}</Text> : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

function PrintTotal({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.printTotalLine}>
      <Text style={[styles.printTotalLabel, strong && styles.printTotalStrong]}>{label}</Text>
      <Text style={[styles.printTotalValue, strong && styles.printTotalStrong]}>{value}</Text>
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ContactLedger({ data, type, title, invoices, selectedContactId, onSelect, onEdit, onPay, onAllocate, onSaveContact, onOpenDetail, onVoidPayment }: {
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  title: string;
  invoices: Transaction[];
  selectedContactId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (tx: Transaction) => void;
  onPay: (tx: Transaction) => void;
  onAllocate: (allocations: PaymentAllocation[]) => void;
  onSaveContact: (contact: Contact) => void;
  onOpenDetail: (tx: Transaction) => void;
  onVoidPayment: (tx: Transaction, paymentId: string) => void;
}) {
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [detailView, setDetailView] = useState<ContactDetailView>('items');
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const [receiptState, setReceiptState] = useState<{ tx: Transaction; payment: InvoicePayment } | null>(null);
  const contacts = (data.contacts || [])
    .filter((contact) => !contact.archivedAt && (type === 'income' ? contact.type === 'customer' || contact.type === 'both' : contact.type === 'supplier' || contact.type === 'both'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selected = contacts.find((contact) => contact.id === selectedContactId) || null;

  if (selected) {
    const allContactTx = data.transactions
      .filter((tx) => (isInvoice(tx) || isCreditNote(tx)) && tx.type === type && tx.contactId === selected.id)
      .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
    const contactInvoices = allContactTx.filter((tx) => isInvoice(tx));
    const open = contactInvoices.filter((tx) => txBalance(tx, data) > 0.005);
    const paid = contactInvoices.reduce((sum, tx) => sum + txPaid(tx), 0);
    const balance = open.reduce((sum, tx) => sum + txBalance(tx, data), 0);
    const overdue = open.filter((tx) => invoiceStatus(tx, data).tone === 'overdue');
    return (
      <>
        <Pressable style={styles.backLink} onPress={() => onSelect(null)}><Text style={styles.backText}>Back to {title}</Text></Pressable>
        <Card>
          <Text style={styles.contactName}>{selected.name}</Text>
          <Text style={styles.contactMeta}>{selected.abn ? `ABN ${selected.abn} · ` : ''}{selected.email || selected.phone || selected.paymentTerms}</Text>
          <View style={styles.ledgerStats}>
            <View><Text style={styles.muted}>Outstanding</Text><Text style={type === 'income' ? styles.greenText : styles.redText}>{fmtMoney(balance)}</Text></View>
            <View><Text style={styles.muted}>Paid</Text><Text style={styles.blueText}>{fmtMoney(paid)}</Text></View>
            <View><Text style={styles.muted}>Overdue</Text><Text style={styles.redText}>{overdue.length}</Text></View>
          </View>
          {open.length ? (
            <View style={styles.allocAction}>
              <ActionButton tone={type === 'income' ? 'green' : 'blue'} onPress={() => setAllocationOpen(true)}>{type === 'income' ? 'Receive Payment' : 'Pay Supplier'}</ActionButton>
            </View>
          ) : null}
        </Card>
        <View style={styles.detailSegment}>
          {(['items', 'statement'] as ContactDetailView[]).map((item) => (
            <Pressable key={item} style={[styles.segBtn, detailView === item && styles.segActive]} onPress={() => setDetailView(item)}>
              <Text>{item === 'items' ? 'Items' : 'Statement'}</Text>
            </Pressable>
          ))}
        </View>
        {detailView === 'items' ? (
          <>
            <SectionTitle>Open</SectionTitle>
            <View style={styles.wrap}>
              {open.length ? open.map((tx) => <InvoiceRow key={tx.id} data={data} tx={tx} type={type} onOpen={onOpenDetail} onPay={onPay} onVoidPayment={onVoidPayment} />) : <Text style={styles.empty}>No open items</Text>}
            </View>
            <SectionTitle>Closed</SectionTitle>
            <View style={styles.wrap}>
              {contactInvoices.filter((tx) => txBalance(tx, data) <= 0.005).length
                ? contactInvoices.filter((tx) => txBalance(tx, data) <= 0.005).map((tx) => <InvoiceRow key={tx.id} data={data} tx={tx} type={type} onOpen={onOpenDetail} onPay={onPay} onVoidPayment={onVoidPayment} />)
                : <Text style={styles.empty}>No closed items</Text>}
            </View>
          </>
        ) : (
          <StatementView
            data={data}
            type={type}
            invoices={allContactTx}
            from={statementFrom}
            to={statementTo}
            onFromChange={setStatementFrom}
            onToChange={setStatementTo}
            onReceipt={type === 'income' ? (tx, payment) => setReceiptState({ tx, payment }) : undefined}
          />
        )}
        <AllocationModal
          open={allocationOpen}
          data={data}
          type={type}
          contact={selected}
          openInvoices={open}
          onClose={() => setAllocationOpen(false)}
          onSave={(allocations) => {
            onAllocate(allocations);
            setAllocationOpen(false);
          }}
        />
        <ReceiptModal
          open={!!receiptState}
          data={data}
          tx={receiptState?.tx || null}
          payment={receiptState?.payment || null}
          onClose={() => setReceiptState(null)}
        />
      </>
    );
  }

  return (
    <>
      <ListRow
        title={`Add ${type === 'income' ? 'Customer' : 'Supplier'}`}
        subtitle={`Create a new ${type === 'income' ? 'customer' : 'supplier'} master record`}
        icon="+"
        color={colors.green}
        onPress={() => setContactOpen(true)}
      />
      <SectionTitle>{title}</SectionTitle>
      <View style={styles.wrap}>
        {contacts.length ? contacts.map((contact) => (
          <ContactRow key={contact.id} data={data} type={type} contact={contact} invoices={invoices} onPress={() => onSelect(contact.id)} />
        )) : <Text style={styles.empty}>No {title.toLowerCase()} yet</Text>}
      </View>
      <ContactModal
        open={contactOpen}
        contact={null}
        defaultType={type === 'income' ? 'customer' : 'supplier'}
        onClose={() => setContactOpen(false)}
        onSave={(contact) => {
          onSaveContact(contact);
          setContactOpen(false);
        }}
      />
    </>
  );
}

type StatementRow = {
  id: string;
  date: string;
  label: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  paymentId?: string;
  txId?: string;
};

function StatementView({ data, type, invoices, from, to, onFromChange, onToChange, onReceipt }: {
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  invoices: Transaction[];
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onReceipt?: (tx: Transaction, payment: InvoicePayment) => void;
}) {
  const rows = buildStatementRows(data, type, invoices);
  const opening = rows
    .filter((row) => from && row.date < from)
    .reduce((balance, row) => row.balance, 0);
  const visible = rows.filter((row) => (!from || row.date >= from) && (!to || row.date <= to));
  const party = contactName(data, invoices[0]?.contactId, invoices[0]?.party) || (type === 'income' ? 'customer' : 'supplier');
  const fileParty = party.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || (type === 'income' ? 'customer' : 'supplier');
  return (
    <>
      <View style={styles.creditHeader}>
        <SectionTitle>Statement</SectionTitle>
        <Pressable
          style={styles.miniBtn}
          onPress={() => shareCsv(`${type === 'income' ? 'customer' : 'supplier'}-statement-${fileParty}-${todayStr()}.csv`, buildStatementCsv(type, party, from, to, opening, visible))}
        >
          <Text style={styles.miniText}>Export CSV</Text>
        </Pressable>
      </View>
      <View style={styles.dateGrid}>
        <TextInput style={styles.dateInput} value={from} onChangeText={onFromChange} placeholder="From YYYY-MM-DD" />
        <TextInput style={styles.dateInput} value={to} onChangeText={onToChange} placeholder="To YYYY-MM-DD" />
      </View>
      <View style={styles.statementHeader}>
        <Text style={styles.statementHeadText}>Date / Ref</Text>
        <Text style={styles.statementHeadText}>Debit</Text>
        <Text style={styles.statementHeadText}>Credit</Text>
        <Text style={styles.statementHeadText}>Balance</Text>
      </View>
      <View style={styles.wrap}>
        {from ? (
          <View style={styles.statementRow}>
            <View style={styles.statementBody}>
              <Text style={styles.statementTitle}>{from}</Text>
              <Text style={styles.statementSub}>Opening balance</Text>
            </View>
            <Text style={styles.statementAmount}>-</Text>
            <Text style={styles.statementAmount}>-</Text>
            <Text style={styles.statementBalance}>{fmtMoney(opening)}</Text>
          </View>
        ) : null}
        {visible.length ? visible.map((row) => (
          <View key={row.id} style={styles.statementRow}>
            <View style={styles.statementBody}>
              <Text style={styles.statementTitle}>{row.date}</Text>
              <Text style={styles.statementSub}>{row.reference} · {row.label}</Text>
              {row.paymentId && row.txId && onReceipt ? (
                <Pressable onPress={() => {
                  const txFound = invoices.find((t) => t.id === row.txId);
                  const payFound = txFound?.payments?.find((p) => p.id === row.paymentId);
                  if (txFound && payFound) onReceipt(txFound, payFound);
                }}>
                  <Text style={styles.receiptLink}>View Receipt</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.statementAmount}>{row.debit ? fmtMoney(row.debit) : '-'}</Text>
            <Text style={styles.statementAmount}>{row.credit ? fmtMoney(row.credit) : '-'}</Text>
            <Text style={styles.statementBalance}>{fmtMoney(row.balance)}</Text>
          </View>
        )) : <Text style={styles.empty}>No statement activity</Text>}
      </View>
    </>
  );
}

function buildStatementCsv(type: Extract<TransactionType, 'income' | 'expense'>, party: string, from: string, to: string, opening: number, rows: StatementRow[]) {
  const headers = ['Date', 'Party', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
  const body = rows.map((row) => [row.date, party, row.reference, row.label, row.debit, row.credit, row.balance]);
  if (from) {
    body.unshift([from, party, '', `Opening ${type === 'income' ? 'receivable' : 'payable'} balance${to ? ` to ${to}` : ''}`, '', '', opening]);
  }
  return toCsv(headers, body);
}

function buildStatementRows(data: LedgerData, type: Extract<TransactionType, 'income' | 'expense'>, invoices: Transaction[]): StatementRow[] {
  const rows: Array<Omit<StatementRow, 'balance'>> = [];
  const invoiceIds = new Set(invoices.map((tx) => tx.id));
  for (const tx of invoices) {
    if (isCreditNote(tx)) {
      const total = txTotal(tx, data);
      rows.push({
        id: `tx_${tx.id}`,
        date: tx.date,
        label: type === 'income' ? 'Credit note issued' : 'Supplier credit received',
        reference: tx.creditNoteNo || 'No number',
        debit: type === 'income' ? 0 : total,
        credit: type === 'income' ? total : 0,
      });
      for (const alloc of (data.creditAllocations || []).filter((a) => a.creditNoteId === tx.id)) {
        const invoice = data.transactions.find((t) => t.id === alloc.invoiceId);
        rows.push({
          id: `ca_${alloc.id}`,
          date: alloc.date,
          label: `Credit applied to ${invoice?.invoiceNo || alloc.invoiceId}`,
          reference: tx.creditNoteNo || 'CN',
          debit: type === 'income' ? alloc.amount : 0,
          credit: type === 'income' ? 0 : alloc.amount,
        });
      }
      continue;
    }
    const total = txTotal(tx, data);
    rows.push({
      id: `tx_${tx.id}`,
      date: tx.date,
      label: type === 'income' ? 'Invoice issued' : 'Bill received',
      reference: tx.invoiceNo || 'No number',
      debit: type === 'income' ? total : 0,
      credit: type === 'income' ? 0 : total,
    });
    for (const payment of tx.payments || []) {
      if (payment.voidedAt) continue;
      const account = getAccount(data, payment.accountId);
      rows.push({
        id: `pay_${payment.id}`,
        date: payment.date,
        label: type === 'income' ? `Payment received${account ? ` to ${account.name}` : ''}` : `Payment made${account ? ` from ${account.name}` : ''}`,
        reference: tx.invoiceNo || 'No number',
        debit: type === 'income' ? 0 : payment.amount,
        credit: type === 'income' ? payment.amount : 0,
        paymentId: payment.id,
        txId: tx.id,
      });
    }
    for (const alloc of (data.creditAllocations || []).filter((a) => a.invoiceId === tx.id && !invoiceIds.has(a.creditNoteId))) {
      rows.push({
        id: `ca_inv_${alloc.id}`,
        date: alloc.date,
        label: type === 'income' ? 'Credit note applied' : 'Supplier credit applied',
        reference: tx.invoiceNo || 'No number',
        debit: type === 'income' ? 0 : alloc.amount,
        credit: type === 'income' ? alloc.amount : 0,
      });
    }
  }
  let balance = 0;
  return rows
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((row) => {
      balance = +(balance + (type === 'income' ? row.debit - row.credit : row.credit - row.debit)).toFixed(2);
      return { ...row, balance };
    });
}

function ContactRow({ data, type, contact, invoices, onPress }: {
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  contact: Contact;
  invoices: Transaction[];
  onPress: () => void;
}) {
  const contactInvoices = invoices.filter((tx) => tx.contactId === contact.id);
  const open = contactInvoices.filter((tx) => txBalance(tx, data) > 0.005);
  const balance = open.reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const overdue = open.filter((tx) => invoiceStatus(tx, data).tone === 'overdue').length;
  return (
    <ListRow
      icon={type === 'income' ? 'C' : 'S'}
      color={type === 'income' ? colors.blue : colors.orange}
      title={contact.name}
      subtitle={`${open.length} open · ${overdue} overdue · ${contact.paymentTerms}`}
      right={<Text style={[styles.totalText, balance > 0.005 && (type === 'income' ? styles.green : styles.red)]}>{fmtMoney(balance)}</Text>}
      onPress={onPress}
    />
  );
}

function CreditApplicationModal({ open, data, type, creditNote, openInvoices, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  creditNote: Transaction | null;
  openInvoices: Transaction[];
  onClose: () => void;
  onSave: (allocations: CreditNoteAllocation[]) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDate(todayStr());
    setLines({});
  }, [open]);

  if (!creditNote) return null;
  const cn = creditNote;
  const cnBalance = creditNoteBalance(cn, data);
  const allocated = Object.values(lines).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const remaining = +(cnBalance - allocated).toFixed(2);

  function autoAllocate() {
    let avail = cnBalance;
    const next: Record<string, string> = {};
    for (const tx of openInvoices) {
      const bal = txBalance(tx, data);
      const value = Math.min(bal, avail);
      if (value > 0.005) next[tx.id] = value.toFixed(2);
      avail = +(avail - value).toFixed(2);
      if (avail <= 0.005) break;
    }
    setLines(next);
  }

  function submit() {
    if (allocated <= 0.005) { Alert.alert('No allocation', 'Allocate the credit to at least one invoice.'); return; }
    if (allocated - cnBalance > 0.005) { Alert.alert('Over allocated', `Cannot apply more than remaining balance ${fmtMoney(cnBalance)}.`); return; }
    const over = openInvoices.find((tx) => (Number(lines[tx.id]) || 0) - txBalance(tx, data) > 0.005);
    if (over) {
      Alert.alert('Over invoice balance', `${over.invoiceNo || over.id} has only ${fmtMoney(txBalance(over, data))} outstanding.`);
      return;
    }
    const allocations: CreditNoteAllocation[] = openInvoices.flatMap((tx) => {
      const value = Number(lines[tx.id]) || 0;
      if (value <= 0.005) return [];
      return [{ creditNoteId: cn.id, invoiceId: tx.id, amount: +value.toFixed(2), date: date || todayStr() }];
    });
    if (allocations.length) onSave(allocations);
  }

  const docNo = cn.creditNoteNo || (type === 'income' ? 'Credit Note' : 'Supplier Credit');
  const party = contactName(data, cn.contactId, cn.party) || '';
  return (
    <Modal visible={open} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Text style={styles.modalTitle}>Apply {type === 'income' ? 'Credit Note' : 'Supplier Credit'}</Text>
            <Text style={styles.contactMeta}>{docNo}{party ? ` · ${party}` : ''} · Available {fmtMoney(cnBalance)}</Text>
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Application date YYYY-MM-DD" />
            <View style={styles.allocHeader}>
              <Text style={styles.fieldLabel}>Apply to {type === 'income' ? 'Invoices' : 'Bills'}</Text>
              <Pressable style={styles.miniBtn} onPress={autoAllocate}><Text style={styles.miniText}>Auto allocate</Text></Pressable>
            </View>
            {openInvoices.length ? openInvoices.map((tx) => (
              <View key={tx.id} style={styles.allocLine}>
                <View style={styles.allocBody}>
                  <Text style={styles.allocTitle}>{tx.invoiceNo || 'No number'}</Text>
                  <Text style={styles.allocSub}>{contactName(data, tx.contactId, tx.party) || '—'} · Balance {fmtMoney(txBalance(tx, data))}</Text>
                </View>
                <TextInput
                  style={styles.allocInput}
                  value={lines[tx.id] || ''}
                  onChangeText={(value) => setLines((current) => ({ ...current, [tx.id]: value }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            )) : <Text style={styles.emptySmall}>No open {type === 'income' ? 'invoices' : 'bills'} to apply to</Text>}
            <View style={styles.allocTotals}>
              <Text style={styles.paymentText}>Allocated {fmtMoney(allocated)}</Text>
              <Text style={[styles.paymentAmount, Math.abs(remaining) > 0.005 && styles.green]}>Remaining {fmtMoney(remaining)}</Text>
            </View>
            <ActionButton tone={type === 'income' ? 'green' : 'blue'} onPress={submit}>Apply Credit</ActionButton>
            <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function frequencyLabel(freq: RecurringFrequency) {
  const labels: Record<RecurringFrequency, string> = {
    weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
  };
  return labels[freq] || freq;
}

function RecurringRow({ data, type, template, onEdit, onToggle, onDelete }: {
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  template: RecurringTemplate;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const party = contactName(data, template.contactId, template.party);
  const label = template.note || (type === 'income' ? 'Recurring Invoice' : 'Recurring Bill');
  const nextInfo = template.isActive ? `Next: ${template.nextDate}` : 'Paused';
  const subtitle = `${frequencyLabel(template.frequency)} · ${fmtMoney(template.amount)}${party ? ` · ${party}` : ''} · ${nextInfo}`;
  return (
    <ListRow
      icon="↻"
      color={template.isActive ? (type === 'income' ? colors.green : colors.blue) : colors.muted}
      title={label}
      subtitle={subtitle}
      right={
        <View style={styles.rowActions}>
          <Pressable style={styles.miniBtn} onPress={onEdit}><Text style={styles.miniText}>Edit</Text></Pressable>
          <Pressable style={styles.miniBtn} onPress={onToggle}>
            <Text style={styles.miniText}>{template.isActive ? 'Pause' : 'Resume'}</Text>
          </Pressable>
          <Pressable style={styles.miniBtn} onPress={onDelete}>
            <Text style={[styles.miniText, styles.voidText]}>Delete</Text>
          </Pressable>
        </View>
      }
    />
  );
}

function AllocationModal({ open, data, type, contact, openInvoices, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  contact: Contact;
  openInvoices: Transaction[];
  onClose: () => void;
  onSave: (allocations: PaymentAllocation[]) => void;
}) {
  const defaultAccountId = data.accounts.find((account) => account.type === 'bank' || account.type === 'cash')?.id || data.accounts[0]?.id || '';
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [lines, setLines] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setDate(todayStr());
    setAccountId(defaultAccountId);
    setLines({});
  }, [defaultAccountId, open]);

  const allocated = Object.values(lines).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const paymentAmount = Number(amount) || 0;
  const unapplied = +(paymentAmount - allocated).toFixed(2);

  function autoAllocate() {
    let remaining = paymentAmount || openInvoices.reduce((sum, tx) => sum + txBalance(tx, data), 0);
    const next: Record<string, string> = {};
    for (const tx of openInvoices) {
      const balance = txBalance(tx, data);
      const value = Math.min(balance, remaining);
      if (value > 0.005) next[tx.id] = value.toFixed(2);
      remaining = +(remaining - value).toFixed(2);
    }
    if (!paymentAmount) setAmount(openInvoices.reduce((sum, tx) => sum + txBalance(tx, data), 0).toFixed(2));
    setLines(next);
  }

  function submit() {
    if (!paymentAmount || paymentAmount <= 0) { Alert.alert('Amount required', 'Enter the payment amount.'); return; }
    if (allocated <= 0.005) { Alert.alert('No allocation', 'Allocate the payment to at least one invoice or bill.'); return; }
    if (allocated - paymentAmount > 0.005) { Alert.alert('Over allocated', 'Allocated amount cannot exceed the payment amount.'); return; }
    const overBalance = openInvoices.find((tx) => (Number(lines[tx.id]) || 0) - txBalance(tx, data) > 0.005);
    if (overBalance) {
      Alert.alert('Over invoice balance', `${overBalance.invoiceNo || overBalance.id} has only ${fmtMoney(txBalance(overBalance, data))} outstanding.`);
      return;
    }
    const allocations = openInvoices.flatMap((tx) => {
      const value = Number(lines[tx.id]) || 0;
      if (value <= 0.005) return [];
      return [{ txId: tx.id, amount: +value.toFixed(2), date: date || todayStr(), accountId }];
    });
    if (allocations.length) onSave(allocations);
  }

  return (
    <Modal visible={open} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Text style={styles.modalTitle}>{type === 'income' ? 'Receive Payment' : 'Pay Supplier'}</Text>
            <Text style={styles.contactMeta}>{contact.name}</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Payment amount" keyboardType="decimal-pad" />
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Payment date YYYY-MM-DD" />
            <Text style={styles.fieldLabel}>Account</Text>
            <View style={styles.chipGrid}>
              {data.accounts.map((account) => (
                <Pressable key={account.id} style={[styles.chip, accountId === account.id && styles.chipSelected]} onPress={() => setAccountId(account.id)}>
                  <Text style={styles.chipText}>{account.icon} {account.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.allocHeader}>
              <Text style={styles.fieldLabel}>Allocation</Text>
              <Pressable style={styles.miniBtn} onPress={autoAllocate}><Text style={styles.miniText}>Auto allocate</Text></Pressable>
            </View>
            {openInvoices.map((tx) => (
              <View key={tx.id} style={styles.allocLine}>
                <View style={styles.allocBody}>
                  <Text style={styles.allocTitle}>{tx.invoiceNo || 'No number'}</Text>
                  <Text style={styles.allocSub}>Due {tx.dueDate || tx.date} · Balance {fmtMoney(txBalance(tx, data))}</Text>
                </View>
                <TextInput
                  style={styles.allocInput}
                  value={lines[tx.id] || ''}
                  onChangeText={(value) => setLines((current) => ({ ...current, [tx.id]: value }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
            <View style={styles.allocTotals}>
              <Text style={styles.paymentText}>Allocated {fmtMoney(allocated)}</Text>
              <Text style={[styles.paymentAmount, Math.abs(unapplied) > 0.005 && styles.red]}>Unapplied {fmtMoney(unapplied)}</Text>
            </View>
            <ActionButton tone={type === 'income' ? 'green' : 'blue'} onPress={submit}>{type === 'income' ? 'Receive' : 'Pay'}</ActionButton>
            <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  creditHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  segmentFlex: { flex: 1, flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 12, padding: 2 },
  detailSegment: { flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 12, padding: 2, marginBottom: 4 },
  muted: { color: colors.muted },
  greenText: { marginTop: 6, color: colors.green, fontSize: 20, fontWeight: '900' },
  redText: { marginTop: 6, color: colors.red, fontSize: 20, fontWeight: '900' },
  blueText: { marginTop: 6, color: colors.blue, fontSize: 20, fontWeight: '900' },
  totalLarge: { marginTop: 6, color: colors.text, fontSize: 20, fontWeight: '900' },
  segBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  segActive: { backgroundColor: '#F8F6F2' },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: '#E0DDD8', borderRadius: 12, padding: 6 },
  filterChip: { minWidth: '30%', flexGrow: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  filterText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  wrap: { overflow: 'hidden', borderRadius: 16 },
  rightBox: { alignItems: 'flex-end', gap: 2, maxWidth: 128 },
  totalText: { color: colors.text, fontWeight: '900', fontSize: 14 },
  paidText: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  balanceText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 32, backgroundColor: colors.card },
  emptySmall: { color: colors.muted, fontWeight: '700' },
  green: { color: colors.green },
  red: { color: colors.red },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' },
  miniBtn: { backgroundColor: '#E0DDD8', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 7 },
  miniText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  detailPanel: { backgroundColor: '#F8F6F2', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 6 },
  paymentLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  paymentText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  paymentAmount: { color: colors.text, fontSize: 12, fontWeight: '900' },
  paymentVoided: { textDecorationLine: 'line-through', opacity: 0.45 },
  voidText: { color: colors.red },
  detailScreen: { flex: 1, backgroundColor: colors.bg },
  detailBody: { padding: 16, gap: 12, paddingBottom: 28 },
  detailTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  detailTitle: { color: colors.text, fontSize: 28, fontWeight: '900' },
  detailSub: { marginTop: 3, color: colors.muted, fontWeight: '700' },
  statusChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'center' },
  statusChipText: { fontSize: 12, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  detailLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  detailLabel: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { flex: 1.5, color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  journalLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  journalAccount: { flex: 1.5, color: colors.text, fontSize: 12, fontWeight: '800' },
  journalAmount: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  detailActions: { gap: 10 },
  printScreen: { flex: 1, backgroundColor: '#D8D6D1' },
  printBody: { padding: 14, gap: 12, paddingBottom: 28 },
  printToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  printToolbarText: { color: colors.text, fontWeight: '900', fontSize: 16 },
  printPage: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
  printHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  brandRow: { flex: 1, flexDirection: 'row', gap: 12 },
  printLogo: { width: 46, height: 46, borderRadius: 8, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  printLogoImage: { width: '100%', height: '100%' },
  printLogoText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  printBusiness: { color: colors.text, fontSize: 20, fontWeight: '900' },
  printMuted: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 3 },
  printDocBox: { alignItems: 'flex-end' },
  printHeading: { color: colors.text, fontSize: 22, fontWeight: '900' },
  printMetaGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, paddingVertical: 18 },
  printLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  printStrong: { marginTop: 4, color: colors.text, fontSize: 15, fontWeight: '900' },
  printDates: { minWidth: 180 },
  printTable: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, borderRadius: 8, overflow: 'hidden' },
  printTableHead: { flexDirection: 'row', backgroundColor: '#EDEBE6', paddingVertical: 10, paddingHorizontal: 10 },
  printTableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 10, backgroundColor: '#FFFFFF' },
  printCell: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  printDesc: { flex: 2.4, textAlign: 'left' },
  printTotals: { marginTop: 14, alignSelf: 'flex-end', width: '58%', gap: 7 },
  printTotalLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  printTotalLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  printTotalValue: { color: colors.text, fontSize: 12, fontWeight: '900' },
  printTotalStrong: { color: colors.text, fontSize: 15 },
  printNote: { marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  printFooter: { marginTop: 18, color: colors.muted, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  backLink: { paddingVertical: 8 },
  backText: { color: colors.blue, fontWeight: '900' },
  contactName: { color: colors.text, fontSize: 22, fontWeight: '900' },
  contactMeta: { marginTop: 4, color: colors.muted, fontWeight: '700' },
  ledgerStats: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  allocAction: { marginTop: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetBody: { padding: 16, gap: 12 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  fieldLabel: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line },
  chipSelected: { borderColor: colors.blue, backgroundColor: '#E8EBF0' },
  chipText: { color: colors.text, fontWeight: '700' },
  allocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  allocLine: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8F6F2', borderRadius: 12, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  allocBody: { flex: 1, minWidth: 0 },
  allocTitle: { color: colors.text, fontWeight: '900' },
  allocSub: { marginTop: 3, color: colors.muted, fontSize: 12, fontWeight: '700' },
  allocInput: { width: 96, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: 10, textAlign: 'right', fontWeight: '800' },
  allocTotals: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  dateGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dateInput: { flex: 1, backgroundColor: '#F8F6F2', borderRadius: 12, padding: 12, fontSize: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  statementHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0DDD8', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, gap: 8, marginBottom: 8 },
  statementHeadText: { flex: 1, color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', textAlign: 'right' },
  statementRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 10, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  statementBody: { flex: 1.4, minWidth: 0 },
  statementTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  statementSub: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '700' },
  receiptLink: { marginTop: 4, color: colors.blue, fontSize: 11, fontWeight: '800' },
  statementAmount: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  statementBalance: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '900', textAlign: 'right' },
});
