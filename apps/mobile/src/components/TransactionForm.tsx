import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Header, colors } from './ui';
import { SelectField } from './SelectField';
import { chartAccountName, clearingAccountId, contactName, defaultChartAccountId, dueDateForTerms, formatCreditNumber, formatDocumentNumber, uid } from '../domain/accounting';
import type { EntryMode, GsmMode, LedgerData, PaymentTerms, Transaction, TransactionType } from '../domain/models';

export function TransactionForm({ open, data, tx, initialType, initialEntryMode, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  tx: Transaction | null;
  initialType?: TransactionType;
  initialEntryMode?: EntryMode;
  onClose: () => void;
  onSave: (tx: Transaction) => void;
}) {
  const [type, setType] = useState<TransactionType>(tx?.type || initialType || 'expense');
  const [entryMode, setEntryMode] = useState<EntryMode>(tx?.entryMode || initialEntryMode || 'cash');
  const [amount, setAmount] = useState(String(tx?.amount || ''));
  const [categoryId, setCategoryId] = useState(tx?.categoryId || data.categories.expense[0]?.id || '');
  const [chartAccountId, setChartAccountId] = useState(tx?.chartAccountId || defaultChartAccountId(data, tx?.type || 'expense', tx?.categoryId || data.categories.expense[0]?.id));
  const [accountId, setAccountId] = useState(tx?.accountId || data.accounts[0]?.id || '');
  const [accountToId, setAccountToId] = useState(tx?.accountToId || data.accounts[1]?.id || data.accounts[0]?.id || '');
  const [gstMode, setGstMode] = useState<GsmMode>(tx?.gstMode === undefined ? 'inc' : tx.gstMode);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(tx?.paymentTerms || 'net_30');
  const [dueDate, setDueDate] = useState(tx?.dueDate || dueDateForTerms(new Date().toISOString().slice(0, 10), 'net_30'));
  const [invoiceNo, setInvoiceNo] = useState(tx?.invoiceNo || '');
  const [creditNoteNo, setCreditNoteNo] = useState(tx?.creditNoteNo || '');
  const [contactId, setContactId] = useState(tx?.contactId || '');
  const [note, setNote] = useState(tx?.note || '');
  const [party, setParty] = useState(tx?.party || '');
  const [paidNow, setPaidNow] = useState('');

  useEffect(() => {
    if (!open) return;
    const nextType = tx?.type || initialType || 'expense';
    setType(nextType);
    setEntryMode(tx?.entryMode || initialEntryMode || (initialType && initialType !== 'transfer' ? 'invoice' : 'cash'));
    setAmount(String(tx?.amount || ''));
    const nextCategoryId = tx?.categoryId || (nextType === 'income' ? data.categories.income[0]?.id : data.categories.expense[0]?.id) || '';
    setCategoryId(nextCategoryId);
    setChartAccountId(tx?.chartAccountId || defaultChartAccountId(data, nextType, nextCategoryId));
    setAccountId(tx?.accountId || data.accounts[0]?.id || '');
    setAccountToId(tx?.accountToId || data.accounts[1]?.id || data.accounts[0]?.id || '');
    setGstMode(tx?.gstMode === undefined ? 'inc' : tx.gstMode);
    setPaymentTerms(tx?.paymentTerms || 'net_30');
    setDueDate(tx?.dueDate || dueDateForTerms(tx?.date || new Date().toISOString().slice(0, 10), tx?.paymentTerms || 'net_30'));
    setInvoiceNo(tx?.invoiceNo || (tx ? '' : formatDocumentNumber(data, nextType)));
    setCreditNoteNo(tx?.creditNoteNo || (tx ? '' : formatCreditNumber(data, nextType)));
    setContactId(tx?.contactId || '');
    setNote(tx?.note || '');
    setParty(tx?.party || '');
    setPaidNow('');
  }, [data, data.accounts, data.categories.expense, data.categories.income, initialEntryMode, initialType, open, tx]);

  const chartChoices = type === 'income'
    ? data.chartOfAccounts.filter((account) => account.class === 'revenue')
    : type === 'expense'
      ? data.chartOfAccounts.filter((account) => account.class === 'expense')
      : [];
  const defaultPaymentAccountId = data.accounts.find((account) => account.type === 'bank' || account.type === 'cash')?.id || data.accounts[0]?.id || '';
  const txDate = tx?.date || new Date().toISOString().slice(0, 10);
  const contactChoices = (data.contacts || []).filter((contact) => !contact.archivedAt && (
    type === 'income' ? contact.type === 'customer' || contact.type === 'both' : contact.type === 'supplier' || contact.type === 'both'
  ));
  const selectedContact = contactChoices.find((contact) => contact.id === contactId);

  function submit() {
    const value = Number(amount);
    if (!value || value <= 0) return;
    const isCN = entryMode === 'credit_note' && type !== 'transfer';
    const next: Transaction = {
      id: tx?.id || uid(),
      type,
      amount: value,
      categoryId: undefined,
      chartAccountId: type === 'transfer' ? undefined : chartAccountId || defaultChartAccountId(data, type, categoryId),
      clearingChartAccountId: (entryMode === 'invoice' || isCN) && type !== 'transfer' ? clearingAccountId(data, type) : undefined,
      accountId: entryMode === 'invoice' && type !== 'transfer' ? (tx?.accountId || defaultPaymentAccountId) : isCN ? undefined : accountId,
      accountToId: type === 'transfer' ? accountToId : undefined,
      date: txDate,
      note: note.trim(),
      gstMode: type === 'transfer' ? null : gstMode,
      entryMode: type === 'transfer' ? 'cash' : entryMode,
      contactId: (entryMode === 'invoice' || isCN) && contactId ? contactId : undefined,
      party: (entryMode === 'invoice' || isCN) ? (selectedContact?.name || party) : undefined,
      invoiceNo: entryMode === 'invoice' ? invoiceNo : undefined,
      creditNoteNo: isCN ? (creditNoteNo || undefined) : undefined,
      paymentTerms: entryMode === 'invoice' ? paymentTerms : undefined,
      dueDate: entryMode === 'invoice' ? dueDate : undefined,
      payments: entryMode === 'invoice' ? [
        ...(tx?.payments || []),
        ...(Number(paidNow) > 0 ? [{ id: uid('p'), amount: Number(paidNow), date: txDate, accountId }] : []),
      ] : undefined,
    };
    onSave(next);
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modal}>
          <ScrollView contentContainerStyle={styles.body}>
            <Header title={tx ? 'Edit Entry' : 'New Entry'} />
            <View style={styles.segment}>
              {(['expense', 'income', 'transfer'] as TransactionType[]).map((item) => (
                <Pressable
                  key={item}
                  style={[styles.segBtn, type === item && styles.segActive]}
                  onPress={() => {
                    setType(item);
                    if (item === 'income') { const first = data.categories.income[0]?.id || ''; setCategoryId(first); setChartAccountId(defaultChartAccountId(data, item, first)); if (!tx) setInvoiceNo(formatDocumentNumber(data, item)); }
                    if (item === 'expense') { const first = data.categories.expense[0]?.id || ''; setCategoryId(first); setChartAccountId(defaultChartAccountId(data, item, first)); if (!tx) setInvoiceNo(formatDocumentNumber(data, item)); }
                    setContactId('');
                    setParty('');
                  }}
                >
                  <Text>{item === 'expense' ? 'Purchase' : item === 'income' ? 'Sale' : 'Transfer'}</Text>
                </Pressable>
              ))}
            </View>
            {type !== 'transfer' ? (
              <View style={styles.segment}>
                <Pressable style={[styles.segBtn, entryMode === 'cash' && styles.segActive]} onPress={() => setEntryMode('cash')}><Text>Paid Now</Text></Pressable>
                <Pressable style={[styles.segBtn, entryMode === 'invoice' && styles.segActive]} onPress={() => setEntryMode('invoice')}><Text>Invoice</Text></Pressable>
                <Pressable style={[styles.segBtn, entryMode === 'credit_note' && styles.segActive]} onPress={() => { setEntryMode('credit_note'); if (!tx) setCreditNoteNo(formatCreditNumber(data, type)); }}>
                  <Text>{type === 'income' ? 'Credit Note' : 'Supplier Credit'}</Text>
                </Pressable>
              </View>
            ) : null}
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" />
            {type !== 'transfer' ? (
              <>
                <Text style={styles.fieldLabel}>{type === 'income' ? 'Revenue Account' : 'Expense Account'}</Text>
                <View style={styles.chipGrid}>
                  {chartChoices.map((account) => (
                    <Pressable
                      key={account.id}
                      style={[styles.chip, chartAccountId === account.id && styles.chipSelected]}
                      onPress={() => setChartAccountId(account.id)}
                    >
                      <Text style={styles.chipText}>{account.code} · {account.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {(entryMode === 'invoice' || entryMode === 'credit_note') && type !== 'transfer' ? (
              <View style={styles.lockedField}>
                <Text style={styles.lockedLabel}>{type === 'expense' ? 'From (AP)' : 'To (AR)'}</Text>
                <Text style={styles.lockedValue}>{chartAccountName(data, clearingAccountId(data, type))}</Text>
                <Text style={styles.lockedDetail}>{entryMode === 'credit_note' ? (type === 'expense' ? 'Reduces AP balance' : 'Reduces AR balance') : (type === 'expense' ? 'Bill owed to supplier until paid' : 'Customer owes money until received')}</Text>
              </View>
            ) : (
              <SelectField
                label={type === 'expense' ? 'From' : type === 'income' ? 'To' : 'From Account'}
                value={accountId}
                options={data.accounts.map((a) => ({ value: a.id, label: `${a.icon} ${a.name}`, detail: a.type }))}
                onChange={setAccountId}
              />
            )}
            {type === 'transfer' ? (
              <SelectField
                label="To Account"
                value={accountToId}
                options={data.accounts.map((a) => ({ value: a.id, label: `${a.icon} ${a.name}`, detail: a.type }))}
                onChange={setAccountToId}
              />
            ) : null}
            {type !== 'transfer' && data.settings.gstEnabled ? (
              <>
                <Text style={styles.fieldLabel}>GST</Text>
                <View style={styles.segment}>
                  {([['inc', 'Inc GST'], ['exc', '+ GST'], ['free', 'GST-Free'], ['', 'No GST']] as [string, string][]).map(([value, label]) => (
                    <Pressable key={value} style={[styles.segBtn, (gstMode || '') === value && styles.segActive]} onPress={() => setGstMode((value || null) as GsmMode)}>
                      <Text>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" />
            {(entryMode === 'invoice' || entryMode === 'credit_note') && type !== 'transfer' ? (
              <>
                {contactChoices.length ? (
                  <SelectField
                    label={type === 'income' ? 'Customer' : 'Supplier'}
                    value={contactId}
                    options={[
                      { value: '', label: `Select ${type === 'income' ? 'customer' : 'supplier'}`, detail: 'Optional' },
                      ...contactChoices.map((contact) => ({ value: contact.id, label: contact.name, detail: contact.abn || contact.email || contact.paymentTerms })),
                    ]}
                    onChange={(value) => {
                      const contact = contactChoices.find((item) => item.id === value);
                      setContactId(value);
                      setParty(contact?.name || '');
                      if (entryMode === 'invoice' && contact?.paymentTerms) {
                        setPaymentTerms(contact.paymentTerms);
                        setDueDate(dueDateForTerms(txDate, contact.paymentTerms));
                      }
                    }}
                  />
                ) : (
                  <View style={styles.lockedField}>
                    <Text style={styles.lockedLabel}>{type === 'income' ? 'Customer' : 'Supplier'}</Text>
                    <Text style={styles.lockedValue}>No contacts yet</Text>
                    <Text style={styles.lockedDetail}>Add contacts in Settings to use master data.</Text>
                  </View>
                )}
                <TextInput style={styles.input} value={party || contactName(data, contactId)} onChangeText={(value) => { setParty(value); setContactId(''); }} placeholder={type === 'income' ? 'Customer name' : 'Supplier name'} />
                {entryMode === 'invoice' ? (
                  <>
                    <TextInput style={styles.input} value={invoiceNo} onChangeText={setInvoiceNo} placeholder="Invoice No." />
                    <Text style={styles.fieldLabel}>Payment Terms</Text>
                    <View style={styles.chipGrid}>
                      {(['due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60'] as PaymentTerms[]).map((term) => (
                        <Pressable
                          key={term}
                          style={[styles.chip, paymentTerms === term && styles.chipSelected]}
                          onPress={() => { setPaymentTerms(term); setDueDate(dueDateForTerms(txDate, term)); }}
                        >
                          <Text style={styles.chipText}>{term === 'due_on_receipt' ? 'Due now' : term.replace('_', ' ').toUpperCase()}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="Due date YYYY-MM-DD" />
                  </>
                ) : (
                  <TextInput style={styles.input} value={creditNoteNo} onChangeText={setCreditNoteNo} placeholder={type === 'income' ? 'Credit Note No.' : 'Supplier Credit No.'} />
                )}
              </>
            ) : null}
            <ActionButton onPress={submit}>Save</ActionButton>
            <View style={{ height: 10 }} />
            <ActionButton onPress={onClose} tone="gray">Cancel</ActionButton>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12 },
  segment: { flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 12, padding: 2 },
  segBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  segActive: { backgroundColor: '#F8F6F2' },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  fieldLabel: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line },
  chipSelected: { borderColor: colors.blue, backgroundColor: '#E8EBF0' },
  chipText: { color: colors.text, fontWeight: '700' },
  lockedField: { minHeight: 62, backgroundColor: '#F8F6F2', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line },
  lockedLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  lockedValue: { marginTop: 3, color: colors.text, fontSize: 16, fontWeight: '800' },
  lockedDetail: { marginTop: 2, color: colors.muted, fontSize: 12 },
});
