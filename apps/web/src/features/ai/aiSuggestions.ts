import type { LedgerData } from '../../domain/models';

export interface Suggestion {
  key: string;
  label: string;
  fillText: string;
  count: number;
}

function matchScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 3;
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const matched = words.filter((w) => t.includes(w));
  return matched.length / words.length;
}

export function buildSuggestions(data: LedgerData, query: string): Suggestion[] {
  const map: Record<string, { label: string; fillText: string; count: number }> = {};

  for (const tx of data.transactions) {
    if (tx.voidedAt || tx.type === 'transfer') continue;

    const account = data.accounts.find((a) => a.id === tx.accountId);
    const contact = data.contacts.find((c) => c.id === tx.contactId);
    const category = [...data.categories.expense, ...data.categories.income]
      .find((c) => c.id === tx.categoryId);

    const party = contact?.name || tx.party || '';
    const desc = tx.note || category?.name || party;
    if (!desc) continue;

    const amt = `$${Number(tx.amount).toFixed(0)}`;
    const acctLabel = account ? ' · ' + account.name : '';
    const partyLabel = party && desc !== party ? ' · ' + party : '';
    const label = `${desc}${partyLabel} · ${amt}${acctLabel}`;

    let fillText: string;
    if (tx.type === 'expense') {
      fillText = party
        ? `Paid ${party} ${amt}${desc && desc !== party ? ' for ' + desc : ''}`
        : `${desc} ${amt}`;
    } else {
      fillText = party
        ? `Received ${amt} from ${party}${desc && desc !== party ? ' – ' + desc : ''}`
        : `Income ${amt} – ${desc}`;
    }

    const key = `${tx.type}|${desc.toLowerCase()}|${tx.accountId || ''}`;
    if (map[key]) {
      map[key].count++;
    } else {
      map[key] = { label, fillText, count: 1 };
    }
  }

  const all = Object.entries(map).map(([key, v]) => ({ key, ...v }));

  if (!query.trim()) {
    return all.sort((a, b) => b.count - a.count).slice(0, 4);
  }

  return all
    .map((s) => ({ ...s, score: matchScore(query, s.label) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 4);
}
