import type { Employee, EmploymentBasis, LedgerData, PayAdjustment, PayRun, PaySlip, Remittance, STPSubmission } from "@auctus/shared-types";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot, type LedgerSnapshot, canRoleViewPayroll } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const writableRoles = new Set(["owner", "admin", "bookkeeper"]);

const ensureObject = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
};

const readString = (body: Record<string, unknown>, key: string, options: { required?: boolean; max?: number } = {}): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new ApiError(400, "invalid_employee", `${key} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new ApiError(400, "invalid_employee", `${key} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed && options.required) throw new ApiError(400, "invalid_employee", `${key} is required.`);
  if (options.max && trimmed.length > options.max) throw new ApiError(400, "invalid_employee", `${key} is too long.`);
  return trimmed || undefined;
};

const isISODate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const readDate = (body: Record<string, unknown>, key: string, errorCode: string): string => {
  const value = readString(body, key, { required: true, max: 10 })!;
  if (!isISODate(value)) {
    throw new ApiError(400, errorCode, `${key} must be a valid date in YYYY-MM-DD format.`);
  }
  return value;
};

const readNumber = (body: Record<string, unknown>, key: string, options: { required?: boolean; min?: number; max?: number } = {}): number | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new ApiError(400, "invalid_employee", `${key} is required.`);
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new ApiError(400, "invalid_employee", `${key} must be a number.`);
  if (options.min !== undefined && numeric < options.min) throw new ApiError(400, "invalid_employee", `${key} must be at least ${options.min}.`);
  if (options.max !== undefined && numeric > options.max) throw new ApiError(400, "invalid_employee", `${key} must be at most ${options.max}.`);
  return numeric;
};

const readBoolean = (body: Record<string, unknown>, key: string, fallback: boolean): boolean => {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new ApiError(400, "invalid_employee", `${key} must be a boolean.`);
  return value;
};

const readArray = (body: Record<string, unknown>, key: string): unknown[] => {
  const value = body[key];
  if (!Array.isArray(value)) throw new ApiError(400, "invalid_pay_run", `${key} must be an array.`);
  return value;
};

const getWriteContext = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<LedgerSnapshot> => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!canRoleViewPayroll(snapshot.business.role) || !writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to update payroll.");
  }
  return snapshot;
};

const touchPayrollState = async (supabase: SupabaseServiceClient, businessId: string) => {
  const { error } = await supabase.rpc("touch_payroll_state", { p_business_id: businessId });
  if (error) throw new ApiError(500, "payroll_version_update_failed", error.message);
};

const parseEmployee = (body: unknown, fallbackId?: string): Employee => {
  const input = ensureObject(body);
  const payType = readString(input, "payType", { required: true, max: 20 });
  if (payType !== "salary" && payType !== "hourly") {
    throw new ApiError(400, "invalid_employee", "payType is invalid.");
  }
  const payFrequency = readString(input, "payFrequency", { required: true, max: 20 });
  if (payFrequency !== "weekly" && payFrequency !== "fortnightly" && payFrequency !== "monthly") {
    throw new ApiError(400, "invalid_employee", "payFrequency is invalid.");
  }
  const employmentBasisInput = readString(input, "employmentBasis", { max: 20 });
  if (employmentBasisInput && employmentBasisInput !== "full_time" && employmentBasisInput !== "part_time" && employmentBasisInput !== "casual") {
    throw new ApiError(400, "invalid_employee", "employmentBasis is invalid.");
  }
  const employmentBasis = (employmentBasisInput || "full_time") as EmploymentBasis;
  return {
    id: fallbackId || readString(input, "id", { required: true, max: 120 })!,
    name: readString(input, "name", { required: true, max: 180 })!,
    payType,
    payRate: readNumber(input, "payRate", { required: true, min: 0 })!,
    payFrequency,
    taxFreeThreshold: readBoolean(input, "taxFreeThreshold", true),
    employmentBasis,
    ordinaryHoursPerWeek: readNumber(input, "ordinaryHoursPerWeek", { min: 0, max: 168 }) ?? 38,
    casualLoadingRate: readNumber(input, "casualLoadingRate", { min: 0, max: 5 }) ?? 0.25,
    superFundName: readString(input, "superFundName", { max: 180 }),
    tfn: readString(input, "tfn", { max: 40 }),
  };
};

const employeeRow = (businessId: string, employee: Employee) => ({
  id: employee.id,
  business_id: businessId,
  name: employee.name,
  pay_type: employee.payType,
  pay_rate: employee.payRate,
  pay_frequency: employee.payFrequency,
  tax_free_threshold: employee.taxFreeThreshold,
  employment_basis: employee.employmentBasis ?? "full_time",
  ordinary_hours_per_week: employee.ordinaryHoursPerWeek ?? 38,
  casual_loading_rate: employee.casualLoadingRate ?? 0.25,
  super_fund_name: employee.superFundName ?? null,
  tfn: employee.tfn ?? null,
  archived_at: employee.archivedAt ?? null,
});

const parseAdjustment = (value: unknown): PayAdjustment => {
  const input = ensureObject(value);
  const type = readString(input, "type", { required: true, max: 30 });
  if (type !== "allowance" && type !== "deduction" && type !== "reimbursement") {
    throw new ApiError(400, "invalid_pay_run", "adjustment type is invalid.");
  }
  return {
    id: readString(input, "id", { max: 120 }),
    type,
    label: readString(input, "label", { required: true, max: 180 })!,
    amount: readNumber(input, "amount", { required: true, min: 0 })!,
    taxable: input.taxable === undefined ? undefined : readBoolean(input, "taxable", false),
    superable: input.superable === undefined ? undefined : readBoolean(input, "superable", false),
  };
};

const parsePaySlip = (value: unknown): PaySlip => {
  const input = ensureObject(value);
  const adjustments = input.adjustments === undefined ? undefined : readArray(input, "adjustments").map(parseAdjustment);
  return {
    id: readString(input, "id", { required: true, max: 120 })!,
    employeeId: readString(input, "employeeId", { required: true, max: 120 })!,
    gross: readNumber(input, "gross", { required: true, min: 0 })!,
    paygWithheld: readNumber(input, "paygWithheld", { required: true, min: 0 })!,
    superAmount: readNumber(input, "superAmount", { required: true, min: 0 })!,
    netPay: readNumber(input, "netPay", { required: true, min: 0 })!,
    hours: readNumber(input, "hours", { min: 0 }),
    adjustments,
  };
};

const parsePayRun = (body: unknown): PayRun => {
  const input = ensureObject(body);
  const status = readString(input, "status", { required: true, max: 20 });
  if (status !== "draft" && status !== "finalised") {
    throw new ApiError(400, "invalid_pay_run", "status is invalid.");
  }
  return {
    id: readString(input, "id", { required: true, max: 120 })!,
    periodStart: readDate(input, "periodStart", "invalid_pay_run"),
    periodEnd: readDate(input, "periodEnd", "invalid_pay_run"),
    payDate: readDate(input, "payDate", "invalid_pay_run"),
    payAccountId: readString(input, "payAccountId", { max: 80 }),
    status,
    paySlips: readArray(input, "paySlips").map(parsePaySlip),
    createdAt: readString(input, "createdAt", { max: 40 }) ?? new Date().toISOString(),
    finalisedAt: readString(input, "finalisedAt", { max: 40 }),
    voidedAt: readString(input, "voidedAt", { max: 40 }),
  };
};

const validatePayRun = (snapshot: LedgerSnapshot, payRun: PayRun) => {
  if (!payRun.paySlips.length) {
    throw new ApiError(400, "invalid_pay_run", "Pay run must include at least one payslip.");
  }
  if (payRun.periodEnd < payRun.periodStart) {
    throw new ApiError(400, "invalid_pay_run", "Period end must be on or after period start.");
  }
  const employeeIds = new Set((snapshot.ledger.employees || []).filter((employee) => !employee.archivedAt).map((employee) => employee.id));
  for (const slip of payRun.paySlips) {
    if (!employeeIds.has(slip.employeeId)) {
      throw new ApiError(400, "invalid_pay_run", `Payslip employee ${slip.employeeId} is not active.`);
    }
  }
  if (payRun.payAccountId && !snapshot.ledger.accounts.some((account) => account.id === payRun.payAccountId)) {
    throw new ApiError(400, "invalid_pay_run", "Pay account does not belong to this business.");
  }
};

const payRunRow = (businessId: string, payRun: PayRun) => ({
  id: payRun.id,
  business_id: businessId,
  period_start: payRun.periodStart,
  period_end: payRun.periodEnd,
  pay_date: payRun.payDate,
  pay_account_id: payRun.payAccountId ?? null,
  status: payRun.status,
  created_at: payRun.createdAt,
  finalised_at: payRun.finalisedAt ?? null,
  voided_at: payRun.voidedAt ?? null,
});

const paySlipRows = (businessId: string, payRun: PayRun) => payRun.paySlips.map((slip, index) => ({
  id: slip.id,
  business_id: businessId,
  pay_run_id: payRun.id,
  employee_id: slip.employeeId,
  gross: slip.gross,
  payg_withheld: slip.paygWithheld,
  super_amount: slip.superAmount,
  net_pay: slip.netPay,
  hours: slip.hours ?? null,
  adjustments: slip.adjustments ?? [],
  line_order: index,
}));

const parseRemittance = (body: unknown): Remittance => {
  const input = ensureObject(body);
  const type = readString(input, "type", { required: true, max: 20 });
  if (type !== "payg" && type !== "super") {
    throw new ApiError(400, "invalid_remittance", "type is invalid.");
  }
  return {
    id: readString(input, "id", { required: true, max: 120 })!,
    date: readDate(input, "date", "invalid_remittance"),
    type,
    amount: readNumber(input, "amount", { required: true, min: 0 })!,
    payAccountId: readString(input, "payAccountId", { max: 80 }),
    memo: readString(input, "memo", { max: 500 }),
  };
};

const validateRemittance = (snapshot: LedgerSnapshot, remittance: Remittance) => {
  if (remittance.amount <= 0) {
    throw new ApiError(400, "invalid_remittance", "Remittance amount must be greater than zero.");
  }
  if (remittance.payAccountId && !snapshot.ledger.accounts.some((account) => account.id === remittance.payAccountId)) {
    throw new ApiError(400, "invalid_remittance", "Pay account does not belong to this business.");
  }
};

const remittanceRow = (businessId: string, remittance: Remittance) => ({
  id: remittance.id,
  business_id: businessId,
  date: remittance.date,
  type: remittance.type,
  amount: remittance.amount,
  pay_account_id: remittance.payAccountId ?? null,
  memo: remittance.memo ?? null,
});

const parseSTPSubmission = (body: unknown): STPSubmission => {
  const input = ensureObject(body);
  const status = readString(input, "status", { required: true, max: 20 });
  if (status !== "submitted" && status !== "accepted" && status !== "rejected") {
    throw new ApiError(400, "invalid_stp_submission", "status is invalid.");
  }
  return {
    id: readString(input, "id", { required: true, max: 120 })!,
    payRunId: readString(input, "payRunId", { required: true, max: 120 })!,
    submittedAt: readString(input, "submittedAt", { max: 40 }) ?? new Date().toISOString(),
    status,
    referenceNumber: readString(input, "referenceNumber", { max: 120 }),
    memo: readString(input, "memo", { max: 500 }),
  };
};

const validateSTPSubmission = (snapshot: LedgerSnapshot, submission: STPSubmission) => {
  const run = snapshot.ledger.payRuns?.find((payRun) => payRun.id === submission.payRunId);
  if (!run) throw new ApiError(404, "pay_run_not_found", "Pay run not found.");
  if (run.status !== "finalised" || run.voidedAt) {
    throw new ApiError(400, "invalid_stp_submission", "Only active finalised pay runs can be submitted.");
  }
  if (snapshot.ledger.stpSubmissions?.some((item) => item.payRunId === submission.payRunId)) {
    throw new ApiError(400, "invalid_stp_submission", "Pay run already has an STP submission.");
  }
};

const stpSubmissionRow = (businessId: string, submission: STPSubmission) => ({
  id: submission.id,
  business_id: businessId,
  pay_run_id: submission.payRunId,
  submitted_at: submission.submittedAt,
  status: submission.status,
  reference_number: submission.referenceNumber ?? null,
  memo: submission.memo ?? null,
});

export const createEmployee = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const employee = parseEmployee(body);
  const { error } = await supabase.from("employees").insert(employeeRow(businessId, employee));
  if (error) throw new ApiError(500, "employee_create_failed", error.message);
  await touchPayrollState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "employee",
    entityId: employee.id,
    detail: `Created employee ${employee.name}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const updateEmployee = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  employeeId: string,
  body: unknown,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const employee = parseEmployee(body, employeeId);
  const { error } = await supabase.from("employees").update(employeeRow(businessId, employee)).eq("business_id", businessId).eq("id", employeeId);
  if (error) throw new ApiError(500, "employee_update_failed", error.message);
  await touchPayrollState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "employee",
    entityId: employeeId,
    detail: `Updated employee ${employee.name}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const archiveEmployee = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  employeeId: string,
): Promise<LedgerData> => {
  await getWriteContext(supabase, userId, businessId);
  const { error } = await supabase.from("employees").update({ archived_at: new Date().toISOString() }).eq("business_id", businessId).eq("id", employeeId);
  if (error) throw new ApiError(500, "employee_archive_failed", error.message);
  await touchPayrollState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "archive",
    entityType: "employee",
    entityId: employeeId,
    detail: "Archived employee",
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const createPayRun = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const payRun = parsePayRun(body);
  validatePayRun(snapshot, payRun);
  const normalizedPayRun = {
    ...payRun,
    finalisedAt: payRun.status === "finalised" ? payRun.finalisedAt ?? new Date().toISOString() : undefined,
  };

  const { error: runError } = await supabase.from("pay_runs").insert(payRunRow(businessId, normalizedPayRun));
  if (runError) throw new ApiError(500, "pay_run_create_failed", runError.message);

  const { error: slipsError } = await supabase.from("pay_slips").insert(paySlipRows(businessId, normalizedPayRun));
  if (slipsError) throw new ApiError(500, "pay_run_create_failed", slipsError.message);

  await touchPayrollState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "pay_run",
    entityId: normalizedPayRun.id,
    detail: `Created ${normalizedPayRun.status} pay run ${normalizedPayRun.id}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const finalisePayRun = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  payRunId: string,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const payRun = snapshot.ledger.payRuns?.find((run) => run.id === payRunId);
  if (!payRun) throw new ApiError(404, "pay_run_not_found", "Pay run not found.");
  if (payRun.status !== "draft") {
    throw new ApiError(400, "invalid_pay_run", "Only draft pay runs can be finalised.");
  }

  const { error } = await supabase
    .from("pay_runs")
    .update({ status: "finalised", finalised_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", payRunId);
  if (error) throw new ApiError(500, "pay_run_finalise_failed", error.message);

  await touchPayrollState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "pay_run",
    entityId: payRunId,
    detail: "Finalised pay run",
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const createRemittance = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const remittance = parseRemittance(body);
  validateRemittance(snapshot, remittance);

  const { error } = await supabase.from("remittances").insert(remittanceRow(businessId, remittance));
  if (error) throw new ApiError(500, "remittance_create_failed", error.message);

  await touchPayrollState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "remittance",
    entityId: remittance.id,
    detail: `Created ${remittance.type} remittance`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};

export const createSTPSubmission = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<LedgerData> => {
  const snapshot = await getWriteContext(supabase, userId, businessId);
  const submission = parseSTPSubmission(body);
  validateSTPSubmission(snapshot, submission);

  const { error } = await supabase.from("stp_submissions").insert(stpSubmissionRow(businessId, submission));
  if (error) throw new ApiError(500, "stp_submission_create_failed", error.message);

  await touchPayrollState(supabase, businessId);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "stp_submission",
    entityId: submission.id,
    detail: `Created STP submission for pay run ${submission.payRunId}`,
  });
  return (await getLedgerSnapshot(supabase, userId, businessId)).ledger;
};
