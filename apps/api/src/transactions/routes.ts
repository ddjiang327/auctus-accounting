import type { IncomingMessage, ServerResponse } from "node:http";

import { getCurrentUser } from "../auth/currentUser.js";
import { ApiError } from "../businesses/service.js";
import { readJsonBody } from "../http/request.js";
import { sendJson } from "../http/response.js";
import type { ApiContext } from "../types.js";
import {
  createCreditAllocation,
  createTransaction,
  recordTransactionPayment,
  voidCreditAllocation,
  voidPayment,
  voidTransaction,
} from "./service.js";

export const createBusinessTransaction = async (
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
    const transaction = await createTransaction(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      transaction,
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

export const createTransactionPayment = async (
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
    const payment = await recordTransactionPayment(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.transactionId ?? "",
      body,
    );

    sendJson(response, 201, {
      payment,
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

export const createBusinessCreditAllocation = async (
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
    const allocation = await createCreditAllocation(context.supabase, user.id, params.businessId ?? "", body);

    sendJson(response, 201, {
      allocation,
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

export const voidBusinessTransaction = async (
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
    const transaction = await voidTransaction(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.transactionId ?? "",
      body,
    );

    sendJson(response, 200, {
      transaction,
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

export const voidBusinessPayment = async (
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
    const payment = await voidPayment(context.supabase, user.id, params.businessId ?? "", params.paymentId ?? "", body);

    sendJson(response, 200, {
      payment,
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

export const voidBusinessCreditAllocation = async (
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
    const allocation = await voidCreditAllocation(
      context.supabase,
      user.id,
      params.businessId ?? "",
      params.allocationId ?? "",
      body,
    );

    sendJson(response, 200, {
      allocation,
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
