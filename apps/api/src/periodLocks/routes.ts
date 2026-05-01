import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendEmpty, sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import { clearPeriodLocks, createPeriodLock } from "./service.js";

export const clearBusinessPeriodLocks = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await getCurrentUser(request, context);
  if (!user) {
    sendJson(response, 401, {
      error: "unauthorized",
    });
    return;
  }

  try {
    await clearPeriodLocks(context.supabase, user.id, params.businessId ?? "");
    sendEmpty(response, 204);
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    throw error;
  }
};

export const createBusinessPeriodLock = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await getCurrentUser(request, context);
  if (!user) {
    sendJson(response, 401, {
      error: "unauthorized",
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const periodLock = await createPeriodLock(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      periodLock,
    });
  } catch (error) {
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
  }
};
