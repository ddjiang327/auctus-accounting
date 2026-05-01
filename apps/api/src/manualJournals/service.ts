import { isDateLocked } from "@auctus/accounting-core";
import type { JournalLine, ManualJournal } from "@auctus/shared-types";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const writableRoles = new Set(["owner", "admin", "bookkeeper"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type ManualJournalInput = {
  date: string;
  memo: string;
  lines: JournalLine[];
};

const readString = (
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  required = false,
): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "invalid_manual_journal", `${key} is required.`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_manual_journal", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new ApiError(400, "invalid_manual_journal", `${key} is required.`);
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_manual_journal", `${key} is too long.`);
  }
  return trimmed;
};

const readDate = (body: Record<string, unknown>, key: string): string => {
  const value = readString(body, key, 10, true) ?? "";
  if (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new ApiError(400, "invalid_manual_journal", `${key} must be YYYY-MM-DD.`);
  }
  return value;
};

const parseManualJournalInput = (body: unknown): ManualJournalInput => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.lines)) {
    throw new ApiError(400, "invalid_manual_journal", "lines must be an array.");
  }

  return {
    date: readDate(input, "date"),
    memo: readString(input, "memo", 500) ?? "Manual journal",
    lines: input.lines.map((line, index) => parseManualJournalLine(line, index)),
  };
};

const parseManualJournalLine = (line: unknown, index: number): JournalLine => {
  if (!line || typeof line !== "object" || Array.isArray(line)) {
    throw new ApiError(400, "invalid_manual_journal", `Line ${index + 1} must be an object.`);
  }
  const input = line as Record<string, unknown>;
  const chartAccountId = readString(input, "chartAccountId", 64, true) ?? "";
  const debit = Number(input.debit ?? 0);
  const credit = Number(input.credit ?? 0);

  if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
    throw new ApiError(400, "invalid_manual_journal", `Line ${index + 1} debit and credit must be numbers.`);
  }

  return {
    chartAccountId,
    debit: roundMoney(debit),
    credit: roundMoney(credit),
  };
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const validateManualJournal = (
  snapshot: Awaited<ReturnType<typeof getLedgerSnapshot>>,
  input: ManualJournalInput,
): void => {
  if (isDateLocked(snapshot.ledger, input.date)) {
    throw new ApiError(400, "locked_period", `Manual journal date ${input.date} is in a locked period.`);
  }

  if (input.lines.length < 2) {
    throw new ApiError(400, "invalid_manual_journal", "Use at least two posting lines.");
  }

  const chartAccountIds = new Set(snapshot.ledger.chartOfAccounts.map((account) => account.id));
  for (const [index, line] of input.lines.entries()) {
    if (!chartAccountIds.has(line.chartAccountId)) {
      throw new ApiError(400, "invalid_manual_journal", `Line ${index + 1} chartAccountId does not belong to this business.`);
    }
    if (line.debit < 0 || line.credit < 0) {
      throw new ApiError(400, "invalid_manual_journal", `Line ${index + 1} cannot have negative amounts.`);
    }
    if ((line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0)) {
      throw new ApiError(400, "invalid_manual_journal", `Line ${index + 1} must have either debit or credit.`);
    }
  }

  const debit = input.lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = input.lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(debit - credit) > 0.005) {
    throw new ApiError(400, "invalid_manual_journal", "Total debits must equal total credits.");
  }
};

const getWriteContext = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
) => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to write manual journals.");
  }
  return { snapshot };
};

const insertJournalLines = async (
  supabase: SupabaseServiceClient,
  businessId: string,
  journalId: string,
  lines: JournalLine[],
): Promise<void> => {
  const { error } = await supabase.from("manual_journal_lines").insert(
    lines.map((line, index) => ({
      business_id: businessId,
      manual_journal_id: journalId,
      chart_account_id: line.chartAccountId,
      debit: line.debit,
      credit: line.credit,
      line_order: index,
    })),
  );

  if (error) {
    throw new ApiError(500, "manual_journal_lines_save_failed", error.message);
  }
};

const mapManualJournalRow = (row: {
  id: string;
  date: string;
  memo: string;
  created_at: string;
  updated_at: string | null;
  reversed_at: string | null;
  reversal_of: string | null;
  voided_at: string | null;
}, lines: JournalLine[]): ManualJournal => ({
  id: row.id,
  date: row.date,
  memo: row.memo,
  lines,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  reversedAt: row.reversed_at ?? undefined,
  reversalOf: row.reversal_of ?? undefined,
  voidedAt: row.voided_at ?? undefined,
});

const findJournal = (journals: ManualJournal[], journalId: string): ManualJournal => {
  const journal = journals.find((item) => item.id === journalId);
  if (!journal) {
    throw new ApiError(404, "manual_journal_not_found", "Manual journal not found.");
  }
  return journal;
};

export const createManualJournal = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<ManualJournal> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseManualJournalInput(body);
  validateManualJournal(context.snapshot, input);

  const { data, error } = await supabase
    .from("manual_journals")
    .insert({
      business_id: businessId,
      date: input.date,
      memo: input.memo,
      created_by: userId,
    })
    .select("id,date,memo,created_at,updated_at,reversed_at,reversal_of,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "manual_journal_create_failed", error?.message ?? "No manual journal returned.");
  }

  const row = data as unknown as Parameters<typeof mapManualJournalRow>[0];
  await insertJournalLines(supabase, businessId, row.id, input.lines);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "manual_journal",
    entityId: row.id,
    detail: input.memo,
    metadata: {
      date: input.date,
      lineCount: input.lines.length,
    },
  });

  return mapManualJournalRow(row, input.lines);
};

export const updateManualJournal = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  journalId: string,
  body: unknown,
): Promise<ManualJournal> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = findJournal(context.snapshot.ledger.manualJournals, journalId);

  if (existing.voidedAt) {
    throw new ApiError(400, "manual_journal_voided", "Voided manual journals cannot be edited.");
  }
  if (existing.reversedAt || existing.reversalOf) {
    throw new ApiError(400, "manual_journal_not_editable", "Reversed manual journals and reversal entries cannot be edited.");
  }
  if (isDateLocked(context.snapshot.ledger, existing.date)) {
    throw new ApiError(400, "locked_period", `Manual journal date ${existing.date} is in a locked period.`);
  }

  const input = parseManualJournalInput(body);
  validateManualJournal(context.snapshot, input);

  const { data, error } = await supabase
    .from("manual_journals")
    .update({
      date: input.date,
      memo: input.memo,
    })
    .eq("business_id", businessId)
    .eq("id", journalId)
    .is("voided_at", null)
    .is("reversed_at", null)
    .is("reversal_of", null)
    .select("id,date,memo,created_at,updated_at,reversed_at,reversal_of,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "manual_journal_update_failed", error?.message ?? "No manual journal returned.");
  }

  const { error: deleteError } = await supabase
    .from("manual_journal_lines")
    .delete()
    .eq("business_id", businessId)
    .eq("manual_journal_id", journalId);

  if (deleteError) {
    throw new ApiError(500, "manual_journal_lines_save_failed", deleteError.message);
  }

  await insertJournalLines(supabase, businessId, journalId, input.lines);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "manual_journal",
    entityId: journalId,
    detail: input.memo,
    metadata: {
      date: input.date,
      lineCount: input.lines.length,
    },
  });

  return mapManualJournalRow(data as unknown as Parameters<typeof mapManualJournalRow>[0], input.lines);
};

export const voidManualJournal = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  journalId: string,
  body: unknown,
): Promise<ManualJournal> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = findJournal(context.snapshot.ledger.manualJournals, journalId);
  const reason = body && typeof body === "object" && !Array.isArray(body)
    ? readString(body as Record<string, unknown>, "reason", 500)
    : undefined;

  if (existing.voidedAt) {
    throw new ApiError(400, "manual_journal_voided", "Manual journal is already voided.");
  }
  if (isDateLocked(context.snapshot.ledger, existing.date)) {
    throw new ApiError(400, "locked_period", `Manual journal date ${existing.date} is in a locked period.`);
  }

  const { data, error } = await supabase
    .from("manual_journals")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: userId,
      void_reason: reason,
    })
    .eq("business_id", businessId)
    .eq("id", journalId)
    .is("voided_at", null)
    .select("id,date,memo,created_at,updated_at,reversed_at,reversal_of,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "manual_journal_void_failed", error?.message ?? "No manual journal returned.");
  }

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "void",
    entityType: "manual_journal",
    entityId: journalId,
    detail: `Voided manual journal ${existing.memo}${reason ? `: ${reason}` : ""}`,
    metadata: {
      reason,
    },
  });

  return {
    ...existing,
    voidedAt: (data as { voided_at: string }).voided_at,
  };
};

export const reverseManualJournal = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  journalId: string,
): Promise<ManualJournal> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = findJournal(context.snapshot.ledger.manualJournals, journalId);
  const today = new Date().toISOString().slice(0, 10);

  if (existing.voidedAt) {
    throw new ApiError(400, "manual_journal_voided", "Voided manual journals cannot be reversed.");
  }
  if (existing.reversedAt || existing.reversalOf) {
    throw new ApiError(400, "manual_journal_not_reversible", "Manual journal is already reversed or is itself a reversal.");
  }
  if (isDateLocked(context.snapshot.ledger, existing.date)) {
    throw new ApiError(400, "locked_period", `Manual journal date ${existing.date} is in a locked period.`);
  }
  if (isDateLocked(context.snapshot.ledger, today)) {
    throw new ApiError(400, "locked_period", `Reversal date ${today} is in a locked period.`);
  }

  const now = new Date().toISOString();
  const reversalLines = existing.lines.map((line) => ({
    chartAccountId: line.chartAccountId,
    debit: line.credit,
    credit: line.debit,
  }));

  const { error: updateError } = await supabase
    .from("manual_journals")
    .update({ reversed_at: now })
    .eq("business_id", businessId)
    .eq("id", journalId)
    .is("reversed_at", null)
    .is("voided_at", null);

  if (updateError) {
    throw new ApiError(500, "manual_journal_reverse_failed", updateError.message);
  }

  const { data, error } = await supabase
    .from("manual_journals")
    .insert({
      business_id: businessId,
      date: today,
      memo: `Reversal - ${existing.memo}`,
      created_by: userId,
      reversal_of: existing.id,
    })
    .select("id,date,memo,created_at,updated_at,reversed_at,reversal_of,voided_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "manual_journal_reverse_failed", error?.message ?? "No reversal journal returned.");
  }

  const row = data as unknown as Parameters<typeof mapManualJournalRow>[0];
  await insertJournalLines(supabase, businessId, row.id, reversalLines);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "reverse",
    entityType: "manual_journal",
    entityId: journalId,
    detail: `Reversed manual journal ${existing.memo}`,
    metadata: {
      reversalId: row.id,
      reversalDate: today,
    },
  });

  return mapManualJournalRow(row, reversalLines);
};
