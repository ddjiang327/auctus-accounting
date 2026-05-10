import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { LedgerData } from "@auctus/shared-types";
import type { ApiContext } from "../types.js";

type UserMap = Record<string, { id: string; email: string }>;

type SupabaseMockOptions = {
  users?: UserMap;
  membershipRole?: "owner" | "admin" | "bookkeeper" | "viewer" | null;
  rpcHandlers?: Record<string, (args: unknown) => unknown>;
};

type MockResponse = ServerResponse & {
  statusCode: number;
  body: string;
  headers: Record<string, string | number | string[]>;
  writableEnded: boolean;
};

class QueryBuilder {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private payload: unknown;

  constructor(
    private readonly table: string,
    private readonly options: SupabaseMockOptions,
  ) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  is() {
    return this;
  }

  order() {
    return this;
  }

  in() {
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  async maybeSingle() {
    if (this.table === "business_members") {
      return {
        data: this.options.membershipRole ? { role: this.options.membershipRole } : null,
        error: null,
      };
    }

    return { data: null, error: null };
  }

  async single() {
    if (this.table === "business_settings" && this.operation === "update") {
      return {
        data: {
          gst_enabled: Boolean((this.payload as Record<string, unknown>).gst_enabled ?? true),
          gst_rate: Number((this.payload as Record<string, unknown>).gst_rate ?? 0.1),
          bas_basis: ((this.payload as Record<string, unknown>).bas_basis as string | undefined) ?? "cash",
          invoice_prefix: "INV",
          bill_prefix: "BILL",
          credit_note_prefix: "CN",
          supplier_credit_prefix: "SCN",
          receipt_prefix: "RCT",
          next_invoice_number: 1,
          next_bill_number: 1,
          next_credit_note_number: 1,
          next_supplier_credit_number: 1,
          next_receipt_number: 1,
        },
        error: null,
      };
    }

    if (this.table === "period_locks" && this.operation === "insert") {
      const input = this.payload as Record<string, unknown>;
      return {
        data: {
          id: "lock_1",
          locked_through: String(input.locked_through),
          note: input.note ? String(input.note) : null,
          created_at: "2026-02-01T00:00:00.000Z",
        },
        error: null,
      };
    }

    if (this.table === "transactions" && this.operation === "insert") {
      const input = this.payload as Record<string, unknown>;
      return {
        data: {
          id: "tx_1",
          type: input.type,
          amount: input.amount,
          payment_account_id: input.payment_account_id ?? null,
          payment_account_to_id: input.payment_account_to_id ?? null,
          category_id: input.category_id ?? null,
          chart_account_id: input.chart_account_id ?? null,
          clearing_chart_account_id: input.clearing_chart_account_id ?? null,
          date: input.date,
          note: input.note ?? null,
          gst_mode: input.gst_mode ?? null,
          entry_mode: input.entry_mode ?? null,
          contact_id: input.contact_id ?? null,
          party: input.party ?? null,
          invoice_no: input.invoice_no ?? null,
          credit_note_no: input.credit_note_no ?? null,
          payment_terms: input.payment_terms ?? null,
          due_date: input.due_date ?? null,
          doc_status: input.doc_status ?? null,
          voided_at: null,
          recurring_template_id: input.recurring_template_id ?? null,
        },
        error: null,
      };
    }

    if (this.table === "invoice_payments" && this.operation === "insert") {
      const input = this.payload as Record<string, unknown>;
      return {
        data: {
          id: "pay_1",
          amount: Number(input.amount ?? 0),
          date: String(input.date ?? "2026-02-01"),
          payment_account_id: String(input.payment_account_id ?? "bank_1"),
          receipt_no: (input.receipt_no as string | null) ?? null,
          receipt_created_at: (input.receipt_created_at as string | null) ?? null,
          voided_at: null,
        },
        error: null,
      };
    }

    if (this.table === "transactions" && this.operation === "update") {
      return {
        data: { id: "tx_1", voided_at: new Date().toISOString() },
        error: null,
      };
    }

    if (this.table === "bank_reconciliations" && this.operation === "update") {
      return {
        data: {
          id: "recon_1",
          payment_account_id: "bank_1",
          statement_date: "2026-01-31",
          statement_balance: 1000,
          book_balance: 1000,
          difference: 0,
          cleared_source_ids: [],
          created_at: new Date().toISOString(),
          finalized_at: new Date().toISOString(),
          voided_at: new Date().toISOString(),
        },
        error: null,
      };
    }

    if (this.table === "invoice_payments" && this.operation === "update") {
      return {
        data: { id: "pay_1", voided_at: new Date().toISOString() },
        error: null,
      };
    }

    return { data: null, error: null };
  }
}

export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const users = options.users ?? {};

  return {
    auth: {
      async getUser(token: string) {
        const user = users[token];
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "Invalid token" } };
      },
    },
    from(table: string) {
      return new QueryBuilder(table, options);
    },
    async rpc(fnName: string, args?: unknown) {
      if (options.rpcHandlers?.[fnName]) {
        return { data: options.rpcHandlers[fnName](args), error: null };
      }
      return { data: null, error: null };
    },
  };
}

export const testUser = {
  id: "user_1",
  email: "owner@example.com",
};

export function createContext(supabase = createSupabaseMock({ users: { token: testUser } })): ApiContext {
  return {
    env: {
      port: 4010,
      host: "127.0.0.1",
      corsOrigin: "http://localhost:5173",
      supabaseUrl: "http://127.0.0.1",
      supabaseAnonKey: "anon",
      supabaseServiceRoleKey: "service",
    },
    supabase: supabase as ApiContext["supabase"],
  };
}

export function createRequest(method: string, url: string, body?: unknown, token = "token"): IncomingMessage {
  const request = new PassThrough() as IncomingMessage & PassThrough;
  request.method = method;
  request.url = url;
  request.headers = {
    host: "127.0.0.1:4010",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" }),
  };
  request.end(body === undefined ? undefined : JSON.stringify(body));
  return request;
}

export function createResponse(): MockResponse {
  const response = {
    statusCode: 200,
    body: "",
    headers: {},
    writableEnded: false,
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    writeHead(statusCode: number, headers?: Record<string, string | number | string[]>) {
      this.statusCode = statusCode;
      if (headers) {
        for (const [key, value] of Object.entries(headers)) this.headers[key.toLowerCase()] = value;
      }
      return this;
    },
    end(chunk?: unknown) {
      this.body += chunk ? String(chunk) : "";
      this.writableEnded = true;
      return this;
    },
  };

  return response as MockResponse;
}

export async function invokeApi(
  method: string,
  url: string,
  body?: unknown,
  context = createContext(),
  token = "token",
) {
  const response = createResponse();
  const { handleRequest } = await import("../http/router.js");
  await handleRequest(createRequest(method, url, body, token), response, context);
  return {
    statusCode: response.statusCode,
    body: response.body ? (JSON.parse(response.body) as unknown) : null,
    rawBody: response.body,
  };
}

export function ledgerData(overrides: Partial<LedgerData> = {}): LedgerData {
  return {
    meta: { version: 2, currency: "AUD", locale: "en-AU", createdAt: "2026-01-01T00:00:00.000Z" },
    settings: {
      gstEnabled: true,
      gstRate: 0.1,
      basBasis: "cash",
      nextInvoiceNumber: 1,
      nextBillNumber: 1,
      nextCreditNoteNumber: 1,
      nextSupplierCreditNumber: 1,
      nextReceiptNumber: 1,
      invoicePrefix: "INV",
      billPrefix: "BILL",
      creditNotePrefix: "CN",
      supplierCreditPrefix: "SCN",
      receiptPrefix: "RCT",
      businessProfile: { name: "Test Business" },
    },
    accounts: [{ id: "bank_1", name: "Bank", type: "bank", initBalance: 0, icon: "bank", color: "#2563eb", chartAccountId: "ca_bank" }],
    chartOfAccounts: [
      { id: "ca_bank", code: "1000", name: "Bank", class: "asset", group: "Current Assets", normalBalance: "debit" },
      { id: "ca_sales", code: "4000", name: "Sales", class: "revenue", group: "Income", normalBalance: "credit" },
    ],
    categories: {
      income: [{ id: "cat_sales", name: "Sales", icon: "receipt", color: "#0f766e", chartAccountId: "ca_sales" }],
      expense: [],
    },
    transactions: [],
    budgets: [],
    contacts: [],
    manualJournals: [],
    creditAllocations: [],
    periodLocks: [],
    bankReconciliations: [],
    bankFeedItems: [],
    recurringTemplates: [],
    auditLog: [],
    ...overrides,
  };
}
