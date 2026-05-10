import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LedgerData } from "@auctus/shared-types";
import { createContext, createSupabaseMock, invokeApi, ledgerData, testUser } from "./setup.js";
import { getLedgerSnapshot } from "../ledger/service.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);

// Chart accounts that include an AR clearing account for invoice transactions
const chartOfAccounts = [
  { id: "ca_bank", code: "1000", name: "Bank", class: "asset" as const, group: "Current Assets", normalBalance: "debit" as const },
  { id: "ca_sales", code: "4000", name: "Sales", class: "revenue" as const, group: "Income", normalBalance: "credit" as const },
  { id: "ca_ar", code: "1100", name: "Accounts Receivable", class: "asset" as const, group: "Current Assets", normalBalance: "debit" as const },
];

const invoiceLedger = (): LedgerData =>
  ledgerData({
    chartOfAccounts,
    transactions: [
      {
        id: "tx_invoice",
        type: "income",
        amount: 100,
        accountId: "bank_1",
        categoryId: "cat_sales",
        chartAccountId: "ca_sales",
        clearingChartAccountId: "ca_ar",
        date: "2026-02-01",
        gstMode: "inc",
        entryMode: "invoice",
        invoiceNo: "INV-001",
        payments: [],
      },
    ],
  });

const paidLedger = (): LedgerData =>
  ledgerData({
    chartOfAccounts,
    transactions: [
      {
        id: "tx_paid",
        type: "income",
        amount: 100,
        accountId: "bank_1",
        categoryId: "cat_sales",
        chartAccountId: "ca_sales",
        clearingChartAccountId: "ca_ar",
        date: "2026-02-01",
        gstMode: "inc",
        entryMode: "invoice",
        invoiceNo: "INV-002",
        payments: [{ id: "pay_existing", amount: 100, date: "2026-02-05", accountId: "bank_1" }],
      },
    ],
  });

describe("transaction payment API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when a viewer tries to record a standalone payment", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: invoiceLedger(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/transactions/tx_invoice/payments",
      { amount: 100, date: "2026-02-10", accountId: "bank_1" },
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a viewer tries to update a transaction with inline payments", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: invoiceLedger(),
    });

    const result = await invokeApi(
      "PATCH",
      "/v1/businesses/biz_1/transactions/tx_invoice",
      { amount: 100, newPayments: [{ amount: 50, date: "2026-02-10", accountId: "bank_1" }] },
    );

    expect(result.statusCode).toBe(403);
  });

  it("returns 400 when voiding a transaction that has active payments", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: paidLedger(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/transactions/tx_paid/void",
      {},
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "transaction_has_payments" });
  });

  it("returns 400 when voiding a payment whose date is in a locked period", async () => {
    const lockedLedger = ledgerData({
      chartOfAccounts,
      periodLocks: [{ id: "lock_1", lockedThrough: "2026-01-31", createdAt: "2026-02-01T00:00:00.000Z" }],
      transactions: [
        {
          id: "tx_inv",
          type: "income",
          amount: 100,
          accountId: "bank_1",
          categoryId: "cat_sales",
          chartAccountId: "ca_sales",
          clearingChartAccountId: "ca_ar",
          date: "2026-01-10",
          gstMode: "inc",
          entryMode: "invoice",
          payments: [{ id: "pay_locked", amount: 100, date: "2026-01-15", accountId: "bank_1" }],
        },
      ],
    });

    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: lockedLedger,
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/payments/pay_locked/void",
      {},
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "locked_period" });
  });

  it("returns 400 when inline newPayments would over-pay the invoice", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: invoiceLedger(),
    });

    const result = await invokeApi(
      "PATCH",
      "/v1/businesses/biz_1/transactions/tx_invoice",
      {
        amount: 100,
        newPayments: [{ amount: 200, date: "2026-02-10", accountId: "bank_1" }],
      },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "invalid_payment" });
  });

  it("records a standalone payment and returns 201", async () => {
    const supabase = createSupabaseMock({
      users: { token: testUser },
      rpcHandlers: {
        allocate_document_number: () => "RCT-001",
      },
    });

    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: invoiceLedger(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/transactions/tx_invoice/payments",
      { amount: 100, date: "2026-02-10", accountId: "bank_1" },
      createContext(supabase),
    );

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      payment: {
        id: "pay_1",
        amount: 100,
        accountId: "bank_1",
      },
    });
  });

  it("updates a transaction with inline payments and returns 200", async () => {
    const supabase = createSupabaseMock({
      users: { token: testUser },
      rpcHandlers: {
        update_transaction_with_payments: () => ({
          transaction: {
            id: "tx_invoice",
            type: "income",
            amount: 100,
            payment_account_id: "bank_1",
            payment_account_to_id: null,
            category_id: "cat_sales",
            chart_account_id: "ca_sales",
            clearing_chart_account_id: "ca_ar",
            date: "2026-02-01",
            note: null,
            gst_mode: "inc",
            entry_mode: "invoice",
            contact_id: null,
            party: null,
            invoice_no: "INV-001",
            credit_note_no: null,
            payment_terms: null,
            due_date: null,
            doc_status: null,
            voided_at: null,
            recurring_template_id: null,
          },
          payments: [
            {
              id: "pay_new",
              amount: 50,
              date: "2026-02-10",
              payment_account_id: "bank_1",
              receipt_no: "RCT-001",
              receipt_created_at: "2026-02-10T00:00:00.000Z",
              voided_at: null,
            },
          ],
        }),
      },
    });

    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: invoiceLedger(),
    });

    const result = await invokeApi(
      "PATCH",
      "/v1/businesses/biz_1/transactions/tx_invoice",
      {
        amount: 100,
        newPayments: [{ amount: 50, date: "2026-02-10", accountId: "bank_1" }],
      },
      createContext(supabase),
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      transaction: {
        id: "tx_invoice",
        amount: 100,
        payments: expect.arrayContaining([
          expect.objectContaining({ id: "pay_new", amount: 50 }),
        ]),
      },
    });
  });

  it("voids a cash transaction and returns 200", async () => {
    const cashLedger = ledgerData({
      transactions: [
        {
          id: "tx_cash",
          type: "income",
          amount: 50,
          accountId: "bank_1",
          categoryId: "cat_sales",
          chartAccountId: "ca_sales",
          date: "2026-02-01",
          gstMode: "inc",
          entryMode: "cash",
        },
      ],
    });

    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: cashLedger,
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/transactions/tx_cash/void",
      { reason: "Entered in error" },
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      transaction: {
        id: "tx_cash",
        voidedAt: expect.any(String),
      },
    });
  });
});
