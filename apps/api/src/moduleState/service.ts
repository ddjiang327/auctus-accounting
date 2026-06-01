import type {
  Employee,
  InventoryMovement,
  LedgerData,
  PayRun,
  Product,
  PurchaseOrder,
  Remittance,
  STPSubmission,
} from "@auctus/shared-types";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot, type LedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const writableRoles = new Set(["owner", "admin", "bookkeeper"]);

const ensureObject = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
};

const readArray = <T>(body: Record<string, unknown>, key: string): T[] => {
  const value = body[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ApiError(400, "invalid_module_state", `${key} must be an array.`);
  }
  return value as T[];
};

const readExpectedVersion = (body: Record<string, unknown>, key: string): number => {
  const value = body[key];
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ApiError(400, "invalid_module_state", `${key} must be a positive integer.`);
  }
  return Number(value);
};

const getWriteContext = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<LedgerSnapshot> => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to update this module.");
  }
  return snapshot;
};

export const replaceInventoryModuleState = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const input = ensureObject(body);
  const products = readArray<Product>(input, "products");
  const inventoryMovements = readArray<InventoryMovement>(input, "inventoryMovements");
  const purchaseOrders = readArray<PurchaseOrder>(input, "purchaseOrders");
  const expectedVersion = readExpectedVersion(input, "expectedVersion");

  const { error } = await supabase.rpc("replace_inventory_module_state", {
    p_business_id: businessId,
    p_expected_version: expectedVersion,
    p_products: products,
    p_inventory_movements: inventoryMovements,
    p_purchase_orders: purchaseOrders,
  });
  if (error) {
    if (error.message.includes("module_state_conflict")) {
      throw new ApiError(409, "module_state_conflict", "Inventory changed in another session. Reload the workspace and try again.");
    }
    throw new ApiError(500, "module_state_save_failed", error.message);
  }

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "inventory",
    entityId: businessId,
    detail: "Updated inventory module state",
    metadata: {
      products: products.length,
      inventoryMovements: inventoryMovements.length,
      purchaseOrders: purchaseOrders.length,
    },
  });

  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const replacePayrollModuleState = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const input = ensureObject(body);
  const employees = readArray<Employee>(input, "employees");
  const payRuns = readArray<PayRun>(input, "payRuns");
  const remittances = readArray<Remittance>(input, "remittances");
  const stpSubmissions = readArray<STPSubmission>(input, "stpSubmissions");
  const expectedVersion = readExpectedVersion(input, "expectedVersion");

  const { error } = await supabase.rpc("replace_payroll_module_state", {
    p_business_id: businessId,
    p_expected_version: expectedVersion,
    p_employees: employees,
    p_pay_runs: payRuns,
    p_remittances: remittances,
    p_stp_submissions: stpSubmissions,
  });
  if (error) {
    if (error.message.includes("module_state_conflict")) {
      throw new ApiError(409, "module_state_conflict", "Payroll changed in another session. Reload the workspace and try again.");
    }
    throw new ApiError(500, "module_state_save_failed", error.message);
  }

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "payroll",
    entityId: businessId,
    detail: "Updated payroll module state",
    metadata: {
      employees: employees.length,
      payRuns: payRuns.length,
      remittances: remittances.length,
      stpSubmissions: stpSubmissions.length,
    },
  });

  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};
