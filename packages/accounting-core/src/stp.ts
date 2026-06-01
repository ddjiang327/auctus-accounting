import type { Employee, LedgerData, PayRun, STPSubmission } from '@auctus/shared-types';

export interface PaymentSummary {
  employee: Employee;
  ytdGross: number;
  ytdPayg: number;
  ytdSuper: number;
  ytdAllowances: number;
  ytdDeductions: number;
  ytdReimbursements: number;
  payRunCount: number;
}

export function currentFinancialYear(): { start: string; end: string; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyStart = month >= 7 ? year : year - 1;
  return {
    start: `${fyStart}-07-01`,
    end: `${fyStart + 1}-06-30`,
    label: `FY ${fyStart}–${String(fyStart + 1).slice(2)}`,
  };
}

export function financialYearFor(date: string): { start: string; end: string; label: string } {
  const year = parseInt(date.slice(0, 4), 10);
  const month = parseInt(date.slice(5, 7), 10);
  const fyStart = month >= 7 ? year : year - 1;
  return {
    start: `${fyStart}-07-01`,
    end: `${fyStart + 1}-06-30`,
    label: `FY ${fyStart}–${String(fyStart + 1).slice(2)}`,
  };
}

export function pendingSTPPayRuns(data: LedgerData): PayRun[] {
  const submittedIds = new Set((data.stpSubmissions || []).map((s) => s.payRunId));
  return (data.payRuns || []).filter(
    (r) => r.status === 'finalised' && !r.voidedAt && !submittedIds.has(r.id),
  );
}

export function generatePaymentSummaries(
  data: LedgerData,
  fyStart: string,
  fyEnd: string,
): PaymentSummary[] {
  const runs = (data.payRuns || []).filter(
    (r) => r.status === 'finalised' && !r.voidedAt && r.payDate >= fyStart && r.payDate <= fyEnd,
  );

  const totals: Record<string, { gross: number; payg: number; super: number; allowances: number; deductions: number; reimbursements: number; count: number }> = {};
  for (const run of runs) {
    for (const slip of run.paySlips) {
      const t = totals[slip.employeeId] ?? { gross: 0, payg: 0, super: 0, allowances: 0, deductions: 0, reimbursements: 0, count: 0 };
      t.gross += slip.gross;
      t.payg += slip.paygWithheld;
      t.super += slip.superAmount;
      for (const adjustment of slip.adjustments || []) {
        if (adjustment.type === 'allowance') t.allowances += adjustment.amount;
        if (adjustment.type === 'deduction') t.deductions += adjustment.amount;
        if (adjustment.type === 'reimbursement') t.reimbursements += adjustment.amount;
      }
      t.count += 1;
      totals[slip.employeeId] = t;
    }
  }

  return (data.employees || [])
    .filter((e) => totals[e.id])
    .map((e) => ({
      employee: e,
      ytdGross: Math.round(totals[e.id].gross * 100) / 100,
      ytdPayg: Math.round(totals[e.id].payg * 100) / 100,
      ytdSuper: Math.round(totals[e.id].super * 100) / 100,
      ytdAllowances: Math.round(totals[e.id].allowances * 100) / 100,
      ytdDeductions: Math.round(totals[e.id].deductions * 100) / 100,
      ytdReimbursements: Math.round(totals[e.id].reimbursements * 100) / 100,
      payRunCount: totals[e.id].count,
    }));
}

export function generateSTPCSV(payRuns: PayRun[], data: LedgerData): string {
  const rows = ['Pay Date,Period Start,Period End,Employee Name,TFN,Gross,PAYG Withheld,Super,Deductions,Reimbursements,Net Pay,Allowance Details,Deduction Details,Reimbursement Details'];
  for (const run of payRuns) {
    for (const slip of run.paySlips) {
      const emp = (data.employees || []).find((e) => e.id === slip.employeeId);
      const allowances = (slip.adjustments || []).filter((item) => item.type === 'allowance');
      const deductions = (slip.adjustments || []).filter((item) => item.type === 'deduction');
      const reimbursements = (slip.adjustments || []).filter((item) => item.type === 'reimbursement');
      const totalDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);
      const totalReimbursements = reimbursements.reduce((sum, item) => sum + item.amount, 0);
      const details = (items: typeof allowances) => items.map((item) => `${item.label}: ${item.amount.toFixed(2)}`).join('; ');
      rows.push(
        [
          run.payDate,
          run.periodStart,
          run.periodEnd,
          emp?.name ?? slip.employeeId,
          emp?.tfn ?? '',
          slip.gross.toFixed(2),
          slip.paygWithheld.toFixed(2),
          slip.superAmount.toFixed(2),
          totalDeductions.toFixed(2),
          totalReimbursements.toFixed(2),
          slip.netPay.toFixed(2),
          details(allowances),
          details(deductions),
          details(reimbursements),
        ].map(csvCell).join(','),
      );
    }
  }
  return rows.join('\n');
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function markAllSubmitted(
  data: LedgerData,
  fyStart: string,
  fyEnd: string,
): STPSubmission[] {
  const pending = pendingSTPPayRuns(data).filter(
    (r) => r.payDate >= fyStart && r.payDate <= fyEnd,
  );
  const now = new Date().toISOString();
  return pending.map((r) => ({
    id: `stp_${r.id}`,
    payRunId: r.id,
    submittedAt: now,
    status: 'submitted' as const,
    memo: 'EOFY bulk finalisation',
  }));
}
