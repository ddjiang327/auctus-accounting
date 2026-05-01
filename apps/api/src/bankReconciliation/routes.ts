import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import {
  finalizeBankReconciliation,
  ignoreBankFeedItem,
  importBankFeedItems,
  matchBankFeedItem,
  unignoreBankFeedItem,
  voidBankReconciliation,
} from "./service.js";

const handleBankError = (response: ServerResponse, error: unknown): boolean => {
  if (error instanceof SyntaxError) {
    sendJson(response, 400, {
      error: "invalid_json",
    });
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
  if (!user) {
    sendJson(response, 401, {
      error: "unauthorized",
    });
  }
  return user;
};

export const importBusinessBankFeedItems = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const items = await importBankFeedItems(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      items,
    });
  } catch (error) {
    if (handleBankError(response, error)) return;
    throw error;
  }
};

export const matchBusinessBankFeedItem = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const item = await matchBankFeedItem(context.supabase, user.id, params.businessId ?? "", params.itemId ?? "", body);

    sendJson(response, 200, {
      item,
    });
  } catch (error) {
    if (handleBankError(response, error)) return;
    throw error;
  }
};

export const ignoreBusinessBankFeedItem = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const item = await ignoreBankFeedItem(context.supabase, user.id, params.businessId ?? "", params.itemId ?? "");

    sendJson(response, 200, {
      item,
    });
  } catch (error) {
    if (handleBankError(response, error)) return;
    throw error;
  }
};

export const unignoreBusinessBankFeedItem = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const item = await unignoreBankFeedItem(context.supabase, user.id, params.businessId ?? "", params.itemId ?? "");

    sendJson(response, 200, {
      item,
    });
  } catch (error) {
    if (handleBankError(response, error)) return;
    throw error;
  }
};

export const finalizeBusinessBankReconciliation = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const reconciliation = await finalizeBankReconciliation(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      reconciliation,
    });
  } catch (error) {
    if (handleBankError(response, error)) return;
    throw error;
  }
};

export const voidBusinessBankReconciliation = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const reconciliation = await voidBankReconciliation(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.reconciliationId ?? "",
    );

    sendJson(response, 200, {
      reconciliation,
    });
  } catch (error) {
    if (handleBankError(response, error)) return;
    throw error;
  }
};
