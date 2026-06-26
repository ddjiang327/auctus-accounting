import type { LedgerData, Transaction } from '../../domain/models';

const API_URL = import.meta.env.VITE_AUCTUS_API_URL || 'http://127.0.0.1:4010';
const LOCAL_ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

export interface ParseDraft extends Partial<Transaction> {
  missingFields: string[];
  clarification?: string;
}

interface ParseContext {
  accounts: LedgerData['accounts'];
  categories: LedgerData['categories'];
  contacts: LedgerData['contacts'];
  chartOfAccounts: LedgerData['chartOfAccounts'];
  gstEnabled: boolean;
  today: string;
}

const PAYMENT_TERMS = new Set(['due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60']);
const GST_MODES = new Set(['inc', 'exc', 'free']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function validDate(value: unknown): value is string {
  return typeof value === 'string'
    && DATE_PATTERN.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value: unknown, today?: string) {
  if (validDate(value)) return value;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const normalized = text.toLowerCase();
  if (today && validDate(today)) {
    if (normalized === 'today') return today;
    if (normalized === 'yesterday') return addDays(today, -1);
    if (normalized === 'tomorrow') return addDays(today, 1);
  }
  const auNumeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (auNumeric) return isoDate(Number(auNumeric[3]), Number(auNumeric[2]), Number(auNumeric[1]));
  const monthFirst = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthFirst) return isoDate(Number(monthFirst[3]), MONTHS[monthFirst[1].toLowerCase()] || 0, Number(monthFirst[2]));
  const dayFirst = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayFirst) return isoDate(Number(dayFirst[3]), MONTHS[dayFirst[2].toLowerCase()] || 0, Number(dayFirst[1]));
  return undefined;
}

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dueDateForTerms(dateStr: string, terms?: string) {
  const days = terms === 'net_7' ? 7 : terms === 'net_14' ? 14 : terms === 'net_30' ? 30 : terms === 'net_60' ? 60 : 0;
  return addDays(dateStr, days);
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0 ? Math.abs(value) : 0;
  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replace(/[$,\s]/g, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return 0;
  const amount = Math.abs(Number(normalized));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function normalizeGstMode(value: unknown): ParseDraft['gstMode'] | undefined {
  const normalized = normalizeName(String(value ?? '')) || '';
  if (GST_MODES.has(normalized)) return normalized as ParseDraft['gstMode'];
  if (!normalized) return undefined;
  if (/\b(gst\s*free|free|exempt|no\s*gst|without\s*gst)\b/.test(normalized)) return 'free';
  if (/\b(exc|excl|exclusive|plus|before)\s*gst\b|\bgst\s*(extra|on\s*top)\b/.test(normalized)) return 'exc';
  if (/\b(inc|incl|inclusive|includes|including)\s*gst\b|\bgst\s*included\b/.test(normalized)) return 'inc';
  return undefined;
}

function normalizePaymentTerms(value: unknown): ParseDraft['paymentTerms'] | undefined {
  const normalized = normalizeName(String(value ?? '')) || '';
  if (PAYMENT_TERMS.has(normalized)) return normalized as ParseDraft['paymentTerms'];
  if (!normalized) return undefined;
  if (/\bdue\s*(on\s*)?(receipt|now)\b|\bimmediate\b/.test(normalized)) return 'due_on_receipt';
  const days = normalized.match(/\b(?:net\s*)?(7|14|30|60)(?:\s*days?)?\b/);
  return days ? `net_${days[1]}` as ParseDraft['paymentTerms'] : undefined;
}

function normalizeEntryMode(value: unknown): ParseDraft['entryMode'] | undefined {
  const normalized = normalizeName(String(value ?? '')) || '';
  if (normalized === 'cash' || normalized === 'invoice' || normalized === 'credit_note') return normalized;
  if (!normalized) return undefined;
  if (/\b(credit\s*note|supplier\s*credit|credit\s*memo|refund\s*credit)\b/.test(normalized)) return 'credit_note';
  if (/\b(invoice|bill|supplier\s*invoice|payable|accounts\s*payable)\b/.test(normalized)) return 'invoice';
  if (/\b(cash|paid|payment|receipt|card|eftpos)\b/.test(normalized)) return 'cash';
  return undefined;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clarificationForMissingFields(missingFields: string[]) {
  if (!missingFields.length) return undefined;
  return `Can you confirm the ${missingFields.join(', ')}?`;
}

function defaultChartAccountId(context: ParseContext, type: ParseDraft['type']): string | undefined {
  if (type === 'transfer') return undefined;
  const preferredCode = type === 'income' ? '4010' : '7030';
  const expectedClass = type === 'income' ? 'revenue' : 'expense';
  return context.chartOfAccounts.find((account) => account.code === preferredCode)?.id
    || context.chartOfAccounts.find((account) => account.class === expectedClass)?.id;
}

function normalizeName(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizedNameCandidates(value?: string) {
  const candidates = [normalizeName(value)];
  const pipeLabel = value?.split('|').slice(1).join('|');
  if (pipeLabel) candidates.push(normalizeName(pipeLabel));
  return unique(candidates.filter((candidate): candidate is string => Boolean(candidate)));
}

function matchByIdOrName<T extends { id: string; name: string }>(items: T[], value?: string): { item?: T; ambiguous: boolean } {
  const candidates = normalizedNameCandidates(value);
  if (!candidates.length) return { ambiguous: false };
  const idMatch = items.find((item) => item.id === value);
  if (idMatch) return { item: idMatch, ambiguous: false };
  const nameMatches = items.filter((item) => {
    const name = normalizeName(item.name);
    return name ? candidates.includes(name) : false;
  });
  return nameMatches.length === 1
    ? { item: nameMatches[0], ambiguous: false }
    : { ambiguous: nameMatches.length > 1 };
}

function contactSupportsType(contact: ParseContext['contacts'][number], type: ParseDraft['type']) {
  if (type === 'transfer') return false;
  return type === 'income'
    ? contact.type === 'customer' || contact.type === 'both'
    : contact.type === 'supplier' || contact.type === 'both';
}

function matchContactByIdOrParty(
  contacts: ParseContext['contacts'],
  type: ParseDraft['type'],
  contactId?: string,
  party?: string,
): { item?: ParseContext['contacts'][number]; ambiguous: boolean } {
  if (type === 'transfer') return { item: undefined, ambiguous: false };
  const supportedContacts = contacts.filter((contact) => contactSupportsType(contact, type));
  const idMatch = supportedContacts.find((contact) => contact.id === contactId);
  if (idMatch) return { item: idMatch, ambiguous: false };
  const partyNames = normalizedNameCandidates(party);
  if (!partyNames.length) return { item: undefined, ambiguous: false };
  const nameMatches = supportedContacts.filter((contact) => {
    const name = normalizeName(contact.name);
    return name ? partyNames.includes(name) : false;
  });
  return nameMatches.length === 1
    ? { item: nameMatches[0], ambiguous: false }
    : { item: undefined, ambiguous: nameMatches.length > 1 };
}

function normalizeTransactionType(value: unknown): ParseDraft['type'] {
  const normalized = normalizeName(String(value ?? '')) || '';
  if (normalized === 'income' || normalized === 'expense' || normalized === 'transfer') return normalized;
  if (/\b(transfer|move|moved)\b/.test(normalized)) return 'transfer';
  if (/\b(income|sale|sales|revenue|customer\s*receipt|received|deposit)\b/.test(normalized)) return 'income';
  if (/\b(expense|purchase|bill|supplier\s*invoice|paid|payment|cost)\b/.test(normalized)) return 'expense';
  return 'expense';
}

function normalizeDraft(input: unknown, context: ParseContext): ParseDraft {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<ParseDraft>;
  const missing = Array.isArray(raw.missingFields)
    ? raw.missingFields.filter((field): field is string => typeof field === 'string')
    : [];

  const type = normalizeTransactionType(raw.type);
  const amount = parseAmount(raw.amount);
  if (!amount) missing.push('amount');

  const accountMatch = matchByIdOrName(context.accounts, raw.accountId);
  const accountToMatch = matchByIdOrName(context.accounts, raw.accountToId);
  const accountId = accountMatch.item?.id;
  const accountToId = accountToMatch.item?.id;
  if (!accountId) missing.push(type === 'transfer' ? 'source account' : 'account');
  if (type === 'transfer' && !accountToId) missing.push('destination account');

  const categories = type === 'income' ? context.categories.income : context.categories.expense;
  const categoryMatch = type === 'transfer'
    ? { item: undefined, ambiguous: false }
    : matchByIdOrName(categories, raw.categoryId);
  const category = categoryMatch.item;
  const categoryId = category?.id;
  if (type !== 'transfer' && !categoryId) missing.push('category');

  const categoryChartAccountId = category?.chartAccountId && context.chartOfAccounts.some((account) => {
    if (account.id !== category.chartAccountId) return false;
    return type === 'income' ? account.class === 'revenue' : account.class === 'expense';
  }) ? category.chartAccountId : undefined;
  const parsedChartAccountId = type === 'transfer' ? undefined : context.chartOfAccounts.some((account) => {
    if (account.id !== raw.chartAccountId) return false;
    return type === 'income' ? account.class === 'revenue' : account.class === 'expense';
  }) ? raw.chartAccountId : undefined;
  const chartAccountId = categoryChartAccountId || parsedChartAccountId || defaultChartAccountId(context, type);

  const party = typeof raw.party === 'string' ? raw.party.trim() || undefined : undefined;
  const contactMatch = matchContactByIdOrParty(context.contacts, type, raw.contactId, party);
  const matchedContact = contactMatch.item;
  const contactId = matchedContact?.id;

  const entryMode = type === 'transfer'
    ? 'cash'
    : normalizeEntryMode(raw.entryMode) || 'cash';
  const gstMode = type === 'transfer' || !context.gstEnabled
    ? null
    : normalizeGstMode(raw.gstMode) || 'inc';
  const contactPaymentTerms = normalizePaymentTerms(matchedContact?.paymentTerms);
  const paymentTerms = entryMode === 'invoice'
    ? normalizePaymentTerms(raw.paymentTerms) || contactPaymentTerms
    : undefined;

  const date = normalizeDate(raw.date, context.today) || context.today;
  const dueDate = entryMode === 'invoice'
    ? normalizeDate(raw.dueDate, context.today) || dueDateForTerms(date, paymentTerms)
    : undefined;
  const invoiceNo = entryMode === 'invoice' && typeof raw.invoiceNo === 'string' ? raw.invoiceNo.trim() || undefined : undefined;
  const creditNoteNo = entryMode === 'credit_note' && typeof raw.creditNoteNo === 'string' ? raw.creditNoteNo.trim() || undefined : undefined;
  if (party && !contactId && (entryMode === 'invoice' || entryMode === 'credit_note')) {
    missing.push('contact');
  }

  const missingFields = unique(missing);
  const rawClarification = typeof raw.clarification === 'string' ? raw.clarification.trim() : '';

  return {
    type,
    amount,
    date,
    accountId,
    accountToId: type === 'transfer' ? accountToId : undefined,
    categoryId,
    chartAccountId,
    contactId,
    party,
    note: typeof raw.note === 'string' ? raw.note.trim() || undefined : undefined,
    entryMode,
    gstMode,
    paymentTerms,
    dueDate,
    invoiceNo,
    creditNoteNo,
    missingFields,
    clarification: rawClarification || clarificationForMissingFields(missingFields),
  };
}

function buildContext(data: LedgerData): ParseContext {
  return {
    accounts: data.accounts,
    categories: {
      income: data.categories.income.filter((category) => !category.archivedAt),
      expense: data.categories.expense.filter((category) => !category.archivedAt),
    },
    contacts: data.contacts.filter((c) => !c.archivedAt),
    chartOfAccounts: data.chartOfAccounts,
    gstEnabled: data.settings.gstEnabled ?? false,
    today: new Date().toISOString().slice(0, 10),
  };
}

async function parseViaServer(
  text: string,
  context: ParseContext,
  token: string,
  existingDraft?: ParseDraft,
): Promise<ParseDraft> {
  const res = await fetch(`${API_URL}/v1/ai/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, context, existingDraft }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'AI parse failed' })) as { message?: string; error?: string };
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  const body = await res.json() as { draft: ParseDraft };
  return body.draft;
}

function buildSystemPrompt(ctx: ParseContext): string {
  const accounts = ctx.accounts.map((a) => `  ${a.id} | ${a.name} (${a.type})`).join('\n');
  const expCats = ctx.categories.expense.map((c) => `  ${c.id} | ${c.name}${c.chartAccountId ? ` | chartAccount=${c.chartAccountId}` : ''}`).join('\n');
  const incCats = ctx.categories.income.map((c) => `  ${c.id} | ${c.name}${c.chartAccountId ? ` | chartAccount=${c.chartAccountId}` : ''}`).join('\n');
  const contacts = ctx.contacts.length ? ctx.contacts.map((c) => `  ${c.id} | ${c.name} (${c.type}${c.paymentTerms ? `, terms=${c.paymentTerms}` : ''})`).join('\n') : '  (none)';
  const coa = ctx.chartOfAccounts.map((a) => `  ${a.id} | ${a.code} ${a.name}`).join('\n');
  return `You are an AI accounting assistant. Parse natural language transaction descriptions into structured entries.

Payment Accounts:\n${accounts}
Expense Categories:\n${expCats}
Income Categories:\n${incCats}
Contacts:\n${contacts}
Chart of Accounts:\n${coa}
Today: ${ctx.today}
GST: ${ctx.gstEnabled ? 'enabled 10%' : 'disabled'}

Rules: default date=today, match names loosely, entryMode=cash for payments, invoice for invoices/bills, credit_note for credit notes/supplier credits, gstMode=inc/exc/free/null, preserve invoiceNo/creditNoteNo when mentioned, list uncertain fields in missingFields, and if missingFields is not empty set clarification to one concise question asking the user for those fields.`;
}

async function parseViaDirectApi(text: string, context: ParseContext, existingDraft?: ParseDraft): Promise<ParseDraft> {
  const toolSchema = {
    name: 'parse_transaction',
    description: 'Parse a natural language transaction into a structured draft',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
        amount: { type: 'number' },
        date: { type: 'string' },
        accountId: { type: 'string' },
        accountToId: { type: 'string' },
        categoryId: { type: 'string' },
        chartAccountId: { type: 'string' },
        contactId: { type: 'string' },
        party: { type: 'string' },
        note: { type: 'string' },
        entryMode: { type: 'string', enum: ['cash', 'invoice', 'credit_note'] },
        gstMode: { type: 'string', enum: ['inc', 'exc', 'free'] },
        paymentTerms: { type: 'string', enum: ['due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60'] },
        dueDate: { type: 'string' },
        invoiceNo: { type: 'string' },
        creditNoteNo: { type: 'string' },
        missingFields: { type: 'array', items: { type: 'string' } },
        clarification: { type: 'string' },
      },
      required: ['type', 'amount', 'missingFields'],
    },
  };

  const userContent = existingDraft
    ? `Current draft JSON:\n${JSON.stringify(existingDraft)}\n\nUser clarification:\n${text}\n\nUpdate the draft using the clarification. Return the full corrected draft.`
    : text;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': LOCAL_ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(context),
      messages: [{ role: 'user', content: userContent }],
      tools: [toolSchema],
      tool_choice: { type: 'tool', name: 'parse_transaction' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err}`);
  }

  const body = await res.json() as { content: Array<{ type: string; name?: string; input?: unknown }> };
  const toolUse = body.content.find((b) => b.type === 'tool_use' && b.name === 'parse_transaction');
  if (!toolUse?.input) throw new Error('AI did not return a result');
  const input = existingDraft && typeof toolUse.input === 'object'
    ? mergeDraftUpdate(existingDraft, toolUse.input)
    : toolUse.input;
  return normalizeDraft(input, context);
}

function mergeDraftUpdate(existingDraft: ParseDraft, update: object) {
  const { missingFields: _missingFields, clarification: _clarification, ...base } = existingDraft;
  return { ...base, ...update };
}

export async function parseTransactionText(
  text: string,
  data: LedgerData,
  mode: 'local' | 'cloud',
  getToken: () => Promise<string | null>,
  existingDraft?: ParseDraft,
): Promise<ParseDraft> {
  const context = buildContext(data);

  if (mode === 'cloud') {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return parseViaServer(text, context, token, existingDraft);
  }

  if (LOCAL_ANTHROPIC_KEY) {
    return parseViaDirectApi(text, context, existingDraft);
  }

  throw new Error('AI entry in local mode requires VITE_ANTHROPIC_API_KEY to be set');
}
