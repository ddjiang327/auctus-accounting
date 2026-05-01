import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import { getLedgerSnapshot } from "./service.js";

export const getBusinessLedger = async (
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
    const snapshot = await getLedgerSnapshot(context.supabase, user.id, params.businessId ?? "");

    sendJson(response, 200, snapshot);
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
