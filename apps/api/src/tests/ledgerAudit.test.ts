import { beforeEach, describe, expect, it, vi } from "vitest";

import { invokeApi, ledgerData } from "./setup.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import { recordAuditEvent } from "../audit/service.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);
const mockedRecordAuditEvent = vi.mocked(recordAuditEvent);

describe("ledger backup / restore / import / reset permissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when a bookkeeper tries to export a backup", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: ledgerData(),
    });

    const result = await invokeApi("GET", "/v1/businesses/biz_1/backup");

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when a viewer tries to export a backup", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi("GET", "/v1/businesses/biz_1/backup");

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when a bookkeeper tries to restore a backup", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/restore",
      { ledger: ledgerData() },
    );

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when a viewer tries to import ledger data", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi(
      "POST",
      "/v1/businesses/biz_1/import",
      { ledger: ledgerData() },
    );

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when a bookkeeper tries to reset the ledger", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: ledgerData(),
    });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/reset");

    expect(result.statusCode).toBe(403);
  });
});

describe("ledger export audit trail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("owner export returns a well-formed backup envelope", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData(),
    });

    const result = await invokeApi("GET", "/v1/businesses/biz_1/backup");

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      format: "auctus-ledger-backup",
      version: 1,
      businessId: "biz_1",
      exportedAt: expect.any(String),
      ledger: expect.objectContaining({ meta: expect.any(Object) }),
    });
  });

  it("admin export records an audit event with action=export", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "admin" },
      ledger: ledgerData(),
    });

    await invokeApi("GET", "/v1/businesses/biz_1/backup");

    expect(mockedRecordAuditEvent).toHaveBeenCalledOnce();
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_1",
        action: "export",
        entityType: "ledger_backup",
      }),
    );
  });

  it("export audit metadata includes transaction and account counts", async () => {
    const ledger = ledgerData({
      transactions: [
        {
          id: "tx_1",
          type: "income",
          amount: 100,
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
      ledger,
    });

    await invokeApi("GET", "/v1/businesses/biz_1/backup");

    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "export",
        metadata: expect.objectContaining({
          transactions: 1,
          accounts: 1,
        }),
      }),
    );
  });
});
