import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppAlerts } from '../../components/AppAlerts';
import { chartAccountName, fmtMoney, todayStr, uid } from '../../domain/accounting';
import type { AuditLogEntry, JournalLine, LedgerData, ManualJournal } from '../../domain/models';

type JournalLineDraft = {
  chartAccountId: string;
  debit: string;
  credit: string;
};

type JournalTab = 'journals' | 'audit';

interface JournalsProps {
  data: LedgerData;
  onSaveJournal: (journal: ManualJournal) => void | Promise<void>;
  onVoidJournal: (journal: ManualJournal) => void | Promise<void>;
  onReverseJournal: (journal: ManualJournal) => void | Promise<void>;
  canWrite?: boolean;
}

export function Journals({ data, onSaveJournal, onVoidJournal, onReverseJournal, canWrite = true }: JournalsProps) {
  const { reportError } = useAppAlerts();
  const [tab, setTab] = useState<JournalTab>('journals');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<ManualJournal | null>(null);
  const activeJournals = (data.manualJournals || []).filter((journal) => !journal.voidedAt);
  const voidedJournals = (data.manualJournals || []).filter((journal) => journal.voidedAt);
  const debitTotal = activeJournals.reduce((sum, journal) => sum + journalTotal(journal), 0);
  const auditRows = [...(data.auditLog || [])].sort((a, b) => b.date.localeCompare(a.date));

  function openNewJournal() {
    setEditingJournal(null);
    setModalOpen(true);
  }

  function saveJournal(journal: ManualJournal) {
    return Promise.resolve(onSaveJournal(journal)).then(() => {
      setEditingJournal(null);
      setModalOpen(false);
    }).catch((error) => {
      reportError(error instanceof Error ? error : new Error('Manual journal save failed.'));
    });
  }

  return (
    <section className="view">
      <header className="large-header split-header">
        <div>
          <h1>Journals / Audit</h1>
          <p>Manual postings and accounting audit trail</p>
        </div>
        {canWrite ? <button className="primary" onClick={openNewJournal}>New Manual Journal</button> : null}
      </header>

      <div className="toolbar-row">
        <div className="seg-control compact-control">
          <button className={tab === 'journals' ? 'active' : ''} onClick={() => setTab('journals')}>Manual Journals</button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit Log</button>
        </div>
      </div>

      {tab === 'journals' ? (
        <>
          <div className="stats-grid three">
            <div className="stat-card"><span>Active Journals</span><strong>{activeJournals.length}</strong></div>
            <div className="stat-card"><span>Posted Debit Total</span><strong>{fmtMoney(debitTotal)}</strong></div>
            <div className="stat-card"><span>Voided</span><strong className={voidedJournals.length ? 'due' : ''}>{voidedJournals.length}</strong></div>
          </div>
          <JournalList
            data={data}
            journals={[...(data.manualJournals || [])].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))}
            onEdit={(journal) => {
              setEditingJournal(journal);
              setModalOpen(true);
            }}
            onVoid={(journal) => {
              Promise.resolve(onVoidJournal(journal)).catch((error) => {
                reportError(error instanceof Error ? error : new Error('Manual journal void failed.'));
              });
            }}
            onReverse={(journal) => {
              Promise.resolve(onReverseJournal(journal)).catch((error) => {
                reportError(error instanceof Error ? error : new Error('Manual journal reverse failed.'));
              });
            }}
            canWrite={canWrite}
          />
        </>
      ) : <AuditLogTable rows={auditRows} />}

      {canWrite ? (
        <ManualJournalModal
          open={modalOpen}
          data={data}
          journal={editingJournal}
          onClose={() => {
            setModalOpen(false);
            setEditingJournal(null);
          }}
          onSave={saveJournal}
        />
      ) : null}
    </section>
  );
}

function JournalList({ data, journals, onEdit, onVoid, onReverse, canWrite = true }: {
  data: LedgerData;
  journals: ManualJournal[];
  onEdit: (journal: ManualJournal) => void;
  onVoid: (journal: ManualJournal) => void;
  onReverse: (journal: ManualJournal) => void;
  canWrite?: boolean;
}) {
  return (
    <div className="list compact">
      {journals.length ? journals.map((journal) => {
        const isVoided = !!journal.voidedAt;
        const canChange = !isVoided && !journal.reversedAt && !journal.reversalOf;
        return (
          <div key={journal.id} className={`list-row journal-row ${isVoided ? 'voided' : ''}`}>
            <div className="row-body">
              <b>{journal.memo}</b>
              <small>
                {journal.date} · {journal.lines.length} lines · {fmtMoney(journalTotal(journal))}
                {journal.reversedAt ? ' · Reversed' : ''}
                {journal.reversalOf ? ' · Reversal' : ''}
                {isVoided ? ' · Voided' : ''}
              </small>
              <JournalLines data={data} lines={journal.lines} />
            </div>
            <div className="row-actions">
              {canWrite && canChange ? <button onClick={() => onEdit(journal)}>Edit</button> : null}
              {canWrite && canChange ? <button className="secondary-action" onClick={() => onReverse(journal)}>Reverse</button> : null}
              {canWrite && !isVoided ? <button className="danger-action" onClick={() => onVoid(journal)}>Void</button> : null}
            </div>
          </div>
        );
      }) : <div className="empty-card flat">No manual journals posted</div>}
    </div>
  );
}

function JournalLines({ data, lines }: { data: LedgerData; lines: JournalLine[] }) {
  return (
    <div className="journal-lines">
      {lines.map((line, index) => (
        <div key={`${line.chartAccountId}-${index}`} className="journal-line-mini">
          <span>{chartAccountName(data, line.chartAccountId)}</span>
          <b>{line.debit ? `Dr ${fmtMoney(line.debit)}` : `Cr ${fmtMoney(line.credit)}`}</b>
        </div>
      ))}
    </div>
  );
}

function AuditLogTable({ rows }: { rows: AuditLogEntry[] }) {
  return (
    <div className="report-card wide-card">
      <h3>Audit Log</h3>
      <div className="audit-table">
        {rows.length ? rows.map((entry) => (
          <div key={entry.id} className="audit-row">
            <span className="audit-date">{entry.date.slice(0, 19).replace('T', ' ')}</span>
            <span className="status-pill">{entry.action}</span>
            <span className="audit-entity">{entry.entityType}</span>
            <b>{entry.detail || entry.entityId}</b>
          </div>
        )) : <p className="muted">No audit entries yet</p>}
      </div>
    </div>
  );
}

function ManualJournalModal({ open, data, journal, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  journal: ManualJournal | null;
  onClose: () => void;
  onSave: (journal: ManualJournal) => void | Promise<void>;
}) {
  const { reportError } = useAppAlerts();
  const [saving, setSaving] = useState(false);
  const blankLines = useMemo(() => [
    { chartAccountId: data.chartOfAccounts[0]?.id || '', debit: '', credit: '' },
    { chartAccountId: data.chartOfAccounts[1]?.id || data.chartOfAccounts[0]?.id || '', debit: '', credit: '' },
  ], [data.chartOfAccounts]);
  const [date, setDate] = useState(todayStr());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<JournalLineDraft[]>(blankLines);

  useEffect(() => {
    if (!open) return;
    setDate(journal?.date || todayStr());
    setMemo(journal?.memo || '');
    setLines(journal
      ? journal.lines.map((line) => ({
        chartAccountId: line.chartAccountId,
        debit: line.debit ? String(line.debit) : '',
        credit: line.credit ? String(line.credit) : '',
      }))
      : blankLines);
  }, [blankLines, journal, open]);

  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const diff = totalDebit - totalCredit;
  const outOfBalance = Math.abs(diff) > 0.005;
  const hasBothSides = lines.some((line) => Number(line.debit) > 0 && Number(line.credit) > 0);
  const canPost = !outOfBalance && !hasBothSides && lines.filter((l) => l.chartAccountId && (Number(l.debit) > 0 || Number(l.credit) > 0)).length >= 2;

  function updateLine(index: number, patch: Partial<JournalLineDraft>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function submit() {
    if (saving) return;
    const parsed = lines
      .map((line) => ({ chartAccountId: line.chartAccountId, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 }))
      .filter((line) => line.chartAccountId && (line.debit > 0 || line.credit > 0));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      reportError(new Error('Use YYYY-MM-DD for journal date.'));
      return;
    }
    if (parsed.length < 2) {
      reportError(new Error('Use at least two posting lines.'));
      return;
    }
    if (parsed.some((line) => line.debit > 0 && line.credit > 0)) {
      reportError(new Error('A line cannot have both debit and credit.'));
      return;
    }
    const debit = parsed.reduce((sum, line) => sum + line.debit, 0);
    const credit = parsed.reduce((sum, line) => sum + line.credit, 0);
    if (Math.abs(debit - credit) > 0.005) {
      reportError(new Error('Total debits must equal total credits.'));
      return;
    }
    setSaving(true);
    Promise.resolve(onSave({
      id: journal?.id || uid('mj_'),
      date,
      memo: memo.trim() || 'Manual journal',
      lines: parsed,
      createdAt: journal?.createdAt || new Date().toISOString(),
      reversalOf: journal?.reversalOf,
      reversedAt: journal?.reversedAt,
    })).catch((error) => {
      reportError(error instanceof Error ? error : new Error('Manual journal save failed.'));
    }).finally(() => setSaving(false));
  }

  return (
    <Modal
      open={open}
      title={journal ? 'Edit Manual Journal' : 'Manual Journal'}
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit} disabled={saving || !canPost}>{saving ? 'Saving…' : journal ? 'Save Journal' : 'Post Journal'}</button>}
    >
      <div className="form-card">
        <label>Date <input value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Memo <input value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
      </div>
      <div className="journal-editor">
        <div className="journal-editor-head">
          <span>Account</span>
          <span>Debit</span>
          <span>Credit</span>
          <span />
        </div>
        {lines.map((line, index) => {
          const bothSides = Number(line.debit) > 0 && Number(line.credit) > 0;
          return (
            <div key={index} className={`journal-editor-row${bothSides ? ' journal-row-error' : ''}`}>
              <select value={line.chartAccountId} onChange={(event) => updateLine(index, { chartAccountId: event.target.value })}>
                {data.chartOfAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                ))}
              </select>
              <input
                type="number"
                step={0.01}
                value={line.debit}
                onChange={(event) => updateLine(index, { debit: event.target.value, credit: event.target.value ? '' : line.credit })}
              />
              <input
                type="number"
                step={0.01}
                value={line.credit}
                onChange={(event) => updateLine(index, { credit: event.target.value, debit: event.target.value ? '' : line.debit })}
              />
              <button className="icon-action" onClick={() => removeLine(index)} aria-label="Remove line">×</button>
            </div>
          );
        })}
      </div>
      <div className="toolbar-row modal-toolbar">
        <button className="primary secondary-action" onClick={() => setLines([...lines, { chartAccountId: data.chartOfAccounts[0]?.id || '', debit: '', credit: '' }])}>Add Line</button>
      </div>
      <div className={`journal-balance-bar ${canPost ? 'balanced' : 'unbalanced'}`}>
        <div className="journal-balance-totals">
          <span>Dr <strong>{fmtMoney(totalDebit)}</strong></span>
          <span>Cr <strong>{fmtMoney(totalCredit)}</strong></span>
        </div>
        {hasBothSides ? (
          <span className="journal-balance-msg error">A line cannot have both debit and credit</span>
        ) : outOfBalance ? (
          <span className="journal-balance-msg error">Out of balance by {fmtMoney(Math.abs(diff))}</span>
        ) : (
          <span className="journal-balance-msg ok">✓ Balanced</span>
        )}
      </div>
    </Modal>
  );
}

function journalTotal(journal: ManualJournal) {
  return journal.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
}
