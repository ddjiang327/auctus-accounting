import type { Account, BankFeedItem, BankReconciliation, BusinessProfile, Category, Contact, CreditAllocation, LedgerData, ManualJournal, PeriodLock, Transaction, InvoicePayment } from '../domain/models';
import { ledgerDataAdapter } from '../storage/ledgerDataAdapter';

const API_URL = import.meta.env.VITE_AUCTUS_API_URL || 'http://127.0.0.1:4010';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const DEV_EMAIL = import.meta.env.VITE_AUCTUS_DEV_EMAIL || '';
const DEV_PASSWORD = import.meta.env.VITE_AUCTUS_DEV_PASSWORD || '';

const TOKEN_KEY = 'auctus_api_access_token';
const BUSINESS_ID_KEY = 'auctus_api_business_id';

type BusinessSummary = {
  id: string;
  name: string;
};

export function isAuctusApiConfigured() {
  return Boolean(
    localStorage.getItem(TOKEN_KEY) ||
      (SUPABASE_URL && SUPABASE_ANON_KEY && DEV_EMAIL && DEV_PASSWORD)
  );
}

async function getAccessToken(): Promise<string> {
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing) return existing;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !DEV_EMAIL || !DEV_PASSWORD) {
    throw new Error('Auctus API is not configured.');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase login failed: ${await response.text()}`);
  }

  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('Supabase login did not return an access token.');
  localStorage.setItem(TOKEN_KEY, body.access_token);
  return body.access_token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : text;
    throw new Error(message || `Auctus API request failed: ${response.status}`);
  }

  return body as T;
}

async function resolveBusinessId(): Promise<string> {
  const selected = localStorage.getItem(BUSINESS_ID_KEY);
  if (selected) return selected;

  const response = await request<{ businesses: BusinessSummary[] }>('/v1/businesses');
  const businessId = response.businesses[0]?.id;
  if (!businessId) throw new Error('No Auctus business workspace found for this user.');
  localStorage.setItem(BUSINESS_ID_KEY, businessId);
  return businessId;
}

function optionalString(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const auctusApi = {
  async loadLedger(): Promise<LedgerData> {
    const businessId = await resolveBusinessId();
    const response = await request<{ ledger: LedgerData }>(`/v1/businesses/${businessId}/ledger`);
    return ledgerDataAdapter.normalize(response.ledger);
  },

  async exportBackup(): Promise<Blob> {
    const businessId = await resolveBusinessId();
    const response = await request<Record<string, unknown>>(`/v1/businesses/${businessId}/backup`);
    return new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
  },

  async restoreBackup(raw: string): Promise<LedgerData> {
    const businessId = await resolveBusinessId();
    const parsed = JSON.parse(raw) as unknown;
    const response = await request<{ ledger: LedgerData }>(`/v1/businesses/${businessId}/restore`, {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
    return ledgerDataAdapter.normalize(response.ledger);
  },

  async importLedger(raw: string): Promise<LedgerData> {
    const businessId = await resolveBusinessId();
    const parsed = JSON.parse(raw) as unknown;
    const response = await request<{ ledger: LedgerData }>(`/v1/businesses/${businessId}/import`, {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
    return ledgerDataAdapter.normalize(response.ledger);
  },

  async resetLedger(): Promise<LedgerData> {
    const businessId = await resolveBusinessId();
    const response = await request<{ ledger: LedgerData }>(`/v1/businesses/${businessId}/reset`, {
      method: 'POST',
    });
    return ledgerDataAdapter.normalize(response.ledger);
  },

  async createTransaction(tx: Transaction): Promise<Transaction> {
    const businessId = await resolveBusinessId();
    const response = await request<{ transaction: Transaction }>(`/v1/businesses/${businessId}/transactions`, {
      method: 'POST',
      body: JSON.stringify({
        type: tx.type,
        amount: tx.amount,
        accountId: tx.accountId,
        accountToId: tx.accountToId,
        categoryId: tx.categoryId,
        chartAccountId: tx.chartAccountId,
        clearingChartAccountId: tx.clearingChartAccountId,
        date: tx.date,
        note: tx.note,
        gstMode: tx.gstMode,
        entryMode: tx.entryMode,
        contactId: tx.contactId,
        party: tx.party,
        invoiceNo: tx.invoiceNo || undefined,
        creditNoteNo: tx.creditNoteNo || undefined,
        paymentTerms: tx.paymentTerms,
        dueDate: tx.dueDate,
        docStatus: tx.docStatus,
        recurringTemplateId: tx.recurringTemplateId,
      }),
    });
    return response.transaction;
  },

  async updateTransaction(tx: Transaction): Promise<Transaction> {
    const businessId = await resolveBusinessId();
    const isTransfer = tx.type === 'transfer';
    const isInvoice = !isTransfer && tx.entryMode === 'invoice';
    const isCreditNote = !isTransfer && tx.entryMode === 'credit_note';
    const isCash = !isTransfer && !isInvoice && !isCreditNote;
    const body = {
      type: tx.type,
      amount: tx.amount,
      accountId: optionalString(tx.accountId),
      accountToId: isTransfer ? optionalString(tx.accountToId) : null,
      categoryId: isTransfer ? null : optionalString(tx.categoryId),
      chartAccountId: isTransfer ? null : tx.chartAccountId ?? undefined,
      clearingChartAccountId: isInvoice || isCreditNote ? tx.clearingChartAccountId ?? undefined : null,
      date: tx.date,
      note: optionalString(tx.note),
      gstMode: isTransfer ? null : tx.gstMode ?? null,
      entryMode: isTransfer ? null : tx.entryMode ?? 'cash',
      contactId: isCash || isTransfer ? null : optionalString(tx.contactId),
      party: isCash || isTransfer ? null : optionalString(tx.party),
      invoiceNo: isInvoice ? optionalString(tx.invoiceNo) : null,
      creditNoteNo: isCreditNote ? optionalString(tx.creditNoteNo) : null,
      paymentTerms: isInvoice || isCreditNote ? tx.paymentTerms ?? null : null,
      dueDate: isInvoice || isCreditNote ? tx.dueDate ?? null : null,
      docStatus: isInvoice || isCreditNote ? tx.docStatus ?? null : null,
      recurringTemplateId: tx.recurringTemplateId ?? null,
    };
    const response = await request<{ transaction: Transaction }>(
      `/v1/businesses/${businessId}/transactions/${tx.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
    return response.transaction;
  },

  async recordPayment(txId: string, payment: Omit<InvoicePayment, 'id'>): Promise<InvoicePayment> {
    const businessId = await resolveBusinessId();
    const response = await request<{ payment: InvoicePayment }>(
      `/v1/businesses/${businessId}/transactions/${txId}/payments`,
      {
        method: 'POST',
        body: JSON.stringify(payment),
      },
    );
    return response.payment;
  },

  async createContact(contact: Contact): Promise<Contact> {
    const businessId = await resolveBusinessId();
    const response = await request<{ contact: Contact }>(`/v1/businesses/${businessId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(contact),
    });
    return response.contact;
  },

  async updateContact(contact: Contact): Promise<Contact> {
    const businessId = await resolveBusinessId();
    const response = await request<{ contact: Contact }>(`/v1/businesses/${businessId}/contacts/${contact.id}`, {
      method: 'PATCH',
      body: JSON.stringify(contact),
    });
    return response.contact;
  },

  async createPaymentAccount(account: Account): Promise<Account> {
    const businessId = await resolveBusinessId();
    const response = await request<{ account: Account }>(`/v1/businesses/${businessId}/payment-accounts`, {
      method: 'POST',
      body: JSON.stringify({
        name: account.name,
        type: account.type,
        initBalance: account.initBalance,
        icon: account.icon,
        color: account.color,
        chartAccountId: account.chartAccountId,
      }),
    });
    return response.account;
  },

  async updatePaymentAccount(account: Account): Promise<Account> {
    const businessId = await resolveBusinessId();
    const response = await request<{ account: Account }>(`/v1/businesses/${businessId}/payment-accounts/${account.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: account.name,
        type: account.type,
        initBalance: account.initBalance,
        icon: account.icon,
        color: account.color,
        chartAccountId: account.chartAccountId,
      }),
    });
    return response.account;
  },

  async archivePaymentAccount(accountId: string): Promise<Account> {
    const businessId = await resolveBusinessId();
    const response = await request<{ account: Account }>(`/v1/businesses/${businessId}/payment-accounts/${accountId}/archive`, {
      method: 'POST',
    });
    return response.account;
  },

  async createCategory(type: 'income' | 'expense', category: Category): Promise<Category> {
    const businessId = await resolveBusinessId();
    const response = await request<{ category: Category }>(`/v1/businesses/${businessId}/categories`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        name: category.name,
        icon: category.icon,
        color: category.color,
        chartAccountId: category.chartAccountId,
      }),
    });
    return response.category;
  },

  async updateCategory(category: Category & { type?: 'income' | 'expense' }): Promise<Category> {
    const businessId = await resolveBusinessId();
    const response = await request<{ category: Category }>(`/v1/businesses/${businessId}/categories/${category.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: category.type,
        name: category.name,
        icon: category.icon,
        color: category.color,
        chartAccountId: category.chartAccountId,
      }),
    });
    return response.category;
  },

  async archiveCategory(categoryId: string): Promise<Category> {
    const businessId = await resolveBusinessId();
    const response = await request<{ category: Category }>(`/v1/businesses/${businessId}/categories/${categoryId}/archive`, {
      method: 'POST',
    });
    return response.category;
  },

  async importBankFeedItems(accountId: string, items: BankFeedItem[]): Promise<BankFeedItem[]> {
    const businessId = await resolveBusinessId();
    const response = await request<{ items: BankFeedItem[] }>(`/v1/businesses/${businessId}/bank-feed-items/import`, {
      method: 'POST',
      body: JSON.stringify({
        accountId,
        items: items.map((item) => ({
          date: item.date,
          description: item.description,
          amount: item.amount,
          reference: item.reference,
          rawHash: item.rawHash,
          matchedSourceId: item.matchedSourceId,
        })),
      }),
    });
    return response.items;
  },

  async matchBankFeedItem(itemId: string, matchedSourceId?: string): Promise<BankFeedItem> {
    const businessId = await resolveBusinessId();
    const response = await request<{ item: BankFeedItem }>(`/v1/businesses/${businessId}/bank-feed-items/${itemId}/match`, {
      method: 'PATCH',
      body: JSON.stringify({
        matchedSourceId: matchedSourceId || undefined,
      }),
    });
    return response.item;
  },

  async ignoreBankFeedItem(itemId: string): Promise<BankFeedItem> {
    const businessId = await resolveBusinessId();
    const response = await request<{ item: BankFeedItem }>(`/v1/businesses/${businessId}/bank-feed-items/${itemId}/ignore`, {
      method: 'POST',
    });
    return response.item;
  },

  async unignoreBankFeedItem(itemId: string): Promise<BankFeedItem> {
    const businessId = await resolveBusinessId();
    const response = await request<{ item: BankFeedItem }>(`/v1/businesses/${businessId}/bank-feed-items/${itemId}/unignore`, {
      method: 'POST',
    });
    return response.item;
  },

  async finalizeBankReconciliation(reconciliation: BankReconciliation): Promise<BankReconciliation> {
    const businessId = await resolveBusinessId();
    const response = await request<{ reconciliation: BankReconciliation }>(`/v1/businesses/${businessId}/bank-reconciliations`, {
      method: 'POST',
      body: JSON.stringify({
        accountId: reconciliation.accountId,
        statementDate: reconciliation.statementDate,
        statementBalance: reconciliation.statementBalance,
        bookBalance: reconciliation.bookBalance,
        difference: reconciliation.difference,
        clearedSourceIds: reconciliation.clearedSourceIds,
      }),
    });
    return response.reconciliation;
  },

  async voidBankReconciliation(reconciliationId: string): Promise<BankReconciliation> {
    const businessId = await resolveBusinessId();
    const response = await request<{ reconciliation: BankReconciliation }>(`/v1/businesses/${businessId}/bank-reconciliations/${reconciliationId}/void`, {
      method: 'POST',
    });
    return response.reconciliation;
  },

  async createCreditAllocation(allocation: Omit<CreditAllocation, 'id'>): Promise<CreditAllocation> {
    const businessId = await resolveBusinessId();
    const response = await request<{ allocation: CreditAllocation }>(`/v1/businesses/${businessId}/credit-allocations`, {
      method: 'POST',
      body: JSON.stringify(allocation),
    });
    return response.allocation;
  },

  async updateBusinessProfile(profile: BusinessProfile): Promise<BusinessProfile> {
    const businessId = await resolveBusinessId();
    const response = await request<{ business: BusinessProfile }>(`/v1/businesses/${businessId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(profile),
    });
    return response.business;
  },

  async updateBusinessSettings(settings: Partial<LedgerData['settings']>): Promise<Partial<LedgerData['settings']>> {
    const businessId = await resolveBusinessId();
    const body = { ...settings };
    delete body.businessProfile;
    const response = await request<{ settings: Partial<LedgerData['settings']> }>(`/v1/businesses/${businessId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return response.settings;
  },

  async createPeriodLock(lockedThrough: string, note?: string): Promise<PeriodLock> {
    const businessId = await resolveBusinessId();
    const response = await request<{ periodLock: PeriodLock }>(`/v1/businesses/${businessId}/period-locks`, {
      method: 'POST',
      body: JSON.stringify({
        lockedThrough,
        note: note || undefined,
      }),
    });
    return response.periodLock;
  },

  async clearPeriodLocks(): Promise<void> {
    const businessId = await resolveBusinessId();
    await request<Record<string, never>>(`/v1/businesses/${businessId}/period-locks/clear`, {
      method: 'POST',
    });
  },

  async createManualJournal(journal: ManualJournal): Promise<ManualJournal> {
    const businessId = await resolveBusinessId();
    const response = await request<{ journal: ManualJournal }>(`/v1/businesses/${businessId}/manual-journals`, {
      method: 'POST',
      body: JSON.stringify({
        date: journal.date,
        memo: journal.memo,
        lines: journal.lines,
      }),
    });
    return response.journal;
  },

  async updateManualJournal(journal: ManualJournal): Promise<ManualJournal> {
    const businessId = await resolveBusinessId();
    const response = await request<{ journal: ManualJournal }>(`/v1/businesses/${businessId}/manual-journals/${journal.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        date: journal.date,
        memo: journal.memo,
        lines: journal.lines,
      }),
    });
    return response.journal;
  },

  async voidManualJournal(journalId: string, reason?: string): Promise<ManualJournal> {
    const businessId = await resolveBusinessId();
    const response = await request<{ journal: ManualJournal }>(`/v1/businesses/${businessId}/manual-journals/${journalId}/void`, {
      method: 'POST',
      body: JSON.stringify({
        reason: reason || undefined,
      }),
    });
    return response.journal;
  },

  async reverseManualJournal(journalId: string): Promise<ManualJournal> {
    const businessId = await resolveBusinessId();
    const response = await request<{ journal: ManualJournal }>(`/v1/businesses/${businessId}/manual-journals/${journalId}/reverse`, {
      method: 'POST',
    });
    return response.journal;
  },
};
