import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import {
  archiveEmployee,
  createEmployee,
  createPayRun,
  createRemittance,
  createSTPSubmission,
  finalisePayRun,
  updateEmployee,
} from "./service.js";

const handlePayrollError = (response: ServerResponse, error: unknown): boolean => {
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

export const createBusinessEmployee = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await createEmployee(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { ledger });
  } catch (error) {
    if (handlePayrollError(response, error)) return;
    throw error;
  }
};

export const updateBusinessEmployee = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await updateEmployee(context.supabase, user.id, params.businessId ?? "", params.employeeId ?? "", body);
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handlePayrollError(response, error)) return;
    throw error;
  }
};

export const archiveBusinessEmployee = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const ledger = await archiveEmployee(context.supabase, user.id, params.businessId ?? "", params.employeeId ?? "");
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handlePayrollError(response, error)) return;
    throw error;
  }
};

export const createBusinessPayRun = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await createPayRun(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { ledger });
  } catch (error) {
    if (handlePayrollError(response, error)) return;
    throw error;
  }
};

export const finaliseBusinessPayRun = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const ledger = await finalisePayRun(context.supabase, user.id, params.businessId ?? "", params.payRunId ?? "");
    sendJson(response, 200, { ledger });
  } catch (error) {
    if (handlePayrollError(response, error)) return;
    throw error;
  }
};

export const createBusinessRemittance = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await createRemittance(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { ledger });
  } catch (error) {
    if (handlePayrollError(response, error)) return;
    throw error;
  }
};

export const createBusinessSTPSubmission = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
): Promise<void> => {
  const user = await requireUser(request, response, context);
  if (!user) return;
  try {
    const body = await readJsonBody(request);
    const ledger = await createSTPSubmission(context.supabase, user.id, params.businessId ?? "", body);
    sendJson(response, 201, { ledger });
  } catch (error) {
    if (handlePayrollError(response, error)) return;
    throw error;
  }
};
