import { useMemo, useState } from 'react';
import { calculatePaySlip, fmtMoney, todayStr, uid } from '../../domain/accounting';
import { Modal } from '../../components/Modal';
import type { Employee, LedgerData, PayFrequency, PayRun, PaySlip, PayType } from '../../domain/models';

interface PayrollProps {
  data: LedgerData;
  onDataChange: (data: LedgerData) => void;
  canWrite?: boolean;
}

type Tab = 'employees' | 'payruns';

const FREQ_LABELS: Record<PayFrequency, string> = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly' };

function blankEmployee(): Omit<Employee, 'id'> {
  return { name: '', payType: 'salary', payRate: 0, payFrequency: 'fortnightly', taxFreeThreshold: true };
}

function defaultPeriod(): { start: string; end: string; payDate: string } {
  const now = new Date();
  const end = todayStr();
  const start = new Date(now);
  start.setDate(start.getDate() - 13);
  return { start: start.toISOString().slice(0, 10), end, payDate: end };
}

export function Payroll({ data, onDataChange, canWrite = true }: PayrollProps) {
  const [tab, setTab] = useState<Tab>('employees');
  const [empModal, setEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState(blankEmployee());

  const [runModal, setRunModal] = useState(false);
  const [runPeriod, setRunPeriod] = useState(defaultPeriod());
  const [runAccountId, setRunAccountId] = useState('');
  const [runSlips, setRunSlips] = useState<Record<string, string>>({}); // employeeId -> gross string

  const activeEmployees = useMemo(() => (data.employees || []).filter((e) => !e.archivedAt), [data]);
  const payRuns = useMemo(() => [...(data.payRuns || [])].sort((a, b) => b.payDate.localeCompare(a.payDate)), [data]);

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
    setEmpForm({ name: emp.name, payType: emp.payType, payRate: emp.payRate, payFrequency: emp.payFrequency, taxFreeThreshold: emp.taxFreeThreshold, superFundName: emp.superFundName, tfn: emp.tfn });
    setEmpModal(true);
  }

  function saveEmployee() {
    if (!empForm.name.trim()) return;
    const employees = data.employees || [];
    if (editingEmp) {
      onDataChange({ ...data, employees: employees.map((e) => e.id === editingEmp.id ? { ...editingEmp, ...empForm } : e) });
    } else {
      onDataChange({ ...data, employees: [...employees, { ...empForm, id: uid() }] });
    }
    setEmpModal(false);
  }

  function archiveEmployee(id: string) {
    onDataChange({ ...data, employees: (data.employees || []).map((e) => e.id === id ? { ...e, archivedAt: new Date().toISOString() } : e) });
  }

  function openNewPayRun() {
    const period = defaultPeriod();
    setRunPeriod(period);
    setRunAccountId(data.accounts[0]?.id || '');
    const slips: Record<string, string> = {};
    for (const emp of activeEmployees) {
      const periods = emp.payFrequency === 'weekly' ? 52 : emp.payFrequency === 'fortnightly' ? 26 : 12;
      slips[emp.id] = emp.payType === 'salary' ? String(Math.round((emp.payRate / periods) * 100) / 100) : '';
    }
    setRunSlips(slips);
    setRunModal(true);
  }

  function previewSlips(): Array<PaySlip & { employee: Employee }> {
    return activeEmployees
      .filter((e) => Number(runSlips[e.id]) > 0)
      .map((e) => {
        const gross = Number(runSlips[e.id]) || 0;
        const slip = calculatePaySlip(e, gross);
        return { id: uid(), ...slip, employee: e };
      });
  }

  function savePayRun(finalise: boolean) {
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
    onDataChange({ ...data, payRuns: [...(data.payRuns || []), payRun] });
    setRunModal(false);
  }

  function finalisePayRun(run: PayRun) {
    onDataChange({
      ...data,
      payRuns: (data.payRuns || []).map((r) =>
        r.id === run.id ? { ...r, status: 'finalised', finalisedAt: new Date().toISOString() } : r,
      ),
    });
  }

  const preview = runModal ? previewSlips() : [];
  const previewTotalGross = preview.reduce((s, p) => s + p.gross, 0);
  const previewTotalPayg = preview.reduce((s, p) => s + p.paygWithheld, 0);
  const previewTotalSuper = preview.reduce((s, p) => s + p.superAmount, 0);
  const previewTotalNet = preview.reduce((s, p) => s + p.netPay, 0);

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
      </div>

      <div className="inv-tabs">
        {(['employees', 'payruns'] as Tab[]).map((t) => (
          <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'employees' ? 'Employees' : 'Pay Runs'}
          </button>
        ))}
        {canWrite && tab === 'employees' && (
          <button className="top-add" style={{ marginLeft: 'auto' }} onClick={openNewEmployee}>+ Add Employee</button>
        )}
        {canWrite && tab === 'payruns' && (
          <button className="top-add" style={{ marginLeft: 'auto' }} onClick={openNewPayRun} disabled={activeEmployees.length === 0}>+ New Pay Run</button>
        )}
      </div>

      {tab === 'employees' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Name</th><th>Pay Type</th><th>Pay Rate</th><th>Frequency</th><th>Tax-Free Threshold</th><th>Super Fund</th><th></th></tr>
          </thead>
          <tbody>
            {activeEmployees.length === 0 && (
              <tr><td colSpan={7} className="empty-row">No employees yet. Click "+ Add Employee" to get started.</td></tr>
            )}
            {activeEmployees.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td className="muted">{e.payType === 'salary' ? 'Salary' : 'Hourly'}</td>
                <td className="num">{fmtMoney(e.payRate)}{e.payType === 'hourly' ? '/hr' : '/yr'}</td>
                <td className="muted">{FREQ_LABELS[e.payFrequency]}</td>
                <td className="muted">{e.taxFreeThreshold ? 'Yes' : 'No'}</td>
                <td className="muted">{e.superFundName || '—'}</td>
                <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {canWrite && (
                    <>
                      <button className="btn-link" onClick={() => openEditEmployee(e)}>Edit</button>
                      <button className="btn-link text-danger" onClick={() => archiveEmployee(e.id)}>Archive</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'payruns' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Period</th><th>Pay Date</th><th className="num">Gross</th><th className="num">PAYG</th><th className="num">Super</th><th className="num">Net Pay</th><th>Status</th><th></th></tr>
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
                  <td>
                    {canWrite && run.status === 'draft' && (
                      <button className="btn-link" onClick={() => finalisePayRun(run)}>Finalise</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
            <label>{empForm.payType === 'salary' ? 'Annual Salary' : 'Hourly Rate'}
              <input type="number" step="0.01" min="0" value={empForm.payRate} onChange={(e) => setEmpForm({ ...empForm, payRate: parseFloat(e.target.value) || 0 })} />
            </label>
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
              <tr><th>Employee</th><th>Frequency</th><th className="num">Gross</th><th className="num">PAYG</th><th className="num">Super</th><th className="num">Net</th></tr>
            </thead>
            <tbody>
              {activeEmployees.map((emp) => {
                const grossStr = runSlips[emp.id] || '';
                const gross = Number(grossStr) || 0;
                const slip = gross > 0 ? calculatePaySlip(emp, gross) : null;
                return (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td className="muted">{FREQ_LABELS[emp.payFrequency]}</td>
                    <td><input type="number" step="0.01" min="0" value={grossStr} onChange={(e) => setRunSlips({ ...runSlips, [emp.id]: e.target.value })} style={{ width: 90, textAlign: 'right' }} /></td>
                    <td className="num muted">{slip ? fmtMoney(slip.paygWithheld) : '—'}</td>
                    <td className="num muted">{slip ? fmtMoney(slip.superAmount) : '—'}</td>
                    <td className="num">{slip ? fmtMoney(slip.netPay) : '—'}</td>
                  </tr>
                );
              })}
              {preview.length > 0 && (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                  <td colSpan={2}>Total</td>
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
    </div>
  );
}
