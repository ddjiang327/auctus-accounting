import {
  clearingAccountId,
  defaultChartAccountId,
  isDateLocked,
  validatePaymentInput,
  validateCreditAllocations,
  validateTransactionInput,
} from "@auctus/accounting-core";
import type {
  CreditAllocation,
  DocStatus,
  EntryMode,
  GsmMode,
  InvoicePayment,
  PaymentTerms,
  Transaction,
  TransactionType,
} from "@auctus/shared-types";

import { ApiError } from "../businesses/service.js";
import { recordAuditEvent } from "../audit/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

type TransactionInsertRow = {
  business_id: string;
  type: TransactionType;
  entry_mode?: EntryMode;
  amount: number;
  payment_account_id?: string;
  payment_account_to_id?: string;
  category_id?: string;
  chart_account_id?: string;
  clearing_chart_account_id?: string;
  contact_id?: string;
  party?: string;
  date: string;
  due_date?: string;
  note?: string;
  gst_mode?: Exclude<GsmMode, null>;
  invoice_no?: string;
  credit_note_no?: string;
  payment_terms?: PaymentTerms;
  doc_status?: DocStatus;
  recurring_template_id?: string;
};

type InvoicePaymentInsertRow = {
  business_id: string;
  transaction_id: string;
  amount: number;
  date: string;
  payment_account_id: string;
  receipt_no?: string;
  receipt_created_at?: string;
};

type CreditAllocationInsertRow = {
  business_id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: number;
  date: string;
};

type VoidInput = {
  reason?: string;
};

type DocumentNumberKind = "invoice" | "bill" | "credit_note" | "supplier_credit" | "receipt";

const transactionTypes = new Set<TransactionType>(["income", "expense", "transfer"]);
const entryModes = new Set<EntryMode>(["cash", "invoice", "credit_note"]);
const gstModes = new Set<Exclude<GsmMode, null>>(["inc", "exc", "free"]);
const paymentTerms = new Set<PaymentTerms>(["due_on_receipt", "net_7", "net_14", "net_30", "net_60", "custom"]);
const docStatuses = new Set<DocStatus>(["draft", "sent", "viewed"]);
const writableRoles = new Set(["owner", "admin", "bookkeeper"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const readString = (body: Record<string, unknown>, key: string, maxLength: number): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_transaction", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_transaction", `${key} is too long.`);
  }
  return trimmed;
};

const readEnum = <T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: Set<T>,
  required = false,
): T | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new ApiError(400, "invalid_transaction", `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new ApiError(400, "invalid_transaction", `${key} is invalid.`);
  }
  return value as T;
};

const readDate = (body: Record<string, unknown>, key: string, required = false): string | undefined => {
  const value = readString(body, key, 10);
  if (!value) {
    if (required) {
      throw new ApiError(400, "invalid_transaction", `${key} is required.`);
    }
    return undefined;
  }
  if (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new ApiError(400, "invalid_transaction", `${key} must be YYYY-MM-DD.`);
  }
  return value;
};

const parseTransactionInput = (body: unknown): Omit<Transaction, "id"> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const input = body as Record<string, unknown>;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) {
    throw new ApiError(400, "invalid_transaction", "amount must be a number.");
  }

  const gstMode = input.gstMode === null ? null : readEnum(input, "gstMode", gstModes);

  const type = readEnum(input, "type", transactionTypes, true);
  if (!type) {
    throw new ApiError(400, "invalid_transaction", "type is required.");
  }

  return {
    type,
    amount,
    accountId: readString(input, "accountId", 64),
    accountToId: readString(input, "accountToId", 64),
    categoryId: readString(input, "categoryId", 64),
    chartAccountId: readString(input, "chartAccountId", 64),
    clearingChartAccountId: readString(input, "clearingChartAccountId", 64),
    date: readDate(input, "date", true) ?? "",
    note: readString(input, "note", 1000),
    gstMode,
    entryMode: readEnum(input, "entryMode", entryModes),
    contactId: readString(input, "contactId", 64),
    party: readString(input, "party", 200),
    invoiceNo: readString(input, "invoiceNo", 80),
    creditNoteNo: readString(input, "creditNoteNo", 80),
    paymentTerms: readEnum(input, "paymentTerms", paymentTerms),
    dueDate: readDate(input, "dueDate"),
    docStatus: readEnum(input, "docStatus", docStatuses),
    recurringTemplateId: readString(input, "recurringTemplateId", 64),
  };
};

const parsePaymentInput = (body: unknown): Omit<InvoicePayment, "id"> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const input = body as Record<string, unknown>;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) {
    throw new ApiError(400, "invalid_payment", "amount must be a number.");
  }

  return {
    amount,
    date: readDate(input, "date", true) ?? "",
    accountId: readString(input, "accountId", 64) ?? "",
    receiptNo: readString(input, "receiptNo", 80),
    receiptCreatedAt: readString(input, "receiptCreatedAt", 40),
  };
};

const parseNewPaymentsInput = (body: unknown): Array<Omit<InvoicePayment, "id">> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }

  const input = body as Record<string, unknown>;
  if (!("newPayments" in input) || input.newPayments === undefined || input.newPayments === null) {
    return [];
  }
  if (!Array.isArray(input.newPayments)) {
    throw new ApiError(400, "invalid_payment", "newPayments must be an array.");
  }

  return input.newPayments.map((payment) => parsePaymentInput(payment));
};

const parseCreditAllocationInput = (body: unknown): Omit<CreditAllocation, "id"> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const input = body as Record<string, unknown>;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) {
    throw new ApiError(400, "invalid_credit_allocation", "amount must be a number.");
  }

  return {
    creditNoteId: readString(input, "creditNoteId", 64) ?? "",
    invoiceId: readString(input, "invoiceId", 64) ?? "",
    amount,
    date: readDate(input, "date", true) ?? "",
  };
};

const parseVoidInput = (body: unknown): VoidInput => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }

  return {
    reason: readString(body as Record<string, unknown>, "reason", 500),
  };
};

const readPatchString = (body: Record<string, unknown>, key: string, maxLength: number): string | null | undefined => {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_transaction", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_transaction", `${key} is too long.`);
  }
  return trimmed;
};

const readPatchEnum = <T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: Set<T>,
): T | null | undefined => {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new ApiError(400, "invalid_transaction", `${key} is invalid.`);
  }
  return value as T;
};

const readPatchDate = (body: Record<string, unknown>, key: string): string | null | undefined => {
  if (!(key in body)) return undefined;
  const value = readPatchString(body, key, 10);
  if (value === null) return null;
  if (!value) return undefined;
  if (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new ApiError(400, "invalid_transaction", `${key} must be YYYY-MM-DD.`);
  }
  return value;
};

type TransactionPatch = {
  type?: TransactionType;
  amount?: number;
  accountId?: string | null;
  accountToId?: string | null;
  categoryId?: string | null;
  chartAccountId?: string | null;
  clearingChartAccountId?: string | null;
  date?: string;
  note?: string | null;
  gstMode?: GsmMode;
  entryMode?: EntryMode | null;
  contactId?: string | null;
  party?: string | null;
  invoiceNo?: string | null;
  creditNoteNo?: string | null;
  paymentTerms?: PaymentTerms | null;
  dueDate?: string | null;
  docStatus?: DocStatus | null;
  recurringTemplateId?: string | null;
};

const parseTransactionPatch = (body: unknown): TransactionPatch => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }
  const input = body as Record<string, unknown>;
  const patch: TransactionPatch = {};

  if ("type" in input) patch.type = readEnum(input, "type", transactionTypes, true);
  if ("amount" in input) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount)) {
      throw new ApiError(400, "invalid_transaction", "amount must be a number.");
    }
    patch.amount = amount;
  }
  if ("accountId" in input) patch.accountId = readPatchString(input, "accountId", 64);
  if ("accountToId" in input) patch.accountToId = readPatchString(input, "accountToId", 64);
  if ("categoryId" in input) patch.categoryId = readPatchString(input, "categoryId", 64);
  if ("chartAccountId" in input) patch.chartAccountId = readPatchString(input, "chartAccountId", 64);
  if ("clearingChartAccountId" in input) patch.clearingChartAccountId = readPatchString(input, "clearingChartAccountId", 64);
  if ("date" in input) patch.date = readDate(input, "date", true) ?? "";
  if ("note" in input) patch.note = readPatchString(input, "note", 1000);
  if ("gstMode" in input) patch.gstMode = input.gstMode === null ? null : readEnum(input, "gstMode", gstModes);
  if ("entryMode" in input) patch.entryMode = readPatchEnum(input, "entryMode", entryModes);
  if ("contactId" in input) patch.contactId = readPatchString(input, "contactId", 64);
  if ("party" in input) patch.party = readPatchString(input, "party", 200);
  if ("invoiceNo" in input) patch.invoiceNo = readPatchString(input, "invoiceNo", 80);
  if ("creditNoteNo" in input) patch.creditNoteNo = readPatchString(input, "creditNoteNo", 80);
  if ("paymentTerms" in input) patch.paymentTerms = readPatchEnum(input, "paymentTerms", paymentTerms);
  if ("dueDate" in input) patch.dueDate = readPatchDate(input, "dueDate");
  if ("docStatus" in input) patch.docStatus = readPatchEnum(input, "docStatus", docStatuses);
  if ("recurringTemplateId" in input) patch.recurringTemplateId = readPatchString(input, "recurringTemplateId", 64);

  return patch;
};

const mapTransactionRow = (row: unknown): Transaction => {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    type: String(r.type) as TransactionType,
    amount: Number(r.amount),
    accountId: r.payment_account_id ? String(r.payment_account_id) : undefined,
    accountToId: r.payment_account_to_id ? String(r.payment_account_to_id) : undefined,
    categoryId: r.category_id ? String(r.category_id) : undefined,
    chartAccountId: r.chart_account_id ? String(r.chart_account_id) : undefined,
    clearingChartAccountId: r.clearing_chart_account_id ? String(r.clearing_chart_account_id) : undefined,
    date: String(r.date),
    note: r.note ? String(r.note) : undefined,
    gstMode: (r.gst_mode as GsmMode) ?? undefined,
    entryMode: (r.entry_mode as EntryMode) ?? undefined,
    contactId: r.contact_id ? String(r.contact_id) : undefined,
    party: r.party ? String(r.party) : undefined,
    invoiceNo: r.invoice_no ? String(r.invoice_no) : undefined,
    creditNoteNo: r.credit_note_no ? String(r.credit_note_no) : undefined,
    paymentTerms: (r.payment_terms as PaymentTerms) ?? undefined,
    dueDate: r.due_date ? String(r.due_date) : undefined,
    docStatus: (r.doc_status as DocStatus) ?? undefined,
    voidedAt: r.voided_at ? String(r.voided_at) : undefined,
    recurringTemplateId: r.recurring_template_id ? String(r.recurring_template_id) : undefined,
  };
};

const requireKnownId = (ids: Set<string>, id: string | null | undefined, field: string): void => {
  if (id && !ids.has(id)) {
    throw new ApiError(400, "invalid_transaction", `${field} does not belong to this business.`);
  }
};

const normalizeTransaction = (ledger: WriteContext, input: Omit<Transaction, "id">): Transaction => {
  const data = ledger.snapshot.ledger;
  const accountIds = new Set(data.accounts.map((account) => account.id));
  const chartAccountIds = new Set(data.chartOfAccounts.map((account) => account.id));
  const contactIds = new Set(data.contacts.map((contact) => contact.id));

  requireKnownId(accountIds, input.accountId, "accountId");
  requireKnownId(accountIds, input.accountToId, "accountToId");
  requireKnownId(chartAccountIds, input.chartAccountId, "chartAccountId");
  requireKnownId(chartAccountIds, input.clearingChartAccountId, "clearingChartAccountId");
  requireKnownId(contactIds, input.contactId, "contactId");

  const categoryPool = input.type === "income" ? data.categories.income : data.categories.expense;
  if (input.type !== "transfer" && input.categoryId && !categoryPool.some((category) => category.id === input.categoryId)) {
    throw new ApiError(400, "invalid_transaction", "categoryId does not belong to this business transaction type.");
  }

  if (input.type === "transfer") {
    if (!input.accountId || !input.accountToId) {
      throw new ApiError(400, "invalid_transaction", "Transfers require accountId and accountToId.");
    }
    if (input.accountId === input.accountToId) {
      throw new ApiError(400, "invalid_transaction", "Transfers require different accounts.");
    }
  }

  const entryMode = input.entryMode ?? "cash";
  const chartAccountId =
    input.type === "transfer"
      ? undefined
      : input.chartAccountId ?? defaultChartAccountId(data, input.type, input.categoryId);
  const clearingChartAccountId =
    input.type === "transfer"
      ? undefined
      : input.clearingChartAccountId ?? (entryMode === "invoice" ? clearingAccountId(data, input.type) : undefined);

  const transaction: Transaction = {
    id: "pending",
    ...input,
    entryMode,
    chartAccountId,
    clearingChartAccountId,
  };

  const validation = validateTransactionInput(data, transaction);
  if (!validation.ok) {
    throw new ApiError(400, "invalid_transaction", validation.errors.join(" "));
  }

  return transaction;
};

const compactPatchedTransaction = (existing: Transaction, patch: TransactionPatch): Transaction => ({
  ...existing,
  ...("type" in patch ? { type: patch.type } : {}),
  ...("amount" in patch ? { amount: patch.amount } : {}),
  ...("accountId" in patch ? { accountId: patch.accountId ?? undefined } : {}),
  ...("accountToId" in patch ? { accountToId: patch.accountToId ?? undefined } : {}),
  ...("categoryId" in patch ? { categoryId: patch.categoryId ?? undefined } : {}),
  ...("chartAccountId" in patch ? { chartAccountId: patch.chartAccountId ?? undefined } : {}),
  ...("clearingChartAccountId" in patch ? { clearingChartAccountId: patch.clearingChartAccountId ?? undefined } : {}),
  ...("date" in patch ? { date: patch.date } : {}),
  ...("note" in patch ? { note: patch.note ?? undefined } : {}),
  ...("gstMode" in patch ? { gstMode: patch.gstMode ?? undefined } : {}),
  ...("entryMode" in patch ? { entryMode: patch.entryMode ?? undefined } : {}),
  ...("contactId" in patch ? { contactId: patch.contactId ?? undefined } : {}),
  ...("party" in patch ? { party: patch.party ?? undefined } : {}),
  ...("invoiceNo" in patch ? { invoiceNo: patch.invoiceNo ?? undefined } : {}),
  ...("creditNoteNo" in patch ? { creditNoteNo: patch.creditNoteNo ?? undefined } : {}),
  ...("paymentTerms" in patch ? { paymentTerms: patch.paymentTerms ?? undefined } : {}),
  ...("dueDate" in patch ? { dueDate: patch.dueDate ?? undefined } : {}),
  ...("docStatus" in patch ? { docStatus: patch.docStatus ?? undefined } : {}),
  ...("recurringTemplateId" in patch ? { recurringTemplateId: patch.recurringTemplateId ?? undefined } : {}),
});

const normalizePatchedTransaction = (
  ledger: WriteContext,
  existing: Transaction,
  patch: TransactionPatch,
): Transaction => {
  const data = ledger.snapshot.ledger;
  const accountIds = new Set(data.accounts.map((account) => account.id));
  const chartAccountIds = new Set(data.chartOfAccounts.map((account) => account.id));
  const contactIds = new Set(data.contacts.map((contact) => contact.id));
  const merged = compactPatchedTransaction(existing, patch);

  requireKnownId(accountIds, merged.accountId, "accountId");
  requireKnownId(accountIds, merged.accountToId, "accountToId");
  requireKnownId(chartAccountIds, merged.chartAccountId, "chartAccountId");
  requireKnownId(chartAccountIds, merged.clearingChartAccountId, "clearingChartAccountId");
  requireKnownId(contactIds, merged.contactId, "contactId");

  const categoryPool = merged.type === "income" ? data.categories.income : data.categories.expense;
  if (merged.type !== "transfer" && merged.categoryId && !categoryPool.some((category) => category.id === merged.categoryId)) {
    throw new ApiError(400, "invalid_transaction", "categoryId does not belong to this business transaction type.");
  }

  if (merged.type === "transfer") {
    if (!merged.accountId || !merged.accountToId) {
      throw new ApiError(400, "invalid_transaction", "Transfers require accountId and accountToId.");
    }
    if (merged.accountId === merged.accountToId) {
      throw new ApiError(400, "invalid_transaction", "Transfers require different accounts.");
    }

    return {
      ...merged,
      categoryId: undefined,
      chartAccountId: undefined,
      clearingChartAccountId: undefined,
      contactId: undefined,
      party: undefined,
      invoiceNo: undefined,
      creditNoteNo: undefined,
      paymentTerms: undefined,
      dueDate: undefined,
      docStatus: undefined,
      gstMode: undefined,
      entryMode: undefined,
    };
  }

  const entryMode = merged.entryMode ?? "cash";
  const needsClearingAccount = entryMode === "invoice" || entryMode === "credit_note";
  const normalized: Transaction = {
    ...merged,
    accountToId: undefined,
    entryMode,
    chartAccountId: merged.chartAccountId ?? defaultChartAccountId(data, merged.type, merged.categoryId),
    clearingChartAccountId: needsClearingAccount
      ? merged.clearingChartAccountId ?? clearingAccountId(data, merged.type)
      : undefined,
  };

  if (entryMode === "cash") {
    return {
      ...normalized,
      contactId: undefined,
      party: undefined,
      invoiceNo: undefined,
      creditNoteNo: undefined,
      paymentTerms: undefined,
      dueDate: undefined,
      docStatus: undefined,
    };
  }

  if (entryMode === "invoice") {
    return {
      ...normalized,
      creditNoteNo: undefined,
    };
  }

  return {
    ...normalized,
    invoiceNo: undefined,
  };
};

type WriteContext = Awaited<ReturnType<typeof getWriteContext>>;

const getWriteContext = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
) => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to write transactions.");
  }
  return { snapshot };
};

const toInsertRow = (businessId: string, transaction: Transaction): TransactionInsertRow => ({
  business_id: businessId,
  type: transaction.type,
  entry_mode: transaction.entryMode,
  amount: transaction.amount,
  payment_account_id: transaction.accountId,
  payment_account_to_id: transaction.accountToId,
  category_id: transaction.categoryId,
  chart_account_id: transaction.chartAccountId,
  clearing_chart_account_id: transaction.clearingChartAccountId,
  contact_id: transaction.contactId,
  party: transaction.party,
  date: transaction.date,
  due_date: transaction.dueDate,
  note: transaction.note,
  gst_mode: transaction.gstMode ?? undefined,
  invoice_no: transaction.invoiceNo,
  credit_note_no: transaction.creditNoteNo,
  payment_terms: transaction.paymentTerms,
  doc_status: transaction.docStatus,
  recurring_template_id: transaction.recurringTemplateId,
});

const toUpdateRow = (transaction: Transaction): Record<string, unknown> => ({
  type: transaction.type,
  entry_mode: transaction.entryMode ?? null,
  amount: transaction.amount,
  payment_account_id: transaction.accountId ?? null,
  payment_account_to_id: transaction.accountToId ?? null,
  category_id: transaction.categoryId ?? null,
  chart_account_id: transaction.chartAccountId ?? null,
  clearing_chart_account_id: transaction.clearingChartAccountId ?? null,
  contact_id: transaction.contactId ?? null,
  party: transaction.party ?? null,
  date: transaction.date,
  due_date: transaction.dueDate ?? null,
  note: transaction.note ?? null,
  gst_mode: transaction.gstMode ?? null,
  invoice_no: transaction.invoiceNo ?? null,
  credit_note_no: transaction.creditNoteNo ?? null,
  payment_terms: transaction.paymentTerms ?? null,
  doc_status: transaction.docStatus ?? null,
  recurring_template_id: transaction.recurringTemplateId ?? null,
});

const toPaymentInsertRow = (
  businessId: string,
  transactionId: string,
  payment: Omit<InvoicePayment, "id">,
): InvoicePaymentInsertRow => ({
  business_id: businessId,
  transaction_id: transactionId,
  amount: payment.amount,
  date: payment.date,
  payment_account_id: payment.accountId,
  receipt_no: payment.receiptNo,
  receipt_created_at: payment.receiptCreatedAt,
});

const toPaymentRpcRow = (payment: Omit<InvoicePayment, "id">): Record<string, unknown> => ({
  amount: payment.amount,
  date: payment.date,
  payment_account_id: payment.accountId,
  receipt_no: payment.receiptNo ?? null,
  receipt_created_at: payment.receiptCreatedAt ?? null,
});

const mapPaymentRow = (row: unknown): InvoicePayment => {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    amount: Number(r.amount),
    date: String(r.date),
    accountId: String(r.payment_account_id),
    receiptNo: r.receipt_no ? String(r.receipt_no) : undefined,
    receiptCreatedAt: r.receipt_created_at ? String(r.receipt_created_at) : undefined,
    voidedAt: r.voided_at ? String(r.voided_at) : undefined,
  };
};

const toCreditAllocationInsertRow = (
  businessId: string,
  allocation: Omit<CreditAllocation, "id">,
): CreditAllocationInsertRow => ({
  business_id: businessId,
  credit_note_id: allocation.creditNoteId,
  invoice_id: allocation.invoiceId,
  amount: allocation.amount,
  date: allocation.date,
});

const allocateDocumentNumber = async (
  supabase: SupabaseServiceClient,
  businessId: string,
  kind: DocumentNumberKind,
): Promise<string> => {
  const { data, error } = await supabase.rpc("allocate_document_number", {
    target_business_id: businessId,
    document_kind: kind,
  });

  if (error || typeof data !== "string") {
    throw new ApiError(500, "document_number_allocation_failed", error?.message ?? "No document number returned.");
  }

  return data;
};

const applyServerDocumentNumber = async (
  supabase: SupabaseServiceClient,
  businessId: string,
  transaction: Transaction,
): Promise<Transaction> => {
  if (transaction.entryMode === "invoice" && !transaction.invoiceNo) {
    return {
      ...transaction,
      invoiceNo: await allocateDocumentNumber(supabase, businessId, transaction.type === "income" ? "invoice" : "bill"),
    };
  }

  if (transaction.entryMode === "credit_note" && !transaction.creditNoteNo) {
    return {
      ...transaction,
      creditNoteNo: await allocateDocumentNumber(
        supabase,
        businessId,
        transaction.type === "income" ? "credit_note" : "supplier_credit",
      ),
    };
  }

  return transaction;
};

export const createTransaction = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<Transaction> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseTransactionInput(body);
  const transaction = await applyServerDocumentNumber(supabase, businessId, normalizeTransaction(context, input));

  const { data, error } = await supabase
    .from("transactions")
    .insert(toInsertRow(businessId, transaction))
    .select(
      "id,type,amount,payment_account_id,payment_account_to_id,category_id,chart_account_id,clearing_chart_account_id,date,note,gst_mode,entry_mode,contact_id,party,invoice_no,credit_note_no,payment_terms,due_date,doc_status,voided_at,recurring_template_id",
    )
    .single();

  if (error || !data) {
    throw new ApiError(500, "transaction_create_failed", error?.message ?? "No transaction returned.");
  }

  const transactionId = (data as { id: string }).id;
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "transaction",
    entityId: transactionId,
    detail: `Created ${transaction.type} ${transaction.entryMode ?? "cash"} transaction for ${transaction.amount} on ${transaction.date}`,
    metadata: {
      type: transaction.type,
      entryMode: transaction.entryMode,
      amount: transaction.amount,
      date: transaction.date,
      invoiceNo: transaction.invoiceNo,
      creditNoteNo: transaction.creditNoteNo,
    },
  });

  return {
    ...transaction,
    id: transactionId,
  };
};

export const updateTransaction = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  transactionId: string,
  body: unknown,
): Promise<Transaction> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = context.snapshot.ledger.transactions.find((item) => item.id === transactionId);

  if (!existing) {
    throw new ApiError(404, "transaction_not_found", "Transaction not found.");
  }
  if (existing.voidedAt) {
    throw new ApiError(400, "transaction_already_voided", "Cannot edit a voided transaction.");
  }
  if (isDateLocked(context.snapshot.ledger, existing.date)) {
    throw new ApiError(400, "locked_period", `Transaction date ${existing.date} is in a locked period.`);
  }

  const patch = parseTransactionPatch(body);
  const newPayments = parseNewPaymentsInput(body);
  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "invalid_transaction", "No fields to update.");
  }

  const merged = normalizePatchedTransaction(context, existing, patch);

  if (patch.date && isDateLocked(context.snapshot.ledger, merged.date)) {
    throw new ApiError(400, "locked_period", `Transaction date ${merged.date} is in a locked period.`);
  }

  const validation = validateTransactionInput(context.snapshot.ledger, merged, { allowLockedPeriod: true });
  if (!validation.ok) {
    throw new ApiError(400, "invalid_transaction", validation.errors.join(" "));
  }

  const paymentValidationLedger = {
    ...context.snapshot.ledger,
    transactions: context.snapshot.ledger.transactions.map((transaction) =>
      transaction.id === transactionId ? merged : transaction,
    ),
  };
  const paymentValidatedTransaction: Transaction = { ...merged, payments: [...(merged.payments ?? [])] };
  const payments = newPayments.map((payment) => ({
    ...payment,
    receiptNo: payment.receiptNo,
    receiptCreatedAt: payment.receiptCreatedAt,
  }));

  for (const payment of payments) {
    const paymentValidation = validatePaymentInput(paymentValidationLedger, paymentValidatedTransaction, payment);
    if (!paymentValidation.ok) {
      throw new ApiError(400, "invalid_payment", paymentValidation.errors.join(" "));
    }
    paymentValidatedTransaction.payments = [
      ...(paymentValidatedTransaction.payments ?? []),
      {
        id: `pending_${paymentValidatedTransaction.payments?.length ?? 0}`,
        ...payment,
      },
    ];
  }

  const update = toUpdateRow(merged);

  const { data, error } = await supabase
    .rpc("update_transaction_with_payments", {
      target_business_id: businessId,
      target_transaction_id: transactionId,
      transaction_update: update,
      new_payments: payments.map(toPaymentRpcRow),
      transaction_audit: {
        action: "update",
        entity_type: "transaction",
        entity_id: transactionId,
        detail: `Updated ${merged.type} ${merged.entryMode ?? "cash"} transaction for ${merged.amount} on ${merged.date}`,
        metadata: { fields: Object.keys(patch), newPaymentCount: payments.length },
      },
      actor_user_id: userId,
    });

  if (error || !data) {
    throw new ApiError(500, "transaction_update_failed", error?.message ?? "No transaction returned.");
  }

  const result = data as unknown as { transaction?: unknown; payments?: unknown[] };
  const updated = mapTransactionRow(result.transaction);
  const insertedPayments = Array.isArray(result.payments) ? result.payments.map(mapPaymentRow) : [];

  return {
    ...updated,
    payments: [...(existing.payments ?? []), ...insertedPayments],
  };
};

export const recordTransactionPayment = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  transactionId: string,
  body: unknown,
): Promise<InvoicePayment> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const parsedPayment = parsePaymentInput(body);
  const payment = {
    ...parsedPayment,
    receiptNo: parsedPayment.receiptNo ?? (await allocateDocumentNumber(supabase, businessId, "receipt")),
    receiptCreatedAt: parsedPayment.receiptCreatedAt ?? new Date().toISOString(),
  };
  const transaction = context.snapshot.ledger.transactions.find((item) => item.id === transactionId);

  if (!transaction) {
    throw new ApiError(404, "transaction_not_found", "Transaction not found.");
  }

  const validation = validatePaymentInput(context.snapshot.ledger, transaction, payment);
  if (!validation.ok) {
    throw new ApiError(400, "invalid_payment", validation.errors.join(" "));
  }

  const { data, error } = await supabase
    .from("invoice_payments")
    .insert(toPaymentInsertRow(businessId, transactionId, payment))
    .select("id,amount,date,payment_account_id,receipt_no,receipt_created_at,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "payment_create_failed", error?.message ?? "No payment returned.");
  }

  const row = data as unknown as {
    id: string;
    amount: number;
    date: string;
    payment_account_id: string;
    receipt_no: string | null;
    receipt_created_at: string | null;
    voided_at: string | null;
  };

  const paymentResult = {
    id: row.id,
    amount: Number(row.amount),
    date: row.date,
    accountId: row.payment_account_id,
    receiptNo: row.receipt_no ?? undefined,
    receiptCreatedAt: row.receipt_created_at ?? undefined,
    voidedAt: row.voided_at ?? undefined,
  };

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "record",
    entityType: "payment",
    entityId: paymentResult.id,
    detail: `Recorded payment ${paymentResult.amount} for transaction ${transactionId} on ${paymentResult.date}`,
    metadata: {
      transactionId,
      amount: paymentResult.amount,
      date: paymentResult.date,
      paymentAccountId: paymentResult.accountId,
    },
  });

  return paymentResult;
};

export const createCreditAllocation = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<CreditAllocation> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const allocation = parseCreditAllocationInput(body);

  const validation = validateCreditAllocations(context.snapshot.ledger, [allocation]);
  if (!validation.ok) {
    throw new ApiError(400, "invalid_credit_allocation", validation.errors.join(" "));
  }

  const { data, error } = await supabase
    .from("credit_allocations")
    .insert(toCreditAllocationInsertRow(businessId, allocation))
    .select("id,credit_note_id,invoice_id,amount,date")
    .single();

  if (error || !data) {
    throw new ApiError(500, "credit_allocation_create_failed", error?.message ?? "No credit allocation returned.");
  }

  const row = data as unknown as {
    id: string;
    credit_note_id: string;
    invoice_id: string;
    amount: number;
    date: string;
  };

  const allocationResult = {
    id: row.id,
    creditNoteId: row.credit_note_id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount),
    date: row.date,
  };

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "allocate",
    entityType: "credit_allocation",
    entityId: allocationResult.id,
    detail: `Allocated credit ${allocationResult.amount} from ${allocationResult.creditNoteId} to ${allocationResult.invoiceId} on ${allocationResult.date}`,
    metadata: {
      creditNoteId: allocationResult.creditNoteId,
      invoiceId: allocationResult.invoiceId,
      amount: allocationResult.amount,
      date: allocationResult.date,
    },
  });

  return allocationResult;
};

export const voidTransaction = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  transactionId: string,
  body: unknown,
): Promise<Transaction> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseVoidInput(body);
  const transaction = context.snapshot.ledger.transactions.find((item) => item.id === transactionId);

  if (!transaction) {
    throw new ApiError(404, "transaction_not_found", "Transaction not found.");
  }

  if (transaction.voidedAt) {
    throw new ApiError(400, "transaction_already_voided", "Transaction is already voided.");
  }

  if (isDateLocked(context.snapshot.ledger, transaction.date)) {
    throw new ApiError(400, "locked_period", `Transaction date ${transaction.date} is in a locked period.`);
  }

  const activePayments = (transaction.payments ?? []).filter((payment) => !payment.voidedAt);
  if (activePayments.length > 0) {
    throw new ApiError(400, "transaction_has_payments", "Void related payments before voiding this transaction.");
  }

  const activeAllocations = context.snapshot.ledger.creditAllocations.filter(
    (allocation) => allocation.invoiceId === transaction.id || allocation.creditNoteId === transaction.id,
  );
  if (activeAllocations.length > 0) {
    throw new ApiError(
      400,
      "transaction_has_credit_allocations",
      "Void related credit allocations before voiding this transaction.",
    );
  }

  const { data, error } = await supabase
    .from("transactions")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: userId,
      void_reason: input.reason,
    })
    .eq("business_id", businessId)
    .eq("id", transactionId)
    .is("voided_at", null)
    .select("id,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "transaction_void_failed", error?.message ?? "No transaction returned.");
  }

  const voidedAt = (data as { voided_at: string }).voided_at;
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "void",
    entityType: "transaction",
    entityId: transactionId,
    detail: `Voided transaction ${transactionId}${input.reason ? `: ${input.reason}` : ""}`,
    metadata: {
      reason: input.reason,
      voidedAt,
      type: transaction.type,
      entryMode: transaction.entryMode,
      amount: transaction.amount,
      date: transaction.date,
    },
  });

  return {
    ...transaction,
    voidedAt,
  };
};

export const voidPayment = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  paymentId: string,
  body: unknown,
): Promise<InvoicePayment> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseVoidInput(body);
  const paymentOwner = context.snapshot.ledger.transactions.find((transaction) =>
    (transaction.payments ?? []).some((payment) => payment.id === paymentId),
  );
  const payment = paymentOwner?.payments?.find((item) => item.id === paymentId);

  if (!paymentOwner || !payment) {
    throw new ApiError(404, "payment_not_found", "Payment not found.");
  }

  if (payment.voidedAt) {
    throw new ApiError(400, "payment_already_voided", "Payment is already voided.");
  }

  if (isDateLocked(context.snapshot.ledger, payment.date)) {
    throw new ApiError(400, "locked_period", `Payment date ${payment.date} is in a locked period.`);
  }

  const { data, error } = await supabase
    .from("invoice_payments")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: userId,
    })
    .eq("business_id", businessId)
    .eq("id", paymentId)
    .is("voided_at", null)
    .select("id,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "payment_void_failed", error?.message ?? "No payment returned.");
  }

  const voidedAt = (data as { voided_at: string }).voided_at;
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "void",
    entityType: "payment",
    entityId: paymentId,
    detail: `Voided payment ${paymentId} for transaction ${paymentOwner.id}${input.reason ? `: ${input.reason}` : ""}`,
    metadata: {
      reason: input.reason,
      voidedAt,
      transactionId: paymentOwner.id,
      amount: payment.amount,
      date: payment.date,
    },
  });

  return {
    ...payment,
    voidedAt,
  };
};

export const voidCreditAllocation = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  allocationId: string,
  body: unknown,
): Promise<CreditAllocation> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseVoidInput(body);
  const allocation = context.snapshot.ledger.creditAllocations.find((item) => item.id === allocationId);

  if (!allocation) {
    throw new ApiError(404, "credit_allocation_not_found", "Credit allocation not found.");
  }

  if (isDateLocked(context.snapshot.ledger, allocation.date)) {
    throw new ApiError(400, "locked_period", `Credit allocation date ${allocation.date} is in a locked period.`);
  }

  const { data, error } = await supabase
    .from("credit_allocations")
    .update({
      voided_at: new Date().toISOString(),
    })
    .eq("business_id", businessId)
    .eq("id", allocationId)
    .is("voided_at", null)
    .select("id,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "credit_allocation_void_failed", error?.message ?? "No credit allocation returned.");
  }

  const voidedAt = (data as { voided_at: string }).voided_at;
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "void",
    entityType: "credit_allocation",
    entityId: allocationId,
    detail: `Voided credit allocation ${allocationId}${input.reason ? `: ${input.reason}` : ""}`,
    metadata: {
      reason: input.reason,
      voidedAt,
      creditNoteId: allocation.creditNoteId,
      invoiceId: allocation.invoiceId,
      amount: allocation.amount,
      date: allocation.date,
    },
  });

  return allocation;
};
