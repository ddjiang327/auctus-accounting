import type { LedgerData } from '@auctus/shared-types';
import { getAccount } from './accounts.js';
import { chartAccountLedger } from './posting.js';

export function bankFeedFingerprint(accountId: string, date: string, amount: number, description: string, reference?: string) {
  const raw = [
    accountId,
    date,
    (Number(amount) || 0).toFixed(2),
    description.trim().toLowerCase().replace(/\s+/g, ' '),
    (reference || '').trim().toLowerCase(),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function reconciliationRows(data: LedgerData, accountId: string, statementDate: string) {
  const account = getAccount(data, accountId);
  if (!account?.chartAccountId) return [];
  const cleared = new Set((data.bankReconciliations || [])
    .filter((reconciliation) => reconciliation.accountId === accountId && !reconciliation.voidedAt)
    .flatMap((reconciliation) => reconciliation.clearedSourceIds));
  return chartAccountLedger(data, account.chartAccountId)
    .filter((row) => row.date <= statementDate)
    .filter((row) => !cleared.has(row.sourceId))
    .map((row) => {
      const movement = data.chartOfAccounts.find((chart) => chart.id === account.chartAccountId)?.normalBalance === 'credit'
        ? row.credit - row.debit
        : row.debit - row.credit;
      return { ...row, movement };
    });
}
