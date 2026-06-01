import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import { replaceInventoryModuleState, replacePayrollModuleState } from "./service.js";

const handleModuleStateError = (response: ServerResponse, error: unknown): boolean => {
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

export const replaceBusinessInventoryState = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await getCurrentUser(request, context);
  if (!user) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const ledger = await replaceInventoryModuleState(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleModuleStateError(response, error)) return;
    throw error;
  }
};

export const replaceBusinessPayrollState = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await getCurrentUser(request, context);
  if (!user) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const ledger = await replacePayrollModuleState(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handleModuleStateError(response, error)) return;
    throw error;
  }
};
