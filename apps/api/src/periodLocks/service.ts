import type { PeriodLock } from "@auctus/shared-types";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const adminRoles = new Set(["owner", "admin"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type CreatePeriodLockInput = {
  lockedThrough: string;
  note?: string;
};

const readString = (body: Record<string, unknown>, key: string, maxLength: number): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_period_lock", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_period_lock", `${key} is too long.`);
  }
  return trimmed;
};

const readDate = (body: Record<string, unknown>, key: string): string => {
  const value = readString(body, key, 10);
  if (!value) {
    throw new ApiError(400, "invalid_period_lock", `${key} is required.`);
  }
  if (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new ApiError(400, "invalid_period_lock", `${key} must be YYYY-MM-DD.`);
  }
  return value;
};

const parseCreatePeriodLockInput = (body: unknown): CreatePeriodLockInput => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const input = body as Record<string, unknown>;
  return {
    lockedThrough: readDate(input, "lockedThrough"),
    note: readString(input, "note", 500),
  };
};

export const clearPeriodLocks = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<void> => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!adminRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "Only owners and admins can clear accounting period locks.");
  }

  const locks = snapshot.ledger.periodLocks || [];
  if (locks.length === 0) {
    return;
  }

  const latestLock = locks
    .map((lock) => lock.lockedThrough)
    .sort((a, b) => b.localeCompare(a))[0];

  const { error } = await supabase.rpc("clear_period_locks_with_audit", {
    target_business_id: businessId,
    actor_user_id: userId,
    previous_latest_lock: latestLock,
    cleared_count: locks.length,
  });
  if (error) {
    throw new ApiError(500, "period_lock_clear_failed", error.message);
  }
};

export const createPeriodLock = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<PeriodLock> => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!adminRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "Only owners and admins can lock accounting periods.");
  }

  const input = parseCreatePeriodLockInput(body);
  const latestLockedThrough = snapshot.ledger.periodLocks
    .map((lock) => lock.lockedThrough)
    .sort((a, b) => b.localeCompare(a))[0];

  if (latestLockedThrough && input.lockedThrough <= latestLockedThrough) {
    throw new ApiError(
      400,
      "invalid_period_lock",
      `lockedThrough must be later than the current lock ${latestLockedThrough}.`,
    );
  }

  const { data, error } = await supabase
    .from("period_locks")
    .insert({
      business_id: businessId,
      locked_through: input.lockedThrough,
      note: input.note,
      created_by: userId,
    })
    .select("id,locked_through,note,created_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "period_lock_create_failed", error?.message ?? "No period lock returned.");
  }

  const row = data as unknown as {
    id: string;
    locked_through: string;
    note: string | null;
    created_at: string;
  };

  const lock: PeriodLock = {
    id: row.id,
    lockedThrough: row.locked_through,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "lock",
    entityType: "period",
    entityId: lock.id,
    detail: `Locked accounting period through ${lock.lockedThrough}${lock.note ? `: ${lock.note}` : ""}`,
    metadata: {
      lockedThrough: lock.lockedThrough,
      note: lock.note,
    },
  });

  return lock;
};
