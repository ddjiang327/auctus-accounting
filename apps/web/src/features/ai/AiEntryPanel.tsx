import { useState, useRef, useEffect } from 'react';
import type { LedgerData, Transaction } from '../../domain/models';
import { parseTransactionText, type ParseDraft } from './aiApi';

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
    setLoading(true);
    setError('');
    setDraft(null);
    try {
      const result = await parseTransactionText(trimmed, data, mode, getToken);
      setDraft(result);
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Describe a transaction…\ne.g. "${EXAMPLE_HINTS[Math.floor(Math.random() * EXAMPLE_HINTS.length)]}"`}
          rows={3}
          disabled={loading}
        />

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
              {draft.party && <><dt>Party</dt><dd>{draft.party}</dd></>}
              {draft.note && <><dt>Note</dt><dd>{draft.note}</dd></>}
              {draft.entryMode && <><dt>Mode</dt><dd>{draft.entryMode}</dd></>}
              {draft.gstMode && <><dt>GST</dt><dd>{draft.gstMode}</dd></>}
            </dl>
            <button className="ai-draft-confirm" onClick={handleConfirm}>
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
            {loading ? 'Parsing…' : 'Parse  ⌘↵'}
          </button>
        </div>
      </div>
    </div>
  );
}
