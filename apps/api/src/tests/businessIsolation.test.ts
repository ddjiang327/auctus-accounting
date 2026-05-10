import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import { invokeApi } from "./setup.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);
const notMember = new ApiError(403, "forbidden", "Not a member of this business.");

describe("business isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when a non-member reads the ledger", async () => {
    mockedGetLedgerSnapshot.mockRejectedValue(notMember);

    const result = await invokeApi("GET", "/v1/businesses/biz_other/ledger");

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a non-member creates a transaction", async () => {
    mockedGetLedgerSnapshot.mockRejectedValue(notMember);

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_other/transactions",
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
  });

  it("returns 403 when a non-member creates a period lock", async () => {
    mockedGetLedgerSnapshot.mockRejectedValue(notMember);

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_other/period-locks",
      { lockedThrough: "2026-01-31" },
    );

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when a non-member imports bank feed items", async () => {
    mockedGetLedgerSnapshot.mockRejectedValue(notMember);

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_other/bank-feed-items/import",
      {
        accountId: "bank_1",
        items: [{ date: "2026-01-15", description: "Test credit", amount: 100, rawHash: "abc123" }],
      },
    );

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when a non-member finalizes a bank reconciliation", async () => {
    mockedGetLedgerSnapshot.mockRejectedValue(notMember);

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_other/bank-reconciliations",
      {
        accountId: "bank_1",
        statementDate: "2026-01-31",
        statementBalance: 0,
        bookBalance: 0,
        difference: 0,
        clearedSourceIds: ["src_1"],
      },
    );

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when a non-member exports a ledger backup", async () => {
    mockedGetLedgerSnapshot.mockRejectedValue(notMember);

    const result = await invokeApi("GET", "/v1/businesses/biz_other/backup");

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when a non-member resets ledger data", async () => {
    mockedGetLedgerSnapshot.mockRejectedValue(notMember);

    const result = await invokeApi("POST", "/v1/businesses/biz_other/reset");

    expect(result.statusCode).toBe(403);
  });
});
