import { useMemo, useState } from 'react';
import { printPaySlips } from './payslipPrint';
import {
  calculateHourlyGross,
  calculatePaySlip,
  computeLeaveBalances,
  currentFinancialYear,
  fmtMoney,
  generatePaymentSummaries,
  generateSTPCSV,
  markAllSubmitted,
  outstandingLiabilities,
  pendingSTPPayRuns,
  todayStr,
  uid,
} from '../../domain/accounting';
import { Modal } from '../../components/Modal';
import type {
  Employee,
  EmploymentBasis,
  LedgerData,
  PayFrequency,
  PayRun,
  PaySlip,
  PayType,
  Remittance,
  RemittanceType,
  STPSubmission,
} from '../../domain/models';

interface PayrollProps {
  data: LedgerData;
  onDataChange: (data: LedgerData) => void;
  canWrite?: boolean;
  onSaveEmployee?: (employee: Employee, mode: 'create' | 'update') => void | Promise<void>;
  onArchiveEmployee?: (employeeId: string) => void | Promise<void>;
  onCreatePayRun?: (payRun: PayRun) => void | Promise<void>;
  onFinalisePayRun?: (payRun: PayRun) => void | Promise<void>;
  onCreateRemittance?: (remittance: Remittance) => void | Promise<void>;
  onCreateSTPSubmission?: (submission: STPSubmission) => void | Promise<void>;
}

type Tab = 'employees' | 'payruns' | 'remittances' | 'stp';

const FREQ_LABELS: Record<PayFrequency, string> = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly' };
const BASIS_LABELS: Record<EmploymentBasis, string> = { full_time: 'Full-time', part_time: 'Part-time', casual: 'Casual' };

function blankEmployee(): Omit<Employee, 'id'> {
  return {
    name: '',
    payType: 'salary',
    payRate: 0,
    payFrequency: 'fortnightly',
    taxFreeThreshold: true,
    employmentBasis: 'full_time',
    ordinaryHoursPerWeek: 38,
    casualLoadingRate: 0.25,
  };
}

function defaultPeriod(): { start: string; end: string; payDate: string } {
  const now = new Date();
  const end = todayStr();
  const start = new Date(now);
  start.setDate(start.getDate() - 13);
  return { start: start.toISOString().slice(0, 10), end, payDate: end };
}

function hoursToDisplay(hours: number): string {
  const days = Math.floor(hours / 7.6);
  const rem = Math.round((hours - days * 7.6) * 10) / 10;
  return `${hours.toFixed(1)} hrs${days > 0 ? ` (${days}d${rem > 0 ? ` ${rem}h` : ''})` : ''}`;
}

function ordinaryHoursForPeriod(emp: Employee): number {
  const weeklyHours = emp.ordinaryHoursPerWeek ?? 38;
  const multiplier = emp.payFrequency === 'weekly' ? 1 : emp.payFrequency === 'fortnightly' ? 2 : 52 / 12;
  return Math.round(weeklyHours * multiplier * 100) / 100;
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Payroll({
  data,
  onDataChange,
  canWrite = true,
  onSaveEmployee,
  onArchiveEmployee,
  onCreatePayRun,
  onFinalisePayRun,
  onCreateRemittance,
  onCreateSTPSubmission,
}: PayrollProps) {
  const [tab, setTab] = useState<Tab>('employees');
  const [empModal, setEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState(blankEmployee());

  const [runModal, setRunModal] = useState(false);
  const [runPeriod, setRunPeriod] = useState(defaultPeriod());
  const [runAccountId, setRunAccountId] = useState('');
  const [runSlips, setRunSlips] = useState<Record<string, string>>({});
  const [runAdjustments, setRunAdjustments] = useState<Record<string, { allowance: string; deduction: string; reimbursement: string }>>({});

  const [remModal, setRemModal] = useState(false);
  const [remForm, setRemForm] = useState<Omit<Remittance, 'id'>>({ date: todayStr(), type: 'payg', amount: 0, payAccountId: '', memo: '' });

  const [stpModal, setStpModal] = useState(false);
  const [stpRun, setStpRun] = useState<PayRun | null>(null);
  const [stpRef, setStpRef] = useState('');

  const fy = useMemo(() => currentFinancialYear(), []);
  const activeEmployees = useMemo(() => (data.employees || []).filter((e) => !e.archivedAt), [data]);
  const payRuns = useMemo(() => [...(data.payRuns || [])].sort((a, b) => b.payDate.localeCompare(a.payDate)), [data]);
  const remittances = useMemo(() => [...(data.remittances || [])].sort((a, b) => b.date.localeCompare(a.date)), [data]);
  const leaveBalances = useMemo(() => computeLeaveBalances(data), [data]);
  const outstanding = useMemo(() => outstandingLiabilities(data), [data]);
  const stpPending = useMemo(() => pendingSTPPayRuns(data).sort((a, b) => b.payDate.localeCompare(a.payDate)), [data]);
  const stpSubmitted = useMemo(
    () => (data.stpSubmissions || []).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [data],
  );
  const paymentSummaries = useMemo(() => generatePaymentSummaries(data, fy.start, fy.end), [data, fy]);

  const totalPayroll = useMemo(
    () => payRuns.filter((r) => r.status === 'finalised').reduce((s, r) => s + r.paySlips.reduce((ss, p) => ss + p.gross, 0), 0),
    [payRuns],
  );

  function openNewEmployee() {
    setEditingEmp(null);
    setEmpForm(blankEmployee());
    setEmpModal(true);
  }

  function openEditEmployee(emp: Employee) {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name,
      payType: emp.payType,
      payRate: emp.payRate,
      payFrequency: emp.payFrequency,
      taxFreeThreshold: emp.taxFreeThreshold,
      employmentBasis: emp.employmentBasis ?? 'full_time',
      ordinaryHoursPerWeek: emp.ordinaryHoursPerWeek ?? 38,
      casualLoadingRate: emp.casualLoadingRate ?? 0.25,
      superFundName: emp.superFundName,
      tfn: emp.tfn,
    });
    setEmpModal(true);
  }

  async function saveEmployee() {
    if (!empForm.name.trim()) return;
    const employees = data.employees || [];
    if (editingEmp) {
      const employee = { ...editingEmp, ...empForm };
      if (onSaveEmployee) {
        await onSaveEmployee(employee, 'update');
      } else {
        onDataChange({ ...data, employees: employees.map((e) => e.id === editingEmp.id ? employee : e) });
      }
    } else {
      const employee = { ...empForm, id: uid() };
      if (onSaveEmployee) {
        await onSaveEmployee(employee, 'create');
      } else {
        onDataChange({ ...data, employees: [...employees, employee] });
      }
    }
    setEmpModal(false);
  }

  async function archiveEmployee(id: string) {
    if (onArchiveEmployee) {
      await onArchiveEmployee(id);
    } else {
      onDataChange({ ...data, employees: (data.employees || []).map((e) => e.id === id ? { ...e, archivedAt: new Date().toISOString() } : e) });
    }
  }

  function openNewPayRun() {
    const period = defaultPeriod();
    setRunPeriod(period);
    setRunAccountId(data.accounts[0]?.id || '');
    const slips: Record<string, string> = {};
    for (const emp of activeEmployees) {
      const periods = emp.payFrequency === 'weekly' ? 52 : emp.payFrequency === 'fortnightly' ? 26 : 12;
      slips[emp.id] = emp.payType === 'salary'
        ? String(Math.round((emp.payRate / periods) * 100) / 100)
        : String(ordinaryHoursForPeriod(emp));
    }
    setRunSlips(slips);
    setRunAdjustments({});
    setRunModal(true);
  }

  function previewSlips(): Array<PaySlip & { employee: Employee }> {
    return activeEmployees
      .filter((e) => Number(runSlips[e.id]) > 0)
      .map((e) => {
        const input = Number(runSlips[e.id]) || 0;
        const hours = e.payType === 'hourly' ? input : undefined;
        const gross = e.payType === 'hourly' ? calculateHourlyGross(e, input) : input;
        const adjustmentInput = runAdjustments[e.id];
        const allowance = Number(adjustmentInput?.allowance) || 0;
        const deduction = Number(adjustmentInput?.deduction) || 0;
        const reimbursement = Number(adjustmentInput?.reimbursement) || 0;
        const adjustments = [
          allowance > 0 ? { id: `${e.id}_allowance`, type: 'allowance' as const, label: 'Taxable allowance', amount: allowance, taxable: true, superable: true } : null,
          deduction > 0 ? { id: `${e.id}_deduction`, type: 'deduction' as const, label: 'Post-tax deduction', amount: deduction } : null,
          reimbursement > 0 ? { id: `${e.id}_reimbursement`, type: 'reimbursement' as const, label: 'Reimbursement', amount: reimbursement, taxable: false, superable: false } : null,
        ].filter((item): item is NonNullable<typeof item> => item !== null);
        const slip = calculatePaySlip(e, gross, adjustments);
        return { id: uid(), ...slip, hours, employee: e };
      });
  }

  async function savePayRun(finalise: boolean) {
    const slips = previewSlips();
    if (slips.length === 0) return;
    const payRun: PayRun = {
      id: uid(),
      periodStart: runPeriod.start,
      periodEnd: runPeriod.end,
      payDate: runPeriod.payDate,
      payAccountId: runAccountId || undefined,
      status: finalise ? 'finalised' : 'draft',
      paySlips: slips.map(({ employee: _e, ...s }) => s),
      createdAt: new Date().toISOString(),
      finalisedAt: finalise ? new Date().toISOString() : undefined,
    };
    if (onCreatePayRun) {
      await onCreatePayRun(payRun);
    } else {
      onDataChange({ ...data, payRuns: [...(data.payRuns || []), payRun] });
    }
    setRunModal(false);
  }

  async function finalisePayRun(run: PayRun) {
    if (onFinalisePayRun) {
      await onFinalisePayRun(run);
    } else {
      onDataChange({
        ...data,
        payRuns: (data.payRuns || []).map((r) =>
          r.id === run.id ? { ...r, status: 'finalised', finalisedAt: new Date().toISOString() } : r,
        ),
      });
    }
  }

  function openRemittance(type: RemittanceType) {
    setRemForm({ date: todayStr(), type, amount: type === 'payg' ? outstanding.payg : outstanding.super, payAccountId: data.accounts[0]?.id || '', memo: '' });
    setRemModal(true);
  }

  async function saveRemittance() {
    if (!remForm.amount || remForm.amount <= 0) return;
    const rem: Remittance = { ...remForm, id: uid() };
    if (onCreateRemittance) {
      await onCreateRemittance(rem);
    } else {
      onDataChange({ ...data, remittances: [...(data.remittances || []), rem] });
    }
    setRemModal(false);
  }

  function openMarkSubmitted(run: PayRun) {
    setStpRun(run);
    setStpRef('');
    setStpModal(true);
  }

  async function saveStpSubmission() {
    if (!stpRun) return;
    const sub: STPSubmission = {
      id: uid(),
      payRunId: stpRun.id,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
      referenceNumber: stpRef.trim() || undefined,
    };
    if (onCreateSTPSubmission) {
      await onCreateSTPSubmission(sub);
    } else {
      onDataChange({ ...data, stpSubmissions: [...(data.stpSubmissions || []), sub] });
    }
    setStpModal(false);
  }

  async function handleEOFY() {
    const newSubs = markAllSubmitted(data, fy.start, fy.end);
    if (newSubs.length === 0) return;
    if (onCreateSTPSubmission) {
      for (const submission of newSubs) {
        await onCreateSTPSubmission(submission);
      }
    } else {
      onDataChange({ ...data, stpSubmissions: [...(data.stpSubmissions || []), ...newSubs] });
    }
  }

  function handleExportCSV() {
    const fyRuns = (data.payRuns || []).filter(
      (r) => r.status === 'finalised' && !r.voidedAt && r.payDate >= fy.start && r.payDate <= fy.end,
    );
    const csv = generateSTPCSV(fyRuns, data);
    downloadCSV(`stp-${fy.label.replace(/\s/g, '-')}.csv`, csv);
  }

  const preview = runModal ? previewSlips() : [];
  const previewTotalGross = preview.reduce((s, p) => s + p.gross, 0);
  const previewTotalPayg = preview.reduce((s, p) => s + p.paygWithheld, 0);
  const previewTotalSuper = preview.reduce((s, p) => s + p.superAmount, 0);
  const previewTotalNet = preview.reduce((s, p) => s + p.netPay, 0);

  const hasOutstanding = outstanding.payg > 0 || outstanding.super > 0;

  return (
    <div className="inv-root">
      <div className="inv-summary">
        <div className="inv-stat">
          <span className="inv-stat-label">Employees</span>
          <span className="inv-stat-value">{activeEmployees.length}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Pay Runs</span>
          <span className="inv-stat-value">{payRuns.filter((r) => r.status === 'finalised').length}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Total Wages Paid</span>
          <span className="inv-stat-value">{fmtMoney(totalPayroll)}</span>
        </div>
        {stpPending.length > 0 && (
          <div className="inv-stat inv-stat-alert">
            <span className="inv-stat-label">STP Pending</span>
            <span className="inv-stat-value">{stpPending.length}</span>
          </div>
        )}
        {hasOutstanding && (
          <div className="inv-stat inv-stat-alert">
            <span className="inv-stat-label">Outstanding Liabilities</span>
            <span className="inv-stat-value">{fmtMoney(outstanding.payg + outstanding.super)}</span>
          </div>
        )}
      </div>

      <div className="inv-tabs">
        {(['employees', 'payruns', 'remittances', 'stp'] as Tab[]).map((t) => (
          <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'employees' ? 'Employees' : t === 'payruns' ? 'Pay Runs' : t === 'remittances' ? 'Remittances' : 'STP'}
          </button>
        ))}
        {canWrite && tab === 'employees' && (
          <button className="top-add" style={{ marginLeft: 'auto' }} onClick={openNewEmployee}>+ Add Employee</button>
        )}
        {canWrite && tab === 'payruns' && (
          <button className="top-add" style={{ marginLeft: 'auto' }} onClick={openNewPayRun} disabled={activeEmployees.length === 0}>+ New Pay Run</button>
        )}
      </div>

      <div className="payroll-estimate-banner">
        PAYG withholding shown here is an estimate based on annualised resident tax rates and simplified Medicare levy handling. Use ATO PAYG withholding tax tables or payroll advice before lodging or paying wages.
      </div>

      {tab === 'employees' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Name</th><th>Basis</th><th>Pay Type</th><th>Pay Rate</th><th>Frequency</th><th>Tax-Free</th><th className="num">Annual Leave</th><th className="num">Sick Leave</th><th></th></tr>
          </thead>
          <tbody>
            {activeEmployees.length === 0 && (
              <tr><td colSpan={9} className="empty-row">No employees yet. Click "+ Add Employee" to get started.</td></tr>
            )}
            {activeEmployees.map((e) => {
              const bal = leaveBalances[e.id];
              return (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td className="muted">{BASIS_LABELS[e.employmentBasis ?? 'full_time']}</td>
                  <td className="muted">{e.payType === 'salary' ? 'Salary' : 'Hourly'}</td>
                  <td className="num">{fmtMoney(e.payRate)}{e.payType === 'hourly' ? '/hr' : '/yr'}</td>
                  <td className="muted">{FREQ_LABELS[e.payFrequency]}</td>
                  <td className="muted">{e.taxFreeThreshold ? 'Yes' : 'No'}</td>
                  <td className="num muted">{bal ? hoursToDisplay(bal.annualLeaveHours) : '—'}</td>
                  <td className="num muted">{bal ? hoursToDisplay(bal.sickLeaveHours) : '—'}</td>
                  <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {canWrite && (
                      <>
                        <button className="btn-link" onClick={() => openEditEmployee(e)}>Edit</button>
                        <button className="btn-link text-danger" onClick={() => archiveEmployee(e.id)}>Archive</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tab === 'payruns' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Period</th><th>Pay Date</th><th className="num">Gross</th><th className="num">PAYG Est.</th><th className="num">Super</th><th className="num">Net Pay</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {payRuns.length === 0 && (
              <tr><td colSpan={8} className="empty-row">No pay runs yet. Add employees and click "+ New Pay Run".</td></tr>
            )}
            {payRuns.map((run) => {
              const gross = run.paySlips.reduce((s, p) => s + p.gross, 0);
              const payg = run.paySlips.reduce((s, p) => s + p.paygWithheld, 0);
              const superAmt = run.paySlips.reduce((s, p) => s + p.superAmount, 0);
              const net = run.paySlips.reduce((s, p) => s + p.netPay, 0);
              return (
                <tr key={run.id}>
                  <td>{run.periodStart} → {run.periodEnd}</td>
                  <td>{run.payDate}</td>
                  <td className="num">{fmtMoney(gross)}</td>
                  <td className="num">{fmtMoney(payg)}</td>
                  <td className="num">{fmtMoney(superAmt)}</td>
                  <td className="num">{fmtMoney(net)}</td>
                  <td><span className={`badge badge-${run.status === 'finalised' ? 'purchase' : 'adjustment'}`}>{run.status === 'finalised' ? 'Finalised' : 'Draft'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canWrite && run.status === 'draft' && (
                      <button className="btn-link" onClick={() => finalisePayRun(run)}>Finalise</button>
                    )}
                    {run.status === 'finalised' && run.paySlips.length > 0 && (
                      <button className="btn-link" onClick={() => printPaySlips(run, data)}>🖨 Pay Slips</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tab === 'remittances' && (
        <>
          <div className="remittance-summary">
            <div className="remittance-card">
              <div className="remittance-card-label">PAYG Withholding Payable</div>
              <div className={`remittance-card-amount ${outstanding.payg > 0 ? 'outstanding' : 'clear'}`}>{fmtMoney(outstanding.payg)}</div>
              {canWrite && outstanding.payg > 0 && (
                <button className="btn-primary remittance-btn" onClick={() => openRemittance('payg')}>Record Remittance</button>
              )}
            </div>
            <div className="remittance-card">
              <div className="remittance-card-label">Superannuation Payable</div>
              <div className={`remittance-card-amount ${outstanding.super > 0 ? 'outstanding' : 'clear'}`}>{fmtMoney(outstanding.super)}</div>
              {canWrite && outstanding.super > 0 && (
                <button className="btn-primary remittance-btn" onClick={() => openRemittance('super')}>Record Remittance</button>
              )}
            </div>
          </div>
          <table className="ledger-table" style={{ marginTop: 16 }}>
            <thead>
              <tr><th>Date</th><th>Type</th><th className="num">Amount</th><th>Account</th><th>Memo</th></tr>
            </thead>
            <tbody>
              {remittances.length === 0 && (
                <tr><td colSpan={5} className="empty-row">No remittances recorded yet.</td></tr>
              )}
              {remittances.map((r) => {
                const account = data.accounts.find((a) => a.id === r.payAccountId);
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td><span className={`badge badge-${r.type === 'payg' ? 'sale' : 'purchase'}`}>{r.type === 'payg' ? 'PAYG' : 'Super'}</span></td>
                    <td className="num">{fmtMoney(r.amount)}</td>
                    <td className="muted">{account ? `${account.icon || ''} ${account.name}` : '—'}</td>
                    <td className="muted">{r.memo || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {tab === 'stp' && (
        <>
          <div className="stp-header">
            <div className="stp-fy-badge">{fy.label}</div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {canWrite && stpPending.filter((r) => r.payDate >= fy.start && r.payDate <= fy.end).length > 0 && (
                <button className="top-add" onClick={handleEOFY}>Finalise All ({stpPending.filter((r) => r.payDate >= fy.start && r.payDate <= fy.end).length})</button>
              )}
              <button className="top-add" onClick={handleExportCSV}>Export CSV</button>
            </div>
          </div>

          {stpPending.length > 0 && (
            <>
              <div className="low-stock-banner" style={{ marginBottom: 8 }}>
                ⚠ {stpPending.length} pay run{stpPending.length > 1 ? 's' : ''} not yet reported to ATO
              </div>
              <table className="ledger-table">
                <thead>
                  <tr><th>Pay Date</th><th>Period</th><th className="num">Employees</th><th className="num">Gross</th><th className="num">PAYG Est.</th><th className="num">Super</th><th></th></tr>
                </thead>
                <tbody>
                  {stpPending.map((run) => {
                    const gross = run.paySlips.reduce((s, p) => s + p.gross, 0);
                    const payg = run.paySlips.reduce((s, p) => s + p.paygWithheld, 0);
                    const superAmt = run.paySlips.reduce((s, p) => s + p.superAmount, 0);
                    return (
                      <tr key={run.id}>
                        <td>{run.payDate}</td>
                        <td className="muted">{run.periodStart} → {run.periodEnd}</td>
                        <td className="num">{run.paySlips.length}</td>
                        <td className="num">{fmtMoney(gross)}</td>
                        <td className="num">{fmtMoney(payg)}</td>
                        <td className="num">{fmtMoney(superAmt)}</td>
                        <td>
                          {canWrite && (
                            <button className="btn-link" onClick={() => openMarkSubmitted(run)}>Mark Submitted</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          <div className="stp-section-title">Payment Summaries — {fy.label}</div>
          <table className="ledger-table">
            <thead>
              <tr><th>Employee</th><th>TFN</th><th className="num">YTD Gross</th><th className="num">YTD PAYG Est.</th><th className="num">YTD Super</th><th className="num">Allowances</th><th className="num">Deductions</th><th className="num">Reimb.</th><th className="num">Pay Runs</th></tr>
            </thead>
            <tbody>
              {paymentSummaries.length === 0 && (
                <tr><td colSpan={9} className="empty-row">No finalised pay runs in {fy.label} yet.</td></tr>
              )}
              {paymentSummaries.map((s) => (
                <tr key={s.employee.id}>
                  <td>{s.employee.name}</td>
                  <td className="muted">{s.employee.tfn || '—'}</td>
                  <td className="num">{fmtMoney(s.ytdGross)}</td>
                  <td className="num">{fmtMoney(s.ytdPayg)}</td>
                  <td className="num">{fmtMoney(s.ytdSuper)}</td>
                  <td className="num muted">{fmtMoney(s.ytdAllowances)}</td>
                  <td className="num muted">{fmtMoney(s.ytdDeductions)}</td>
                  <td className="num muted">{fmtMoney(s.ytdReimbursements)}</td>
                  <td className="num muted">{s.payRunCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {stpSubmitted.length > 0 && (
            <>
              <div className="stp-section-title">Submission History</div>
              <table className="ledger-table">
                <thead>
                  <tr><th>Submitted</th><th>Pay Date</th><th>Reference</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {stpSubmitted.map((sub) => {
                    const run = (data.payRuns || []).find((r) => r.id === sub.payRunId);
                    return (
                      <tr key={sub.id}>
                        <td>{sub.submittedAt.slice(0, 10)}</td>
                        <td className="muted">{run?.payDate || '—'}</td>
                        <td className="muted">{sub.referenceNumber || '—'}</td>
                        <td><span className="badge badge-purchase">{sub.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {empModal && (
        <Modal title={editingEmp ? 'Edit Employee' : 'Add Employee'} open={empModal} onClose={() => setEmpModal(false)}>
          <div className="form-grid">
            <label>Name *<input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} autoFocus /></label>
            <label>Pay Type
              <select value={empForm.payType} onChange={(e) => setEmpForm({ ...empForm, payType: e.target.value as PayType })}>
                <option value="salary">Salary</option>
                <option value="hourly">Hourly</option>
              </select>
            </label>
            <label>Employment Basis
              <select value={empForm.employmentBasis || 'full_time'} onChange={(e) => setEmpForm({ ...empForm, employmentBasis: e.target.value as EmploymentBasis })}>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="casual">Casual</option>
              </select>
            </label>
            <label>{empForm.payType === 'salary' ? 'Annual Salary' : 'Hourly Rate'}
              <input type="number" step="0.01" min="0" value={empForm.payRate} onChange={(e) => setEmpForm({ ...empForm, payRate: parseFloat(e.target.value) || 0 })} />
            </label>
            <label>Ordinary Hours / Week
              <input type="number" step="0.1" min="0" max="168" value={empForm.ordinaryHoursPerWeek ?? 38} onChange={(e) => setEmpForm({ ...empForm, ordinaryHoursPerWeek: parseFloat(e.target.value) || 0 })} />
            </label>
            {empForm.employmentBasis === 'casual' && (
              <label>Casual Loading %
                <input type="number" step="0.1" min="0" max="100" value={Math.round(((empForm.casualLoadingRate ?? 0.25) * 100) * 10) / 10} onChange={(e) => setEmpForm({ ...empForm, casualLoadingRate: (parseFloat(e.target.value) || 0) / 100 })} />
              </label>
            )}
            <label>Pay Frequency
              <select value={empForm.payFrequency} onChange={(e) => setEmpForm({ ...empForm, payFrequency: e.target.value as PayFrequency })}>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={empForm.taxFreeThreshold} onChange={(e) => setEmpForm({ ...empForm, taxFreeThreshold: e.target.checked })} />
              Claims tax-free threshold
            </label>
            <label>Super Fund<input value={empForm.superFundName || ''} onChange={(e) => setEmpForm({ ...empForm, superFundName: e.target.value })} placeholder="e.g. Australian Super" /></label>
            <label>TFN (optional)<input value={empForm.tfn || ''} onChange={(e) => setEmpForm({ ...empForm, tfn: e.target.value })} placeholder="000 000 000" /></label>
          </div>
          <div className="modal-actions">
            <button onClick={() => setEmpModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveEmployee} disabled={!empForm.name.trim()}>Save</button>
          </div>
        </Modal>
      )}

      {runModal && (
        <Modal title="New Pay Run" open={runModal} onClose={() => setRunModal(false)}>
          <div className="form-grid">
            <label>Period Start<input type="date" value={runPeriod.start} onChange={(e) => setRunPeriod({ ...runPeriod, start: e.target.value })} /></label>
            <label>Period End<input type="date" value={runPeriod.end} onChange={(e) => setRunPeriod({ ...runPeriod, end: e.target.value })} /></label>
            <label>Pay Date<input type="date" value={runPeriod.payDate} onChange={(e) => setRunPeriod({ ...runPeriod, payDate: e.target.value })} /></label>
            <label>Pay From Account
              <select value={runAccountId} onChange={(e) => setRunAccountId(e.target.value)}>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </label>
          </div>
          <table className="ledger-table" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Employee</th><th>Basis</th><th>Frequency</th><th className="num">Hours / Gross</th><th className="num">Allowance</th><th className="num">Deduction</th><th className="num">Reimb.</th><th className="num">Gross</th><th className="num">PAYG Est.</th><th className="num">Super</th><th className="num">Net</th></tr>
            </thead>
            <tbody>
              {activeEmployees.map((emp) => {
                const grossStr = runSlips[emp.id] || '';
                const adjustmentInput = runAdjustments[emp.id] || { allowance: '', deduction: '', reimbursement: '' };
                const input = Number(grossStr) || 0;
                const gross = emp.payType === 'hourly' ? calculateHourlyGross(emp, input) : input;
                const adjustments = [
                  Number(adjustmentInput.allowance) > 0 ? { type: 'allowance' as const, label: 'Taxable allowance', amount: Number(adjustmentInput.allowance), taxable: true, superable: true } : null,
                  Number(adjustmentInput.deduction) > 0 ? { type: 'deduction' as const, label: 'Post-tax deduction', amount: Number(adjustmentInput.deduction) } : null,
                  Number(adjustmentInput.reimbursement) > 0 ? { type: 'reimbursement' as const, label: 'Reimbursement', amount: Number(adjustmentInput.reimbursement), taxable: false, superable: false } : null,
                ].filter((item): item is NonNullable<typeof item> => item !== null);
                const slip = gross > 0 ? calculatePaySlip(emp, gross, adjustments) : null;
                const updateAdjustment = (key: keyof typeof adjustmentInput, value: string) => {
                  setRunAdjustments({
                    ...runAdjustments,
                    [emp.id]: { ...adjustmentInput, [key]: value },
                  });
                };
                return (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td className="muted">{BASIS_LABELS[emp.employmentBasis ?? 'full_time']}</td>
                    <td className="muted">{FREQ_LABELS[emp.payFrequency]}</td>
                    <td><input type="number" step="0.01" min="0" value={grossStr} onChange={(e) => setRunSlips({ ...runSlips, [emp.id]: e.target.value })} style={{ width: 90, textAlign: 'right' }} placeholder={emp.payType === 'hourly' ? 'Hours' : 'Gross'} /></td>
                    <td><input type="number" step="0.01" min="0" value={adjustmentInput.allowance} onChange={(e) => updateAdjustment('allowance', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.01" min="0" value={adjustmentInput.deduction} onChange={(e) => updateAdjustment('deduction', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.01" min="0" value={adjustmentInput.reimbursement} onChange={(e) => updateAdjustment('reimbursement', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td className="num muted">{gross > 0 ? fmtMoney(gross) : '—'}</td>
                    <td className="num muted">{slip ? fmtMoney(slip.paygWithheld) : '—'}</td>
                    <td className="num muted">{slip ? fmtMoney(slip.superAmount) : '—'}</td>
                    <td className="num">{slip ? fmtMoney(slip.netPay) : '—'}</td>
                  </tr>
                );
              })}
              {preview.length > 0 && (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                  <td colSpan={7}>Total</td>
                  <td className="num">{fmtMoney(previewTotalGross)}</td>
                  <td className="num">{fmtMoney(previewTotalPayg)}</td>
                  <td className="num">{fmtMoney(previewTotalSuper)}</td>
                  <td className="num">{fmtMoney(previewTotalNet)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button onClick={() => setRunModal(false)}>Cancel</button>
            <button onClick={() => savePayRun(false)} disabled={preview.length === 0}>Save as Draft</button>
            <button className="btn-primary" onClick={() => savePayRun(true)} disabled={preview.length === 0}>Finalise & Post</button>
          </div>
        </Modal>
      )}

      {remModal && (
        <Modal title="Record Remittance" open={remModal} onClose={() => setRemModal(false)}>
          <div className="form-grid">
            <label>Type
              <select value={remForm.type} onChange={(e) => setRemForm({ ...remForm, type: e.target.value as RemittanceType })}>
                <option value="payg">PAYG Withholding (to ATO)</option>
                <option value="super">Superannuation (to fund)</option>
              </select>
            </label>
            <label>Date<input type="date" value={remForm.date} onChange={(e) => setRemForm({ ...remForm, date: e.target.value })} /></label>
            <label>Amount<input type="number" step="0.01" min="0" value={remForm.amount} onChange={(e) => setRemForm({ ...remForm, amount: parseFloat(e.target.value) || 0 })} /></label>
            <label>Pay From Account
              <select value={remForm.payAccountId || ''} onChange={(e) => setRemForm({ ...remForm, payAccountId: e.target.value })}>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </label>
            <label>Memo<input value={remForm.memo || ''} onChange={(e) => setRemForm({ ...remForm, memo: e.target.value })} placeholder="Optional" /></label>
          </div>
          <p className="form-hint">
            {remForm.type === 'payg' ? `Outstanding PAYG payable: ${fmtMoney(outstanding.payg)}` : `Outstanding super payable: ${fmtMoney(outstanding.super)}`}
          </p>
          <div className="modal-actions">
            <button onClick={() => setRemModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveRemittance} disabled={!remForm.amount || remForm.amount <= 0}>Save</button>
          </div>
        </Modal>
      )}

      {stpModal && stpRun && (
        <Modal title="Mark Pay Run Submitted" open={stpModal} onClose={() => setStpModal(false)}>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
            Confirm you have submitted this pay event to the ATO via your STP gateway or the ATO's online tool.
          </p>
          <div className="form-grid">
            <label>Pay Date<input value={stpRun.payDate} disabled /></label>
            <label>Period<input value={`${stpRun.periodStart} → ${stpRun.periodEnd}`} disabled /></label>
            <label>Reference Number (optional)<input value={stpRef} onChange={(e) => setStpRef(e.target.value)} placeholder="ATO or gateway reference" /></label>
          </div>
          <div className="modal-actions">
            <button onClick={() => setStpModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveStpSubmission}>Confirm Submitted</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
