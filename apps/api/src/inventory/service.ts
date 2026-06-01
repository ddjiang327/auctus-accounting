import { validateInventoryMovementInput, validatePurchaseOrderInput, validatePurchaseOrderReceiptInput } from "@auctus/accounting-core";
import type { InventoryMovement, LedgerData, POLine, Product, PurchaseOrder } from "@auctus/shared-types";

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

const readString = (body: Record<string, unknown>, key: string, options: { required?: boolean; max?: number } = {}): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new ApiError(400, "invalid_inventory_item", `${key} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new ApiError(400, "invalid_inventory_item", `${key} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed && options.required) throw new ApiError(400, "invalid_inventory_item", `${key} is required.`);
  if (options.max && trimmed.length > options.max) throw new ApiError(400, "invalid_inventory_item", `${key} is too long.`);
  return trimmed || undefined;
};

const readNumber = (body: Record<string, unknown>, key: string, options: { required?: boolean; min?: number } = {}): number | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new ApiError(400, "invalid_inventory_item", `${key} is required.`);
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new ApiError(400, "invalid_inventory_item", `${key} must be a number.`);
  if (options.min !== undefined && numeric < options.min) throw new ApiError(400, "invalid_inventory_item", `${key} must be at least ${options.min}.`);
  return numeric;
};

const readArray = (body: Record<string, unknown>, key: string): unknown[] => {
  const value = body[key];
  if (!Array.isArray(value)) throw new ApiError(400, "invalid_inventory_item", `${key} must be an array.`);
  return value;
};

const getWriteContext = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<LedgerSnapshot> => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to update inventory.");
  }
  return snapshot;
};

const touchInventoryState = async (supabase: SupabaseServiceClient, businessId: string) => {
  const { error } = await supabase.rpc("touch_inventory_state", { p_business_id: businessId });
  if (error) throw new ApiError(500, "inventory_version_update_failed", error.message);
};

const productRow = (businessId: string, product: Product) => ({
  id: product.id,
  business_id: businessId,
  name: product.name,
  sku: product.sku ?? null,
  unit_of_measure: product.unitOfMeasure ?? null,
  cost_price: product.costPrice,
  sell_price: product.sellPrice,
  reorder_point: product.reorderPoint ?? null,
  inventory_chart_account_id: product.inventoryChartAccountId ?? null,
  cogs_chart_account_id: product.cogsChartAccountId ?? null,
  revenue_chart_account_id: product.revenueChartAccountId ?? null,
  archived_at: product.archivedAt ?? null,
});

const parseProduct = (body: unknown, fallbackId?: string): Product => {
  const input = ensureObject(body);
  return {
    id: fallbackId || readString(input, "id", { required: true, max: 120 })!,
    name: readString(input, "name", { required: true, max: 180 })!,
    sku: readString(input, "sku", { max: 80 }),
    unitOfMeasure: readString(input, "unitOfMeasure", { max: 40 }) ?? "unit",
    costPrice: readNumber(input, "costPrice", { required: true, min: 0 })!,
    sellPrice: readNumber(input, "sellPrice", { required: true, min: 0 })!,
    reorderPoint: readNumber(input, "reorderPoint", { min: 0 }),
    inventoryChartAccountId: readString(input, "inventoryChartAccountId", { max: 80 }),
    cogsChartAccountId: readString(input, "cogsChartAccountId", { max: 80 }),
    revenueChartAccountId: readString(input, "revenueChartAccountId", { max: 80 }),
  };
};

const parseMovement = (body: unknown): InventoryMovement => {
  const input = ensureObject(body);
  const type = readString(input, "type", { required: true, max: 40 });
  if (type !== "purchase" && type !== "sale" && type !== "adjustment") {
    throw new ApiError(400, "invalid_inventory_movement", "type is invalid.");
  }
  return {
    id: readString(input, "id", { required: true, max: 120 })!,
    productId: readString(input, "productId", { required: true, max: 120 })!,
    date: readString(input, "date", { required: true, max: 10 })!,
    type,
    quantity: readNumber(input, "quantity", { required: true })!,
    unitCost: readNumber(input, "unitCost", { required: true, min: 0 })!,
    memo: readString(input, "memo", { max: 500 }),
    sourceId: readString(input, "sourceId", { max: 180 }),
  };
};

const movementRow = (businessId: string, movement: InventoryMovement) => ({
  id: movement.id,
  business_id: businessId,
  product_id: movement.productId,
  date: movement.date,
  type: movement.type,
  quantity: movement.quantity,
  unit_cost: movement.unitCost,
  memo: movement.memo ?? null,
  source_id: movement.sourceId ?? null,
});

const parsePOLine = (value: unknown): POLine => {
  const input = ensureObject(value);
  return {
    productId: readString(input, "productId", { required: true, max: 120 })!,
    orderedQty: readNumber(input, "orderedQty", { required: true, min: 0 })!,
    unitCost: readNumber(input, "unitCost", { required: true, min: 0 })!,
    receivedQty: readNumber(input, "receivedQty", { min: 0 }) ?? 0,
  };
};

const parsePurchaseOrder = (body: unknown): PurchaseOrder => {
  const input = ensureObject(body);
  return {
    id: readString(input, "id", { required: true, max: 120 })!,
    date: readString(input, "date", { required: true, max: 10 })!,
    expectedDate: readString(input, "expectedDate", { max: 10 }),
    supplierId: readString(input, "supplierId", { max: 80 }),
    supplierName: readString(input, "supplierName", { max: 180 }),
    status: "draft",
    memo: readString(input, "memo", { max: 500 }),
    lines: readArray(input, "lines").map(parsePOLine),
  };
};

const purchaseOrderRow = (businessId: string, po: PurchaseOrder) => ({
  id: po.id,
  business_id: businessId,
  date: po.date,
  expected_date: po.expectedDate ?? null,
  supplier_id: po.supplierId ?? null,
  supplier_name: po.supplierName ?? null,
  status: po.status,
  memo: po.memo ?? null,
  received_at: po.receivedAt ?? null,
  bill_transaction_id: po.billTransactionId ?? null,
  billed_at: po.billedAt ?? null,
});

const purchaseOrderLineRows = (businessId: string, po: PurchaseOrder) => po.lines.map((line, index) => ({
  id: `${po.id}_${index}`,
  business_id: businessId,
  purchase_order_id: po.id,
  product_id: line.productId,
  ordered_qty: line.orderedQty,
  unit_cost: line.unitCost,
  received_qty: line.receivedQty || 0,
  line_order: index,
}));

export const createProduct = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const product = parseProduct(body);
  const { error } = await supabase.from("products").insert(productRow(businessId, product));
  if (error) throw new ApiError(500, "product_create_failed", error.message);
  await touchInventoryState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "product",
    entityId: product.id,
    detail: `Created product ${product.name}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const updateProduct = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  productId: string,
  body: unknown,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const product = parseProduct(body, productId);
  const { error } = await supabase.from("products").update(productRow(businessId, product)).eq("business_id", businessId).eq("id", productId);
  if (error) throw new ApiError(500, "product_update_failed", error.message);
  await touchInventoryState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "product",
    entityId: productId,
    detail: `Updated product ${product.name}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const archiveProduct = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  productId: string,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const { error } = await supabase.from("products").update({ archived_at: new Date().toISOString() }).eq("business_id", businessId).eq("id", productId);
  if (error) throw new ApiError(500, "product_archive_failed", error.message);
  await touchInventoryState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "archive",
    entityType: "product",
    entityId: productId,
    detail: "Archived product",
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const createInventoryMovement = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const movement = parseMovement(body);
  const validation = validateInventoryMovementInput(snapshot.ledger, movement);
  if (!validation.ok) {
    throw new ApiError(400, "invalid_inventory_movement", validation.errors.join(" "));
  }
  const { error } = await supabase.from("inventory_movements").insert(movementRow(businessId, movement));
  if (error) throw new ApiError(500, "inventory_movement_create_failed", error.message);
  await touchInventoryState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "inventory_movement",
    entityId: movement.id,
    detail: `Created ${movement.type} inventory movement`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const createPurchaseOrder = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const po = parsePurchaseOrder(body);
  const validation = validatePurchaseOrderInput(snapshot.ledger, po);
  if (!validation.ok) {
    throw new ApiError(400, "invalid_purchase_order", validation.errors.join(" "));
  }

  const { error: poError } = await supabase.from("purchase_orders").insert(purchaseOrderRow(businessId, po));
  if (poError) throw new ApiError(500, "purchase_order_create_failed", poError.message);

  const lines = purchaseOrderLineRows(businessId, po);
  if (lines.length) {
    const { error: linesError } = await supabase.from("purchase_order_lines").insert(lines);
    if (linesError) throw new ApiError(500, "purchase_order_create_failed", linesError.message);
  }

  await touchInventoryState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "purchase_order",
    entityId: po.id,
    detail: `Created purchase order ${po.id}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const updatePurchaseOrderStatus = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  purchaseOrderId: string,
  status: "sent" | "cancelled",
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const po = snapshot.ledger.purchaseOrders?.find((item) => item.id === purchaseOrderId);
  if (!po) throw new ApiError(404, "purchase_order_not_found", "Purchase order not found.");
  if (status === "sent" && po.status !== "draft") {
    throw new ApiError(400, "invalid_purchase_order_status", "Only draft purchase orders can be marked sent.");
  }
  if (status === "cancelled" && po.status !== "draft" && po.status !== "sent") {
    throw new ApiError(400, "invalid_purchase_order_status", "Only draft or sent purchase orders can be cancelled.");
  }

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", purchaseOrderId);
  if (error) throw new ApiError(500, "purchase_order_update_failed", error.message);

  await touchInventoryState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "purchase_order",
    entityId: purchaseOrderId,
    detail: status === "sent" ? "Marked purchase order sent" : "Cancelled purchase order",
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const receivePurchaseOrder = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  purchaseOrderId: string,
  body: unknown,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const input = ensureObject(body);
  const rawQtys = input.receiptQtys;
  if (!rawQtys || typeof rawQtys !== "object" || Array.isArray(rawQtys)) {
    throw new ApiError(400, "invalid_purchase_order_receipt", "receiptQtys must be an object.");
  }
  const receiptQtys = Object.fromEntries(Object.entries(rawQtys as Record<string, unknown>).map(([key, value]) => [Number(key), Number(value) || 0]));
  const po = snapshot.ledger.purchaseOrders?.find((item) => item.id === purchaseOrderId);
  if (!po) throw new ApiError(404, "purchase_order_not_found", "Purchase order not found.");

  const validation = validatePurchaseOrderReceiptInput(snapshot.ledger, po, receiptQtys);
  if (!validation.ok) {
    throw new ApiError(400, "invalid_purchase_order_receipt", validation.errors.join(" "));
  }

  const today = readString(input, "date", { max: 10 }) ?? new Date().toISOString().slice(0, 10);
  const movements: InventoryMovement[] = [];
  const updatedLines = po.lines.map((line, index) => {
    const qty = receiptQtys[index] || 0;
    if (qty > 0) {
      movements.push({
        id: readString(input, `movementId_${index}`, { max: 120 }) ?? `${po.id}_receipt_${index}_${Date.now()}`,
        productId: line.productId,
        date: today,
        type: "purchase",
        quantity: qty,
        unitCost: line.unitCost,
        sourceId: `${po.id}:${index}:${today}`,
        memo: `PO received${po.supplierName ? ` from ${po.supplierName}` : ""}`,
      });
    }
    return { ...line, receivedQty: Math.round(((line.receivedQty || 0) + qty) * 100) / 100 };
  });
  const allReceived = updatedLines.every((line) => Number(line.receivedQty || 0) >= Number(line.orderedQty));

  const lineResults = await Promise.all(updatedLines.map((line, index) => supabase
    .from("purchase_order_lines")
    .update({ received_qty: line.receivedQty || 0 })
    .eq("business_id", businessId)
    .eq("id", `${po.id}_${index}`)));
  const lineError = lineResults.find((result) => result.error)?.error;
  if (lineError) throw new ApiError(500, "purchase_order_receive_failed", lineError.message);

  const { error: poError } = await supabase
    .from("purchase_orders")
    .update({ status: allReceived ? "received" : "sent", received_at: allReceived ? new Date().toISOString() : null })
    .eq("business_id", businessId)
    .eq("id", purchaseOrderId);
  if (poError) throw new ApiError(500, "purchase_order_receive_failed", poError.message);

  if (movements.length) {
    const { error: movementsError } = await supabase.from("inventory_movements").insert(movements.map((movement) => movementRow(businessId, movement)));
    if (movementsError) throw new ApiError(500, "purchase_order_receive_failed", movementsError.message);
  }

  await touchInventoryState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "purchase_order",
    entityId: purchaseOrderId,
    detail: "Received purchase order stock",
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const linkPurchaseOrderBill = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  purchaseOrderId: string,
  body: unknown,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const input = ensureObject(body);
  const billTransactionId = readString(input, "billTransactionId", { required: true, max: 120 })!;
  const po = snapshot.ledger.purchaseOrders?.find((item) => item.id === purchaseOrderId);
  if (!po) throw new ApiError(404, "purchase_order_not_found", "Purchase order not found.");
  if (po.status !== "received") {
    throw new ApiError(400, "invalid_purchase_order_status", "Only received purchase orders can be linked to a supplier bill.");
  }
  if (po.billTransactionId) {
    throw new ApiError(400, "purchase_order_already_billed", "Purchase order already has a supplier bill.");
  }
  const transaction = snapshot.ledger.transactions.find((item) => item.id === billTransactionId);
  if (!transaction) throw new ApiError(404, "transaction_not_found", "Supplier bill transaction not found.");

  const { error } = await supabase.rpc("link_purchase_order_bill", {
    p_business_id: businessId,
    p_purchase_order_id: purchaseOrderId,
    p_bill_transaction_id: billTransactionId,
  });
  if (error) throw new ApiError(500, "purchase_order_bill_link_failed", error.message);

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "purchase_order",
    entityId: purchaseOrderId,
    detail: `Linked supplier bill ${billTransactionId}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};
