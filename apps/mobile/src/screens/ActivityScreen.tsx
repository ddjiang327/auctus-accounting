import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, Header, ListRow, Screen, SectionTitle, colors } from '../components/ui';
import { TransactionRows } from '../components/TransactionRows';
import { contactName, fmt, fmtMoney, getCategory, invoiceStatus, isInvoice, txBalance, txPaid } from '../domain/accounting';
import type { LedgerData, Transaction } from '../domain/models';

export function ActivityScreen({ data, onEdit, onPay }: { data: LedgerData; onEdit: (tx: Transaction) => void; onPay: (tx: Transaction) => void }) {
  const outstanding = data.transactions.filter((tx) => isInvoice(tx) && txBalance(tx, data) > 0);
  const receive = outstanding.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  const pay = outstanding.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + txBalance(tx, data), 0);
  return (
    <Screen>
      <Header title="Activity" subtitle={`${data.transactions.length} entries`} />
      <View style={styles.statsRow}>
        <Card><Text style={styles.muted}>To Receive</Text><Text style={styles.greenText}>{fmtMoney(receive)}</Text></Card>
        <Card><Text style={styles.muted}>To Pay</Text><Text style={styles.redText}>{fmtMoney(pay)}</Text></Card>
      </View>
      <SectionTitle>Outstanding</SectionTitle>
      {outstanding.map((tx) => {
        const cat = getCategory(data, tx.categoryId);
        const status = invoiceStatus(tx, data);
        return (
          <ListRow
            key={tx.id}
            icon={cat?.icon || '📄'}
            color={cat?.color}
            title={contactName(data, tx.contactId, tx.party) || (tx.type === 'income' ? 'Customer' : 'Supplier')}
            subtitle={`${status.label} · Due ${tx.dueDate || tx.date} · Paid $${fmt(txPaid(tx))}`}
            right={<ActionButton tone={tx.type === 'income' ? 'green' : 'blue'} onPress={() => onPay(tx)}>{tx.type === 'income' ? 'Receive' : 'Pay'}</ActionButton>}
            onPress={() => onEdit(tx)}
          />
        );
      })}
      <SectionTitle>All Transactions</SectionTitle>
      <TransactionRows data={data} txs={[...data.transactions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))} onEdit={onEdit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 12 },
  muted: { color: colors.muted },
  greenText: { marginTop: 6, color: colors.green, fontSize: 20, fontWeight: '900' },
  redText: { marginTop: 6, color: colors.red, fontSize: 20, fontWeight: '900' },
});
