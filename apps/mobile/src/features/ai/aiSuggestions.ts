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
  const matched = words.filter((word) => t.includes(word));
  return matched.length / words.length;
}

export function buildSuggestions(data: LedgerData, query: string): Suggestion[] {
  const map: Record<string, { label: string; fillText: string; count: number }> = {};

  for (const tx of data.transactions) {
    if (tx.voidedAt || tx.type === 'transfer') continue;

    const account = data.accounts.find((item) => item.id === tx.accountId);
    const contact = data.contacts.find((item) => item.id === tx.contactId);
    const category = [...data.categories.expense, ...data.categories.income]
      .find((item) => item.id === tx.categoryId);

    const party = contact?.name || tx.party || '';
    const desc = tx.note || category?.name || party;
    if (!desc) continue;

    const amount = `$${Number(tx.amount).toFixed(0)}`;
    const accountLabel = account ? ` - ${account.name}` : '';
    const partyLabel = party && desc !== party ? ` - ${party}` : '';
    const label = `${desc}${partyLabel} · ${amount}${accountLabel}`;

    const fillText = tx.type === 'expense'
      ? party
        ? `Paid ${party} ${amount}${desc && desc !== party ? ` for ${desc}` : ''}`
        : `${desc} ${amount}`
      : party
        ? `Received ${amount} from ${party}${desc && desc !== party ? ` - ${desc}` : ''}`
        : `Income ${amount} - ${desc}`;

    const key = `${tx.type}|${desc.toLowerCase()}|${tx.accountId || ''}`;
    if (map[key]) {
      map[key].count++;
    } else {
      map[key] = { label, fillText, count: 1 };
    }
  }

  const all = Object.entries(map).map(([key, value]) => ({ key, ...value }));

  if (!query.trim()) {
    return all.sort((a, b) => b.count - a.count).slice(0, 4);
  }

  return all
    .map((suggestion) => ({ ...suggestion, score: matchScore(query, suggestion.label) }))
    .filter((suggestion) => suggestion.score > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 4);
}
