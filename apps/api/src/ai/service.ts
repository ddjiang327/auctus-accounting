import type { ApiEnv } from '../config/env.js';

interface Account { id: string; name: string; type: string; }
interface Category { id: string; name: string; chartAccountId?: string; }
interface Contact { id: string; name: string; type: string; paymentTerms?: string; }
interface ChartAccount { id: string; code: string; name: string; class: string; }

export interface ParseContext {
  accounts: Account[];
  categories: { income: Category[]; expense: Category[] };
  contacts: Contact[];
  chartOfAccounts: ChartAccount[];
  gstEnabled: boolean;
  today: string;
}

export interface ParseDraft {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  date?: string;
  accountId?: string;
  accountToId?: string;
  categoryId?: string;
  chartAccountId?: string;
  contactId?: string;
  party?: string;
  note?: string;
  entryMode?: 'cash' | 'invoice' | 'credit_note';
  gstMode?: 'inc' | 'exc' | 'free' | null;
  paymentTerms?: string;
  dueDate?: string;
  invoiceNo?: string;
  creditNoteNo?: string;
  missingFields: string[];
  clarification?: string;
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

function normalizeDate(value: unknown) {
  if (validDate(value)) return value;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
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

function normalizePaymentTerms(value: unknown): string | undefined {
  const normalized = normalizeName(String(value ?? '')) || '';
  if (PAYMENT_TERMS.has(normalized)) return normalized;
  if (!normalized) return undefined;
  if (/\bdue\s*(on\s*)?(receipt|now)\b|\bimmediate\b/.test(normalized)) return 'due_on_receipt';
  const days = normalized.match(/\b(?:net\s*)?(7|14|30|60)(?:\s*days?)?\b/);
  return days ? `net_${days[1]}` : undefined;
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

function defaultChartAccountId(ctx: ParseContext, type: ParseDraft['type']): string | undefined {
  if (type === 'transfer') return undefined;
  const preferredCode = type === 'income' ? '4010' : '7030';
  const expectedClass = type === 'income' ? 'revenue' : 'expense';
  return ctx.chartOfAccounts.find((account) => account.code === preferredCode)?.id
    || ctx.chartOfAccounts.find((account) => account.class === expectedClass)?.id;
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

function contactSupportsType(contact: Contact, type: ParseDraft['type']) {
  if (type === 'transfer') return false;
  return type === 'income'
    ? contact.type === 'customer' || contact.type === 'both'
    : contact.type === 'supplier' || contact.type === 'both';
}

function normalizeDraft(input: unknown, ctx: ParseContext): ParseDraft {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<ParseDraft>;
  const missing = Array.isArray(raw.missingFields)
    ? raw.missingFields.filter((field): field is string => typeof field === 'string')
    : [];

  const type: ParseDraft['type'] = raw.type === 'income' || raw.type === 'transfer' ? raw.type : 'expense';
  const amount = parseAmount(raw.amount);
  if (!amount) missing.push('amount');

  const accountId = matchByIdOrName(ctx.accounts, raw.accountId)?.id;
  const accountToId = matchByIdOrName(ctx.accounts, raw.accountToId)?.id;
  if (!accountId) missing.push(type === 'transfer' ? 'source account' : 'account');
  if (type === 'transfer' && !accountToId) missing.push('destination account');

  const categories = type === 'income' ? ctx.categories.income : ctx.categories.expense;
  const category = type === 'transfer' ? undefined : matchByIdOrName(categories, raw.categoryId);
  const categoryId = category?.id;
  if (type !== 'transfer' && !categoryId) missing.push('category');

  const categoryChartAccountId = category?.chartAccountId && ctx.chartOfAccounts.some((account) => {
    if (account.id !== category.chartAccountId) return false;
    return type === 'income' ? account.class === 'revenue' : account.class === 'expense';
  }) ? category.chartAccountId : undefined;
  const parsedChartAccountId = type === 'transfer' ? undefined : ctx.chartOfAccounts.some((account) => {
    if (account.id !== raw.chartAccountId) return false;
    return type === 'income' ? account.class === 'revenue' : account.class === 'expense';
  }) ? raw.chartAccountId : undefined;
  const chartAccountId = categoryChartAccountId || parsedChartAccountId || defaultChartAccountId(ctx, type);

  const party = typeof raw.party === 'string' ? raw.party.trim() || undefined : undefined;
  const partyName = normalizeName(party);
  const matchedContact = type === 'transfer'
    ? undefined
    : ctx.contacts.find((contact) => contact.id === raw.contactId && contactSupportsType(contact, type))
      || ctx.contacts.find((contact) => partyName && normalizeName(contact.name) === partyName && contactSupportsType(contact, type));
  const contactId = matchedContact?.id;

  const entryMode = type === 'transfer'
    ? 'cash'
    : normalizeEntryMode(raw.entryMode) || 'cash';
  const gstMode = type === 'transfer' || !ctx.gstEnabled
    ? null
    : normalizeGstMode(raw.gstMode) || 'inc';
  const contactPaymentTerms = normalizePaymentTerms(matchedContact?.paymentTerms);
  const paymentTerms = entryMode === 'invoice'
    ? normalizePaymentTerms(raw.paymentTerms) || contactPaymentTerms
    : undefined;

  const date = normalizeDate(raw.date) || ctx.today;
  const dueDate = entryMode === 'invoice'
    ? normalizeDate(raw.dueDate) || dueDateForTerms(date, paymentTerms)
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

function buildSystemPrompt(ctx: ParseContext): string {
  const accounts = ctx.accounts.map((a) => `  ${a.id} | ${a.name} (${a.type})`).join('\n');
  const expenseCategories = ctx.categories.expense.map((c) => `  ${c.id} | ${c.name}${c.chartAccountId ? ` | chartAccount=${c.chartAccountId}` : ''}`).join('\n');
  const incomeCategories = ctx.categories.income.map((c) => `  ${c.id} | ${c.name}${c.chartAccountId ? ` | chartAccount=${c.chartAccountId}` : ''}`).join('\n');
  const contacts = ctx.contacts.length
    ? ctx.contacts.map((c) => `  ${c.id} | ${c.name} (${c.type}${c.paymentTerms ? `, terms=${c.paymentTerms}` : ''})`).join('\n')
    : '  (none)';
  const chartOfAccounts = ctx.chartOfAccounts.map((a) => `  ${a.id} | ${a.code} ${a.name} [${a.class}]`).join('\n');

  return `You are an AI accounting assistant for Auctus. Parse natural language transaction descriptions into structured accounting entries.

## Payment Accounts
${accounts}

## Expense Categories
${expenseCategories}

## Income Categories
${incomeCategories}

## Contacts
${contacts}

## Chart of Accounts
${chartOfAccounts}

## Settings
- Today: ${ctx.today}
- GST: ${ctx.gstEnabled ? 'enabled at 10%' : 'disabled'}

## Rules
- Default date to today if not specified
- Match account and contact names loosely
- entryMode: use "invoice" for invoices/bills, "credit_note" for credit notes or supplier credits, "cash" for direct payments
- gstMode: "inc" = price includes GST, "exc" = GST on top, "free" = GST exempt, null = unknown
- When GST is enabled and not specified, default gstMode to "inc"
- List truly unknown required fields in missingFields (e.g. "amount" if no dollar value given)
- If missingFields is not empty, set clarification to one concise question asking the user for those fields
- For transfers, set type="transfer", accountId=source account, accountToId=destination account
- Preserve invoiceNo or creditNoteNo if the user explicitly mentions a document number`;
}

const TOOL_SCHEMA = {
  name: 'parse_transaction',
  description: 'Parse a natural language transaction description into a structured accounting draft',
  input_schema: {
    type: 'object' as const,
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

export async function parseTransactionText(
  text: string,
  context: ParseContext,
  env: ApiEnv,
  existingDraft?: Partial<ParseDraft>,
): Promise<ParseDraft> {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const userContent = existingDraft
    ? `Current draft JSON:\n${JSON.stringify(existingDraft)}\n\nUser clarification:\n${text}\n\nUpdate the draft using the clarification. Return the full corrected draft.`
    : text;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(context),
      messages: [{ role: 'user', content: userContent }],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'parse_transaction' },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const result = await response.json() as {
    content: Array<{ type: string; name?: string; input?: unknown }>;
  };

  const toolUse = result.content.find((block) => block.type === 'tool_use' && block.name === 'parse_transaction');
  if (!toolUse?.input) {
    throw new Error('AI did not return a parse result');
  }

  const input = existingDraft && toolUse.input && typeof toolUse.input === 'object'
    ? mergeDraftUpdate(existingDraft, toolUse.input)
    : toolUse.input;
  return normalizeDraft(input, context);
}

function mergeDraftUpdate(existingDraft: Partial<ParseDraft>, update: object) {
  const { missingFields: _missingFields, clarification: _clarification, ...base } = existingDraft;
  return { ...base, ...update };
}

export const __testing = { normalizeDraft, mergeDraftUpdate };
