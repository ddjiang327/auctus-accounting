import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContext, createSupabaseMock, invokeApi, ledgerData, testUser } from "./setup.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import { recordAuditEvent } from "../audit/service.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ledger/seed.js", () => ({
  seedAccountingFoundation: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);
const mockedRecordAuditEvent = vi.mocked(recordAuditEvent);

describe("ledger backup / restore / import / reset permissions", () => {
  beforeEach(() => vi.clearAllMocks());

  const adminActions = [
    { label: "export a backup", method: "GET", path: "/v1/businesses/biz_1/backup", body: undefined },
    { label: "restore a backup", method: "POST", path: "/v1/businesses/biz_1/restore", body: { ledger: ledgerData() } },
    { label: "import ledger data", method: "POST", path: "/v1/businesses/biz_1/import", body: { ledger: ledgerData() } },
    { label: "reset the ledger", method: "POST", path: "/v1/businesses/biz_1/reset", body: undefined },
  ];

  it.each(["owner", "admin"] as const)("allows a %s to export, restore, import, and reset ledger data", async (role) => {
    for (const action of adminActions) {
      vi.clearAllMocks();
      mockedGetLedgerSnapshot.mockResolvedValue({
        business: { id: "biz_1", role },
        ledger: ledgerData(),
      });

      const result = await invokeApi(action.method, action.path, action.body);

      expect(result.statusCode, `${role} should be allowed to ${action.label}`).toBe(200);
    }
  });

  it.each(["bookkeeper", "viewer"] as const)("returns 403 when a %s tries to export, restore, import, or reset ledger data", async (role) => {
    for (const action of adminActions) {
      vi.clearAllMocks();
      mockedGetLedgerSnapshot.mockResolvedValue({
        business: { id: "biz_1", role },
        ledger: ledgerData(),
      });

      const result = await invokeApi(action.method, action.path, action.body);

      expect(result.statusCode, `${role} should not be allowed to ${action.label}`).toBe(403);
      expect(result.body).toMatchObject({ error: "forbidden" });
    }
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

  it("restore keeps inventory and payroll module data", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
    }));
    const ledger = ledgerData({
      chartOfAccounts: [
        { id: "ca_bank", code: "1000", name: "Bank", class: "asset", group: "Current Assets", normalBalance: "debit" },
        { id: "ca_inventory", code: "1220", name: "Inventory", class: "asset", group: "Current Assets - Inventory", normalBalance: "debit" },
        { id: "ca_cogs", code: "5000", name: "COGS", class: "expense", group: "Cost of Goods Sold", normalBalance: "debit" },
        { id: "ca_sales", code: "4000", name: "Sales", class: "revenue", group: "Revenue", normalBalance: "credit" },
      ],
      products: [{
        id: "prod_1",
        name: "Widget",
        unitOfMeasure: "each",
        costPrice: 12,
        sellPrice: 24,
        inventoryChartAccountId: "ca_inventory",
        cogsChartAccountId: "ca_cogs",
        revenueChartAccountId: "ca_sales",
      }],
      inventoryMovements: [{
        id: "move_1",
        productId: "prod_1",
        date: "2026-02-01",
        type: "purchase",
        quantity: 5,
        unitCost: 12,
        sourceId: "tx_1",
      }],
      purchaseOrders: [{
        id: "po_1",
        date: "2026-02-01",
        supplierName: "Supplier",
        status: "received",
        receivedAt: "2026-02-02T00:00:00.000Z",
        billTransactionId: "tx_1",
        billedAt: "2026-02-03T00:00:00.000Z",
        lines: [{ productId: "prod_1", orderedQty: 5, receivedQty: 5, unitCost: 12 }],
      }],
      employees: [{
        id: "emp_1",
        name: "Alex",
        payType: "salary",
        payRate: 78000,
        payFrequency: "weekly",
        taxFreeThreshold: true,
        employmentBasis: "full_time",
        ordinaryHoursPerWeek: 38,
        casualLoadingRate: 0.25,
      }],
      payRuns: [{
        id: "payrun_1",
        periodStart: "2026-02-01",
        periodEnd: "2026-02-07",
        payDate: "2026-02-08",
        status: "finalised",
        createdAt: "2026-02-08T00:00:00.000Z",
        paySlips: [{
          id: "slip_1",
          employeeId: "emp_1",
          gross: 1500,
          paygWithheld: 300,
          superAmount: 172.5,
          netPay: 1200,
          adjustments: [],
        }],
      }],
      remittances: [{
        id: "remit_1",
        date: "2026-02-15",
        type: "payg",
        amount: 300,
        payAccountId: "bank_1",
      }],
      stpSubmissions: [{
        id: "stp_1",
        payRunId: "payrun_1",
        submittedAt: "2026-02-08T00:00:00.000Z",
        status: "accepted",
        referenceNumber: "STP-1",
      }],
    });

    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger,
    });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/restore", { ledger }, context);

    expect(result.statusCode).toBe(200);
    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "products", operation: "insert" }),
      expect.objectContaining({ table: "inventory_movements", operation: "insert" }),
      expect.objectContaining({ table: "purchase_orders", operation: "insert" }),
      expect.objectContaining({ table: "purchase_order_lines", operation: "insert" }),
      expect.objectContaining({ table: "employees", operation: "insert" }),
      expect.objectContaining({ table: "pay_runs", operation: "insert" }),
      expect.objectContaining({ table: "pay_slips", operation: "insert" }),
      expect.objectContaining({ table: "remittances", operation: "insert" }),
      expect.objectContaining({ table: "stp_submissions", operation: "insert" }),
    ]));
  });
});
