import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, colors } from './ui';
import { clearingAccountId, contactName, defaultChartAccountId, fmt, uid } from '../domain/accounting';
import type { GsmMode, LedgerData, PaymentTerms, RecurringFrequency, RecurringTemplate, TransactionType } from '../domain/models';

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const GST_MODES: { value: GsmMode; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'inc', label: 'Inc' },
  { value: 'exc', label: 'Exc' },
  { value: 'free', label: 'Free' },
];

const PAYMENT_TERMS: { value: PaymentTerms; label: string }[] = [
  { value: 'due_on_receipt', label: 'On Receipt' },
  { value: 'net_7', label: 'Net 7' },
  { value: 'net_14', label: 'Net 14' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_60', label: 'Net 60' },
];

function nextMonthFirst() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

export function RecurringModal({ open, data, type, template, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  type: Extract<TransactionType, 'income' | 'expense'>;
  template: RecurringTemplate | null;
  onClose: () => void;
  onSave: (template: RecurringTemplate) => void;
}) {
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState(nextMonthFirst());
  const [endDate, setEndDate] = useState('');
  const [party, setParty] = useState('');
  const [gstMode, setGstMode] = useState<GsmMode>(null);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('net_30');

  useEffect(() => {
    if (!open) return;
    if (template) {
      setNote(template.note || '');
      setAmount(template.amount ? fmt(template.amount) : '');
      setFrequency(template.frequency);
      setStartDate(template.nextDate);
      setEndDate(template.endDate || '');
      setParty(template.party || contactName(data, template.contactId) || '');
      setGstMode(template.gstMode ?? null);
      setPaymentTerms(template.paymentTerms || 'net_30');
    } else {
      setNote('');
      setAmount('');
      setFrequency('monthly');
      setStartDate(nextMonthFirst());
      setEndDate('');
      setParty('');
      setGstMode(null);
      setPaymentTerms('net_30');
    }
  }, [open, template, data]);

  function submit() {
    const amtNum = Number(amount.replace(/,/g, ''));
    if (!amtNum || amtNum <= 0) { Alert.alert('Invalid amount', 'Enter a positive amount.'); return; }
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { Alert.alert('Invalid date', 'Enter a start date in YYYY-MM-DD format.'); return; }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) { Alert.alert('Invalid end date', 'Enter end date in YYYY-MM-DD format or leave blank.'); return; }
    const saved: RecurringTemplate = {
      id: template?.id || uid('rec'),
      type,
      frequency,
      nextDate: startDate,
      endDate: endDate || undefined,
      amount: +amtNum.toFixed(2),
      party: party.trim() || undefined,
      note: note.trim() || undefined,
      gstMode: data.settings.gstEnabled ? gstMode : null,
      paymentTerms,
      chartAccountId: template?.chartAccountId || defaultChartAccountId(data, type),
      clearingChartAccountId: template?.clearingChartAccountId || clearingAccountId(data, type),
      isActive: template?.isActive ?? true,
      createdAt: template?.createdAt || new Date().toISOString(),
      lastGeneratedAt: template?.lastGeneratedAt,
    };
    onSave(saved);
  }

  const isEditing = !!template;
  const tone = type === 'income' ? 'green' : 'blue';

  return (
    <Modal visible={open} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{isEditing ? 'Edit' : 'New'} Recurring {type === 'income' ? 'Invoice' : 'Bill'}</Text>

            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder={type === 'income' ? 'Description (e.g. Monthly Retainer)' : 'Description (e.g. Office Rent)'}
            />
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount"
              keyboardType="decimal-pad"
            />

            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.chipGrid}>
              {FREQUENCIES.map((f) => (
                <Pressable key={f.value} style={[styles.chip, frequency === f.value && styles.chipSelected]} onPress={() => setFrequency(f.value)}>
                  <Text style={[styles.chipText, frequency === f.value && styles.chipSelectedText]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="First occurrence YYYY-MM-DD" />
            <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="End date YYYY-MM-DD (optional, blank = no end)" />
            <TextInput
              style={styles.input}
              value={party}
              onChangeText={setParty}
              placeholder={type === 'income' ? 'Customer name (optional)' : 'Supplier name (optional)'}
            />

            <Text style={styles.fieldLabel}>Payment Terms</Text>
            <View style={styles.chipGrid}>
              {PAYMENT_TERMS.map((pt) => (
                <Pressable key={pt.value} style={[styles.chip, paymentTerms === pt.value && styles.chipSelected]} onPress={() => setPaymentTerms(pt.value)}>
                  <Text style={[styles.chipText, paymentTerms === pt.value && styles.chipSelectedText]}>{pt.label}</Text>
                </Pressable>
              ))}
            </View>

            {data.settings.gstEnabled ? (
              <>
                <Text style={styles.fieldLabel}>GST</Text>
                <View style={styles.chipGrid}>
                  {GST_MODES.map((g) => (
                    <Pressable key={String(g.value)} style={[styles.chip, gstMode === g.value && styles.chipSelected]} onPress={() => setGstMode(g.value)}>
                      <Text style={[styles.chipText, gstMode === g.value && styles.chipSelectedText]}>{g.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <View style={{ height: 4 }} />
            <ActionButton tone={tone} onPress={submit}>{isEditing ? 'Save Changes' : 'Create Schedule'}</ActionButton>
            <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetBody: { padding: 16, gap: 12, paddingBottom: 28 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  fieldLabel: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line },
  chipSelected: { borderColor: colors.blue, backgroundColor: '#E8EBF0' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  chipSelectedText: { color: colors.blue },
});
