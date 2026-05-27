import type { Employee, JournalEntry, LedgerData, PayRun, PaySlip, Remittance } from '@auctus/shared-types';

const SUPER_RATE = 0.12; // 12% from 1 July 2025
const WAGES_CODE = '7000';
const SUPER_EXPENSE_CODE = '7080';
const PAYG_LIABILITY_CODE = '2400';
const SUPER_LIABILITY_CODE = '2410';

function chartIdByCode(data: LedgerData, code: string): string | undefined {
  return data.chartOfAccounts.find((a) => a.code === code)?.id;
}

function periodsPerYear(freq: Employee['payFrequency']): number {
  return freq === 'weekly' ? 52 : freq === 'fortnightly' ? 26 : 12;
}

function annualTaxWithThreshold(income: number): number {
  if (income <= 18200) return 0;
  if (income <= 45000) return (income - 18200) * 0.19;
  if (income <= 120000) return 5092 + (income - 45000) * 0.325;
  if (income <= 180000) return 29467 + (income - 120000) * 0.37;
  return 51667 + (income - 180000) * 0.45;
}

function annualTaxNoThreshold(income: number): number {
  // No tax-free threshold: tax from first dollar at 19% up to $45k
  if (income <= 45000) return income * 0.19;
  if (income <= 120000) return 8550 + (income - 45000) * 0.325;
  if (income <= 180000) return 32875 + (income - 120000) * 0.37;
  return 55075 + (income - 180000) * 0.45;
}

function medicareLevy(income: number): number {
  if (income <= 26000) return 0;
  return income * 0.02;
}

export function calculatePayg(annualGross: number, taxFreeThreshold: boolean): number {
  const baseTax = taxFreeThreshold
    ? annualTaxWithThreshold(annualGross)
    : annualTaxNoThreshold(annualGross);
  return Math.round(baseTax + medicareLevy(annualGross));
}

export function calculatePaySlip(employee: Employee, gross: number): Omit<PaySlip, 'id'> {
  const periods = periodsPerYear(employee.payFrequency);
  const annualGross = gross * periods;
  const annualPayg = calculatePayg(annualGross, employee.taxFreeThreshold);
  const paygWithheld = Math.round((annualPayg / periods) * 100) / 100;
  const superAmount = Math.round(gross * SUPER_RATE * 100) / 100;
  const netPay = Math.round((gross - paygWithheld) * 100) / 100;
  return { employeeId: employee.id, gross, paygWithheld, superAmount, netPay };
}

export function payRunJournalEntries(payRun: PayRun, data: LedgerData): JournalEntry[] {
  if (payRun.status !== 'finalised' || payRun.voidedAt) return [];
  const wagesId = chartIdByCode(data, WAGES_CODE);
  const superExpId = chartIdByCode(data, SUPER_EXPENSE_CODE);
  const paygLiabId = chartIdByCode(data, PAYG_LIABILITY_CODE);
  const superLiabId = chartIdByCode(data, SUPER_LIABILITY_CODE);
  if (!wagesId || !paygLiabId) return [];

  const totalGross = payRun.paySlips.reduce((s, p) => s + p.gross, 0);
  const totalPayg = payRun.paySlips.reduce((s, p) => s + p.paygWithheld, 0);
  const totalSuper = payRun.paySlips.reduce((s, p) => s + p.superAmount, 0);
  const totalNet = payRun.paySlips.reduce((s, p) => s + p.netPay, 0);

  const payAccount = payRun.payAccountId
    ? data.accounts.find((a) => a.id === payRun.payAccountId)
    : data.accounts[0];
  const bankId = payAccount?.chartAccountId;

  const entries: JournalEntry[] = [];

  // Wages journal: Dr Wages / Cr PAYG Payable / Cr Bank (net)
  if (totalGross > 0) {
    const lines: JournalEntry['lines'] = [
      { chartAccountId: wagesId, debit: totalGross, credit: 0 },
      { chartAccountId: paygLiabId, debit: 0, credit: totalPayg },
    ];
    if (bankId && totalNet > 0) {
      lines.push({ chartAccountId: bankId, debit: 0, credit: totalNet });
    }
    entries.push({
      id: `je_payrun_wages_${payRun.id}`,
      date: payRun.payDate,
      memo: `Payroll ${payRun.periodStart} to ${payRun.periodEnd}`,
      sourceId: payRun.id,
      lines,
    });
  }

  // Super journal: Dr Super Expense / Cr Super Payable
  if (totalSuper > 0 && superExpId && superLiabId) {
    entries.push({
      id: `je_payrun_super_${payRun.id}`,
      date: payRun.payDate,
      memo: `Superannuation ${payRun.periodStart} to ${payRun.periodEnd}`,
      sourceId: payRun.id,
      lines: [
        { chartAccountId: superExpId, debit: totalSuper, credit: 0 },
        { chartAccountId: superLiabId, debit: 0, credit: totalSuper },
      ],
    });
  }

  return entries;
}


const STANDARD_HOURS_PER_WEEK = 38;
const ANNUAL_LEAVE_HOURS_PER_YEAR = STANDARD_HOURS_PER_WEEK * 4;   // 4 weeks
const SICK_LEAVE_HOURS_PER_YEAR = (STANDARD_HOURS_PER_WEEK / 5) * 10; // 10 days

export function periodicLeaveAccrual(employee: Employee): { annualLeaveHours: number; sickLeaveHours: number } {
  const periods = periodsPerYear(employee.payFrequency);
  return {
    annualLeaveHours: Math.round((ANNUAL_LEAVE_HOURS_PER_YEAR / periods) * 100) / 100,
    sickLeaveHours: Math.round((SICK_LEAVE_HOURS_PER_YEAR / periods) * 100) / 100,
  };
}

export function computeLeaveBalances(data: LedgerData): Record<string, { annualLeaveHours: number; sickLeaveHours: number }> {
  const balances: Record<string, { annualLeaveHours: number; sickLeaveHours: number }> = {};
  for (const run of (data.payRuns || []).filter((r) => r.status === 'finalised' && !r.voidedAt)) {
    for (const slip of run.paySlips) {
      const emp = (data.employees || []).find((e) => e.id === slip.employeeId);
      if (!emp) continue;
      const accrual = periodicLeaveAccrual(emp);
      const bal = balances[emp.id] ?? { annualLeaveHours: 0, sickLeaveHours: 0 };
      bal.annualLeaveHours = Math.round((bal.annualLeaveHours + accrual.annualLeaveHours) * 100) / 100;
      bal.sickLeaveHours = Math.round((bal.sickLeaveHours + accrual.sickLeaveHours) * 100) / 100;
      balances[emp.id] = bal;
    }
  }
  return balances;
}

export function outstandingLiabilities(data: LedgerData): { payg: number; super: number } {
  const finalisedRuns = (data.payRuns || []).filter((r) => r.status === 'finalised' && !r.voidedAt);
  const totalPayg = finalisedRuns.reduce((s, r) => s + r.paySlips.reduce((ss, p) => ss + p.paygWithheld, 0), 0);
  const totalSuper = finalisedRuns.reduce((s, r) => s + r.paySlips.reduce((ss, p) => ss + p.superAmount, 0), 0);
  const paygRemitted = (data.remittances || []).filter((r) => r.type === 'payg').reduce((s, r) => s + r.amount, 0);
  const superRemitted = (data.remittances || []).filter((r) => r.type === 'super').reduce((s, r) => s + r.amount, 0);
  return {
    payg: Math.max(0, Math.round((totalPayg - paygRemitted) * 100) / 100),
    super: Math.max(0, Math.round((totalSuper - superRemitted) * 100) / 100),
  };
}

export function remittanceJournalEntry(rem: Remittance, data: LedgerData): JournalEntry | null {
  const liabCode = rem.type === 'payg' ? PAYG_LIABILITY_CODE : SUPER_LIABILITY_CODE;
  const liabId = chartIdByCode(data, liabCode);
  const payAccount = rem.payAccountId
    ? data.accounts.find((a) => a.id === rem.payAccountId)
    : data.accounts[0];
  const bankId = payAccount?.chartAccountId;
  if (!liabId || !bankId) return null;
  return {
    id: `je_remittance_${rem.id}`,
    date: rem.date,
    memo: rem.memo || `${rem.type === 'payg' ? 'PAYG' : 'Super'} remittance to ATO`,
    sourceId: rem.id,
    lines: [
      { chartAccountId: liabId, debit: rem.amount, credit: 0 },
      { chartAccountId: bankId, debit: 0, credit: rem.amount },
    ],
  };
}

export function allRemittanceJournalEntries(data: LedgerData): JournalEntry[] {
  return (data.remittances || [])
    .map((r) => remittanceJournalEntry(r, data))
    .filter((e): e is JournalEntry => e !== null);
}

export function allPayrollJournalEntries(data: LedgerData): JournalEntry[] {
  return (data.payRuns || []).flatMap((run) => payRunJournalEntries(run, data));
}
