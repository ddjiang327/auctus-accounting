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

function buildContext(data: LedgerData): ParseContext {
  return {
    accounts: data.accounts,
    categories: data.categories,
    contacts: data.contacts.filter((c) => !c.archivedAt),
    chartOfAccounts: data.chartOfAccounts,
    gstEnabled: data.settings.gstEnabled ?? false,
    today: new Date().toISOString().slice(0, 10),
  };
}

function buildSystemPrompt(ctx: ParseContext): string {
  const accounts = ctx.accounts.map((a) => `  ${a.id} | ${a.name} (${a.type})`).join('\n');
  const expCats = ctx.categories.expense.map((c) => `  ${c.id} | ${c.name}`).join('\n');
  const incCats = ctx.categories.income.map((c) => `  ${c.id} | ${c.name}`).join('\n');
  const contacts = ctx.contacts.length ? ctx.contacts.map((c) => `  ${c.id} | ${c.name}`).join('\n') : '  (none)';
  const coa = ctx.chartOfAccounts.map((a) => `  ${a.id} | ${a.code} ${a.name}`).join('\n');
  return `You are an AI accounting assistant. Parse natural language transaction descriptions into structured entries.

Payment Accounts:\n${accounts}
Expense Categories:\n${expCats}
Income Categories:\n${incCats}
Contacts:\n${contacts}
Chart of Accounts:\n${coa}
Today: ${ctx.today}
GST: ${ctx.gstEnabled ? 'enabled 10%' : 'disabled'}

Rules: default date=today, match names loosely, entryMode=cash for payments or invoice for invoices, gstMode=inc/exc/free/null, list uncertain fields in missingFields.`;
}

async function parseViaServer(text: string, context: ParseContext, token: string): Promise<ParseDraft> {
  const res = await fetch(`${API_URL}/v1/ai/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, context }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'AI parse failed' })) as { message?: string; error?: string };
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  const body = await res.json() as { draft: ParseDraft };
  return body.draft;
}

async function parseViaDirectApi(text: string, context: ParseContext): Promise<ParseDraft> {
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
        entryMode: { type: 'string', enum: ['cash', 'invoice'] },
        gstMode: { type: 'string', enum: ['inc', 'exc', 'free'] },
        paymentTerms: { type: 'string', enum: ['due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60'] },
        missingFields: { type: 'array', items: { type: 'string' } },
        clarification: { type: 'string' },
      },
      required: ['type', 'amount', 'missingFields'],
    },
  };

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
      messages: [{ role: 'user', content: text }],
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
  return toolUse.input as ParseDraft;
}

export async function parseTransactionText(
  text: string,
  data: LedgerData,
  mode: 'local' | 'cloud',
  getToken: () => Promise<string | null>,
): Promise<ParseDraft> {
  const context = buildContext(data);

  if (mode === 'cloud') {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return parseViaServer(text, context, token);
  }

  if (LOCAL_ANTHROPIC_KEY) {
    return parseViaDirectApi(text, context);
  }

  throw new Error('AI entry requires EXPO_PUBLIC_ANTHROPIC_API_KEY to be set in your .env file');
}
