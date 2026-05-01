import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import {
  ApiError,
  createBusinessWorkspace,
  listBusinessWorkspaces,
  parseCreateBusinessInput,
  updateBusinessProfile,
  updateBusinessSettings,
} from "./service.js";

export const listBusinesses = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
): Promise<void> => {
  const user = await getCurrentUser(request, context);
  if (!user) {
    sendJson(response, 401, {
      error: "unauthorized",
    });
    return;
  }

  try {
    const businesses = await listBusinessWorkspaces(context.supabase, user.id);

    sendJson(response, 200, {
      businesses,
    });
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

export const createBusiness = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
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
    const input = parseCreateBusinessInput(body);
    const business = await createBusinessWorkspace(context.supabase, user, input);

    sendJson(response, 201, {
      business,
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

export const patchBusinessProfile = async (
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
    const business = await updateBusinessProfile(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 200, {
      business,
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

export const patchBusinessSettings = async (
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
    const settings = await updateBusinessSettings(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 200, {
      settings,
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
