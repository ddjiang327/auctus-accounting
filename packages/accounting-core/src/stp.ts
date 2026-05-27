import type { Employee, LedgerData, PayRun, STPSubmission } from '@auctus/shared-types';

export interface PaymentSummary {
  employee: Employee;
  ytdGross: number;
  ytdPayg: number;
  ytdSuper: number;
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

  const totals: Record<string, { gross: number; payg: number; super: number; count: number }> = {};
  for (const run of runs) {
    for (const slip of run.paySlips) {
      const t = totals[slip.employeeId] ?? { gross: 0, payg: 0, super: 0, count: 0 };
      t.gross += slip.gross;
      t.payg += slip.paygWithheld;
      t.super += slip.superAmount;
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
      payRunCount: totals[e.id].count,
    }));
}

export function generateSTPCSV(payRuns: PayRun[], data: LedgerData): string {
  const rows = ['Pay Date,Period Start,Period End,Employee Name,TFN,Gross,PAYG Withheld,Super,Net Pay'];
  for (const run of payRuns) {
    for (const slip of run.paySlips) {
      const emp = (data.employees || []).find((e) => e.id === slip.employeeId);
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
          slip.netPay.toFixed(2),
        ].join(','),
      );
    }
  }
  return rows.join('\n');
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
