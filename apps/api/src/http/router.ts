import type { IncomingMessage, ServerResponse } from "node:http";

import {
  archiveBusinessCategory,
  archiveBusinessPaymentAccount,
  createBusinessCategory,
  createBusinessPaymentAccount,
  updateBusinessCategory,
  updateBusinessPaymentAccount,
} from "../accounts/routes.js";
import {
  finalizeBusinessBankReconciliation,
  ignoreBusinessBankFeedItem,
  importBusinessBankFeedItems,
  matchBusinessBankFeedItem,
  unignoreBusinessBankFeedItem,
  voidBusinessBankReconciliation,
} from "../bankReconciliation/routes.js";
import { createBusiness, listBusinesses, patchBusinessProfile, patchBusinessSettings } from "../businesses/routes.js";
import { archiveBusinessContact, createBusinessContact, updateBusinessContact } from "../contacts/routes.js";
import {
  exportBusinessLedgerBackup,
  importBusinessLedgerData,
  resetBusinessLedgerData,
  restoreBusinessLedgerBackup,
} from "../ledgerBackup/routes.js";
import { getBusinessLedger } from "../ledger/routes.js";
import {
  createBusinessManualJournal,
  reverseBusinessManualJournal,
  updateBusinessManualJournal,
  voidBusinessManualJournal,
} from "../manualJournals/routes.js";
import { clearBusinessPeriodLocks, createBusinessPeriodLock } from "../periodLocks/routes.js";
import {
  createBusinessCreditAllocation,
  createBusinessTransaction,
  createTransactionPayment,
  voidBusinessCreditAllocation,
  voidBusinessPayment,
  voidBusinessTransaction,
} from "../transactions/routes.js";
import type { ApiContext } from "../types.js";
import { sendEmpty, sendJson } from "./response.js";

type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  params: Record<string, string>,
) => void | Promise<void>;

type Route = {
  method: string;
  path: string;
  handler: Handler;
};

const routes: Route[] = [
  {
    method: "GET",
    path: "/health",
    handler: (_request, response) => {
      sendJson(response, 200, {
        ok: true,
        service: "auctus-api",
      });
    },
  },
  {
    method: "GET",
    path: "/v1/businesses",
    handler: listBusinesses,
  },
  {
    method: "POST",
    path: "/v1/businesses",
    handler: createBusiness,
  },
  {
    method: "GET",
    path: "/v1/businesses/:businessId/ledger",
    handler: getBusinessLedger,
  },
  {
    method: "GET",
    path: "/v1/businesses/:businessId/backup",
    handler: exportBusinessLedgerBackup,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/restore",
    handler: restoreBusinessLedgerBackup,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/import",
    handler: importBusinessLedgerData,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/reset",
    handler: resetBusinessLedgerData,
  },
  {
    method: "PATCH",
    path: "/v1/businesses/:businessId/profile",
    handler: patchBusinessProfile,
  },
  {
    method: "PATCH",
    path: "/v1/businesses/:businessId/settings",
    handler: patchBusinessSettings,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/period-locks/clear",
    handler: clearBusinessPeriodLocks,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/period-locks",
    handler: createBusinessPeriodLock,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/payment-accounts",
    handler: createBusinessPaymentAccount,
  },
  {
    method: "PATCH",
    path: "/v1/businesses/:businessId/payment-accounts/:accountId",
    handler: updateBusinessPaymentAccount,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/payment-accounts/:accountId/archive",
    handler: archiveBusinessPaymentAccount,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/categories",
    handler: createBusinessCategory,
  },
  {
    method: "PATCH",
    path: "/v1/businesses/:businessId/categories/:categoryId",
    handler: updateBusinessCategory,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/categories/:categoryId/archive",
    handler: archiveBusinessCategory,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/bank-feed-items/import",
    handler: importBusinessBankFeedItems,
  },
  {
    method: "PATCH",
    path: "/v1/businesses/:businessId/bank-feed-items/:itemId/match",
    handler: matchBusinessBankFeedItem,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/bank-feed-items/:itemId/ignore",
    handler: ignoreBusinessBankFeedItem,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/bank-feed-items/:itemId/unignore",
    handler: unignoreBusinessBankFeedItem,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/bank-reconciliations",
    handler: finalizeBusinessBankReconciliation,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/bank-reconciliations/:reconciliationId/void",
    handler: voidBusinessBankReconciliation,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/manual-journals",
    handler: createBusinessManualJournal,
  },
  {
    method: "PATCH",
    path: "/v1/businesses/:businessId/manual-journals/:journalId",
    handler: updateBusinessManualJournal,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/manual-journals/:journalId/void",
    handler: voidBusinessManualJournal,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/manual-journals/:journalId/reverse",
    handler: reverseBusinessManualJournal,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/contacts",
    handler: createBusinessContact,
  },
  {
    method: "PATCH",
    path: "/v1/businesses/:businessId/contacts/:contactId",
    handler: updateBusinessContact,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/contacts/:contactId/archive",
    handler: archiveBusinessContact,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/transactions",
    handler: createBusinessTransaction,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/transactions/:transactionId/payments",
    handler: createTransactionPayment,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/transactions/:transactionId/void",
    handler: voidBusinessTransaction,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/payments/:paymentId/void",
    handler: voidBusinessPayment,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/credit-allocations",
    handler: createBusinessCreditAllocation,
  },
  {
    method: "POST",
    path: "/v1/businesses/:businessId/credit-allocations/:allocationId/void",
    handler: voidBusinessCreditAllocation,
  },
];

const matchPath = (routePath: string, requestPath: string): Record<string, string> | null => {
  const routeParts = routePath.split("/").filter(Boolean);
  const requestParts = requestPath.split("/").filter(Boolean);

  if (routeParts.length !== requestParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < routeParts.length; index += 1) {
    const routePart = routeParts[index];
    const requestPart = requestParts[index];

    if (routePart?.startsWith(":")) {
      params[routePart.slice(1)] = decodeURIComponent(requestPart ?? "");
      continue;
    }

    if (routePart !== requestPart) {
      return null;
    }
  }

  return params;
};

const applyCors = (request: IncomingMessage, response: ServerResponse, context: ApiContext): void => {
  response.setHeader("access-control-allow-origin", context.env.corsOrigin);
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization,content-type");
  response.setHeader("vary", "origin");

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
  }
};

export const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
): Promise<void> => {
  applyCors(request, response, context);
  if (response.writableEnded) {
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const match = routes.reduce<{ route: Route; params: Record<string, string> } | null>((matched, candidate) => {
    if (matched || candidate.method !== request.method) {
      return matched;
    }

    const params = matchPath(candidate.path, url.pathname);
    return params ? { route: candidate, params } : null;
  }, null);

  if (!match) {
    sendJson(response, 404, {
      error: "not_found",
    });
    return;
  }

  try {
    await match.route.handler(request, response, context, match.params);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: "internal_server_error",
    });
  }
};
