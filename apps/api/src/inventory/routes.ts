import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import {
  archiveProduct,
  createInventoryMovement,
  createProduct,
  createPurchaseOrder,
  linkPurchaseOrderBill,
  receivePurchaseOrder,
  updateProduct,
  updatePurchaseOrderStatus,
} from "./service.js";

const handleInventoryError = (response: ServerResponse, error: unknown): boolean => {
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "invalid_json" });
    return true;
  }
  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
    });
    return true;
  }
  return false;
};

const requireUser = async (request: IncomingMessage, response: ServerResponse, context: ApiContext) => {
  const user = await getCurrentUser(request, context);
  if (!user) sendJson(response, 401, { error: "unauthorized" });
  return user;
};

export const createBusinessProduct = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await createProduct(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const updateBusinessProduct = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await updateProduct(context.supabase, user.id, params.businessId ?? "", params.productId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const archiveBusinessProduct = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const ledger = await archiveProduct(context.supabase, user.id, params.businessId ?? "", params.productId ?? "");
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const createBusinessInventoryMovement = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await createInventoryMovement(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const createBusinessPurchaseOrder = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await createPurchaseOrder(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const markBusinessPurchaseOrderSent = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const ledger = await updatePurchaseOrderStatus(context.supabase, user.id, params.businessId ?? "", params.purchaseOrderId ?? "", "sent");
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const cancelBusinessPurchaseOrder = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const ledger = await updatePurchaseOrderStatus(context.supabase, user.id, params.businessId ?? "", params.purchaseOrderId ?? "", "cancelled");
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const receiveBusinessPurchaseOrder = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await receivePurchaseOrder(context.supabase, user.id, params.businessId ?? "", params.purchaseOrderId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};

export const linkBusinessPurchaseOrderBill = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await linkPurchaseOrderBill(context.supabase, user.id, params.businessId ?? "", params.purchaseOrderId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleInventoryError(response, error)) return;
    throw error;
  }
};
