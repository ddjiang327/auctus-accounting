import type { ApiEnv } from '../config/env.js';

interface Account { id: string; name: string; type: string; }
interface Category { id: string; name: string; }
interface Contact { id: string; name: string; type: string; }
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
  entryMode?: 'cash' | 'invoice';
  gstMode?: 'inc' | 'exc' | 'free' | null;
  paymentTerms?: string;
  missingFields: string[];
  clarification?: string;
}

function buildSystemPrompt(ctx: ParseContext): string {
  const accounts = ctx.accounts.map((a) => `  ${a.id} | ${a.name} (${a.type})`).join('\n');
  const expenseCategories = ctx.categories.expense.map((c) => `  ${c.id} | ${c.name}`).join('\n');
  const incomeCategories = ctx.categories.income.map((c) => `  ${c.id} | ${c.name}`).join('\n');
  const contacts = ctx.contacts.length
    ? ctx.contacts.map((c) => `  ${c.id} | ${c.name} (${c.type})`).join('\n')
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
- entryMode: use "invoice" for invoices/bills, "cash" for direct payments
- gstMode: "inc" = price includes GST, "exc" = GST on top, "free" = GST exempt, null = unknown
- When GST is enabled and not specified, default gstMode to "inc"
- List truly unknown required fields in missingFields (e.g. "amount" if no dollar value given)
- Only set clarification if a critical field cannot be guessed at all
- For transfers, set type="transfer", accountId=source account, accountToId=destination account`;
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
      entryMode: { type: 'string', enum: ['cash', 'invoice'] },
      gstMode: { type: 'string', enum: ['inc', 'exc', 'free'] },
      paymentTerms: { type: 'string', enum: ['due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60'] },
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
): Promise<ParseDraft> {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

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
      messages: [{ role: 'user', content: text }],
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

  return toolUse.input as ParseDraft;
}
