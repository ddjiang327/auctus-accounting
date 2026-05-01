import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import {
  createManualJournal,
  reverseManualJournal,
  updateManualJournal,
  voidManualJournal,
} from "./service.js";

const handleRouteError = (response: ServerResponse, error: unknown): void => {
  if (error instanceof SyntaxError) {
    sendJson(response, 400, {
      error: "invalid_json",
    });
    return;
  }

  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
    });
    return;
  }

  throw error;
};

export const createBusinessManualJournal = async (
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
    const journal = await createManualJournal(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { journal });
  } catch (error) {
    handleRouteError(response, error);
  }
};

export const updateBusinessManualJournal = async (
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
    const journal = await updateManualJournal(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.journalId ?? "",
      body,
    );
    sendJson(response, 200, { journal });
  } catch (error) {
    handleRouteError(response, error);
  }
};

export const voidBusinessManualJournal = async (
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
    const journal = await voidManualJournal(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.journalId ?? "",
      body,
    );
    sendJson(response, 200, { journal });
  } catch (error) {
    handleRouteError(response, error);
  }
};

export const reverseBusinessManualJournal = async (
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
    const journal = await reverseManualJournal(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.journalId ?? "",
    );
    sendJson(response, 201, { journal });
  } catch (error) {
    handleRouteError(response, error);
  }
};
