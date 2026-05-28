import type { Account, BankFeedItem, BankReconciliation, Category, ChartAccount, Contact, InvoicePayment, LedgerData, ManualJournal, PeriodLock, Transaction } from "@auctus/shared-types";
import { randomUUID } from "node:crypto";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { seedAccountingFoundation } from "../ledger/seed.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const adminRoles = new Set(["owner", "admin"]);

export type LedgerBackupEnvelope = {
  format: "auctus-ledger-backup";
  version: 1;
  exportedAt: string;
  businessId: string;
  ledger: LedgerData;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const dateString = (value: unknown, field: string): string => {
  const date = optionalString(value);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "invalid_ledger_import", `${field} must be YYYY-MM-DD.`);
  }
  return date;
};

const numberValue = (value: unknown, field: string, fallback = 0): number => {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ApiError(400, "invalid_ledger_import", `${field} must be a number.`);
  }
  return number;
};

const positiveInteger = (value: unknown, fallback: number): number => {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const stringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.trim() : fallback;

const parseLedgerImport = (body: unknown): LedgerData => {
  const payload = isRecord(body) && isRecord(body.ledger) ? body.ledger : body;
  if (!isRecord(payload)) {
    throw new ApiError(400, "invalid_ledger_import", "Request body must contain a ledger object or backup envelope.");
  }

  const settings = isRecord(payload.settings) ? payload.settings : {};
  const profile = isRecord(settings.businessProfile) ? settings.businessProfile : {};
  const categories = isRecord(payload.categories) ? payload.categories : {};

  return {
    meta: {
      version: Number(isRecord(payload.meta) ? payload.meta.version : 2) || 2,
      currency: stringValue(isRecord(payload.meta) ? payload.meta.currency : "AUD", "AUD") || "AUD",
      locale: stringValue(isRecord(payload.meta) ? payload.meta.locale : "en-AU", "en-AU") || "en-AU",
      createdAt: stringValue(isRecord(payload.meta) ? payload.meta.createdAt : new Date().toISOString(), new Date().toISOString()),
    },
    settings: {
      gstEnabled: typeof settings.gstEnabled === "boolean" ? settings.gstEnabled : true,
      gstRate: numberValue(settings.gstRate, "settings.gstRate", 0.1),
      basBasis: settings.basBasis === "accrual" ? "accrual" : "cash",
      nextInvoiceNumber: positiveInteger(settings.nextInvoiceNumber, 1),
      nextBillNumber: positiveInteger(settings.nextBillNumber, 1),
      nextCreditNoteNumber: positiveInteger(settings.nextCreditNoteNumber, 1),
      nextSupplierCreditNumber: positiveInteger(settings.nextSupplierCreditNumber, 1),
      nextReceiptNumber: positiveInteger(settings.nextReceiptNumber, 1),
      invoicePrefix: stringValue(settings.invoicePrefix, "INV-") || "INV-",
      billPrefix: stringValue(settings.billPrefix, "BILL-") || "BILL-",
      creditNotePrefix: stringValue(settings.creditNotePrefix, "CN-") || "CN-",
      supplierCreditPrefix: stringValue(settings.supplierCreditPrefix, "SCN-") || "SCN-",
      receiptPrefix: stringValue(settings.receiptPrefix, "RCT-") || "RCT-",
      businessProfile: {
        name: stringValue(profile.name, "Auctus Business") || "Auctus Business",
        abn: optionalString(profile.abn) ?? undefined,
        email: optionalString(profile.email) ?? undefined,
        phone: optionalString(profile.phone) ?? undefined,
        address: optionalString(profile.address) ?? undefined,
        logoUri: optionalString(profile.logoUri) ?? undefined,
        logoText: optionalString(profile.logoText) ?? undefined,
        paymentInstructions: optionalString(profile.paymentInstructions) ?? undefined,
        invoiceFooter: optionalString(profile.invoiceFooter) ?? undefined,
      },
    },
    chartOfAccounts: asArray<ChartAccount>(payload.chartOfAccounts),
    accounts: asArray<Account>(payload.accounts),
    categories: {
      income: asArray<Category>(categories.income),
      expense: asArray<Category>(categories.expense),
    },
    contacts: asArray<Contact>(payload.contacts),
    transactions: asArray<Transaction>(payload.transactions),
    budgets: [],
    manualJournals: asArray<ManualJournal>(payload.manualJournals),
    creditAllocations: asArray(payload.creditAllocations),
    periodLocks: asArray<PeriodLock>(payload.periodLocks),
    bankReconciliations: asArray<BankReconciliation>(payload.bankReconciliations),
    bankFeedItems: asArray<BankFeedItem>(payload.bankFeedItems),
    recurringTemplates: [],
    auditLog: [],
    products: [],
    inventoryItems: [],
    inventoryMovements: [],
    employees: [],
    payRuns: [],
    remittances: [],
    stpSubmissions: [],
    purchaseOrders: [],
    fixedAssets: [],
    depreciationRuns: [],
  };
};

const requireAdminSnapshot = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
) => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!adminRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "Only owners and admins can export, restore, import, or reset ledger data.");
  }
  return snapshot;
};

const deleteRows = async (supabase: SupabaseServiceClient, businessId: string): Promise<void> => {
  const tables = [
    "bank_reconciliations",
    "bank_feed_items",
    "manual_journal_lines",
    "manual_journals",
    "credit_allocations",
    "invoice_payments",
    "transactions",
    "period_locks",
    "contacts",
    "categories",
    "payment_accounts",
    "chart_accounts",
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("business_id", businessId);
    if (error) throw new ApiError(500, "ledger_replace_failed", error.message);
  }
};

const insertRows = async <T extends Record<string, unknown>>(
  supabase: SupabaseServiceClient,
  table: string,
  rows: T[],
): Promise<void> => {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new ApiError(500, "ledger_replace_failed", error.message);
};

const mapSourceId = (sourceId: string | undefined, idMap: Map<string, string>): string | undefined => {
  if (!sourceId) return undefined;
  if (idMap.has(sourceId)) return idMap.get(sourceId);
  if (sourceId.startsWith("opening_")) {
    const accountId = sourceId.slice("opening_".length);
    const mappedAccountId = idMap.get(accountId);
    return mappedAccountId ? `opening_${mappedAccountId}` : undefined;
  }
  return undefined;
};

const replaceLedgerData = async (
  supabase: SupabaseServiceClient,
  businessId: string,
  ledger: LedgerData,
): Promise<{ transactions: number; contacts: number; accounts: number }> => {
  const idMap = new Map<string, string>();
  const idFor = (oldId: string | undefined): string => {
    if (!oldId) return randomUUID();
    const existing = idMap.get(oldId);
    if (existing) return existing;
    const next = randomUUID();
    idMap.set(oldId, next);
    return next;
  };

  for (const item of [
    ...ledger.chartOfAccounts,
    ...ledger.accounts,
    ...ledger.categories.income,
    ...ledger.categories.expense,
    ...ledger.contacts,
    ...ledger.transactions,
    ...ledger.transactions.flatMap((transaction) => transaction.payments || []),
    ...ledger.creditAllocations,
    ...ledger.periodLocks,
    ...ledger.manualJournals,
    ...ledger.bankFeedItems,
    ...ledger.bankReconciliations,
  ]) {
    idFor((item as { id?: string }).id);
  }

  await deleteRows(supabase, businessId);

  const profile = ledger.settings.businessProfile;
  const { error: businessError } = await supabase
    .from("businesses")
    .update({
      name: profile.name,
      abn: profile.abn ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      address: profile.address ?? null,
      logo_uri: profile.logoUri ?? null,
      logo_text: profile.logoText ?? null,
      payment_instructions: profile.paymentInstructions ?? null,
      invoice_footer: profile.invoiceFooter ?? null,
      currency: ledger.meta.currency || "AUD",
      locale: ledger.meta.locale || "en-AU",
    })
    .eq("id", businessId);
  if (businessError) throw new ApiError(500, "ledger_replace_failed", businessError.message);

  const { error: settingsError } = await supabase
    .from("business_settings")
    .update({
      gst_enabled: ledger.settings.gstEnabled,
      gst_rate: ledger.settings.gstRate,
      bas_basis: ledger.settings.basBasis || "cash",
      invoice_prefix: ledger.settings.invoicePrefix,
      bill_prefix: ledger.settings.billPrefix,
      credit_note_prefix: ledger.settings.creditNotePrefix,
      supplier_credit_prefix: ledger.settings.supplierCreditPrefix,
      receipt_prefix: ledger.settings.receiptPrefix,
      next_invoice_number: ledger.settings.nextInvoiceNumber,
      next_bill_number: ledger.settings.nextBillNumber,
      next_credit_note_number: ledger.settings.nextCreditNoteNumber,
      next_supplier_credit_number: ledger.settings.nextSupplierCreditNumber,
      next_receipt_number: ledger.settings.nextReceiptNumber,
    })
    .eq("business_id", businessId);
  if (settingsError) throw new ApiError(500, "ledger_replace_failed", settingsError.message);

  await insertRows(supabase, "chart_accounts", ledger.chartOfAccounts.map((account) => ({
    id: idFor(account.id),
    business_id: businessId,
    code: account.code,
    name: account.name,
    class: account.class,
    group_name: account.group,
    normal_balance: account.normalBalance,
    is_contra: account.isContra ?? false,
  })));

  await insertRows(supabase, "payment_accounts", ledger.accounts.map((account) => ({
    id: idFor(account.id),
    business_id: businessId,
    name: account.name,
    type: account.type,
    init_balance: numberValue(account.initBalance, "account.initBalance", 0),
    icon: account.icon || "",
    color: account.color || "#8E8E93",
    chart_account_id: idMap.get(account.chartAccountId),
  })));

  const categoryRows = [
    ...ledger.categories.income.map((category) => ({ category, type: "income" })),
    ...ledger.categories.expense.map((category) => ({ category, type: "expense" })),
  ];
  await insertRows(supabase, "categories", categoryRows.map(({ category, type }) => ({
    id: idFor(category.id),
    business_id: businessId,
    type,
    name: category.name,
    icon: category.icon || "",
    color: category.color || "#8E8E93",
    chart_account_id: category.chartAccountId ? idMap.get(category.chartAccountId) : null,
  })));

  await insertRows(supabase, "contacts", ledger.contacts.map((contact) => ({
    id: idFor(contact.id),
    business_id: businessId,
    type: contact.type,
    name: contact.name,
    abn: contact.abn ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    address: contact.address ?? null,
    payment_terms: contact.paymentTerms || "due_on_receipt",
    archived_at: contact.archivedAt ?? null,
    created_at: contact.createdAt || new Date().toISOString(),
  })));

  await insertRows(supabase, "transactions", ledger.transactions.map((transaction) => ({
    id: idFor(transaction.id),
    business_id: businessId,
    type: transaction.type,
    amount: numberValue(transaction.amount, "transaction.amount"),
    payment_account_id: transaction.accountId ? idMap.get(transaction.accountId) : null,
    payment_account_to_id: transaction.accountToId ? idMap.get(transaction.accountToId) : null,
    category_id: transaction.categoryId ? idMap.get(transaction.categoryId) : null,
    chart_account_id: transaction.chartAccountId ? idMap.get(transaction.chartAccountId) : null,
    clearing_chart_account_id: transaction.clearingChartAccountId ? idMap.get(transaction.clearingChartAccountId) : null,
    contact_id: transaction.contactId ? idMap.get(transaction.contactId) : null,
    party: transaction.party ?? null,
    date: dateString(transaction.date, "transaction.date"),
    due_date: transaction.dueDate ?? null,
    note: transaction.note ?? null,
    gst_mode: transaction.gstMode ?? null,
    entry_mode: transaction.entryMode ?? null,
    invoice_no: transaction.invoiceNo ?? null,
    credit_note_no: transaction.creditNoteNo ?? null,
    payment_terms: transaction.paymentTerms ?? null,
    doc_status: transaction.docStatus ?? null,
    recurring_template_id: null,
    voided_at: transaction.voidedAt ?? null,
  })));

  await insertRows(supabase, "invoice_payments", ledger.transactions.flatMap((transaction) =>
    (transaction.payments || []).map((payment: InvoicePayment) => ({
      id: idFor(payment.id),
      business_id: businessId,
      transaction_id: idFor(transaction.id),
      amount: numberValue(payment.amount, "payment.amount"),
      date: dateString(payment.date, "payment.date"),
      payment_account_id: idFor(payment.accountId),
      receipt_no: payment.receiptNo ?? null,
      receipt_created_at: payment.receiptCreatedAt ?? null,
      voided_at: payment.voidedAt ?? null,
    })),
  ));

  await insertRows(supabase, "credit_allocations", ledger.creditAllocations.map((allocation) => ({
    id: idFor(allocation.id),
    business_id: businessId,
    credit_note_id: idFor(allocation.creditNoteId),
    invoice_id: idFor(allocation.invoiceId),
    amount: numberValue(allocation.amount, "creditAllocation.amount"),
    date: dateString(allocation.date, "creditAllocation.date"),
  })));

  await insertRows(supabase, "period_locks", ledger.periodLocks.map((lock) => ({
    id: idFor(lock.id),
    business_id: businessId,
    locked_through: dateString(lock.lockedThrough, "periodLock.lockedThrough"),
    note: lock.note ?? null,
    created_at: lock.createdAt || new Date().toISOString(),
  })));

  await insertRows(supabase, "manual_journals", ledger.manualJournals.map((journal) => ({
    id: idFor(journal.id),
    business_id: businessId,
    date: dateString(journal.date, "manualJournal.date"),
    memo: journal.memo || "Manual journal",
    created_at: journal.createdAt || new Date().toISOString(),
    updated_at: journal.updatedAt ?? null,
    reversed_at: journal.reversedAt ?? null,
    reversal_of: journal.reversalOf ? idMap.get(journal.reversalOf) : null,
    voided_at: journal.voidedAt ?? null,
  })));

  await insertRows(supabase, "manual_journal_lines", ledger.manualJournals.flatMap((journal, journalIndex) =>
    journal.lines.map((line, lineIndex) => ({
      business_id: businessId,
      manual_journal_id: idFor(journal.id),
      chart_account_id: idFor(line.chartAccountId),
      debit: numberValue(line.debit, `manualJournal[${journalIndex}].lines[${lineIndex}].debit`),
      credit: numberValue(line.credit, `manualJournal[${journalIndex}].lines[${lineIndex}].credit`),
      line_order: lineIndex,
    })),
  ));

  await insertRows(supabase, "bank_feed_items", ledger.bankFeedItems.map((item) => ({
    id: idFor(item.id),
    business_id: businessId,
    payment_account_id: idFor(item.accountId),
    date: dateString(item.date, "bankFeedItem.date"),
    description: item.description || "Imported bank feed row",
    amount: numberValue(item.amount, "bankFeedItem.amount"),
    reference: item.reference ?? null,
    raw_hash: item.rawHash || randomUUID(),
    matched_source_id: mapSourceId(item.matchedSourceId, idMap) ?? null,
    imported_at: item.importedAt || new Date().toISOString(),
    reconciled_at: item.reconciledAt ?? null,
    ignored_at: item.ignoredAt ?? null,
  })));

  await insertRows(supabase, "bank_reconciliations", ledger.bankReconciliations.map((reconciliation) => ({
    id: idFor(reconciliation.id),
    business_id: businessId,
    payment_account_id: idFor(reconciliation.accountId),
    statement_date: dateString(reconciliation.statementDate, "bankReconciliation.statementDate"),
    statement_balance: numberValue(reconciliation.statementBalance, "bankReconciliation.statementBalance"),
    book_balance: numberValue(reconciliation.bookBalance, "bankReconciliation.bookBalance"),
    difference: numberValue(reconciliation.difference, "bankReconciliation.difference"),
    cleared_source_ids: (reconciliation.clearedSourceIds || [])
      .map((sourceId) => mapSourceId(sourceId, idMap))
      .filter(Boolean),
    created_at: reconciliation.createdAt || new Date().toISOString(),
    finalized_at: reconciliation.finalizedAt || reconciliation.createdAt || new Date().toISOString(),
    voided_at: reconciliation.voidedAt ?? null,
  })));

  return {
    transactions: ledger.transactions.length,
    contacts: ledger.contacts.length,
    accounts: ledger.accounts.length,
  };
};

export const exportLedgerBackup = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<LedgerBackupEnvelope> => {
  const snapshot = await requireAdminSnapshot(supabase, userId, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "export",
    entityType: "ledger_backup",
    entityId: businessId,
    detail: "Exported ledger backup",
    metadata: {
      transactions: snapshot.ledger.transactions.length,
      contacts: snapshot.ledger.contacts.length,
      accounts: snapshot.ledger.accounts.length,
    },
  });

  return {
    format: "auctus-ledger-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    businessId,
    ledger: snapshot.ledger,
  };
};

export const restoreLedgerBackup = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
  operation: "restore" | "import" = "restore",
): Promise<LedgerData> => {
  await requireAdminSnapshot(supabase, userId, businessId);
  const ledger = parseLedgerImport(body);
  const counts = await replaceLedgerData(supabase, businessId, ledger);

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: operation,
    entityType: "ledger_backup",
    entityId: businessId,
    detail: `${operation === "import" ? "Imported" : "Restored"} ledger backup with ${counts.transactions} transactions, ${counts.contacts} contacts, ${counts.accounts} accounts`,
    metadata: counts,
  });

  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const importLedgerData = (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => restoreLedgerBackup(supabase, userId, businessId, body, "import");

export const resetLedgerData = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<LedgerData> => {
  await requireAdminSnapshot(supabase, userId, businessId);
  await deleteRows(supabase, businessId);

  const { error: settingsError } = await supabase
    .from("business_settings")
    .update({
      gst_enabled: true,
      gst_rate: 0.1,
      bas_basis: "cash",
      invoice_prefix: "INV-",
      bill_prefix: "BILL-",
      credit_note_prefix: "CN-",
      supplier_credit_prefix: "SCN-",
      receipt_prefix: "RCT-",
      next_invoice_number: 1,
      next_bill_number: 1,
      next_credit_note_number: 1,
      next_supplier_credit_number: 1,
      next_receipt_number: 1,
    })
    .eq("business_id", businessId);
  if (settingsError) throw new ApiError(500, "ledger_reset_failed", settingsError.message);

  await seedAccountingFoundation(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "reset",
    entityType: "ledger_data",
    entityId: businessId,
    detail: "Reset ledger data to default accounting foundation",
  });

  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};
