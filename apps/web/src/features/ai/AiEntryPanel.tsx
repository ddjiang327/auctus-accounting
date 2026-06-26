import { useState, useRef, useEffect, useMemo } from 'react';
import type { LedgerData, Transaction } from '../../domain/models';
import { parseTransactionText, type ParseDraft } from './aiApi';
import { buildSuggestions } from './aiSuggestions';

interface AiEntryPanelProps {
  data: LedgerData;
  mode: 'local' | 'cloud';
  getToken: () => Promise<string | null>;
  onParsed: (draft: Partial<Transaction>) => void;
  onClose: () => void;
}

const EXAMPLE_HINTS = [
  'Bought office supplies at Officeworks for $85',
  'Sent ABC Company a $2,000 invoice, net 30',
  'Paid electricity bill $220 from CommBank',
  'Transferred $500 to petty cash',
];

export function AiEntryPanel({ data, mode, getToken, onParsed, onClose }: AiEntryPanelProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ParseDraft | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => buildSuggestions(data, text), [data, text]);

  useEffect(() => {
    textareaRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const existingDraft = draft?.missingFields.length ? draft : undefined;
    setLoading(true);
    setError('');
    if (!existingDraft) setDraft(null);
    try {
      const result = await parseTransactionText(trimmed, data, mode, getToken, existingDraft);
      setDraft(result);
      if (existingDraft) setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI parse failed');
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (!draft) return;
    const { missingFields: _mf, clarification: _cl, ...tx } = draft;
    onParsed(tx as Partial<Transaction>);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleParse();
    }
  }

  function applySuggestion(fillText: string) {
    setText(fillText);
    setDraft(null);
    setError('');
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const hasBlockingMissingFields = draft ? draft.missingFields.some((field) => field !== 'contact') : false;
  const typeLabel = draft?.type === 'income' ? 'Income' : draft?.type === 'transfer' ? 'Transfer' : 'Expense';

  return (
    <div className="ai-entry-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ai-entry-panel">
        <div className="ai-entry-header">
          <span className="ai-entry-title">✨ AI Entry</span>
          <button className="ai-entry-close" onClick={onClose}>✕</button>
        </div>

        <textarea
          ref={textareaRef}
          className="ai-entry-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDraft((current) => current?.missingFields.length ? current : null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={draft?.missingFields.length
            ? 'Answer the question above to update this draft'
            : `Describe a transaction…\ne.g. "${EXAMPLE_HINTS[Math.floor(Math.random() * EXAMPLE_HINTS.length)]}"`}
          rows={3}
          disabled={loading}
        />

        {suggestions.length > 0 && !draft && (
          <div className="ai-suggestions">
            <span className="ai-suggestions-label">
              {text.trim() ? 'Matches:' : 'Recent:'}
            </span>
            <div className="ai-suggestions-list">
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  className="ai-suggestion-chip"
                  onClick={() => applySuggestion(s.fillText)}
                  title={s.label}
                >
                  {s.label.length > 48 ? s.label.slice(0, 46) + '…' : s.label}
                  {s.count > 1 && <span className="ai-chip-count">×{s.count}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="ai-entry-error">{error}</p>}

        {draft && (
          <div className="ai-entry-draft">
            <div className="ai-entry-draft-header">
              <span className="ai-draft-type">{typeLabel}</span>
              {draft.missingFields.length > 0 && (
                <span className="ai-draft-warning">⚠ Fill in: {draft.missingFields.join(', ')}</span>
              )}
            </div>
            {draft.clarification && <p className="ai-draft-clarification">{draft.clarification}</p>}
            <dl className="ai-draft-fields">
              {draft.amount != null && <><dt>Amount</dt><dd>${draft.amount.toFixed(2)}</dd></>}
              {draft.date && <><dt>Date</dt><dd>{draft.date}</dd></>}
              {draft.dueDate && <><dt>Due</dt><dd>{draft.dueDate}</dd></>}
              {draft.paymentTerms && <><dt>Terms</dt><dd>{draft.paymentTerms}</dd></>}
              {draft.invoiceNo && <><dt>Invoice No.</dt><dd>{draft.invoiceNo}</dd></>}
              {draft.creditNoteNo && <><dt>Credit No.</dt><dd>{draft.creditNoteNo}</dd></>}
              {draft.accountId && <><dt>{draft.type === 'transfer' ? 'From' : 'Account'}</dt><dd>{accountLabel(data, draft.accountId)}</dd></>}
              {draft.accountToId && <><dt>To</dt><dd>{accountLabel(data, draft.accountToId)}</dd></>}
              {draft.categoryId && <><dt>Category</dt><dd>{categoryLabel(data, draft.categoryId)}</dd></>}
              {draft.chartAccountId && <><dt>Ledger</dt><dd>{chartAccountLabel(data, draft.chartAccountId)}</dd></>}
              {draft.contactId && <><dt>Contact</dt><dd>{contactLabel(data, draft.contactId)}</dd></>}
              {draft.party && <><dt>Party</dt><dd>{draft.party}</dd></>}
              {draft.note && <><dt>Note</dt><dd>{draft.note}</dd></>}
              {draft.entryMode && <><dt>Mode</dt><dd>{draft.entryMode}</dd></>}
              {draft.gstMode && <><dt>GST</dt><dd>{draft.gstMode}</dd></>}
            </dl>
            <button
              className="ai-draft-confirm"
              onClick={handleConfirm}
              disabled={hasBlockingMissingFields}
              title={hasBlockingMissingFields ? 'Answer the required details first' : undefined}
            >
              Open in form →
            </button>
          </div>
        )}

        <div className="ai-entry-actions">
          <button
            className="ai-entry-parse-btn"
            onClick={handleParse}
            disabled={loading || !text.trim()}
          >
            {loading ? 'Parsing…' : draft?.missingFields.length ? 'Update draft  ⌘↵' : 'Parse  ⌘↵'}
          </button>
        </div>
      </div>
    </div>
  );
}

function accountLabel(data: LedgerData, id: string) {
  return data.accounts.find((account) => account.id === id)?.name || id;
}

function categoryLabel(data: LedgerData, id: string) {
  return [...data.categories.expense, ...data.categories.income].find((category) => category.id === id)?.name || id;
}

function chartAccountLabel(data: LedgerData, id: string) {
  const account = data.chartOfAccounts.find((item) => item.id === id);
  return account ? `${account.code} ${account.name}` : id;
}

function contactLabel(data: LedgerData, id: string) {
  return data.contacts.find((contact) => contact.id === id)?.name || id;
}
