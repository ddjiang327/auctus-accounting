import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LedgerData } from "@auctus/shared-types";
import { invokeApi, ledgerData } from "./setup.js";
import { getLedgerSnapshot } from "../ledger/service.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);

const reconciliationLedger = (): LedgerData =>
  ledgerData({
    bankReconciliations: [
      {
        id: "recon_1",
        accountId: "bank_1",
        statementDate: "2026-01-31",
        statementBalance: 1000,
        bookBalance: 1000,
        difference: 0,
        clearedSourceIds: [],
        createdAt: "2026-02-01T00:00:00.000Z",
        finalizedAt: "2026-02-01T00:00:00.000Z",
      },
    ],
  });

const voidedReconciliationLedger = (): LedgerData =>
  ledgerData({
    bankReconciliations: [
      {
        id: "recon_voided",
        accountId: "bank_1",
        statementDate: "2026-01-31",
        statementBalance: 1000,
        bookBalance: 1000,
        difference: 0,
        clearedSourceIds: [],
        createdAt: "2026-02-01T00:00:00.000Z",
        finalizedAt: "2026-02-01T00:00:00.000Z",
        voidedAt: "2026-02-05T00:00:00.000Z",
      },
    ],
  });

describe("bank reconciliation finalize", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when a viewer tries to finalize a reconciliation", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations",
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
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 400 when the statement date is in a locked period", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData({
        periodLocks: [{ id: "lock_1", lockedThrough: "2026-02-28", createdAt: "2026-03-01T00:00:00.000Z" }],
      }),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations",
      {
        accountId: "bank_1",
        statementDate: "2026-01-31",
        statementBalance: 0,
        bookBalance: 0,
        difference: 0,
        clearedSourceIds: ["src_1"],
      },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "period_locked" });
  });

  it("returns 400 when the client-supplied difference is non-zero", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "admin" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations",
      {
        accountId: "bank_1",
        statementDate: "2026-01-31",
        statementBalance: 1000,
        bookBalance: 995,
        difference: 5,
        clearedSourceIds: ["src_1"],
      },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "bank_reconciliation_out_of_balance" });
  });
});

describe("bank reconciliation void", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when a viewer tries to void a reconciliation", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: reconciliationLedger(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations/recon_1/void",
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 400 when voiding an already-voided reconciliation", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: voidedReconciliationLedger(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations/recon_voided/void",
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "bank_reconciliation_already_voided" });
  });

  it("returns 400 when the reconciliation date is in a locked period", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData({
        periodLocks: [{ id: "lock_1", lockedThrough: "2026-02-28", createdAt: "2026-03-01T00:00:00.000Z" }],
        bankReconciliations: [
          {
            id: "recon_locked",
            accountId: "bank_1",
            statementDate: "2026-01-31",
            statementBalance: 1000,
            bookBalance: 1000,
            difference: 0,
            clearedSourceIds: [],
            createdAt: "2026-02-01T00:00:00.000Z",
            finalizedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      }),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations/recon_locked/void",
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "period_locked" });
  });

  it("voids a reconciliation and returns 200 with voidedAt set", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: reconciliationLedger(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations/recon_1/void",
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      reconciliation: {
        voidedAt: expect.any(String),
      },
    });
  });

  it("bookkeeper can void a reconciliation", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: reconciliationLedger(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/bank-reconciliations/recon_1/void",
    );

    expect(result.statusCode).toBe(200);
  });
});
