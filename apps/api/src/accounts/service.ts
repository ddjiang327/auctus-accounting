import type { Account, AccountType, Category } from "@auctus/shared-types";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const writableRoles = new Set(["owner", "admin", "bookkeeper"]);
const accountTypes = new Set<AccountType>(["cash", "bank", "ewallet", "credit", "investment", "loan", "other"]);
const categoryTypes = new Set(["income", "expense"] as const);
type CategoryType = (typeof categoryTypes extends Set<infer T> ? T : never);

type PaymentAccountInput = {
  name: string;
  type: AccountType;
  initBalance: number;
  icon: string;
  color: string;
  chartAccountId: string;
};

type PaymentAccountPatch = Partial<PaymentAccountInput>;

type CategoryInput = {
  type: CategoryType;
  name: string;
  icon: string;
  color: string;
  chartAccountId?: string;
};

type CategoryPatch = Partial<CategoryInput>;

type PaymentAccountRow = {
  id: string;
  name: string;
  type: AccountType;
  init_balance: number;
  icon: string;
  color: string;
  chart_account_id: string;
};

type CategoryRow = {
  id: string;
  type: CategoryType;
  name: string;
  icon: string;
  color: string;
  chart_account_id: string | null;
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
    if (required) {
      throw new ApiError(400, "invalid_accounting_item", `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_accounting_item", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new ApiError(400, "invalid_accounting_item", `${key} is required.`);
    }
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_accounting_item", `${key} is too long.`);
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
      throw new ApiError(400, "invalid_accounting_item", `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new ApiError(400, "invalid_accounting_item", `${key} is invalid.`);
  }
  return value as T;
};

const readNumber = (
  body: Record<string, unknown>,
  key: string,
  required = false,
): number | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new ApiError(400, "invalid_accounting_item", `${key} is required.`);
    }
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, "invalid_accounting_item", `${key} must be a number.`);
  }
  return parsed;
};

const parsePaymentAccountInput = (body: unknown): PaymentAccountInput => {
  const input = ensureObject(body);
  const type = readEnum(input, "type", accountTypes, true);
  const chartAccountId = readString(input, "chartAccountId", 80, true);

  if (!type || !chartAccountId) {
    throw new ApiError(400, "invalid_payment_account", "type and chartAccountId are required.");
  }

  return {
    name: readString(input, "name", 120, true) ?? "",
    type,
    initBalance: readNumber(input, "initBalance") ?? 0,
    icon: readString(input, "icon", 16) ?? "",
    color: readString(input, "color", 32) ?? "#8E8E93",
    chartAccountId,
  };
};

const parsePaymentAccountPatch = (body: unknown): PaymentAccountPatch => {
  const input = ensureObject(body);

  return {
    name: readString(input, "name", 120),
    type: readEnum(input, "type", accountTypes),
    initBalance: readNumber(input, "initBalance"),
    icon: readString(input, "icon", 16),
    color: readString(input, "color", 32),
    chartAccountId: readString(input, "chartAccountId", 80),
  };
};

const parseCategoryInput = (body: unknown): CategoryInput => {
  const input = ensureObject(body);
  const type = readEnum(input, "type", categoryTypes, true);

  if (!type) {
    throw new ApiError(400, "invalid_category", "type is required.");
  }

  return {
    type,
    name: readString(input, "name", 120, true) ?? "",
    icon: readString(input, "icon", 16) ?? "",
    color: readString(input, "color", 32) ?? "#8E8E93",
    chartAccountId: readString(input, "chartAccountId", 80),
  };
};

const parseCategoryPatch = (body: unknown): CategoryPatch => {
  const input = ensureObject(body);

  return {
    type: readEnum(input, "type", categoryTypes),
    name: readString(input, "name", 120),
    icon: readString(input, "icon", 16),
    color: readString(input, "color", 32),
    chartAccountId: readString(input, "chartAccountId", 80),
  };
};

const toPaymentAccount = (row: PaymentAccountRow): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  initBalance: Number(row.init_balance),
  icon: row.icon,
  color: row.color,
  chartAccountId: row.chart_account_id,
});

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  color: row.color,
  chartAccountId: row.chart_account_id ?? undefined,
});

const getWriteContext = async (supabase: SupabaseServiceClient, userId: string, businessId: string) => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to manage accounts or categories.");
  }
  return { snapshot };
};

const assertChartAccount = (
  chartAccountIds: Set<string>,
  chartAccountId: string | undefined,
  required = true,
): void => {
  if (!chartAccountId) {
    if (required) throw new ApiError(400, "invalid_chart_account", "chartAccountId is required.");
    return;
  }
  if (!chartAccountIds.has(chartAccountId)) {
    throw new ApiError(400, "invalid_chart_account", "chartAccountId does not belong to this business.");
  }
};

export const createPaymentAccount = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<Account> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parsePaymentAccountInput(body);
  assertChartAccount(new Set(context.snapshot.ledger.chartOfAccounts.map((account) => account.id)), input.chartAccountId);

  const { data, error } = await supabase
    .from("payment_accounts")
    .insert({
      business_id: businessId,
      name: input.name,
      type: input.type,
      init_balance: input.initBalance,
      icon: input.icon,
      color: input.color,
      chart_account_id: input.chartAccountId,
    })
    .select("id,name,type,init_balance,icon,color,chart_account_id")
    .single();

  if (error || !data) {
    throw new ApiError(500, "payment_account_create_failed", error?.message ?? "No payment account returned.");
  }

  const account = toPaymentAccount(data as unknown as PaymentAccountRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "payment_account",
    entityId: account.id,
    detail: `Created payment account ${account.name}`,
    metadata: {
      type: account.type,
      chartAccountId: account.chartAccountId,
    },
  });

  return account;
};

export const updatePaymentAccount = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  accountId: string,
  body: unknown,
): Promise<Account> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = context.snapshot.ledger.accounts.find((account) => account.id === accountId);
  if (!existing) {
    throw new ApiError(404, "payment_account_not_found", "Payment account not found.");
  }

  const patch = parsePaymentAccountPatch(body);
  if (patch.chartAccountId) {
    assertChartAccount(new Set(context.snapshot.ledger.chartOfAccounts.map((account) => account.id)), patch.chartAccountId);
  }

  const update: Record<string, unknown> = {};
  if (patch.name) update.name = patch.name;
  if (patch.type) update.type = patch.type;
  if (patch.initBalance !== undefined) update.init_balance = patch.initBalance;
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.chartAccountId) update.chart_account_id = patch.chartAccountId;

  if (Object.keys(update).length === 0) {
    throw new ApiError(400, "invalid_payment_account", "No payment account fields to update.");
  }

  const { data, error } = await supabase
    .from("payment_accounts")
    .update(update)
    .eq("business_id", businessId)
    .eq("id", accountId)
    .is("archived_at", null)
    .select("id,name,type,init_balance,icon,color,chart_account_id")
    .single();

  if (error || !data) {
    throw new ApiError(500, "payment_account_update_failed", error?.message ?? "No payment account returned.");
  }

  const account = toPaymentAccount(data as unknown as PaymentAccountRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "payment_account",
    entityId: account.id,
    detail: `Updated payment account ${account.name}`,
    metadata: {
      fields: Object.keys(update),
    },
  });

  return account;
};

export const archivePaymentAccount = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  accountId: string,
): Promise<Account> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = context.snapshot.ledger.accounts.find((account) => account.id === accountId);
  if (!existing) {
    throw new ApiError(404, "payment_account_not_found", "Payment account not found.");
  }

  const usedByTransaction = context.snapshot.ledger.transactions.some(
    (transaction) => !transaction.voidedAt && (transaction.accountId === accountId || transaction.accountToId === accountId),
  );
  const usedByPayment = context.snapshot.ledger.transactions.some((transaction) =>
    (transaction.payments || []).some((payment) => !payment.voidedAt && payment.accountId === accountId),
  );
  if (usedByTransaction || usedByPayment) {
    throw new ApiError(400, "payment_account_in_use", "Payment account is used by active transactions or payments and cannot be archived.");
  }

  const { data, error } = await supabase
    .from("payment_accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", accountId)
    .is("archived_at", null)
    .select("id,name,type,init_balance,icon,color,chart_account_id")
    .single();

  if (error || !data) {
    throw new ApiError(500, "payment_account_archive_failed", error?.message ?? "No payment account returned.");
  }

  const account = toPaymentAccount(data as unknown as PaymentAccountRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "archive",
    entityType: "payment_account",
    entityId: account.id,
    detail: `Archived payment account ${account.name}`,
  });

  return account;
};

export const createCategory = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<Category> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const input = parseCategoryInput(body);
  assertChartAccount(new Set(context.snapshot.ledger.chartOfAccounts.map((account) => account.id)), input.chartAccountId, false);

  const { data, error } = await supabase
    .from("categories")
    .insert({
      business_id: businessId,
      type: input.type,
      name: input.name,
      icon: input.icon,
      color: input.color,
      chart_account_id: input.chartAccountId,
    })
    .select("id,type,name,icon,color,chart_account_id")
    .single();

  if (error || !data) {
    throw new ApiError(500, "category_create_failed", error?.message ?? "No category returned.");
  }

  const category = toCategory(data as unknown as CategoryRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "category",
    entityId: category.id,
    detail: `Created ${input.type} category ${category.name}`,
    metadata: {
      type: input.type,
      chartAccountId: category.chartAccountId,
    },
  });

  return category;
};

export const updateCategory = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  categoryId: string,
  body: unknown,
): Promise<Category> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = [...context.snapshot.ledger.categories.income, ...context.snapshot.ledger.categories.expense].find(
    (category) => category.id === categoryId,
  );
  if (!existing) {
    throw new ApiError(404, "category_not_found", "Category not found.");
  }

  const patch = parseCategoryPatch(body);
  if (patch.chartAccountId) {
    assertChartAccount(new Set(context.snapshot.ledger.chartOfAccounts.map((account) => account.id)), patch.chartAccountId);
  }

  const update: Record<string, unknown> = {};
  if (patch.type) update.type = patch.type;
  if (patch.name) update.name = patch.name;
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.chartAccountId) update.chart_account_id = patch.chartAccountId;

  if (Object.keys(update).length === 0) {
    throw new ApiError(400, "invalid_category", "No category fields to update.");
  }

  const { data, error } = await supabase
    .from("categories")
    .update(update)
    .eq("business_id", businessId)
    .eq("id", categoryId)
    .is("archived_at", null)
    .select("id,type,name,icon,color,chart_account_id")
    .single();

  if (error || !data) {
    throw new ApiError(500, "category_update_failed", error?.message ?? "No category returned.");
  }

  const category = toCategory(data as unknown as CategoryRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "category",
    entityId: category.id,
    detail: `Updated category ${category.name}`,
    metadata: {
      fields: Object.keys(update),
    },
  });

  return category;
};

export const archiveCategory = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  categoryId: string,
): Promise<Category> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = [...context.snapshot.ledger.categories.income, ...context.snapshot.ledger.categories.expense].find(
    (category) => category.id === categoryId,
  );
  if (!existing) {
    throw new ApiError(404, "category_not_found", "Category not found.");
  }

  const inUse = context.snapshot.ledger.transactions.some(
    (transaction) => !transaction.voidedAt && transaction.categoryId === categoryId,
  );
  if (inUse) {
    throw new ApiError(400, "category_in_use", "Category is used by active transactions and cannot be archived.");
  }

  const { data, error } = await supabase
    .from("categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", categoryId)
    .is("archived_at", null)
    .select("id,type,name,icon,color,chart_account_id")
    .single();

  if (error || !data) {
    throw new ApiError(500, "category_archive_failed", error?.message ?? "No category returned.");
  }

  const category = toCategory(data as unknown as CategoryRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "archive",
    entityType: "category",
    entityId: category.id,
    detail: `Archived category ${category.name}`,
  });

  return category;
};
