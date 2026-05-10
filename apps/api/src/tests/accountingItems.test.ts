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

describe("accounting item guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRecordAuditEvent.mockResolvedValue(undefined);
  });

  it("rejects income categories mapped to expense chart accounts", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData({
        chartOfAccounts: [
          { id: "ca_sales", code: "4000", name: "Sales", class: "revenue", group: "Income", normalBalance: "credit" },
          { id: "ca_office", code: "7030", name: "Office Supplies", class: "expense", group: "Expenses", normalBalance: "debit" },
        ],
      }),
    });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/categories", {
      type: "income",
      name: "Bad Income",
      icon: "receipt",
      color: "#0f766e",
      chartAccountId: "ca_office",
    });

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "invalid_chart_account_type" });
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
  });

  it("blocks archiving payment accounts with opening balances", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData({
        accounts: [
          { id: "bank_1", name: "Bank", type: "bank", initBalance: 50, icon: "bank", color: "#2563eb", chartAccountId: "ca_bank" },
        ],
      }),
    });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/payment-accounts/bank_1/archive");

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "payment_account_in_use" });
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
  });
});
