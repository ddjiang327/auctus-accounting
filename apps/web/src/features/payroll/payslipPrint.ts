import type { Employee, LedgerData, PayRun, PaySlip } from '@auctus/shared-types';

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function slipHtml(slip: PaySlip, employee: Employee, run: PayRun, bizName: string, abn?: string): string {
  const hoursRow = slip.hours != null
    ? `<tr><td class="label">Hours</td><td class="val">${slip.hours.toFixed(2)} hrs</td></tr>`
    : '';
  const superFund = employee.superFundName ? `<p class="sub">Super fund: ${employee.superFundName}</p>` : '';

  return `
<div class="slip">
  <div class="header">
    <div class="biz">
      <div class="biz-name">${bizName}</div>
      ${abn ? `<div class="biz-abn">ABN ${abn}</div>` : ''}
    </div>
    <div class="title">PAY SLIP</div>
  </div>

  <div class="meta">
    <table>
      <tr><td class="label">Employee</td><td class="val">${employee.name}</td></tr>
      <tr><td class="label">Pay period</td><td class="val">${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}</td></tr>
      <tr><td class="label">Pay date</td><td class="val">${fmtDate(run.payDate)}</td></tr>
      ${hoursRow}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Earnings</div>
    <table>
      <tr><td class="label">Gross pay</td><td class="val">${fmt(slip.gross)}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Deductions</div>
    <table>
      <tr><td class="label">PAYG withholding</td><td class="val">${fmt(slip.paygWithheld)}</td></tr>
    </table>
  </div>

  <div class="net-row">
    <span class="net-label">Net pay</span>
    <span class="net-val">${fmt(slip.netPay)}</span>
  </div>

  <div class="super-note">
    <span>Superannuation (paid separately to fund)</span>
    <span>${fmt(slip.superAmount)}</span>
  </div>
  ${superFund}
</div>`;
}

export function printPaySlips(run: PayRun, data: LedgerData): void {
  const biz = data.settings.businessProfile;
  const bizName = biz?.name || 'Your Business';
  const abn = biz?.abn;

  const slipsHtml = run.paySlips.map((slip) => {
    const employee = data.employees.find((e) => e.id === slip.employeeId);
    if (!employee) return '';
    return slipHtml(slip, employee, run, bizName, abn);
  }).filter(Boolean).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pay Slips – ${fmtDate(run.payDate)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, Arial, sans-serif; font-size: 13px; color: #1a1916; }
.slip {
  width: 100%; max-width: 600px; margin: 0 auto;
  padding: 32px 40px; page-break-after: always;
}
.slip:last-child { page-break-after: avoid; }
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 2px solid #1a1916; padding-bottom: 12px; margin-bottom: 16px;
}
.biz-name { font-size: 17px; font-weight: 700; }
.biz-abn { font-size: 11px; color: #666; margin-top: 2px; }
.title { font-size: 20px; font-weight: 300; letter-spacing: 2px; color: #444; }
.meta { margin-bottom: 20px; }
.meta table, .section table { width: 100%; border-collapse: collapse; }
.meta td, .section td { padding: 4px 0; }
.label { color: #666; width: 45%; }
.val { font-weight: 600; text-align: right; }
.section { margin-bottom: 16px; }
.section-title {
  font-size: 11px; font-weight: 700; letter-spacing: 1px;
  text-transform: uppercase; color: #888;
  border-bottom: 1px solid #e5e3de; padding-bottom: 4px; margin-bottom: 8px;
}
.net-row {
  display: flex; justify-content: space-between; align-items: center;
  background: #1a1916; color: #fff; padding: 10px 14px;
  border-radius: 6px; margin: 8px 0;
  font-weight: 700; font-size: 15px;
}
.super-note {
  display: flex; justify-content: space-between;
  font-size: 12px; color: #666; margin-top: 10px; padding-top: 8px;
  border-top: 1px dashed #ddd;
}
.sub { font-size: 11px; color: #999; margin-top: 4px; }
@media print {
  body { margin: 0; }
  .slip { max-width: 100%; padding: 20px 30px; }
}
</style>
</head>
<body>${slipsHtml}</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
