import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import { exportLedgerBackup, importLedgerData, resetLedgerData, restoreLedgerBackup } from "./service.js";

const withAuthenticatedUser = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
) => {
  const user = await getCurrentUser(request, context);
  if (!user) {
    sendJson(response, 401, { error: "unauthorized" });
    return null;
  }
  return user;
};

const handleApiError = (response: ServerResponse, error: unknown): boolean => {
  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
    });
    return true;
  }
  return false;
};

export const exportBusinessLedgerBackup = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await withAuthenticatedUser(request, response, context);
  if (!user) return;

  try {
    const backup = await exportLedgerBackup(context.supabase, user.id, params.businessId ?? "");
    sendJson(response, 200, backup);
  } catch (error) {
    if (!handleApiError(response, error)) throw error;
  }
};

export const restoreBusinessLedgerBackup = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await withAuthenticatedUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const ledger = await restoreLedgerBackup(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (!handleApiError(response, error)) throw error;
  }
};

export const importBusinessLedgerData = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await withAuthenticatedUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const ledger = await importLedgerData(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (!handleApiError(response, error)) throw error;
  }
};

export const resetBusinessLedgerData = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await withAuthenticatedUser(request, response, context);
  if (!user) return;

  try {
    const ledger = await resetLedgerData(context.supabase, user.id, params.businessId ?? "");
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (!handleApiError(response, error)) throw error;
  }
};
