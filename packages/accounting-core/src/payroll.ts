import type { Employee, JournalEntry, LedgerData, PayAdjustment, PayRun, PaySlip, Remittance } from '@auctus/shared-types';

const SUPER_RATE = 0.12; // 12% from 1 July 2025
const WAGES_CODE = '7000';
const SUPER_EXPENSE_CODE = '7080';
const REIMBURSEMENT_EXPENSE_CODE = '7090';
const PAYG_LIABILITY_CODE = '2400';
const SUPER_LIABILITY_CODE = '2410';
const DEDUCTIONS_LIABILITY_CODE = '2420';
const MEDICARE_LEVY_RATE = 0.02;

function chartIdByCode(data: LedgerData, code: string): string | undefined {
  return data.chartOfAccounts.find((a) => a.code === code)?.id;
}

function periodsPerYear(freq: Employee['payFrequency']): number {
  return freq === 'weekly' ? 52 : freq === 'fortnightly' ? 26 : 12;
}

function annualTaxWithThreshold(income: number): number {
  if (income <= 18200) return 0;
  if (income <= 45000) return (income - 18200) * 0.16;
  if (income <= 135000) return 4288 + (income - 45000) * 0.3;
  if (income <= 190000) return 31288 + (income - 135000) * 0.37;
  return 51638 + (income - 190000) * 0.45;
}

function annualTaxNoThreshold(income: number): number {
  // Estimate for employees not claiming the tax-free threshold using current resident rates from the first dollar.
  if (income <= 45000) return income * 0.16;
  if (income <= 135000) return 7200 + (income - 45000) * 0.3;
  if (income <= 190000) return 34200 + (income - 135000) * 0.37;
  return 54550 + (income - 190000) * 0.45;
}

function medicareLevy(income: number): number {
  if (income <= 26000) return 0;
  return income * MEDICARE_LEVY_RATE;
}

// PAYG withholding is an estimate based on annualised resident rates plus a simplified Medicare levy.
// It is not a substitute for the ATO PAYG withholding tax tables or payroll specialist review.
export function calculatePayg(annualGross: number, taxFreeThreshold: boolean): number {
  const baseTax = taxFreeThreshold
    ? annualTaxWithThreshold(annualGross)
    : annualTaxNoThreshold(annualGross);
  return Math.round(baseTax + medicareLevy(annualGross));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePaySlip(employee: Employee, gross: number, adjustments: PayAdjustment[] = []): Omit<PaySlip, 'id'> {
  const cleanedAdjustments = adjustments
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
    .map((item) => ({ ...item, amount: roundMoney(item.amount) }));
  const taxableAllowances = cleanedAdjustments
    .filter((item) => item.type === 'allowance' && item.taxable !== false)
    .reduce((sum, item) => sum + item.amount, 0);
  const superableAllowances = cleanedAdjustments
    .filter((item) => item.type === 'allowance' && item.superable !== false)
    .reduce((sum, item) => sum + item.amount, 0);
  const deductions = cleanedAdjustments
    .filter((item) => item.type === 'deduction')
    .reduce((sum, item) => sum + item.amount, 0);
  const reimbursements = cleanedAdjustments
    .filter((item) => item.type === 'reimbursement')
    .reduce((sum, item) => sum + item.amount, 0);
  const taxableGross = roundMoney(gross + taxableAllowances);
  const superableGross = roundMoney(gross + superableAllowances);
  const periods = periodsPerYear(employee.payFrequency);
  const annualGross = taxableGross * periods;
  const annualPayg = calculatePayg(annualGross, employee.taxFreeThreshold);
  const paygWithheld = roundMoney(annualPayg / periods);
  const superAmount = roundMoney(superableGross * SUPER_RATE);
  const netPay = roundMoney(taxableGross - paygWithheld - deductions + reimbursements);
  return {
    employeeId: employee.id,
    gross: taxableGross,
    paygWithheld,
    superAmount,
    netPay,
    adjustments: cleanedAdjustments.length ? cleanedAdjustments : undefined,
  };
}

export function payRunJournalEntries(payRun: PayRun, data: LedgerData): JournalEntry[] {
  if (payRun.status !== 'finalised' || payRun.voidedAt) return [];
  const wagesId = chartIdByCode(data, WAGES_CODE);
  const superExpId = chartIdByCode(data, SUPER_EXPENSE_CODE);
  const reimbursementExpId = chartIdByCode(data, REIMBURSEMENT_EXPENSE_CODE);
  const paygLiabId = chartIdByCode(data, PAYG_LIABILITY_CODE);
  const superLiabId = chartIdByCode(data, SUPER_LIABILITY_CODE);
  const deductionsLiabId = chartIdByCode(data, DEDUCTIONS_LIABILITY_CODE);
  if (!wagesId || !paygLiabId) return [];

  const totalGross = roundMoney(payRun.paySlips.reduce((s, p) => s + p.gross, 0));
  const totalPayg = roundMoney(payRun.paySlips.reduce((s, p) => s + p.paygWithheld, 0));
  const totalSuper = roundMoney(payRun.paySlips.reduce((s, p) => s + p.superAmount, 0));
  const totalNet = roundMoney(payRun.paySlips.reduce((s, p) => s + p.netPay, 0));
  const totalDeductions = roundMoney(payRun.paySlips.reduce((sum, slip) => (
    sum + (slip.adjustments || [])
      .filter((adjustment) => adjustment.type === 'deduction')
      .reduce((inner, adjustment) => inner + adjustment.amount, 0)
  ), 0));
  const totalReimbursements = roundMoney(payRun.paySlips.reduce((sum, slip) => (
    sum + (slip.adjustments || [])
      .filter((adjustment) => adjustment.type === 'reimbursement')
      .reduce((inner, adjustment) => inner + adjustment.amount, 0)
  ), 0));

  const payAccount = payRun.payAccountId
    ? data.accounts.find((a) => a.id === payRun.payAccountId)
    : data.accounts[0];
  const bankId = payAccount?.chartAccountId;

  const entries: JournalEntry[] = [];

  // Payroll cash journal: Dr Wages/Reimbursements / Cr PAYG, deductions payable, and bank net pay.
  if (totalGross > 0 || totalReimbursements > 0) {
    const lines: JournalEntry['lines'] = [
      { chartAccountId: paygLiabId, debit: 0, credit: totalPayg },
    ];
    if (totalGross > 0) {
      lines.unshift({ chartAccountId: wagesId, debit: totalGross, credit: 0 });
    }
    if (totalReimbursements > 0) {
      lines.push({ chartAccountId: reimbursementExpId || wagesId, debit: totalReimbursements, credit: 0 });
    }
    if (totalDeductions > 0) {
      lines.push({ chartAccountId: deductionsLiabId || paygLiabId, debit: 0, credit: totalDeductions });
    }
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

function ordinaryHoursPerWeek(employee: Employee): number {
  return Number.isFinite(employee.ordinaryHoursPerWeek) && (employee.ordinaryHoursPerWeek ?? 0) > 0
    ? Number(employee.ordinaryHoursPerWeek)
    : STANDARD_HOURS_PER_WEEK;
}

function isCasual(employee: Employee): boolean {
  return employee.employmentBasis === 'casual';
}

export function calculateHourlyGross(employee: Employee, hours: number): number {
  const base = Math.max(0, hours) * employee.payRate;
  const loading = isCasual(employee) ? (employee.casualLoadingRate ?? 0.25) : 0;
  return Math.round(base * (1 + loading) * 100) / 100;
}

export function periodicLeaveAccrual(employee: Employee): { annualLeaveHours: number; sickLeaveHours: number } {
  if (isCasual(employee)) {
    return { annualLeaveHours: 0, sickLeaveHours: 0 };
  }
  const periods = periodsPerYear(employee.payFrequency);
  const weeklyHours = ordinaryHoursPerWeek(employee);
  const annualLeaveHoursPerYear = weeklyHours * 4;
  const sickLeaveHoursPerYear = weeklyHours * 2;
  return {
    annualLeaveHours: Math.round((annualLeaveHoursPerYear / periods) * 100) / 100,
    sickLeaveHours: Math.round((sickLeaveHoursPerYear / periods) * 100) / 100,
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
