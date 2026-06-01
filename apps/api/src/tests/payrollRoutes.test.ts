import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordAuditEvent } from "../audit/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import { createContext, createSupabaseMock, invokeApi, ledgerData, testUser } from "./setup.js";

vi.mock("../ledger/service.js", () => ({
  canRoleViewPayroll: (role: string) => role === "owner" || role === "admin" || role === "bookkeeper",
  getLedgerSnapshot: vi.fn(),
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetLedgerSnapshot = vi.mocked(getLedgerSnapshot);
const mockedRecordAuditEvent = vi.mocked(recordAuditEvent);

describe("payroll granular routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRecordAuditEvent.mockResolvedValue(undefined);
  });

  it("creates an employee without replacing the full payroll module state", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const rpcCalls: Array<{ fnName: string; args: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
      onRpc: (fnName, args) => rpcCalls.push({ fnName, args }),
    }));
    const employee = {
      id: "emp_1",
      name: "Alex Worker",
      payType: "salary",
      payRate: 78000,
      payFrequency: "fortnightly",
      taxFreeThreshold: true,
      employmentBasis: "full_time",
      ordinaryHoursPerWeek: 38,
      casualLoadingRate: 0.25,
    };
    const savedLedger = ledgerData({
      settings: { ...ledgerData().settings, payrollStateVersion: 2 },
      employees: [employee],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: ledgerData() })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/employees", employee, context);

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      ledger: {
        settings: { payrollStateVersion: 2 },
        employees: [{ id: "emp_1", name: "Alex Worker" }],
      },
    });
    expect(mutations).toEqual([
      expect.objectContaining({
        table: "employees",
        operation: "insert",
        payload: expect.objectContaining({
          id: "emp_1",
          business_id: "biz_1",
          name: "Alex Worker",
        }),
      }),
    ]);
    expect(rpcCalls).toContainEqual(expect.objectContaining({
      fnName: "touch_payroll_state",
      args: { p_business_id: "biz_1" },
    }));
    expect(rpcCalls).not.toContainEqual(expect.objectContaining({
      fnName: "replace_payroll_module_state",
    }));
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "employee",
      action: "create",
    }));
  });

  it("blocks viewers from creating employees", async () => {
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "viewer" },
      ledger: ledgerData(),
    });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/employees", {
      id: "emp_1",
      name: "Alex Worker",
      payType: "salary",
      payRate: 78000,
      payFrequency: "fortnightly",
      taxFreeThreshold: true,
    });

    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ error: "forbidden" });
  });

  it("creates a pay run through granular pay run and payslip tables", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const rpcCalls: Array<{ fnName: string; args: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
      onRpc: (fnName, args) => rpcCalls.push({ fnName, args }),
    }));
    const employee = {
      id: "emp_1",
      name: "Alex Worker",
      payType: "salary",
      payRate: 78000,
      payFrequency: "fortnightly",
      taxFreeThreshold: true,
    };
    const payRun = {
      id: "run_1",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-14",
      payDate: "2026-05-15",
      payAccountId: "bank_1",
      status: "draft",
      createdAt: "2026-05-15T00:00:00.000Z",
      paySlips: [{
        id: "slip_1",
        employeeId: "emp_1",
        gross: 3000,
        paygWithheld: 700,
        superAmount: 360,
        netPay: 2300,
      }],
    };
    const baseLedger = ledgerData({ employees: [employee] });
    const savedLedger = ledgerData({ ...baseLedger, payRuns: [payRun] });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: baseLedger })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/pay-runs", payRun, context);

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      ledger: {
        payRuns: [{ id: "run_1", paySlips: [{ id: "slip_1" }] }],
      },
    });
    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "pay_runs",
        operation: "insert",
        payload: expect.objectContaining({ id: "run_1", business_id: "biz_1" }),
      }),
      expect.objectContaining({
        table: "pay_slips",
        operation: "insert",
        payload: [expect.objectContaining({ id: "slip_1", employee_id: "emp_1" })],
      }),
    ]));
    expect(rpcCalls).toContainEqual(expect.objectContaining({ fnName: "touch_payroll_state" }));
    expect(rpcCalls).not.toContainEqual(expect.objectContaining({ fnName: "replace_payroll_module_state" }));
  });

  it("finalises a draft pay run through a granular update", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
    }));
    const baseLedger = ledgerData({
      payRuns: [{
        id: "run_1",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-14",
        payDate: "2026-05-15",
        status: "draft",
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
    });
    const savedLedger = ledgerData({
      payRuns: [{ ...baseLedger.payRuns[0], status: "finalised", finalisedAt: "2026-05-15T01:00:00.000Z" }],
    });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: baseLedger })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/pay-runs/run_1/finalise", undefined, context);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ledger: {
        payRuns: [{ id: "run_1", status: "finalised" }],
      },
    });
    expect(mutations).toContainEqual(expect.objectContaining({
      table: "pay_runs",
      operation: "update",
      payload: expect.objectContaining({ status: "finalised" }),
    }));
  });

  it("creates a remittance through the granular remittance table", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const rpcCalls: Array<{ fnName: string; args: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
      onRpc: (fnName, args) => rpcCalls.push({ fnName, args }),
    }));
    const remittance = {
      id: "rem_1",
      date: "2026-05-30",
      type: "payg",
      amount: 700,
      payAccountId: "bank_1",
      memo: "PAYG remittance",
    };
    const savedLedger = ledgerData({ remittances: [remittance] });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: ledgerData() })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "owner" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/remittances", remittance, context);

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      ledger: { remittances: [{ id: "rem_1", amount: 700 }] },
    });
    expect(mutations).toContainEqual(expect.objectContaining({
      table: "remittances",
      operation: "insert",
      payload: expect.objectContaining({ id: "rem_1", business_id: "biz_1" }),
    }));
    expect(rpcCalls).toContainEqual(expect.objectContaining({ fnName: "touch_payroll_state" }));
    expect(rpcCalls).not.toContainEqual(expect.objectContaining({ fnName: "replace_payroll_module_state" }));
  });

  it("rejects remittances with invalid dates or pay accounts before writing", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
    }));
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "owner" },
      ledger: ledgerData(),
    });

    const badDate = await invokeApi("POST", "/v1/businesses/biz_1/remittances", {
      id: "rem_bad_date",
      date: "2026-02-31",
      type: "payg",
      amount: 700,
      payAccountId: "bank_1",
    }, context);
    const badAccount = await invokeApi("POST", "/v1/businesses/biz_1/remittances", {
      id: "rem_bad_account",
      date: "2026-05-30",
      type: "payg",
      amount: 700,
      payAccountId: "missing_bank",
    }, context);

    expect(badDate.statusCode).toBe(400);
    expect(badDate.body).toMatchObject({ error: "invalid_remittance" });
    expect(badAccount.statusCode).toBe(400);
    expect(badAccount.body).toMatchObject({ error: "invalid_remittance" });
    expect(mutations).toEqual([]);
  });

  it("creates an STP submission only for active finalised pay runs", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
    }));
    const payRun = {
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
    };
    const submission = {
      id: "stp_1",
      payRunId: "run_1",
      submittedAt: "2026-05-15T02:00:00.000Z",
      status: "submitted",
      referenceNumber: "ATO-1",
    };
    const savedLedger = ledgerData({ payRuns: [payRun], stpSubmissions: [submission] });
    mockedGetLedgerSnapshot
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: ledgerData({ payRuns: [payRun] }) })
      .mockResolvedValueOnce({ business: { id: "biz_1", role: "bookkeeper" }, ledger: savedLedger });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/stp-submissions", submission, context);

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      ledger: { stpSubmissions: [{ id: "stp_1", payRunId: "run_1" }] },
    });
    expect(mutations).toContainEqual(expect.objectContaining({
      table: "stp_submissions",
      operation: "insert",
      payload: expect.objectContaining({ id: "stp_1", business_id: "biz_1", pay_run_id: "run_1" }),
    }));
  });

  it("rejects duplicate STP submissions for the same pay run", async () => {
    const mutations: Array<{ table: string; operation: string; payload: unknown }> = [];
    const context = createContext(createSupabaseMock({
      users: { token: testUser },
      onMutation: (table, operation, payload) => mutations.push({ table, operation, payload }),
    }));
    const payRun = {
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
    };
    mockedGetLedgerSnapshot.mockResolvedValue({
      business: { id: "biz_1", role: "bookkeeper" },
      ledger: ledgerData({
        payRuns: [payRun],
        stpSubmissions: [{
          id: "stp_existing",
          payRunId: "run_1",
          submittedAt: "2026-05-15T02:00:00.000Z",
          status: "submitted",
        }],
      }),
    });

    const result = await invokeApi("POST", "/v1/businesses/biz_1/stp-submissions", {
      id: "stp_2",
      payRunId: "run_1",
      submittedAt: "2026-05-15T03:00:00.000Z",
      status: "submitted",
    }, context);

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ error: "invalid_stp_submission" });
    expect(mutations).toEqual([]);
  });
});
