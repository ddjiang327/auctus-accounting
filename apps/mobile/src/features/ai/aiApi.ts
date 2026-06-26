import type { LedgerData, Transaction } from '../../domain/models';

// In Expo, public env vars use EXPO_PUBLIC_ prefix
const LOCAL_ANTHROPIC_KEY = (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY as string) || '';
const API_URL = (process.env.EXPO_PUBLIC_AUCTUS_API_URL as string) || 'http://127.0.0.1:4010';

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

function validDate(value: unknown): value is string {
  return typeof value === 'string'
    && DATE_PATTERN.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
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
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replace(/[$,\s]/g, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return 0;
  const amount = Number(normalized);
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
  return value?.trim().toLowerCase();
}

function matchByIdOrName<T extends { id: string; name: string }>(items: T[], value?: string) {
  const normalized = normalizeName(value);
  if (!normalized) return undefined;
  return items.find((item) => item.id === value)
    || items.find((item) => normalizeName(item.name) === normalized);
}

function contactSupportsType(contact: ParseContext['contacts'][number], type: ParseDraft['type']) {
  if (type === 'transfer') return false;
  return type === 'income'
    ? contact.type === 'customer' || contact.type === 'both'
    : contact.type === 'supplier' || contact.type === 'both';
}

function normalizeDraft(input: unknown, context: ParseContext): ParseDraft {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<ParseDraft>;
  const missing = Array.isArray(raw.missingFields)
    ? raw.missingFields.filter((field): field is string => typeof field === 'string')
    : [];

  const type: ParseDraft['type'] = raw.type === 'income' || raw.type === 'transfer' ? raw.type : 'expense';
  const amount = parseAmount(raw.amount);
  if (!amount) missing.push('amount');

  const accountId = matchByIdOrName(context.accounts, raw.accountId)?.id;
  const accountToId = matchByIdOrName(context.accounts, raw.accountToId)?.id;
  if (!accountId) missing.push(type === 'transfer' ? 'source account' : 'account');
  if (type === 'transfer' && !accountToId) missing.push('destination account');

  const categories = type === 'income' ? context.categories.income : context.categories.expense;
  const category = type === 'transfer' ? undefined : matchByIdOrName(categories, raw.categoryId);
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
  const partyName = normalizeName(party);
  const matchedContact = type === 'transfer'
    ? undefined
    : context.contacts.find((contact) => contact.id === raw.contactId && contactSupportsType(contact, type))
      || context.contacts.find((contact) => partyName && normalizeName(contact.name) === partyName && contactSupportsType(contact, type));
  const contactId = matchedContact?.id;

  const entryMode = type === 'transfer'
    ? 'cash'
    : raw.entryMode === 'invoice' || raw.entryMode === 'credit_note' ? raw.entryMode : 'cash';
  const gstMode = type === 'transfer' || !context.gstEnabled
    ? null
    : normalizeGstMode(raw.gstMode) || 'inc';
  const contactPaymentTerms = normalizePaymentTerms(matchedContact?.paymentTerms);
  const paymentTerms = entryMode === 'invoice'
    ? normalizePaymentTerms(raw.paymentTerms) || contactPaymentTerms
    : undefined;

  const date = validDate(raw.date) ? raw.date : context.today;
  const dueDate = entryMode === 'invoice'
    ? validDate(raw.dueDate) ? raw.dueDate : dueDateForTerms(date, paymentTerms)
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

  throw new Error('AI entry requires EXPO_PUBLIC_ANTHROPIC_API_KEY to be set in your .env file');
}
