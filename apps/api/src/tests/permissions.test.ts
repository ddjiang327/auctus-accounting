import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContext, createSupabaseMock, invokeApi, ledgerData, testUser } from "./setup.js";
import { getLedgerSnapshot } from "../ledger/service.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);

describe("API permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without an auth token", async () => {
    const result = await invokeApi("GET", "/v1/businesses", undefined, createContext(), "");

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ error: "unauthorized" });
  });

  it("returns 403 when a viewer tries to write transactions", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/transactions",
      {
        type: "income",
        amount: 100,
        accountId: "bank_1",
        categoryId: "cat_sales",
        date: "2026-02-01",
        gstMode: "inc",
        entryMode: "cash",
      },
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a viewer tries to create a contact", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/contacts",
      {
        type: "customer",
        name: "Test Customer",
        paymentTerms: "due_on_receipt",
      },
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a viewer tries to create a payment account", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/payment-accounts",
      {
        name: "Test Account",
        type: "bank",
        initBalance: 0,
        icon: "bank",
        color: "#2563eb",
        chartAccountId: "ca_bank",
      },
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a viewer tries to create a manual journal", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/manual-journals",
      {
        date: "2026-02-01",
        memo: "Test journal",
        lines: [
          { chartAccountId: "ca_bank", debit: 100, credit: 0 },
          { chartAccountId: "ca_sales", debit: 0, credit: 100 },
        ],
      },
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a bookkeeper tries to update admin settings", async () => {
    const supabase = createSupabaseMock({
      users: { token: testUser },
      membershipRole: "bookkeeper",
    });

    const result = await invokeApi(
      "PATCH",
      "/v1/businesses/biz_1/settings",
      { basBasis: "accrual" },
      createContext(supabase),
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a bookkeeper tries to create a period lock", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/period-locks",
      { lockedThrough: "2026-01-31" },
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("allows an admin to update business settings", async () => {
    const supabase = createSupabaseMock({
      users: { token: testUser },
      membershipRole: "admin",
    });

    const result = await invokeApi(
      "PATCH",
      "/v1/businesses/biz_1/settings",
      { basBasis: "accrual" },
      createContext(supabase),
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      settings: {
        basBasis: "accrual",
      },
    });
  });

  it("allows an owner to create a period lock", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/period-locks",
      { lockedThrough: "2026-01-31", note: "Month close" },
    );

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      periodLock: {
        id: "lock_1",
        lockedThrough: "2026-01-31",
        note: "Month close",
      },
    });
  });
});
