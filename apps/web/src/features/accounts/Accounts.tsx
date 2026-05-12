import { useEffect, useMemo, useRef, useState } from 'react';
import {
  accountBalance,
  accountTypeLabel,
  auditEntry,
  bankFeedFingerprint,
  chartAccountBalances,
  chartAccountLedger,
  chartAccountName,
  chartAccountSort,
  fmtMoney,
  isDateLocked,
  reconciliationRows,
  todayStr,
  uid,
  totalAssets,
} from '../../domain/accounting';
import { Modal } from '../../components/Modal';
import { useAppAlerts } from '../../components/AppAlerts';
import type { Account, AccountType, BankFeedItem, BankReconciliation, ChartAccountClass, LedgerData, Transaction } from '../../domain/models';

interface AccountsProps {
  data: LedgerData;
  onSaveAccount: (account: Account) => void | Promise<void>;
  onArchiveAccount: (accountId: string) => void | Promise<void>;
  onDataChange: (data: LedgerData) => void;
  onImportBankFeedItems?: (accountId: string, items: BankFeedItem[]) => Promise<void>;
  onMatchBankFeedItem?: (itemId: string, sourceId?: string) => Promise<void>;
  onIgnoreBankFeedItem?: (itemId: string) => Promise<void>;
  onUnignoreBankFeedItem?: (itemId: string) => Promise<void>;
  onRecordBankFeedItem?: (item: BankFeedItem, transaction: Transaction) => Promise<void>;
  onFinalizeBankReconciliation?: (reconciliation: BankReconciliation) => Promise<void>;
  onVoidBankReconciliation?: (reconciliation: BankReconciliation) => Promise<void>;
  canWrite?: boolean;
}

const accountTypes: AccountType[] = ['cash', 'bank', 'ewallet', 'credit', 'investment', 'loan', 'other'];
const defaultColors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#5856D6', '#5AC8FA', '#8E8E93'];

const chartClassTabs: { key: ChartAccountClass; label: string }[] = [
  { key: 'asset', label: 'Assets' },
  { key: 'liability', label: 'Liabilities' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'expense', label: 'Expenses' },
  { key: 'equity', label: 'Equity' },
];

export function Accounts({
  data,
  onSaveAccount,
  onArchiveAccount,
  onDataChange,
  onImportBankFeedItems,
  onMatchBankFeedItem,
  onIgnoreBankFeedItem,
  onUnignoreBankFeedItem,
  onRecordBankFeedItem,
  onFinalizeBankReconciliation,
  onVoidBankReconciliation,
  canWrite = true,
}: AccountsProps) {
  const totals = totalAssets(data);
  const [editing, setEditing] = useState<Account | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [chartClass, setChartClass] = useState<ChartAccountClass>('asset');

  const allBalances = useMemo(() => {
    const balanceMap = new Map(chartAccountBalances(data).map((b) => [b.account.id, b.balance]));
    return data.chartOfAccounts.map((account) => ({
      account,
      balance: balanceMap.get(account.id) ?? 0,
    }));
  }, [data]);

  const filteredChart = useMemo(() =>
    allBalances
      .filter((b) => b.account.class === chartClass)
      .sort((a, b) => chartAccountSort(a.account, b.account)),
    [allBalances, chartClass]
  );

  function openNewAccount() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEditAccount(account: Account) {
    setEditing(account);
    setModalOpen(true);
  }

  async function saveAccount(account: Account) {
    await onSaveAccount(account);
    setModalOpen(false);
    setEditing(null);
  }

  async function archiveAccount(accountId: string) {
    await onArchiveAccount(accountId);
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <section className="view">
      <header className="large-header">
        <h1>Accounts</h1>
        <p>Manage your funds</p>
      </header>
      <div className="hero-card green">
        <span>NET WORTH</span>
        <strong>{fmtMoney(totals.net)}</strong>
        <div className="hero-grid">
          <div><small>Assets</small><b>{fmtMoney(totals.assets)}</b></div>
          <div><small>Liabilities</small><b>{fmtMoney(totals.liabilities)}</b></div>
        </div>
      </div>

      <div className="section-header">
        <h3>Chart of Accounts</h3>
      </div>
      <div className="toolbar-row">
        <div className="seg-control compact-control">
          {chartClassTabs.map(({ key, label }) => (
            <button key={key} className={chartClass === key ? 'active' : ''} onClick={() => setChartClass(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="list compact">
        {filteredChart.length ? filteredChart.map(({ account, balance }) => (
          <div key={account.id} className="list-row">
            <span className="row-body">
              <b>{account.code} · {account.name}</b>
              <small>{account.group}</small>
            </span>
            <span className="row-right">
              <b className={balance < 0 ? 'expense' : ''}>{fmtMoney(balance)}</b>
            </span>
          </div>
        )) : <div className="empty-card flat">No {chartClassTabs.find((t) => t.key === chartClass)?.label.toLowerCase()} accounts</div>}
      </div>

      <div className="section-header">
        <h3>Payment Accounts</h3>
        {canWrite ? (
          <div className="detail-actions">
            <button className="small-action secondary" onClick={() => setFeedOpen(true)}>Bank Feed</button>
            <button className="small-action secondary" onClick={() => setReconciliationOpen(true)}>Reconcile</button>
            <button className="small-action" onClick={openNewAccount}>Add</button>
          </div>
        ) : null}
      </div>
      <div className="list">
        {data.accounts.map((account) => {
          const balance = accountBalance(data, account.id);
          return (
            <button key={account.id} className="list-row" onClick={canWrite ? () => openEditAccount(account) : undefined}>
              <span className="icon" style={{ backgroundColor: account.color }}>{account.icon}</span>
              <span className="row-body">
                <b>{account.name}</b>
                <small>{accountTypeLabel(account)}</small>
              </span>
              <span className="row-right"><b className={balance < 0 ? 'expense' : ''}>{fmtMoney(balance)}</b></span>
            </button>
          );
        })}
      </div>
      {canWrite ? (
        <>
          <AccountModal
            open={modalOpen}
            data={data}
            account={editing}
            onClose={() => setModalOpen(false)}
            onSave={saveAccount}
            onArchive={archiveAccount}
          />
          <BankFeedModal
            open={feedOpen}
            data={data}
            onClose={() => setFeedOpen(false)}
            onDataChange={onDataChange}
            onImportBankFeedItems={onImportBankFeedItems}
            onMatchBankFeedItem={onMatchBankFeedItem}
            onIgnoreBankFeedItem={onIgnoreBankFeedItem}
            onUnignoreBankFeedItem={onUnignoreBankFeedItem}
            onRecordBankFeedItem={onRecordBankFeedItem}
            onFinalizeBankReconciliation={onFinalizeBankReconciliation}
          />
          <ReconciliationModal
            open={reconciliationOpen}
            data={data}
            onClose={() => setReconciliationOpen(false)}
            onDataChange={onDataChange}
            onFinalizeBankReconciliation={onFinalizeBankReconciliation}
            onVoidBankReconciliation={onVoidBankReconciliation}
          />
        </>
      ) : null}
    </section>
  );
}

type ParsedBankCsvRow = {
  date: string;
  description: string;
  amount: number;
  reference?: string;
};

type ReconRow = ReturnType<typeof reconciliationRows>[number];

function paymentAccounts(data: LedgerData) {
  return data.accounts.filter((account) => ['bank', 'cash', 'credit'].includes(account.type));
}

function dateDistanceDays(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function sourceLabel(data: LedgerData, sourceId?: string) {
  if (!sourceId) return 'No match';
  const tx = data.transactions.find((item) => item.id === sourceId);
  if (tx) return tx.invoiceNo || tx.creditNoteNo || tx.note || tx.party || tx.id;
  for (const item of data.transactions) {
    const payment = (item.payments || []).find((candidate) => candidate.id === sourceId);
    if (payment) return `${item.invoiceNo || item.party || item.id} payment`;
  }
  if (sourceId.startsWith('opening_')) return 'Opening balance';
  return sourceId;
}

function matchBankFeedItems(data: LedgerData, accountId: string, items: BankFeedItem[]) {
  const used = new Set((data.bankFeedItems || [])
    .filter((item) => item.accountId === accountId && item.matchedSourceId && !item.ignoredAt)
    .map((item) => item.matchedSourceId as string));
  const rows = reconciliationRows(data, accountId, '9999-12-31')
    .filter((row) => !used.has(row.sourceId));

  return items.map((item) => {
    if (item.matchedSourceId || item.ignoredAt || item.reconciledAt) return item;
    const candidates = rows
      .filter((row) => Math.abs(row.movement - item.amount) <= 0.01 && dateDistanceDays(row.date, item.date) <= 7)
      .map((row) => {
        const dateScore = 10 - dateDistanceDays(row.date, item.date);
        const memo = row.memo.toLowerCase();
        const desc = item.description.toLowerCase();
        const textScore = desc && memo && (desc.includes(memo) || memo.includes(desc)) ? 5 : 0;
        return { row, score: dateScore + textScore };
      })
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) return item;
    if (candidates.length > 1 && Math.abs(candidates[0].score - candidates[1].score) < 0.01) return item;
    used.add(candidates[0].row.sourceId);
    return { ...item, matchedSourceId: candidates[0].row.sourceId };
  });
}

function buildBankFeedItems(accountId: string, rows: ParsedBankCsvRow[], existingHashes: Set<string>) {
  const now = new Date().toISOString();
  return rows.map((row) => {
    const rawHash = bankFeedFingerprint(accountId, row.date, row.amount, row.description, row.reference);
    return {
      id: uid('bf_'),
      accountId,
      date: row.date,
      description: row.description,
      amount: row.amount,
      reference: row.reference,
      rawHash,
      importedAt: now,
    };
  }).filter((item) => !existingHashes.has(item.rawHash));
}

function matchedRowsTotal(rows: ReconRow[], sourceIds: Set<string>) {
  return rows.filter((row) => sourceIds.has(row.sourceId)).reduce((sum, row) => sum + row.movement, 0);
}

function parseBankStatementCsv(text: string): ParsedBankCsvRow[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const dateIndex = findHeader(headers, ['date', 'transaction date', 'posted date']);
  const descriptionIndex = findHeader(headers, ['description', 'memo', 'details', 'narrative', 'transaction description']);
  const amountIndex = findHeader(headers, ['amount', 'transaction amount', 'value']);
  const debitIndex = findHeader(headers, ['debit', 'withdrawal', 'out']);
  const creditIndex = findHeader(headers, ['credit', 'deposit', 'in']);
  const referenceIndex = findHeader(headers, ['reference', 'ref', 'transaction id']);
  if (dateIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) return [];

  return rows.slice(1).map((row) => {
    const date = normalizeCsvDate(row[dateIndex] || '');
    const description = (descriptionIndex >= 0 ? row[descriptionIndex] : '').trim() || 'Bank feed item';
    const amount = amountIndex >= 0
      ? parseMoney(row[amountIndex])
      : parseMoney(row[creditIndex] || '') - parseMoney(row[debitIndex] || '');
    const reference = referenceIndex >= 0 ? row[referenceIndex]?.trim() : undefined;
    return { date, description, amount, reference };
  }).filter((row) => row.date && Number.isFinite(row.amount) && Math.abs(row.amount) > 0.005);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function findHeader(headers: string[], choices: string[]) {
  return headers.findIndex((header) => choices.some((choice) => header === choice || header.includes(choice)));
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeCsvDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const day = slash[1].padStart(2, '0');
    const month = slash[2].padStart(2, '0');
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function BankFeedModal({
  open,
  data,
  onClose,
  onDataChange,
  onImportBankFeedItems,
  onMatchBankFeedItem,
  onIgnoreBankFeedItem,
  onUnignoreBankFeedItem,
  onRecordBankFeedItem,
  onFinalizeBankReconciliation,
}: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onDataChange: (data: LedgerData) => void;
  onImportBankFeedItems?: (accountId: string, items: BankFeedItem[]) => Promise<void>;
  onMatchBankFeedItem?: (itemId: string, sourceId?: string) => Promise<void>;
  onIgnoreBankFeedItem?: (itemId: string) => Promise<void>;
  onUnignoreBankFeedItem?: (itemId: string) => Promise<void>;
  onRecordBankFeedItem?: (item: BankFeedItem, transaction: Transaction) => Promise<void>;
  onFinalizeBankReconciliation?: (reconciliation: BankReconciliation) => Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const accounts = paymentAccounts(data);
  const [accountId, setAccountId] = useState(accounts.find((account) => account.type === 'bank')?.id || accounts[0]?.id || '');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  const accountItems = useMemo(() => (data.bankFeedItems || [])
    .filter((item) => item.accountId === accountId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [accountId, data.bankFeedItems]);
  const activeItems = accountItems.filter((item) => !item.reconciledAt && !item.ignoredAt);
  const ignoredItems = accountItems.filter((item) => item.ignoredAt && !item.reconciledAt);
  const matchedItems = activeItems.filter((item) => item.matchedSourceId);
  const unmatchedItems = activeItems.filter((item) => !item.matchedSourceId);
  const cleared = new Set((data.bankReconciliations || [])
    .filter((reconciliation) => reconciliation.accountId === accountId && !reconciliation.voidedAt)
    .flatMap((reconciliation) => reconciliation.clearedSourceIds));
  const clearableItems = matchedItems.filter((item) => item.matchedSourceId && !cleared.has(item.matchedSourceId));

  function updateFeedItems(nextItems: BankFeedItem[], action: string, detail: string) {
    onDataChange({
      ...data,
      bankFeedItems: nextItems,
      auditLog: [...(data.auditLog || []), auditEntry(action, 'bank_feed', accountId, detail)],
    });
  }

  function importCsv(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const rows = parseBankStatementCsv(String(reader.result || ''));
      if (!rows.length) {
        reportError(new Error('No rows found. CSV needs a date column and either amount or debit/credit columns.'));
        return;
      }
      const existingHashes = new Set((data.bankFeedItems || []).map((item) => item.rawHash));
      const newItems = buildBankFeedItems(accountId, rows, existingHashes);
      if (!newItems.length) {
        reportError(new Error('Nothing imported. These rows already exist for this account.'));
        return;
      }
      const matched = matchBankFeedItems(data, accountId, newItems);
      if (onImportBankFeedItems) {
        try {
          await onImportBankFeedItems(accountId, matched);
          reportError(new Error(`${matched.length} rows imported. ${matched.filter((item) => item.matchedSourceId).length} matched automatically.`));
        } catch (error) {
          reportError(error instanceof Error ? error : new Error('Bank feed import failed.'));
        }
        return;
      }
      onDataChange({
        ...data,
        bankFeedItems: [...(data.bankFeedItems || []), ...matched],
        auditLog: [...(data.auditLog || []), auditEntry('import', 'bank_feed', accountId, `${matched.length} CSV rows imported; ${matched.filter((item) => item.matchedSourceId).length} matched`)],
      });
      reportError(new Error(`${matched.length} rows imported. ${matched.filter((item) => item.matchedSourceId).length} matched automatically.`));
    };
    reader.readAsText(file);
  }

  async function rematch() {
    const rematched = matchBankFeedItems(data, accountId, activeItems);
    const matchedCount = rematched.filter((item, index) => !activeItems[index].matchedSourceId && item.matchedSourceId).length;
    if (onMatchBankFeedItem) {
      try {
        for (const item of rematched) {
          const current = activeItems.find((candidate) => candidate.id === item.id);
          if (current?.matchedSourceId !== item.matchedSourceId) {
            await onMatchBankFeedItem(item.id, item.matchedSourceId);
          }
        }
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank feed auto match failed.'));
      }
      return;
    }
    updateFeedItems(
      (data.bankFeedItems || []).map((item) => rematched.find((candidate) => candidate.id === item.id) || item),
      'match',
      `${matchedCount} bank feed rows matched`,
    );
  }

  async function setMatchedSource(itemId: string, sourceId: string) {
    if (onMatchBankFeedItem) {
      try {
        await onMatchBankFeedItem(itemId, sourceId || undefined);
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank feed match failed.'));
      }
      return;
    }
    updateFeedItems(
      (data.bankFeedItems || []).map((item) => item.id === itemId ? { ...item, matchedSourceId: sourceId || undefined } : item),
      sourceId ? 'match' : 'unmatch',
      sourceId ? `Bank feed row matched to ${sourceId}` : `Bank feed row ${itemId} unmatched`,
    );
  }

  async function clearMatched() {
    if (!clearableItems.length) {
      reportError(new Error('Import or match bank feed rows before clearing.'));
      return;
    }
    const sourceIds = new Set(clearableItems.map((item) => item.matchedSourceId as string));
    const rows = reconciliationRows(data, accountId, '9999-12-31');
    const total = matchedRowsTotal(rows, sourceIds);
    const statementDate = clearableItems.map((item) => item.date).sort((a, b) => b.localeCompare(a))[0] || todayStr();
    if (isDateLocked(data, statementDate)) {
      reportError(new Error(`Matched bank feed rows dated through ${statementDate} cannot be cleared because the period is locked.`));
      return;
    }
    const now = new Date().toISOString();
    const reconciliation: BankReconciliation = {
      id: uid('rec_'),
      accountId,
      statementDate,
      statementBalance: total,
      bookBalance: total,
      difference: 0,
      clearedSourceIds: Array.from(sourceIds),
      createdAt: now,
      finalizedAt: now,
    };
    if (onFinalizeBankReconciliation) {
      try {
        await onFinalizeBankReconciliation(reconciliation);
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank feed reconciliation failed.'));
      }
      return;
    }
    onDataChange({
      ...data,
      bankReconciliations: [...(data.bankReconciliations || []), reconciliation],
      bankFeedItems: (data.bankFeedItems || []).map((item) => sourceIds.has(item.matchedSourceId || '') ? { ...item, reconciledAt: now } : item),
      auditLog: [...(data.auditLog || []), auditEntry('finalize', 'bank_feed_reconciliation', reconciliation.id, `${clearableItems.length} matched bank feed rows cleared`)],
    });
  }

  async function ignoreItem(itemId: string) {
    if (onIgnoreBankFeedItem) {
      try {
        await onIgnoreBankFeedItem(itemId);
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank feed ignore failed.'));
      }
      return;
    }
    const now = new Date().toISOString();
    updateFeedItems(
      (data.bankFeedItems || []).map((item) => item.id === itemId ? { ...item, ignoredAt: now } : item),
      'ignore',
      `Bank feed row ${itemId} ignored`,
    );
  }

  async function unignoreItem(itemId: string) {
    if (onUnignoreBankFeedItem) {
      try {
        await onUnignoreBankFeedItem(itemId);
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank feed restore failed.'));
      }
      return;
    }
    updateFeedItems(
      (data.bankFeedItems || []).map((item) => item.id === itemId ? { ...item, ignoredAt: undefined } : item),
      'unignore',
      `Bank feed row ${itemId} restored`,
    );
  }

  async function recordUnmatched(item: BankFeedItem) {
    if (isDateLocked(data, item.date)) {
      reportError(new Error(`Bank feed rows dated ${item.date} cannot create entries because the period is locked.`));
      return;
    }
    const type = item.amount >= 0 ? 'income' : 'expense';
    const chartCode = type === 'income' ? '4010' : '7030';
    const tx: Transaction = {
      id: uid('bf_tx_'),
      type,
      amount: Math.abs(item.amount),
      accountId,
      categoryId: type === 'income' ? data.categories.income[0]?.id : data.categories.expense[0]?.id,
      chartAccountId: data.chartOfAccounts.find((account) => account.code === chartCode)?.id,
      date: item.date,
      note: item.description,
      gstMode: null,
    };
    if (onRecordBankFeedItem) {
      try {
        await onRecordBankFeedItem(item, tx);
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank feed record failed.'));
      }
      return;
    }
    onDataChange({
      ...data,
      transactions: [...data.transactions, tx],
      bankFeedItems: (data.bankFeedItems || []).map((feed) => feed.id === item.id ? { ...feed, matchedSourceId: tx.id } : feed),
      auditLog: [...(data.auditLog || []), auditEntry('create', 'transaction', tx.id, `Created from bank feed ${item.description}`)],
    });
  }

  return (
    <Modal open={open} title="Bank Feed" onClose={onClose}>
      <div className="form-card">
        <label>Payment Account
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name} · {chartAccountName(data, account.chartAccountId)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="stats-grid three">
        <div className="stat-card"><span>Pending</span><strong>{activeItems.length}</strong></div>
        <div className="stat-card"><span>Matched</span><strong className="income">{matchedItems.length}</strong></div>
        <div className="stat-card"><span>Unmatched</span><strong className={unmatchedItems.length ? 'due' : ''}>{unmatchedItems.length}</strong></div>
      </div>
      <div className="toolbar-row modal-toolbar">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importCsv(file);
            event.currentTarget.value = '';
          }}
        />
        <button className="primary" onClick={() => fileRef.current?.click()}>Import CSV</button>
        <button className="primary secondary-action" onClick={rematch}>Auto Match</button>
        <button className="primary success" onClick={clearMatched}>Finalise Matched</button>
      </div>
      <BankFeedList
        title="Matched"
        data={data}
        accountId={accountId}
        items={matchedItems}
        onRecord={recordUnmatched}
        onIgnore={ignoreItem}
        onUnignore={unignoreItem}
        onMatch={setMatchedSource}
      />
      <BankFeedList
        title="Unmatched"
        data={data}
        accountId={accountId}
        items={unmatchedItems}
        onRecord={recordUnmatched}
        onIgnore={ignoreItem}
        onUnignore={unignoreItem}
        onMatch={setMatchedSource}
      />
      <BankFeedList
        title="Ignored"
        data={data}
        accountId={accountId}
        items={ignoredItems}
        onRecord={recordUnmatched}
        onIgnore={ignoreItem}
        onUnignore={unignoreItem}
        onMatch={setMatchedSource}
        ignored
      />
    </Modal>
  );
}

function BankFeedList({ title, data, accountId, items, ignored, onRecord, onIgnore, onUnignore, onMatch }: {
  title: string;
  data: LedgerData;
  accountId: string;
  items: BankFeedItem[];
  ignored?: boolean;
  onRecord: (item: BankFeedItem) => void;
  onIgnore: (itemId: string) => void;
  onUnignore: (itemId: string) => void;
  onMatch: (itemId: string, sourceId: string) => void;
}) {
  const choices = reconciliationRows(data, accountId, '9999-12-31');
  return (
    <>
      <div className="section-header modal-section"><h3>{title}</h3></div>
      <div className="list compact">
        {items.length ? items.slice(0, 50).map((item) => (
          <div key={item.id} className="list-row bank-feed-row">
            <div className="row-body">
              <b>{item.description}</b>
              <small>{item.date}{item.reference ? ` · ${item.reference}` : ''}</small>
              {!ignored ? (
                <select className="inline-select" value={item.matchedSourceId || ''} onChange={(event) => onMatch(item.id, event.target.value)}>
                  <option value="">No ledger match</option>
                  {choices.map((row) => (
                    <option key={row.sourceId} value={row.sourceId}>
                      {row.date} · {row.memo} · {fmtMoney(row.movement)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="row-right wide">
              <b className={item.amount < 0 ? 'expense' : 'income'}>{fmtMoney(item.amount)}</b>
              <small>{item.matchedSourceId ? sourceLabel(data, item.matchedSourceId) : 'Unmatched'}</small>
            </div>
            <div className="row-actions">
              {!ignored && !item.matchedSourceId ? <button onClick={() => onRecord(item)}>Record</button> : null}
              {ignored ? <button onClick={() => onUnignore(item.id)}>Unignore</button> : <button className="secondary-action" onClick={() => onIgnore(item.id)}>Ignore</button>}
            </div>
          </div>
        )) : <div className="empty-card flat">No {title.toLowerCase()} bank feed rows</div>}
      </div>
    </>
  );
}

function ReconciliationModal({
  open,
  data,
  onClose,
  onDataChange,
  onFinalizeBankReconciliation,
  onVoidBankReconciliation,
}: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onDataChange: (data: LedgerData) => void;
  onFinalizeBankReconciliation?: (reconciliation: BankReconciliation) => Promise<void>;
  onVoidBankReconciliation?: (reconciliation: BankReconciliation) => Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const accounts = paymentAccounts(data);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [statementDate, setStatementDate] = useState(todayStr());
  const [statementBalance, setStatementBalance] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const account = data.accounts.find((item) => item.id === accountId);
  const rows = reconciliationRows(data, accountId, statementDate);
  const selectedSet = new Set(selected);
  const priorReconciliations = (data.bankReconciliations || []).filter((reconciliation) => reconciliation.accountId === accountId && !reconciliation.voidedAt);
  const priorCleared = new Set(priorReconciliations.flatMap((reconciliation) => reconciliation.clearedSourceIds));
  const allAccountRows = account?.chartAccountId
    ? chartAccountLedger(data, account.chartAccountId)
      .filter((row) => row.date <= statementDate)
      .map((row) => {
        const chart = data.chartOfAccounts.find((item) => item.id === account.chartAccountId);
        const movement = chart?.normalBalance === 'credit' ? row.credit - row.debit : row.debit - row.credit;
        return { ...row, movement };
      })
    : [];
  const priorClearedTotal = allAccountRows.filter((row) => priorCleared.has(row.sourceId)).reduce((sum, row) => sum + row.movement, 0);
  const clearedTotal = rows.filter((row) => selectedSet.has(row.sourceId)).reduce((sum, row) => sum + row.movement, 0);
  const bookBalance = priorClearedTotal + clearedTotal;
  const difference = (Number(statementBalance) || 0) - bookBalance;
  const history = [...(data.bankReconciliations || [])]
    .filter((reconciliation) => reconciliation.accountId === accountId)
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate) || b.id.localeCompare(a.id));

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  function toggle(sourceId: string) {
    setSelected((current) => current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId]);
  }

  async function submit() {
    if (!accountId) {
      reportError(new Error('Select an account to reconcile.'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) {
      reportError(new Error('Use YYYY-MM-DD for statement date.'));
      return;
    }
    if (isDateLocked(data, statementDate)) {
      reportError(new Error(`Reconciliations dated ${statementDate} cannot be finalized because the period is locked.`));
      return;
    }
    const balance = Number(statementBalance);
    if (!Number.isFinite(balance)) {
      reportError(new Error('Enter the statement ending balance.'));
      return;
    }
    if (Math.abs(difference) > 0.01) {
      reportError(new Error('The difference must be zero before finalising.'));
      return;
    }
    const now = new Date().toISOString();
    const reconciliation: BankReconciliation = {
      id: uid('rec_'),
      accountId,
      statementDate,
      statementBalance: balance,
      bookBalance,
      difference,
      clearedSourceIds: selected,
      createdAt: now,
      finalizedAt: now,
    };
    if (onFinalizeBankReconciliation) {
      try {
        await onFinalizeBankReconciliation(reconciliation);
        setSelected([]);
        setStatementBalance('');
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank reconciliation failed.'));
      }
      return;
    }
    onDataChange({
      ...data,
      bankReconciliations: [...(data.bankReconciliations || []), reconciliation],
      auditLog: [...(data.auditLog || []), auditEntry('finalize', 'bank_reconciliation', reconciliation.id, `Statement ${statementDate}`)],
    });
    setSelected([]);
    setStatementBalance('');
  }

  async function voidReconciliation(reconciliation: BankReconciliation) {
    if (isDateLocked(data, reconciliation.statementDate)) {
      reportError(new Error(`Reconciliation ${reconciliation.statementDate} cannot be voided because the period is locked.`));
      return;
    }
    if (onVoidBankReconciliation) {
      try {
        await onVoidBankReconciliation(reconciliation);
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Bank reconciliation void failed.'));
      }
      return;
    }
    const now = new Date().toISOString();
    onDataChange({
      ...data,
      bankReconciliations: (data.bankReconciliations || []).map((item) => item.id === reconciliation.id ? { ...item, voidedAt: now } : item),
      bankFeedItems: (data.bankFeedItems || []).map((item) => reconciliation.clearedSourceIds.includes(item.matchedSourceId || '') ? { ...item, reconciledAt: undefined } : item),
      auditLog: [...(data.auditLog || []), auditEntry('void', 'bank_reconciliation', reconciliation.id, `Statement ${reconciliation.statementDate}`)],
    });
  }

  return (
    <Modal open={open} title="Bank Reconciliation" onClose={onClose}>
      <div className="form-card">
        <label>Payment Account
          <select value={accountId} onChange={(event) => {
            setAccountId(event.target.value);
            setSelected([]);
          }}>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {chartAccountName(data, item.chartAccountId)}</option>
            ))}
          </select>
        </label>
        <label>Statement Date
          <input value={statementDate} onChange={(event) => {
            setStatementDate(event.target.value);
            setSelected([]);
          }} />
        </label>
        <label>Statement Ending Balance
          <input type="number" step={0.01} value={statementBalance} onChange={(event) => setStatementBalance(event.target.value)} />
        </label>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><span>Previously Cleared</span><strong>{fmtMoney(priorClearedTotal)}</strong></div>
        <div className="stat-card"><span>Selected Movement</span><strong>{fmtMoney(clearedTotal)}</strong></div>
        <div className="stat-card"><span>Book Balance</span><strong>{fmtMoney(bookBalance)}</strong></div>
        <div className="stat-card"><span>Difference</span><strong className={Math.abs(difference) > 0.01 ? 'expense' : 'income'}>{fmtMoney(difference)}</strong></div>
      </div>
      <div className="section-header modal-section">
        <h3>Uncleared Items</h3>
        <button className="small-action" onClick={submit}>Finalise</button>
      </div>
      <div className="list compact">
        {rows.length ? rows.map((row) => (
          <button key={row.sourceId} className={`list-row recon-row ${selectedSet.has(row.sourceId) ? 'selected' : ''}`} onClick={() => toggle(row.sourceId)}>
            <span className="row-body">
              <b>{row.memo}</b>
              <small>{row.date}</small>
            </span>
            <span className="row-right wide">
              <b className={row.movement < 0 ? 'expense' : 'income'}>{fmtMoney(row.movement)}</b>
              <small>{selectedSet.has(row.sourceId) ? 'Selected' : 'Uncleared'}</small>
            </span>
          </button>
        )) : <div className="empty-card flat">No uncleared items through this date</div>}
      </div>
      <div className="section-header modal-section"><h3>History</h3></div>
      <div className="list compact">
        {history.length ? history.slice(0, 8).map((reconciliation) => (
          <div key={reconciliation.id} className="list-row">
            <span className="row-body">
              <b>{reconciliation.statementDate} · {fmtMoney(reconciliation.statementBalance)}</b>
              <small>{reconciliation.voidedAt ? 'Voided' : `Finalised ${reconciliation.finalizedAt.slice(0, 10)}`} · {reconciliation.clearedSourceIds.length} items</small>
            </span>
            <span className="row-right wide"><b>{fmtMoney(reconciliation.difference)}</b><small>Difference</small></span>
            {!reconciliation.voidedAt ? (
              <span className="row-actions"><button className="secondary-action" onClick={() => voidReconciliation(reconciliation)}>Void</button></span>
            ) : null}
          </div>
        )) : <div className="empty-card flat">No reconciliation history</div>}
      </div>
    </Modal>
  );
}

function AccountModal({
  open,
  data,
  account,
  onClose,
  onSave,
  onArchive,
}: {
  open: boolean;
  data: LedgerData;
  account: Account | null;
  onClose: () => void;
  onSave: (account: Account) => void | Promise<void>;
  onArchive: (accountId: string) => void | Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [initBalance, setInitBalance] = useState('0');
  const [icon, setIcon] = useState('🏦');
  const [color, setColor] = useState(defaultColors[0]);
  const [chartAccountId, setChartAccountId] = useState('');
  const archiveGuard = account ? paymentAccountArchiveGuard(data, account) : null;

  useEffect(() => {
    if (!open) return;
    const nextType = account?.type || 'bank';
    setName(account?.name || '');
    setType(nextType);
    setInitBalance(String(account?.initBalance || 0));
    setIcon(account?.icon || (nextType === 'credit' ? '💳' : nextType === 'cash' ? '💵' : '🏦'));
    setColor(account?.color || defaultColors[0]);
    setChartAccountId(account?.chartAccountId || defaultChartForType(data, nextType));
  }, [account, data, open]);

  useEffect(() => {
    if (!account) setChartAccountId(defaultChartForType(data, type));
  }, [account, data, type]);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      reportError(new Error('Account name is required.'));
      return;
    }
    try {
      await onSave({
        id: account?.id || uid('a'),
        name: trimmedName,
        type,
        initBalance: Number(initBalance) || 0,
        icon: icon.trim() || '🏦',
        color,
        chartAccountId: chartAccountId || defaultChartForType(data, type),
      });
    } catch (error) {
      reportError(error instanceof Error ? error : new Error('Account save failed.'));
    }
  }

  async function archiveAccount() {
    if (!account || archiveGuard?.blocked) return;
    if (!window.confirm(`Archive "${account.name}"? It will no longer appear in payment account pickers.`)) return;
    try {
      await onArchive(account.id);
    } catch (error) {
      reportError(error instanceof Error ? error : new Error('Account archive failed.'));
    }
  }

  return (
    <Modal
      open={open}
      title={account ? 'Edit Account' : 'New Account'}
      onClose={onClose}
      footer={(
        <>
          <button className="primary wide" onClick={submit}>Save Account</button>
          {account ? (
            <button className="primary danger-action" onClick={archiveAccount} disabled={archiveGuard?.blocked}>Archive</button>
          ) : null}
        </>
      )}
    >
      <div className="form-card">
        <label>Name <input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Type <select value={type} onChange={(event) => setType(event.target.value as AccountType)}>
          {accountTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Opening Balance <input type="number" step={0.01} value={initBalance} onChange={(event) => setInitBalance(event.target.value)} /></label>
        <label>Icon <input value={icon} maxLength={4} onChange={(event) => setIcon(event.target.value)} /></label>
      </div>
      <div className="swatch-row">
        {defaultColors.map((item) => (
          <button
            key={item}
            className={`swatch ${color === item ? 'active' : ''}`}
            style={{ backgroundColor: item }}
            aria-label={item}
            onClick={() => setColor(item)}
          />
        ))}
      </div>
      <div className="form-card">
        <label>Chart Account <select value={chartAccountId} onChange={(event) => setChartAccountId(event.target.value)}>
          {data.chartOfAccounts
            .filter((chart) => chart.class === 'asset' || chart.class === 'liability')
            .map((chart) => <option key={chart.id} value={chart.id}>{chart.code} · {chart.name}</option>)}
        </select></label>
      </div>
      {account ? (
        <div className={`empty-card modal-note ${archiveGuard?.blocked ? 'warning-card' : ''}`}>
          {archiveGuard?.message}
        </div>
      ) : null}
    </Modal>
  );
}

function paymentAccountArchiveGuard(data: LedgerData, account: Account) {
  const usedByTransaction = data.transactions.some((tx) => !tx.voidedAt && (tx.accountId === account.id || tx.accountToId === account.id));
  const usedByPayment = data.transactions.some((tx) => (tx.payments || []).some((payment) => !payment.voidedAt && payment.accountId === account.id));
  const hasOpeningBalance = Math.abs(Number(account.initBalance) || 0) > 0.005;
  const usedByBankFeed = (data.bankFeedItems || []).some((item) => item.accountId === account.id);
  const usedByReconciliation = (data.bankReconciliations || []).some((reconciliation) => reconciliation.accountId === account.id && !reconciliation.voidedAt);
  const reasons = [
    hasOpeningBalance ? 'opening balance' : '',
    usedByTransaction ? 'transactions' : '',
    usedByPayment ? 'payments' : '',
    usedByBankFeed ? 'bank feed items' : '',
    usedByReconciliation ? 'reconciliations' : '',
  ].filter(Boolean);

  if (reasons.length) {
    return {
      blocked: true,
      message: `This account has ${reasons.join(', ')} and cannot be archived. Keep it active for audit history and reporting.`,
    };
  }
  return {
    blocked: false,
    message: 'This account has no ledger history and can be archived.',
  };
}

function defaultChartForType(data: LedgerData, type: AccountType) {
  const code = type === 'cash' ? '1000'
    : type === 'bank' ? '1010'
    : type === 'ewallet' ? '1030'
    : type === 'credit' ? '2200'
    : type === 'investment' ? '1400'
    : type === 'loan' ? '2500'
    : '1010';
  return data.chartOfAccounts.find((chart) => chart.code === code)?.id || data.chartOfAccounts[0]?.id || '';
}
