import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import {
  archiveCategory,
  archivePaymentAccount,
  createCategory,
  createPaymentAccount,
  updateCategory,
  updatePaymentAccount,
} from "./service.js";

const handleAccountingItemError = (response: ServerResponse, error: unknown): boolean => {
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

export const createBusinessPaymentAccount = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const account = await createPaymentAccount(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      account,
    });
  } catch (error) {
    if (handleAccountingItemError(response, error)) return;
    throw error;
  }
};

export const updateBusinessPaymentAccount = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const account = await updatePaymentAccount(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.accountId ?? "",
      body,
    );

    sendJson(response, 200, {
      account,
    });
  } catch (error) {
    if (handleAccountingItemError(response, error)) return;
    throw error;
  }
};

export const archiveBusinessPaymentAccount = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const account = await archivePaymentAccount(context.supabase, user.id, params.businessId ?? "", params.accountId ?? "");

    sendJson(response, 200, {
      account,
    });
  } catch (error) {
    if (handleAccountingItemError(response, error)) return;
    throw error;
  }
};

export const createBusinessCategory = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const category = await createCategory(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      category,
    });
  } catch (error) {
    if (handleAccountingItemError(response, error)) return;
    throw error;
  }
};

export const updateBusinessCategory = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const body = await readJsonBody(request);
    const category = await updateCategory(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.categoryId ?? "",
      body,
    );

    sendJson(response, 200, {
      category,
    });
  } catch (error) {
    if (handleAccountingItemError(response, error)) return;
    throw error;
  }
};

export const archiveBusinessCategory = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;

  try {
    const category = await archiveCategory(context.supabase, user.id, params.businessId ?? "", params.categoryId ?? "");

    sendJson(response, 200, {
      category,
    });
  } catch (error) {
    if (handleAccountingItemError(response, error)) return;
    throw error;
  }
};
