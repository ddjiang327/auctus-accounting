import { beforeEach, describe, expect, it, vi } from "vitest";

import { invokeApi, ledgerData } from "./setup.js";
import { getLedgerSnapshot } from "../ledger/service.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);

describe("period lock API behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows admins to create period locks", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "admin" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/period-locks",
      { lockedThrough: "2026-03-31" },
    );

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      periodLock: {
        lockedThrough: "2026-03-31",
      },
    });
  });

  it("forbids bookkeepers from creating period locks", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/period-locks",
      { lockedThrough: "2026-03-31" },
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("prevents transaction mutation on locked dates", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "admin" },
      ledger: ledgerData({
        periodLocks: [{ id: "lock_1", lockedThrough: "2026-01-31", createdAt: "2026-02-01T00:00:00.000Z" }],
        transactions: [
          {
            id: "tx_locked",
            type: "income",
            amount: 100,
            accountId: "bank_1",
            categoryId: "cat_sales",
            chartAccountId: "ca_sales",
            date: "2026-01-15",
            gstMode: "inc",
            entryMode: "cash",
          },
        ],
      }),
    });

    const result = await invokeApi(
      "PATCH",
      "/v1/businesses/biz_1/transactions/tx_locked",
      { amount: 120 },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      error: "locked_period",
    });
  });
});
