import { StyleSheet, Text, View } from 'react-native';
import { ListRow, colors } from './ui';
import { chartAccountName, contactName, fmt, fmtMoney, getAccount, getCategory, isInvoice, txBalance, txTotal } from '../domain/accounting';
import type { LedgerData, Transaction } from '../domain/models';

export function TransactionRows({ data, txs, onEdit }: { data: LedgerData; txs: Transaction[]; onEdit: (tx: Transaction) => void }) {
  return (
    <View style={styles.wrap}>
      {txs.map((tx) => {
        const cat = getCategory(data, tx.categoryId);
        const account = getAccount(data, tx.accountId);
        const chartName = tx.chartAccountId ? chartAccountName(data, tx.chartAccountId) : '';
        const clearingName = tx.clearingChartAccountId ? chartAccountName(data, tx.clearingChartAccountId) : '';
        return (
          <ListRow
            key={tx.id}
            icon={tx.type === 'transfer' ? '↔' : cat?.icon || '📄'}
            color={cat?.color || colors.blue}
            title={tx.type === 'transfer' ? 'Transfer' : cat?.name || chartName || 'Other'}
            subtitle={isInvoice(tx) ? `${contactName(data, tx.contactId, tx.party) || 'Invoice'} · ${clearingName || chartName} · Balance $${fmt(txBalance(tx, data))}` : `${account?.name || ''}${chartName ? ` · ${chartName}` : ''}${tx.note ? ` · ${tx.note}` : ''}`}
            right={<Text style={[styles.amount, tx.type === 'income' ? styles.green : tx.type === 'expense' ? styles.red : styles.blue]}>{tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{fmtMoney(txTotal(tx, data))}</Text>}
            onPress={() => onEdit(tx)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: 16 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  green: { color: colors.green },
  red: { color: colors.red },
  blue: { color: colors.blue },
});
