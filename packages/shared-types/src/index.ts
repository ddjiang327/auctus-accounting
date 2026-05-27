export type TransactionType = 'expense' | 'income' | 'transfer';
export type RecurringFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';
export type GsmMode = 'inc' | 'exc' | 'free' | null;
export type EntryMode = 'cash' | 'invoice' | 'credit_note';
export type DocStatus = 'draft' | 'sent' | 'viewed';

export interface CreditAllocation {
  id: string;
  creditNoteId: string;
  invoiceId: string;
  amount: number;
  date: string;
}
export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit' | 'investment' | 'loan' | 'other';
export type ChartAccountClass = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type PaymentTerms = 'due_on_receipt' | 'net_7' | 'net_14' | 'net_30' | 'net_60' | 'custom';
export type Period = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';
export type ContactType = 'customer' | 'supplier' | 'both';
export type BasBasis = 'cash' | 'accrual';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initBalance: number;
  icon: string;
  color: string;
  chartAccountId: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  chartAccountId?: string;
  archivedAt?: string;
}

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  class: ChartAccountClass;
  group: string;
  normalBalance: 'debit' | 'credit';
  isContra?: boolean;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  date: string;
  accountId: string;
  receiptNo?: string;
  receiptCreatedAt?: string;
  voidedAt?: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  accountId?: string;
  accountToId?: string;
  categoryId?: string;
  chartAccountId?: string;
  clearingChartAccountId?: string;
  date: string;
  note?: string;
  gstMode?: GsmMode;
  entryMode?: EntryMode;
  contactId?: string;
  party?: string;
  invoiceNo?: string;
  creditNoteNo?: string;
  paymentTerms?: PaymentTerms;
  dueDate?: string;
  payments?: InvoicePayment[];
  docStatus?: DocStatus;
  voidedAt?: string;
  recurringTemplateId?: string;
  productId?: string;
  productQty?: number;
}

export interface RecurringTemplate {
  id: string;
  type: Extract<TransactionType, 'income' | 'expense'>;
  frequency: RecurringFrequency;
  nextDate: string;
  endDate?: string;
  amount: number;
  contactId?: string;
  party?: string;
  chartAccountId?: string;
  clearingChartAccountId?: string;
  gstMode?: GsmMode;
  paymentTerms?: PaymentTerms;
  note?: string;
  isActive: boolean;
  createdAt: string;
  lastGeneratedAt?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
}

export interface Contact {
  id: string;
  type: ContactType;
  name: string;
  abn?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms: PaymentTerms;
  createdAt: string;
  archivedAt?: string;
}

export interface JournalLine {
  chartAccountId: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo: string;
  lines: JournalLine[];
  sourceId: string;
}

export interface ManualJournal {
  id: string;
  date: string;
  memo: string;
  lines: JournalLine[];
  createdAt: string;
  updatedAt?: string;
  reversedAt?: string;
  reversalOf?: string;
  voidedAt?: string;
}

export interface PeriodLock {
  id: string;
  lockedThrough: string;
  note?: string;
  createdAt: string;
}

export interface BankReconciliation {
  id: string;
  accountId: string;
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  difference: number;
  clearedSourceIds: string[];
  createdAt: string;
  finalizedAt: string;
  voidedAt?: string;
}

export interface BankFeedItem {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  reference?: string;
  rawHash: string;
  matchedSourceId?: string;
  importedAt: string;
  reconciledAt?: string;
  ignoredAt?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  date: string;
  detail: string;
}

export interface BusinessProfile {
  name: string;
  abn?: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUri?: string;
  logoText?: string;
  paymentInstructions?: string;
  invoiceFooter?: string;
}


export type InventoryMovementType = 'purchase' | 'sale' | 'adjustment';

export interface Product {
  id: string;
  name: string;
  sku?: string;
  unitOfMeasure?: string;
  costPrice: number;
  sellPrice: number;
  inventoryChartAccountId?: string;
  cogsChartAccountId?: string;
  revenueChartAccountId?: string;
  archivedAt?: string;
}

export interface InventoryItem {
  productId: string;
  quantity: number;
  avgCost: number;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  date: string;
  type: InventoryMovementType;
  quantity: number;
  unitCost: number;
  memo?: string;
  sourceId?: string;
}

export interface LedgerData {
  meta: {
    version: number;
    currency: string;
    locale: string;
    createdAt: string;
  };
  settings: {
    gstEnabled: boolean;
    gstRate: number;
    basBasis?: BasBasis;
    nextInvoiceNumber: number;
    nextBillNumber: number;
    nextCreditNoteNumber: number;
    nextSupplierCreditNumber: number;
    nextReceiptNumber: number;
    invoicePrefix: string;
    billPrefix: string;
    creditNotePrefix: string;
    supplierCreditPrefix: string;
    receiptPrefix: string;
    businessProfile: BusinessProfile;
  };
  accounts: Account[];
  chartOfAccounts: ChartAccount[];
  categories: {
    expense: Category[];
    income: Category[];
  };
  transactions: Transaction[];
  budgets: Budget[];
  contacts: Contact[];
  manualJournals: ManualJournal[];
  creditAllocations: CreditAllocation[];
  periodLocks: PeriodLock[];
  bankReconciliations: BankReconciliation[];
  bankFeedItems: BankFeedItem[];
  recurringTemplates: RecurringTemplate[];
  auditLog: AuditLogEntry[];
  products: Product[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
}
