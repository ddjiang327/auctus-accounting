import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, colors } from './ui';
import { fmt, txBalance } from '../domain/accounting';
import type { LedgerData, Transaction } from '../domain/models';

export function PaymentModal({ open, data, tx, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  tx: Transaction | null;
  onClose: () => void;
  onSave: (tx: Transaction, amount: number, date: string, accountId: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');

  useEffect(() => {
    if (!tx || !open) return;
    setAmount(txBalance(tx, data).toFixed(2));
    setDate(new Date().toISOString().slice(0, 10));
    setAccountId(tx.accountId || data.accounts[0]?.id || '');
  }, [data, open, tx]);

  if (!tx) return null;
  const balance = txBalance(tx, data);
  const action = tx.type === 'income' ? 'Receive Payment' : 'Pay Invoice';

  function submit() {
    const value = Number(amount);
    if (!value || value <= 0 || value > balance + 0.005) { Alert.alert('Invalid payment amount'); return; }
    onSave(tx!, +value.toFixed(2), date || new Date().toISOString().slice(0, 10), accountId);
  }

  return (
    <Modal visible={open} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{action}</Text>
          <Text style={styles.muted}>Balance ${fmt(balance)}</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" />
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Payment date YYYY-MM-DD" />
          <Text style={styles.fieldLabel}>Account</Text>
          <View style={styles.chipGrid}>
            {data.accounts.map((account) => (
              <Pressable key={account.id} style={[styles.chip, accountId === account.id && styles.chipSelected]} onPress={() => setAccountId(account.id)}>
                <Text style={styles.chipText}>{account.icon} {account.name}</Text>
              </Pressable>
            ))}
          </View>
          <ActionButton tone={tx.type === 'income' ? 'green' : 'blue'} onPress={submit}>{tx.type === 'income' ? 'Receive' : 'Pay'}</ActionButton>
          <View style={{ height: 10 }} />
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  muted: { color: colors.muted },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  fieldLabel: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line },
  chipSelected: { borderColor: colors.blue, backgroundColor: '#E8EBF0' },
  chipText: { color: colors.text, fontWeight: '700' },
});
