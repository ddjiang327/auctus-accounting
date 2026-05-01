import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import { archiveContact, createContact, updateContact } from "./service.js";

const handleContactError = (response: ServerResponse, error: unknown): boolean => {
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

export const createBusinessContact = async (
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
    const contact = await createContact(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      contact,
    });
  } catch (error) {
    if (handleContactError(response, error)) return;
    throw error;
  }
};

export const updateBusinessContact = async (
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
    const contact = await updateContact(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.contactId ?? "",
      body,
    );

    sendJson(response, 200, {
      contact,
    });
  } catch (error) {
    if (handleContactError(response, error)) return;
    throw error;
  }
};

export const archiveBusinessContact = async (
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
    const contact = await archiveContact(context.supabase, user.id, params.businessId ?? "", params.contactId ?? "");

    sendJson(response, 200, {
      contact,
    });
  } catch (error) {
    if (handleContactError(response, error)) return;
    throw error;
  }
};
