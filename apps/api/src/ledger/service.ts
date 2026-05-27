import type {
  Account,
  Category,
  ChartAccount,
  Contact,
  CreditAllocation,
  AuditLogEntry,
  BankFeedItem,
  BankReconciliation,
  InvoicePayment,
  LedgerData,
  ManualJournal,
  PeriodLock,
  Transaction,
} from "@auctus/shared-types";

import { ApiError, type BusinessSummary } from "../businesses/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";
import { AccountingSeedError, seedAccountingFoundation } from "./seed.js";

type BusinessRow = {
  id: string;
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_uri: string | null;
  logo_text: string | null;
  payment_instructions: string | null;
  invoice_footer: string | null;
  currency: string;
  locale: string;
  created_at: string;
};

type BusinessSettingsRow = {
  gst_enabled: boolean;
  gst_rate: number;
  bas_basis: "cash" | "accrual";
  invoice_prefix: string;
  bill_prefix: string;
  credit_note_prefix: string;
  supplier_credit_prefix: string;
  receipt_prefix: string;
  next_invoice_number: number;
  next_bill_number: number;
  next_credit_note_number: number;
  next_supplier_credit_number: number;
  next_receipt_number: number;
};

type MembershipRow = {
  role: BusinessSummary["role"];
  businesses: BusinessRow | null;
};

type ChartAccountRow = {
  id: string;
  code: string;
  name: string;
  class: ChartAccount["class"];
  group_name: string;
  normal_balance: ChartAccount["normalBalance"];
  is_contra: boolean;
};

type PaymentAccountRow = {
  id: string;
  name: string;
  type: Account["type"];
  init_balance: number;
  icon: string;
  color: string;
  chart_account_id: string;
};

type CategoryRow = {
  id: string;
  type: "income" | "expense";
  name: string;
  icon: string;
  color: string;
  chart_account_id: string | null;
  archived_at: string | null;
};

type ContactRow = {
  id: string;
  type: Contact["type"];
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: Contact["paymentTerms"] | null;
  created_at: string;
  archived_at: string | null;
};

type TransactionRow = {
  id: string;
  type: Transaction["type"];
  amount: number;
  payment_account_id: string | null;
  payment_account_to_id: string | null;
  category_id: string | null;
  chart_account_id: string | null;
  clearing_chart_account_id: string | null;
  date: string;
  note: string | null;
  gst_mode: Transaction["gstMode"];
  entry_mode: Transaction["entryMode"] | null;
  contact_id: string | null;
  party: string | null;
  invoice_no: string | null;
  credit_note_no: string | null;
  payment_terms: Transaction["paymentTerms"] | null;
  due_date: string | null;
  doc_status: Transaction["docStatus"] | null;
  voided_at: string | null;
  recurring_template_id: string | null;
};

type InvoicePaymentRow = {
  id: string;
  transaction_id: string;
  amount: number;
  date: string;
  payment_account_id: string;
  receipt_no: string | null;
  receipt_created_at: string | null;
  voided_at: string | null;
};

type CreditAllocationRow = {
  id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: number;
  date: string;
  voided_at: string | null;
};

type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string;
  created_at: string;
};

type PeriodLockRow = {
  id: string;
  locked_through: string;
  note: string | null;
  created_at: string;
};

type ManualJournalRow = {
  id: string;
  date: string;
  memo: string;
  created_at: string;
  updated_at: string | null;
  reversed_at: string | null;
  reversal_of: string | null;
  voided_at: string | null;
};

type ManualJournalLineRow = {
  manual_journal_id: string;
  chart_account_id: string;
  debit: number;
  credit: number;
  line_order: number;
};

type BankFeedItemRow = {
  id: string;
  payment_account_id: string;
  date: string;
  description: string;
  amount: number;
  reference: string | null;
  raw_hash: string;
  matched_source_id: string | null;
  imported_at: string;
  reconciled_at: string | null;
  ignored_at: string | null;
};

type BankReconciliationRow = {
  id: string;
  payment_account_id: string;
  statement_date: string;
  statement_balance: number;
  book_balance: number;
  difference: number;
  cleared_source_ids: unknown;
  created_at: string;
  finalized_at: string;
  voided_at: string | null;
};

export type LedgerSnapshot = {
  business: {
    id: string;
    role: BusinessSummary["role"];
  };
  ledger: LedgerData;
};

const emptyLedgerData = (
  business: BusinessRow,
  settings: BusinessSettingsRow,
  rows: {
    chartAccounts: ChartAccountRow[];
    paymentAccounts: PaymentAccountRow[];
    categories: CategoryRow[];
    contacts: ContactRow[];
    transactions: TransactionRow[];
    invoicePayments: InvoicePaymentRow[];
    creditAllocations: CreditAllocationRow[];
    auditLog: AuditLogRow[];
    periodLocks: PeriodLockRow[];
    manualJournals: ManualJournalRow[];
    manualJournalLines: ManualJournalLineRow[];
    bankFeedItems: BankFeedItemRow[];
    bankReconciliations: BankReconciliationRow[];
  },
): LedgerData => ({
  meta: {
    version: 2,
    currency: business.currency,
    locale: business.locale,
    createdAt: business.created_at,
  },
  settings: {
    gstEnabled: settings.gst_enabled,
    gstRate: Number(settings.gst_rate),
    basBasis: settings.bas_basis,
    nextInvoiceNumber: settings.next_invoice_number,
    nextBillNumber: settings.next_bill_number,
    nextCreditNoteNumber: settings.next_credit_note_number,
    nextSupplierCreditNumber: settings.next_supplier_credit_number,
    nextReceiptNumber: settings.next_receipt_number,
    invoicePrefix: settings.invoice_prefix,
    billPrefix: settings.bill_prefix,
    creditNotePrefix: settings.credit_note_prefix,
    supplierCreditPrefix: settings.supplier_credit_prefix,
    receiptPrefix: settings.receipt_prefix,
    businessProfile: {
      name: business.name,
      abn: business.abn ?? undefined,
      email: business.email ?? undefined,
      phone: business.phone ?? undefined,
      address: business.address ?? undefined,
      logoUri: business.logo_uri ?? undefined,
      logoText: business.logo_text ?? undefined,
      paymentInstructions: business.payment_instructions ?? undefined,
      invoiceFooter: business.invoice_footer ?? undefined,
    },
  },
  accounts: rows.paymentAccounts.map((account): Account => ({
    id: account.id,
    name: account.name,
    type: account.type,
    initBalance: Number(account.init_balance),
    icon: account.icon,
    color: account.color,
    chartAccountId: account.chart_account_id,
  })),
  chartOfAccounts: rows.chartAccounts.map((account): ChartAccount => ({
    id: account.id,
    code: account.code,
    name: account.name,
    class: account.class,
    group: account.group_name,
    normalBalance: account.normal_balance,
    isContra: account.is_contra || undefined,
  })),
  categories: {
    expense: rows.categories.filter((category) => category.type === "expense").map(mapCategory),
    income: rows.categories.filter((category) => category.type === "income").map(mapCategory),
  },
  transactions: rows.transactions.map((transaction): Transaction => {
    const payments = rows.invoicePayments
      .filter((payment) => payment.transaction_id === transaction.id)
      .map(mapInvoicePayment);

    return {
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount),
      accountId: transaction.payment_account_id ?? undefined,
      accountToId: transaction.payment_account_to_id ?? undefined,
      categoryId: transaction.category_id ?? undefined,
      chartAccountId: transaction.chart_account_id ?? undefined,
      clearingChartAccountId: transaction.clearing_chart_account_id ?? undefined,
      date: transaction.date,
      note: transaction.note ?? undefined,
      gstMode: transaction.gst_mode ?? undefined,
      entryMode: transaction.entry_mode ?? undefined,
      contactId: transaction.contact_id ?? undefined,
      party: transaction.party ?? undefined,
      invoiceNo: transaction.invoice_no ?? undefined,
      creditNoteNo: transaction.credit_note_no ?? undefined,
      paymentTerms: transaction.payment_terms ?? undefined,
      dueDate: transaction.due_date ?? undefined,
      payments: payments.length ? payments : undefined,
      docStatus: transaction.doc_status ?? undefined,
      voidedAt: transaction.voided_at ?? undefined,
      recurringTemplateId: transaction.recurring_template_id ?? undefined,
    };
  }),
  budgets: [],
  contacts: rows.contacts.map(mapContact),
  manualJournals: rows.manualJournals.map((journal) => mapManualJournal(journal, rows.manualJournalLines)),
  creditAllocations: rows.creditAllocations.filter((allocation) => !allocation.voided_at).map(mapCreditAllocation),
  periodLocks: rows.periodLocks.map(mapPeriodLock),
  bankReconciliations: rows.bankReconciliations.map(mapBankReconciliation),
  bankFeedItems: rows.bankFeedItems.map(mapBankFeedItem),
  recurringTemplates: [],
  auditLog: rows.auditLog.map(mapAuditLogEntry),
  products: [],
  inventoryItems: [],
  inventoryMovements: [],
  employees: [],
  payRuns: [],
});

const mapCategory = (category: CategoryRow): Category => ({
  id: category.id,
  name: category.name,
  icon: category.icon,
  color: category.color,
  chartAccountId: category.chart_account_id ?? undefined,
  archivedAt: category.archived_at ?? undefined,
});

const mapContact = (contact: ContactRow): Contact => ({
  id: contact.id,
  type: contact.type,
  name: contact.name,
  abn: contact.abn ?? undefined,
  email: contact.email ?? undefined,
  phone: contact.phone ?? undefined,
  address: contact.address ?? undefined,
  paymentTerms: contact.payment_terms ?? "due_on_receipt",
  createdAt: contact.created_at,
  archivedAt: contact.archived_at ?? undefined,
});

const mapInvoicePayment = (payment: InvoicePaymentRow): InvoicePayment => ({
  id: payment.id,
  amount: Number(payment.amount),
  date: payment.date,
  accountId: payment.payment_account_id,
  receiptNo: payment.receipt_no ?? undefined,
  receiptCreatedAt: payment.receipt_created_at ?? undefined,
  voidedAt: payment.voided_at ?? undefined,
});

const mapCreditAllocation = (allocation: CreditAllocationRow): CreditAllocation => ({
  id: allocation.id,
  creditNoteId: allocation.credit_note_id,
  invoiceId: allocation.invoice_id,
  amount: Number(allocation.amount),
  date: allocation.date,
});

const mapAuditLogEntry = (entry: AuditLogRow): AuditLogEntry => ({
  id: entry.id,
  action: entry.action,
  entityType: entry.entity_type,
  entityId: entry.entity_id,
  detail: entry.detail,
  date: entry.created_at,
});

const mapPeriodLock = (lock: PeriodLockRow): PeriodLock => ({
  id: lock.id,
  lockedThrough: lock.locked_through,
  note: lock.note ?? undefined,
  createdAt: lock.created_at,
});

const mapManualJournal = (journal: ManualJournalRow, lines: ManualJournalLineRow[]): ManualJournal => ({
  id: journal.id,
  date: journal.date,
  memo: journal.memo,
  lines: lines
    .filter((line) => line.manual_journal_id === journal.id)
    .sort((a, b) => a.line_order - b.line_order)
    .map((line) => ({
      chartAccountId: line.chart_account_id,
      debit: Number(line.debit),
      credit: Number(line.credit),
    })),
  createdAt: journal.created_at,
  updatedAt: journal.updated_at ?? undefined,
  reversedAt: journal.reversed_at ?? undefined,
  reversalOf: journal.reversal_of ?? undefined,
  voidedAt: journal.voided_at ?? undefined,
});

const mapBankFeedItem = (item: BankFeedItemRow): BankFeedItem => ({
  id: item.id,
  accountId: item.payment_account_id,
  date: item.date,
  description: item.description,
  amount: Number(item.amount),
  reference: item.reference ?? undefined,
  rawHash: item.raw_hash,
  matchedSourceId: item.matched_source_id ?? undefined,
  importedAt: item.imported_at,
  reconciledAt: item.reconciled_at ?? undefined,
  ignoredAt: item.ignored_at ?? undefined,
});

const mapBankReconciliation = (reconciliation: BankReconciliationRow): BankReconciliation => ({
  id: reconciliation.id,
  accountId: reconciliation.payment_account_id,
  statementDate: reconciliation.statement_date,
  statementBalance: Number(reconciliation.statement_balance),
  bookBalance: Number(reconciliation.book_balance),
  difference: Number(reconciliation.difference),
  clearedSourceIds: Array.isArray(reconciliation.cleared_source_ids)
    ? reconciliation.cleared_source_ids.map(String)
    : [],
  createdAt: reconciliation.created_at,
  finalizedAt: reconciliation.finalized_at,
  voidedAt: reconciliation.voided_at ?? undefined,
});

export const getLedgerSnapshot = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<LedgerSnapshot> => {
  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select(
      `
        role,
        businesses:business_id (
          id,
          name,
          abn,
          email,
          phone,
          address,
          logo_uri,
          logo_text,
          payment_instructions,
          invoice_footer,
          currency,
          locale,
          created_at
        )
      `,
    )
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new ApiError(500, "ledger_snapshot_failed", membershipError.message);
  }

  const membershipRow = membership as unknown as MembershipRow | null;
  if (!membershipRow?.businesses) {
    throw new ApiError(403, "forbidden", "You do not have access to this business.");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("business_settings")
    .select(
      `
        gst_enabled,
        gst_rate,
        bas_basis,
        invoice_prefix,
        bill_prefix,
        credit_note_prefix,
        supplier_credit_prefix,
        receipt_prefix,
        next_invoice_number,
        next_bill_number,
        next_credit_note_number,
        next_supplier_credit_number,
        next_receipt_number
      `,
    )
    .eq("business_id", businessId)
    .single();

  if (settingsError || !settings) {
    throw new ApiError(500, "ledger_snapshot_failed", settingsError?.message ?? "Business settings missing.");
  }

  try {
    await seedAccountingFoundation(supabase, businessId);
  } catch (error) {
    if (error instanceof AccountingSeedError) {
      throw new ApiError(500, error.code, error.message);
    }
    throw error;
  }

  const [
    { data: chartAccounts, error: chartAccountsError },
    { data: paymentAccounts, error: paymentAccountsError },
    { data: categories, error: categoriesError },
    { data: contacts, error: contactsError },
    { data: transactions, error: transactionsError },
    { data: invoicePayments, error: invoicePaymentsError },
    { data: creditAllocations, error: creditAllocationsError },
    { data: auditLog, error: auditLogError },
    { data: periodLocks, error: periodLocksError },
    { data: manualJournals, error: manualJournalsError },
    { data: manualJournalLines, error: manualJournalLinesError },
    { data: bankFeedItems, error: bankFeedItemsError },
    { data: bankReconciliations, error: bankReconciliationsError },
  ] = await Promise.all([
    supabase
      .from("chart_accounts")
      .select("id,code,name,class,group_name,normal_balance,is_contra")
      .eq("business_id", businessId)
      .order("code", { ascending: true }),
    supabase
      .from("payment_accounts")
      .select("id,name,type,init_balance,icon,color,chart_account_id")
      .eq("business_id", businessId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select("id,type,name,icon,color,chart_account_id,archived_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("id,type,name,abn,email,phone,address,payment_terms,created_at,archived_at")
      .eq("business_id", businessId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("transactions")
      .select(
        "id,type,amount,payment_account_id,payment_account_to_id,category_id,chart_account_id,clearing_chart_account_id,date,note,gst_mode,entry_mode,contact_id,party,invoice_no,credit_note_no,payment_terms,due_date,doc_status,voided_at,recurring_template_id",
      )
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("invoice_payments")
      .select("id,transaction_id,amount,date,payment_account_id,receipt_no,receipt_created_at,voided_at")
      .eq("business_id", businessId)
      .order("date", { ascending: true }),
    supabase
      .from("credit_allocations")
      .select("id,credit_note_id,invoice_id,amount,date,voided_at")
      .eq("business_id", businessId)
      .order("date", { ascending: true }),
    supabase
      .from("audit_log")
      .select("id,action,entity_type,entity_id,detail,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    supabase
      .from("period_locks")
      .select("id,locked_through,note,created_at")
      .eq("business_id", businessId)
      .order("locked_through", { ascending: false }),
    supabase
      .from("manual_journals")
      .select("id,date,memo,created_at,updated_at,reversed_at,reversal_of,voided_at")
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("manual_journal_lines")
      .select("manual_journal_id,chart_account_id,debit,credit,line_order")
      .eq("business_id", businessId)
      .order("line_order", { ascending: true }),
    supabase
      .from("bank_feed_items")
      .select("id,payment_account_id,date,description,amount,reference,raw_hash,matched_source_id,imported_at,reconciled_at,ignored_at")
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .order("imported_at", { ascending: false }),
    supabase
      .from("bank_reconciliations")
      .select("id,payment_account_id,statement_date,statement_balance,book_balance,difference,cleared_source_ids,created_at,finalized_at,voided_at")
      .eq("business_id", businessId)
      .order("statement_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (chartAccountsError) {
    throw new ApiError(500, "ledger_snapshot_failed", chartAccountsError.message);
  }

  if (paymentAccountsError) {
    throw new ApiError(500, "ledger_snapshot_failed", paymentAccountsError.message);
  }

  if (categoriesError) {
    throw new ApiError(500, "ledger_snapshot_failed", categoriesError.message);
  }

  if (contactsError) {
    throw new ApiError(500, "ledger_snapshot_failed", contactsError.message);
  }

  if (transactionsError) {
    throw new ApiError(500, "ledger_snapshot_failed", transactionsError.message);
  }

  if (invoicePaymentsError) {
    throw new ApiError(500, "ledger_snapshot_failed", invoicePaymentsError.message);
  }

  if (creditAllocationsError) {
    throw new ApiError(500, "ledger_snapshot_failed", creditAllocationsError.message);
  }

  if (auditLogError) {
    throw new ApiError(500, "ledger_snapshot_failed", auditLogError.message);
  }

  if (periodLocksError) {
    throw new ApiError(500, "ledger_snapshot_failed", periodLocksError.message);
  }

  if (manualJournalsError) {
    throw new ApiError(500, "ledger_snapshot_failed", manualJournalsError.message);
  }

  if (manualJournalLinesError) {
    throw new ApiError(500, "ledger_snapshot_failed", manualJournalLinesError.message);
  }

  if (bankFeedItemsError) {
    throw new ApiError(500, "ledger_snapshot_failed", bankFeedItemsError.message);
  }

  if (bankReconciliationsError) {
    throw new ApiError(500, "ledger_snapshot_failed", bankReconciliationsError.message);
  }

  return {
    business: {
      id: membershipRow.businesses.id,
      role: membershipRow.role,
    },
    ledger: emptyLedgerData(membershipRow.businesses, settings as unknown as BusinessSettingsRow, {
      chartAccounts: (chartAccounts ?? []) as unknown as ChartAccountRow[],
      paymentAccounts: (paymentAccounts ?? []) as unknown as PaymentAccountRow[],
      categories: (categories ?? []) as unknown as CategoryRow[],
      contacts: (contacts ?? []) as unknown as ContactRow[],
      transactions: (transactions ?? []) as unknown as TransactionRow[],
      invoicePayments: (invoicePayments ?? []) as unknown as InvoicePaymentRow[],
      creditAllocations: (creditAllocations ?? []) as unknown as CreditAllocationRow[],
      auditLog: (auditLog ?? []) as unknown as AuditLogRow[],
      periodLocks: (periodLocks ?? []) as unknown as PeriodLockRow[],
      manualJournals: (manualJournals ?? []) as unknown as ManualJournalRow[],
      manualJournalLines: (manualJournalLines ?? []) as unknown as ManualJournalLineRow[],
      bankFeedItems: (bankFeedItems ?? []) as unknown as BankFeedItemRow[],
      bankReconciliations: (bankReconciliations ?? []) as unknown as BankReconciliationRow[],
    }),
  };
};
