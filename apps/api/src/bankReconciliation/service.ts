import { chartAccountLedger, isDateLocked, reconciliationRows } from "@auctus/accounting-core";
import type { BankFeedItem, BankReconciliation } from "@auctus/shared-types";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const writableRoles = new Set(["owner", "admin", "bookkeeper"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type BankFeedItemInput = {
  date: string;
  description: string;
  amount: number;
  reference?: string;
  rawHash: string;
  matchedSourceId?: string;
};

type BankFeedImportInput = {
  accountId: string;
  items: BankFeedItemInput[];
};

type MatchInput = {
  matchedSourceId?: string;
};

type ReconciliationInput = {
  accountId: string;
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  difference: number;
  clearedSourceIds: string[];
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

const ensureObject = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
};

const readString = (
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  required = false,
): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "invalid_bank_reconciliation", `${key} is required.`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_bank_reconciliation", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new ApiError(400, "invalid_bank_reconciliation", `${key} is required.`);
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_bank_reconciliation", `${key} is too long.`);
  }
  return trimmed;
};

const readNumber = (body: Record<string, unknown>, key: string, required = false): number | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "invalid_bank_reconciliation", `${key} is required.`);
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, "invalid_bank_reconciliation", `${key} must be a number.`);
  }
  return parsed;
};

const readDate = (body: Record<string, unknown>, key: string, required = false): string | undefined => {
  const value = readString(body, key, 10, required);
  if (!value) return undefined;
  if (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new ApiError(400, "invalid_bank_reconciliation", `${key} must be YYYY-MM-DD.`);
  }
  return value;
};

const parseImportInput = (body: unknown): BankFeedImportInput => {
  const input = ensureObject(body);
  const accountId = readString(input, "accountId", 80, true) ?? "";
  const rawItems = input.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ApiError(400, "invalid_bank_feed", "items must contain at least one bank feed row.");
  }
  if (rawItems.length > 500) {
    throw new ApiError(400, "invalid_bank_feed", "Cannot import more than 500 bank feed rows at once.");
  }

  const items = rawItems.map((raw) => {
    const item = ensureObject(raw);
    return {
      date: readDate(item, "date", true) ?? "",
      description: readString(item, "description", 500, true) ?? "",
      amount: readNumber(item, "amount", true) ?? 0,
      reference: readString(item, "reference", 160),
      rawHash: readString(item, "rawHash", 160, true) ?? "",
      matchedSourceId: readString(item, "matchedSourceId", 160),
    };
  }).filter((item) => Math.abs(item.amount) > 0.005);

  if (!items.length) {
    throw new ApiError(400, "invalid_bank_feed", "Bank feed rows must have non-zero amounts.");
  }

  return { accountId, items };
};

const parseMatchInput = (body: unknown): MatchInput => {
  const input = ensureObject(body);
  return {
    matchedSourceId: readString(input, "matchedSourceId", 160),
  };
};

const parseReconciliationInput = (body: unknown): ReconciliationInput => {
  const input = ensureObject(body);
  const rawIds = input.clearedSourceIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0 || !rawIds.every((item) => typeof item === "string" && item.trim())) {
    throw new ApiError(400, "invalid_bank_reconciliation", "clearedSourceIds must contain at least one source id.");
  }
  return {
    accountId: readString(input, "accountId", 80, true) ?? "",
    statementDate: readDate(input, "statementDate", true) ?? "",
    statementBalance: readNumber(input, "statementBalance", true) ?? 0,
    bookBalance: readNumber(input, "bookBalance", true) ?? 0,
    difference: readNumber(input, "difference", true) ?? 0,
    clearedSourceIds: Array.from(new Set(rawIds.map((item) => String(item).trim()))),
  };
};

const toBankFeedItem = (row: BankFeedItemRow): BankFeedItem => ({
  id: row.id,
  accountId: row.payment_account_id,
  date: row.date,
  description: row.description,
  amount: Number(row.amount),
  reference: row.reference ?? undefined,
  rawHash: row.raw_hash,
  matchedSourceId: row.matched_source_id ?? undefined,
  importedAt: row.imported_at,
  reconciledAt: row.reconciled_at ?? undefined,
  ignoredAt: row.ignored_at ?? undefined,
});

const toBankReconciliation = (row: BankReconciliationRow): BankReconciliation => ({
  id: row.id,
  accountId: row.payment_account_id,
  statementDate: row.statement_date,
  statementBalance: Number(row.statement_balance),
  bookBalance: Number(row.book_balance),
  difference: Number(row.difference),
  clearedSourceIds: Array.isArray(row.cleared_source_ids) ? row.cleared_source_ids.map(String) : [],
  createdAt: row.created_at,
  finalizedAt: row.finalized_at,
  voidedAt: row.voided_at ?? undefined,
});

const getWriteContext = async (supabase: SupabaseServiceClient, userId: string, businessId: string) => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to manage bank reconciliation.");
  }
  return { snapshot };
};

const assertPaymentAccount = (accountIds: Set<string>, accountId: string): void => {
  if (!accountIds.has(accountId)) {
    throw new ApiError(400, "invalid_payment_account", "Payment account does not belong to this business.");
  }
};

const assertSourceId = (sourceIds: Set<string>, sourceId: string): void => {
  if (!sourceIds.has(sourceId)) {
    throw new ApiError(400, "invalid_bank_feed_match", "Matched source id is not available for this account.");
  }
};

export const importBankFeedItems = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<BankFeedItem[]> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseImportInput(body);
  assertPaymentAccount(new Set(context.snapshot.ledger.accounts.map((account) => account.id)), input.accountId);
  const sourceIds = new Set(reconciliationRows(context.snapshot.ledger, input.accountId, "9999-12-31").map((row) => row.sourceId));
  input.items.forEach((item) => {
    if (item.matchedSourceId) assertSourceId(sourceIds, item.matchedSourceId);
  });

  const rawHashes = Array.from(new Set(input.items.map((item) => item.rawHash)));
  const { data: existing, error: existingError } = await supabase
    .from("bank_feed_items")
    .select("raw_hash")
    .eq("business_id", businessId)
    .eq("payment_account_id", input.accountId)
    .in("raw_hash", rawHashes);

  if (existingError) {
    throw new ApiError(500, "bank_feed_import_failed", existingError.message);
  }

  const existingHashes = new Set(((existing ?? []) as Array<{ raw_hash: string }>).map((row) => row.raw_hash));
  const rows = input.items
    .filter((item) => !existingHashes.has(item.rawHash))
    .map((item) => ({
      business_id: businessId,
      payment_account_id: input.accountId,
      date: item.date,
      description: item.description,
      amount: item.amount,
      reference: item.reference,
      raw_hash: item.rawHash,
      matched_source_id: item.matchedSourceId,
    }));

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from("bank_feed_items")
    .insert(rows)
    .select("id,payment_account_id,date,description,amount,reference,raw_hash,matched_source_id,imported_at,reconciled_at,ignored_at");

  if (error || !data) {
    throw new ApiError(500, "bank_feed_import_failed", error?.message ?? "No bank feed rows returned.");
  }

  const items = (data as unknown as BankFeedItemRow[]).map(toBankFeedItem);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "import",
    entityType: "bank_feed",
    entityId: input.accountId,
    detail: `${items.length} bank feed rows imported`,
    metadata: {
      accountId: input.accountId,
      matchedCount: items.filter((item) => item.matchedSourceId).length,
      skippedDuplicates: input.items.length - items.length,
    },
  });

  return items;
};

export const matchBankFeedItem = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  itemId: string,
  body: unknown,
): Promise<BankFeedItem> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const item = context.snapshot.ledger.bankFeedItems.find((candidate) => candidate.id === itemId);
  if (!item) throw new ApiError(404, "bank_feed_item_not_found", "Bank feed item not found.");
  if (item.reconciledAt) throw new ApiError(400, "bank_feed_item_reconciled", "Reconciled bank feed items cannot be rematched.");

  const input = parseMatchInput(body);
  if (input.matchedSourceId) {
    const sourceIds = new Set(reconciliationRows(context.snapshot.ledger, item.accountId, "9999-12-31").map((row) => row.sourceId));
    assertSourceId(sourceIds, input.matchedSourceId);
  }

  const { data, error } = await supabase
    .from("bank_feed_items")
    .update({ matched_source_id: input.matchedSourceId ?? null })
    .eq("business_id", businessId)
    .eq("id", itemId)
    .select("id,payment_account_id,date,description,amount,reference,raw_hash,matched_source_id,imported_at,reconciled_at,ignored_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "bank_feed_match_failed", error?.message ?? "No bank feed row returned.");
  }

  const updated = toBankFeedItem(data as unknown as BankFeedItemRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: input.matchedSourceId ? "match" : "unmatch",
    entityType: "bank_feed",
    entityId: itemId,
    detail: input.matchedSourceId ? `Bank feed row matched to ${input.matchedSourceId}` : "Bank feed row unmatched",
  });

  return updated;
};

const setBankFeedIgnoredAt = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  itemId: string,
  ignoredAt: string | null,
): Promise<BankFeedItem> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const item = context.snapshot.ledger.bankFeedItems.find((candidate) => candidate.id === itemId);
  if (!item) throw new ApiError(404, "bank_feed_item_not_found", "Bank feed item not found.");
  if (item.reconciledAt) throw new ApiError(400, "bank_feed_item_reconciled", "Reconciled bank feed items cannot be ignored or restored.");

  const { data, error } = await supabase
    .from("bank_feed_items")
    .update({ ignored_at: ignoredAt })
    .eq("business_id", businessId)
    .eq("id", itemId)
    .select("id,payment_account_id,date,description,amount,reference,raw_hash,matched_source_id,imported_at,reconciled_at,ignored_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, ignoredAt ? "bank_feed_ignore_failed" : "bank_feed_unignore_failed", error?.message ?? "No bank feed row returned.");
  }

  const updated = toBankFeedItem(data as unknown as BankFeedItemRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: ignoredAt ? "ignore" : "unignore",
    entityType: "bank_feed",
    entityId: itemId,
    detail: ignoredAt ? "Bank feed row ignored" : "Bank feed row restored",
  });

  return updated;
};

export const ignoreBankFeedItem = (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  itemId: string,
): Promise<BankFeedItem> => setBankFeedIgnoredAt(supabase, userId, businessId, itemId, new Date().toISOString());

export const unignoreBankFeedItem = (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  itemId: string,
): Promise<BankFeedItem> => setBankFeedIgnoredAt(supabase, userId, businessId, itemId, null);

export const finalizeBankReconciliation = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<BankReconciliation> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseReconciliationInput(body);
  assertPaymentAccount(new Set(context.snapshot.ledger.accounts.map((account) => account.id)), input.accountId);
  if (isDateLocked(context.snapshot.ledger, input.statementDate)) {
    throw new ApiError(400, "period_locked", "Reconciliations cannot be finalized in a locked period.");
  }
  if (Math.abs(input.difference) > 0.01) {
    throw new ApiError(400, "bank_reconciliation_out_of_balance", "The reconciliation difference must be zero.");
  }

  const account = context.snapshot.ledger.accounts.find((candidate) => candidate.id === input.accountId);
  const chart = context.snapshot.ledger.chartOfAccounts.find((candidate) => candidate.id === account?.chartAccountId);
  const activePrior = context.snapshot.ledger.bankReconciliations.filter(
    (reconciliation) => reconciliation.accountId === input.accountId && !reconciliation.voidedAt,
  );
  const priorCleared = new Set(activePrior.flatMap((reconciliation) => reconciliation.clearedSourceIds));
  const priorClearedTotal = chartAccountLedger(context.snapshot.ledger, account?.chartAccountId ?? "")
    .filter((row) => row.date <= input.statementDate)
    .filter((row) => priorCleared.has(row.sourceId))
    .reduce((sum, row) => sum + (chart?.normalBalance === "credit" ? row.credit - row.debit : row.debit - row.credit), 0);
  const availableRows = reconciliationRows(context.snapshot.ledger, input.accountId, input.statementDate);
  const availableById = new Map(availableRows.map((row) => [row.sourceId, row]));
  input.clearedSourceIds.forEach((sourceId) => {
    if (!availableById.has(sourceId)) {
      throw new ApiError(400, "invalid_cleared_source", `Source ${sourceId} cannot be cleared for this account/date.`);
    }
  });

  const selectedTotal = input.clearedSourceIds.reduce((sum, sourceId) => sum + (availableById.get(sourceId)?.movement ?? 0), 0);
  const serverBookBalance = +(priorClearedTotal + selectedTotal).toFixed(2);
  const serverDifference = +(input.statementBalance - serverBookBalance).toFixed(2);
  if (Math.abs(serverDifference) > 0.01) {
    throw new ApiError(400, "bank_reconciliation_out_of_balance", "The server-calculated reconciliation difference must be zero.");
  }
  if (Math.abs(serverBookBalance - input.bookBalance) > 0.01) {
    throw new ApiError(400, "bank_reconciliation_mismatch", "The reconciliation book balance does not match the ledger.");
  }

  const finalizedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("bank_reconciliations")
    .insert({
      business_id: businessId,
      payment_account_id: input.accountId,
      statement_date: input.statementDate,
      statement_balance: input.statementBalance,
      book_balance: serverBookBalance,
      difference: serverDifference,
      cleared_source_ids: input.clearedSourceIds,
      finalized_at: finalizedAt,
    })
    .select("id,payment_account_id,statement_date,statement_balance,book_balance,difference,cleared_source_ids,created_at,finalized_at,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "bank_reconciliation_finalize_failed", error?.message ?? "No bank reconciliation returned.");
  }

  await supabase
    .from("bank_feed_items")
    .update({ reconciled_at: finalizedAt })
    .eq("business_id", businessId)
    .in("matched_source_id", input.clearedSourceIds);

  const reconciliation = toBankReconciliation(data as unknown as BankReconciliationRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "finalize",
    entityType: "bank_reconciliation",
    entityId: reconciliation.id,
    detail: `Statement ${reconciliation.statementDate} finalized`,
    metadata: {
      accountId: input.accountId,
      clearedCount: input.clearedSourceIds.length,
      statementBalance: input.statementBalance,
    },
  });

  return reconciliation;
};

export const voidBankReconciliation = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  reconciliationId: string,
): Promise<BankReconciliation> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = context.snapshot.ledger.bankReconciliations.find((candidate) => candidate.id === reconciliationId);
  if (!existing) throw new ApiError(404, "bank_reconciliation_not_found", "Bank reconciliation not found.");
  if (existing.voidedAt) throw new ApiError(400, "bank_reconciliation_already_voided", "Bank reconciliation is already voided.");
  if (isDateLocked(context.snapshot.ledger, existing.statementDate)) {
    throw new ApiError(400, "period_locked", "Reconciliations in a locked period cannot be voided.");
  }

  const { data, error } = await supabase
    .from("bank_reconciliations")
    .update({ voided_at: new Date().toISOString(), voided_by: userId })
    .eq("business_id", businessId)
    .eq("id", reconciliationId)
    .is("voided_at", null)
    .select("id,payment_account_id,statement_date,statement_balance,book_balance,difference,cleared_source_ids,created_at,finalized_at,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "bank_reconciliation_void_failed", error?.message ?? "No bank reconciliation returned.");
  }

  await supabase
    .from("bank_feed_items")
    .update({ reconciled_at: null })
    .eq("business_id", businessId)
    .in("matched_source_id", existing.clearedSourceIds);

  const reconciliation = toBankReconciliation(data as unknown as BankReconciliationRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "void",
    entityType: "bank_reconciliation",
    entityId: reconciliation.id,
    detail: `Statement ${reconciliation.statementDate} voided`,
  });

  return reconciliation;
};
