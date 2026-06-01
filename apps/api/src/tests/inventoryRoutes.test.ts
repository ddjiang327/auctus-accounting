import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordAuditEvent } from "../audit/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import { createContext, createSupabaseMock, invokeApi, ledgerData, testUser } from "./setup.js";

vi.mock("../ledger/service.js", () => ({
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);
const mockedRecordAuditEvent = vi.mocked(recordAuditEvent);

describe("inventory granular routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRecordAuditEvent.mockResolvedValue(undefined);
  });

  it("creates a product without replacing the full inventory module state", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const rpcCalls: Array<{ fnName: string; args: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
      onRpc: (fnName, args) => rpcCalls.push({ fnName, args }),
    }));
    const savedLedger = ledgerData({
      settings: { ...ledgerData().settings, inventoryStateVersion: 2 },
      products: [{
        id: "prod_1",
        name: "Widget",
        sku: "W-1",
        unitOfMeasure: "unit",
        costPrice: 10,
        sellPrice: 25,
      }],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: ledgerData() })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/products", savedLedger.products[0], context);

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      ledger: {
        settings: { inventoryStateVersion: 2 },
        products: [{ id: "prod_1", name: "Widget" }],
      },
    });
    expect(mutations).toEqual([
      expect.objectContaining({
        table: "products",
        operation: "insert",
        payload: expect.objectContaining({
          id: "prod_1",
          business_id: "biz_1",
          name: "Widget",
        }),
      }),
    ]);
    expect(rpcCalls).toContainEqual(expect.objectContaining({
      fnName: "touch_inventory_state",
      args: { p_business_id: "biz_1" },
    }));
    expect(rpcCalls).not.toContainEqual(expect.objectContaining({
      fnName: "replace_inventory_module_state",
    }));
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "product",
      action: "create",
    }));
  });

  it("validates inventory movement stock on the server", async () => {
    const context = createContext(createSupabaseMock({ users: { token: testUser } }));
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: ledgerData({
        products: [{
          id: "prod_1",
          name: "Widget",
          costPrice: 10,
          sellPrice: 20,
        }],
        inventoryMovements: [],
      }),
    });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/inventory-movements", {
      id: "mov_1",
      productId: "prod_1",
      date: "2026-05-01",
      type: "sale",
      quantity: 3,
      unitCost: 10,
    }, context);

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      error: "invalid_inventory_movement",
      message: expect.stringContaining("Insufficient stock"),
    });
  });

  it("creates a purchase order through granular tables", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const rpcCalls: Array<{ fnName: string; args: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
      onRpc: (fnName, args) => rpcCalls.push({ fnName, args }),
    }));
    const baseLedger = ledgerData({
      products: [{
        id: "prod_1",
        name: "Widget",
        costPrice: 10,
        sellPrice: 20,
      }],
    });
    const savedLedger = ledgerData({
      ...baseLedger,
      purchaseOrders: [{
        id: "po_1",
        date: "2026-05-01",
        supplierName: "Supply Co",
        status: "draft",
        lines: [{ productId: "prod_1", orderedQty: 5, unitCost: 10, receivedQty: 0 }],
      }],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: baseLedger })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/purchase-orders", savedLedger.purchaseOrders[0], context);

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      ledger: {
        purchaseOrders: [{ id: "po_1", status: "draft" }],
      },
    });
    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "purchase_orders",
        operation: "insert",
        payload: expect.objectContaining({ id: "po_1", business_id: "biz_1" }),
      }),
      expect.objectContaining({
        table: "purchase_order_lines",
        operation: "insert",
        payload: [expect.objectContaining({ id: "po_1_0", product_id: "prod_1" })],
      }),
    ]));
    expect(rpcCalls).toContainEqual(expect.objectContaining({ fnName: "touch_inventory_state" }));
    expect(rpcCalls).not.toContainEqual(expect.objectContaining({ fnName: "replace_inventory_module_state" }));
  });

  it("receives a purchase order through granular updates and movement inserts", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
    }));
    const baseLedger = ledgerData({
      products: [{
        id: "prod_1",
        name: "Widget",
        costPrice: 10,
        sellPrice: 20,
      }],
      purchaseOrders: [{
        id: "po_1",
        date: "2026-05-01",
        supplierName: "Supply Co",
        status: "sent",
        lines: [{ productId: "prod_1", orderedQty: 5, unitCost: 10, receivedQty: 0 }],
      }],
    });
    const savedLedger = ledgerData({
      ...baseLedger,
      inventoryMovements: [{
        id: "mov_1",
        productId: "prod_1",
        date: "2026-05-03",
        type: "purchase",
        quantity: 5,
        unitCost: 10,
      }],
      purchaseOrders: [{
        ...baseLedger.purchaseOrders[0],
        status: "received",
        receivedAt: "2026-05-03T00:00:00.000Z",
        lines: [{ productId: "prod_1", orderedQty: 5, unitCost: 10, receivedQty: 5 }],
      }],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: baseLedger })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/purchase-orders/po_1/receive", {
      date: "2026-05-03",
      receiptQtys: { 0: 5 },
    }, context);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ledger: {
        inventoryMovements: [{ productId: "prod_1", quantity: 5 }],
        purchaseOrders: [{ id: "po_1", status: "received" }],
      },
    });
    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "purchase_order_lines",
        operation: "update",
        payload: { received_qty: 5 },
      }),
      expect.objectContaining({
        table: "purchase_orders",
        operation: "update",
        payload: expect.objectContaining({ status: "received" }),
      }),
      expect.objectContaining({
        table: "inventory_movements",
        operation: "insert",
        payload: [expect.objectContaining({ product_id: "prod_1", quantity: 5 })],
      }),
    ]));
  });

  it("links a received purchase order to a supplier bill through an RPC", async () => {
    const rpcCalls: Array<{ fnName: string; args: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onRpc: (fnName, args) => rpcCalls.push({ fnName, args }),
    }));
    const baseLedger = ledgerData({
      transactions: [{
        id: "tx_1",
        type: "expense",
        amount: 50,
        date: "2026-05-04",
        entryMode: "invoice",
      }],
      purchaseOrders: [{
        id: "po_1",
        date: "2026-05-01",
        supplierName: "Supply Co",
        status: "received",
        lines: [{ productId: "prod_1", orderedQty: 5, unitCost: 10, receivedQty: 5 }],
      }],
      inventoryMovements: [{
        id: "mov_1",
        productId: "prod_1",
        date: "2026-05-03",
        type: "purchase",
        quantity: 5,
        unitCost: 10,
        sourceId: "po_1:0:2026-05-03",
      }],
    });
    const savedLedger = ledgerData({
      ...baseLedger,
      purchaseOrders: [{ ...baseLedger.purchaseOrders[0], billTransactionId: "tx_1" }],
      inventoryMovements: [{ ...baseLedger.inventoryMovements[0], sourceId: "tx_1" }],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: baseLedger })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/purchase-orders/po_1/link-bill", {
      billTransactionId: "tx_1",
    }, context);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ledger: {
        purchaseOrders: [{ id: "po_1", billTransactionId: "tx_1" }],
        inventoryMovements: [{ id: "mov_1", sourceId: "tx_1" }],
      },
    });
    expect(rpcCalls).toContainEqual(expect.objectContaining({
      fnName: "link_purchase_order_bill",
      args: {
        p_business_id: "biz_1",
        p_purchase_order_id: "po_1",
        p_bill_transaction_id: "tx_1",
      },
    }));
    expect(rpcCalls).not.toContainEqual(expect.objectContaining({ fnName: "replace_inventory_module_state" }));
  });
});
