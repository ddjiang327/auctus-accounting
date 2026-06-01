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

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);
const mockedRecordAuditEvent = vi.mocked(recordAuditEvent);

describe("module state persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRecordAuditEvent.mockResolvedValue(undefined);
  });

  it("saves inventory state and returns a ledger snapshot", async () => {
    const savedLedger = ledgerData({
      products: [{
        id: "prod_1",
        name: "Widget",
        sku: "W-1",
        unitOfMeasure: "unit",
        costPrice: 10,
        sellPrice: 25,
      }],
      inventoryMovements: [{
        id: "mov_1",
        productId: "prod_1",
        date: "2026-05-01",
        type: "purchase",
        quantity: 5,
        unitCost: 10,
      }],
      purchaseOrders: [],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: ledgerData() })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("PUT", "/v1/businesses/biz_1/inventory-state", {
      expectedVersion: 1,
      products: savedLedger.products,
      inventoryMovements: savedLedger.inventoryMovements,
      purchaseOrders: [],
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ledger: {
        products: [{ id: "prod_1", name: "Widget" }],
        inventoryMovements: [{ id: "mov_1", productId: "prod_1" }],
      },
    });
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "inventory",
    }));
  });

  it("saves payroll state and returns a ledger snapshot", async () => {
    const savedLedger = ledgerData({
      employees: [{
        id: "emp_1",
        name: "Alex Worker",
        payType: "salary",
        payRate: 78000,
        payFrequency: "fortnightly",
        taxFreeThreshold: true,
      }],
      payRuns: [{
        id: "run_1",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-14",
        payDate: "2026-05-15",
        status: "finalised",
        createdAt: "2026-05-15T00:00:00.000Z",
        paySlips: [{
          id: "slip_1",
          employeeId: "emp_1",
          gross: 3000,
          paygWithheld: 700,
          superAmount: 360,
          netPay: 2300,
        }],
      }],
      remittances: [],
      stpSubmissions: [],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: ledgerData() })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: savedLedger });

    const result = await invokeApi("PUT", "/v1/businesses/biz_1/payroll-state", {
      expectedVersion: 1,
      employees: savedLedger.employees,
      payRuns: savedLedger.payRuns,
      remittances: [],
      stpSubmissions: [],
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ledger: {
        employees: [{ id: "emp_1", name: "Alex Worker" }],
        payRuns: [{ id: "run_1", paySlips: [{ id: "slip_1" }] }],
      },
    });
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "payroll",
    }));
  });

  it("blocks viewers from saving module state", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi("PUT", "/v1/businesses/biz_1/inventory-state", {
      expectedVersion: 1,
      products: [],
      inventoryMovements: [],
      purchaseOrders: [],
    });

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("replaces inventory state through the database transaction RPC", async () => {
    const rpcCalls: Array<{ fnName: string; args: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onRpc: (fnName, args) => rpcCalls.push({ fnName, args }),
    }));
    const savedLedger = ledgerData({
      products: [{
        id: "prod_1",
        name: "Widget",
        costPrice: 10,
        sellPrice: 20,
      }],
      inventoryMovements: [],
      purchaseOrders: [],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: ledgerData() })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("PUT", "/v1/businesses/biz_1/inventory-state", {
      expectedVersion: 1,
      products: savedLedger.products,
      inventoryMovements: [],
      purchaseOrders: [],
    }, context);

    expect(result.statusCode).toBe(200);
    expect(rpcCalls).toEqual([
      expect.objectContaining({
        fnName: "replace_inventory_module_state",
        args: expect.objectContaining({
          p_business_id: "biz_1",
          p_expected_version: 1,
          p_products: savedLedger.products,
        }),
      }),
    ]);
  });

  it("returns a conflict when inventory state has changed in another session", async () => {
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      rpcErrors: {
        replace_inventory_module_state: { message: "module_state_conflict: inventory state version mismatch" },
      },
    }));
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData(),
    });

    const result = await invokeApi("PUT", "/v1/businesses/biz_1/inventory-state", {
      expectedVersion: 1,
      products: [],
      inventoryMovements: [],
      purchaseOrders: [],
    }, context);

    expect(result.statusCode).toBe(409);
    expect(result.body).toMatchObject({
      error: "module_state_conflict",
      message: expect.stringContaining("Reload"),
    });
  });
});
