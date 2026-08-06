import ExcelJS from 'exceljs';

export interface ApprovalScheduleLine {
  staffName: string;
  departmentName: string;
  pensionEmployee: number;
  pensionEmployer: number;
  monthlyTaxPayable: number;
  otherDeductions: number;
  netPayment: number;
  otherEmolument: number;
}

export interface ApprovalScheduleInput {
  companyName: string;
  periodLabel: string;
  lines: ApprovalScheduleLine[];
}

function formatNaira(n: number): string {
  return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateApprovalScheduleHTML(input: ApprovalScheduleInput): string {
  const totals = input.lines.reduce(
    (acc, l) => {
      acc.pensionEmployee += l.pensionEmployee;
      acc.pensionEmployer += l.pensionEmployer;
      acc.monthlyTaxPayable += l.monthlyTaxPayable;
      acc.otherDeductions += l.otherDeductions;
      acc.netPayment += l.netPayment;
      acc.otherEmolument += l.otherEmolument;
      return acc;
    },
    { pensionEmployee: 0, pensionEmployer: 0, monthlyTaxPayable: 0, otherDeductions: 0, netPayment: 0, otherEmolument: 0 }
  );

  const rows = input.lines.map((l, i) => `
      <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="cell-num">${i + 1}</td>
        <td class="cell-name">${l.staffName}</td>
        <td class="cell-dept">${l.departmentName}</td>
        <td class="cell-money">${formatNaira(l.pensionEmployee)}</td>
        <td class="cell-money">${formatNaira(l.pensionEmployer)}</td>
        <td class="cell-money">${formatNaira(l.monthlyTaxPayable)}</td>
        <td class="cell-money">${formatNaira(l.otherDeductions)}</td>
        <td class="cell-money cell-net">${formatNaira(l.netPayment)}</td>
        <td class="cell-money">${formatNaira(l.otherEmolument)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MD Approval Schedule — ${input.companyName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background: #f0f2f5; padding: 40px 20px; color: #1a1a2e; }
  .report-container { max-width: 1100px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
  .report-header { background: linear-gradient(135deg, #0f4c75 0%, #1b6ca8 100%); padding: 32px 40px; color: #ffffff; }
  .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .company-name { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
  .logo-placeholder { width: 56px; height: 56px; background: rgba(255,255,255,0.15); border: 2px dashed rgba(255,255,255,0.4); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: rgba(255,255,255,0.7); text-align: center; line-height: 1.2; }
  .period-label { font-size: 15px; opacity: 0.9; margin-top: 4px; }
  .report-title { font-size: 18px; font-weight: 600; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); }
  .table-wrapper { padding: 24px 40px 40px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { background: #0f4c75; color: #ffffff; padding: 12px 10px; text-align: center; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; border-right: 1px solid rgba(255,255,255,0.15); }
  thead th:last-child { border-right: none; }
  thead th:first-child { border-top-left-radius: 8px; }
  thead th:last-child { border-top-right-radius: 8px; }
  tbody td { padding: 10px; border-bottom: 1px solid #e8e8e8; text-align: center; }
  .cell-num { font-weight: 600; color: #6c757d; width: 40px; }
  .cell-name { text-align: left; font-weight: 600; }
  .cell-dept { text-align: left; color: #6c757d; }
  .cell-money { font-family: 'Consolas', 'Courier New', monospace; text-align: right; }
  .cell-net { font-weight: 700; color: #0f4c75; }
  .row-even { background: #ffffff; }
  .row-odd { background: #f8f9fa; }
  tfoot td { background: #e9ecef; font-weight: 700; padding: 14px 10px; text-align: center; font-size: 13px; border-top: 2px solid #0f4c75; }
  tfoot td.cell-money { font-family: 'Consolas', 'Courier New', monospace; text-align: right; color: #0f4c75; }
  .footer { padding: 20px 40px 32px; display: flex; justify-content: space-between; gap: 40px; }
  .sign-block { flex: 1; text-align: center; }
  .sign-label { font-size: 12px; color: #6c757d; margin-bottom: 48px; }
  .sign-line { border-top: 1px solid #333; padding-top: 6px; font-size: 13px; font-weight: 600; }
  .sign-sub { font-size: 11px; color: #999; margin-top: 2px; }
</style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <div class="header-top">
        <div>
          <div class="company-name">${input.companyName}</div>
          <div class="period-label">Payroll Period: ${input.periodLabel}</div>
        </div>
        <div class="logo-placeholder">LOGO</div>
      </div>
      <div class="report-title">Managing Director's Approval Schedule</div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>S/N</th><th>Staff Name</th><th>Department</th><th>Pension (Emp)</th><th>Pension (Emplr)</th><th>Tax (PAYE)</th><th>Other Deductions</th><th>Net Payment</th><th>Other Emolument</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="3">TOTAL</td><td class="cell-money">${formatNaira(totals.pensionEmployee)}</td><td class="cell-money">${formatNaira(totals.pensionEmployer)}</td><td class="cell-money">${formatNaira(totals.monthlyTaxPayable)}</td><td class="cell-money">${formatNaira(totals.otherDeductions)}</td><td class="cell-money">${formatNaira(totals.netPayment)}</td><td class="cell-money">${formatNaira(totals.otherEmolument)}</td></tr>
        </tfoot>
      </table>
    </div>
    <div class="footer">
      <div class="sign-block"><div class="sign-label">Prepared By</div><div class="sign-line">HR / Finance</div><div class="sign-sub">Date: _______________</div></div>
      <div class="sign-block"><div class="sign-label">Approved By</div><div class="sign-line">Managing Director</div><div class="sign-sub">Date: _______________</div></div>
    </div>
  </div>
</body>
</html>`;
}

export async function generateApprovalScheduleExcel(input: ApprovalScheduleInput): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HR Payroll SaaS';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('MD Approval Schedule', { views: [{ state: 'frozen', ySplit: 5 }] });
  sheet.columns = [
    { header: 'S/N', key: 'sn', width: 6 },
    { header: 'Staff Name', key: 'staffName', width: 28 },
    { header: 'Department', key: 'departmentName', width: 20 },
    { header: 'Pension (Emp)', key: 'pensionEmployee', width: 16 },
    { header: 'Pension (Emplr)', key: 'pensionEmployer', width: 16 },
    { header: 'Tax (PAYE)', key: 'monthlyTaxPayable', width: 16 },
    { header: 'Other Deductions', key: 'otherDeductions', width: 16 },
    { header: 'Net Payment', key: 'netPayment', width: 18 },
    { header: 'Other Emolument', key: 'otherEmolument', width: 16 },
  ];
  sheet.mergeCells('A1:I1');
  const companyCell = sheet.getCell('A1');
  companyCell.value = input.companyName;
  companyCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  companyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  companyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C75' } };
  sheet.getRow(1).height = 32;
  sheet.mergeCells('A2:I2');
  const periodCell = sheet.getCell('A2');
  periodCell.value = `Payroll Period: ${input.periodLabel}`;
  periodCell.font = { size: 12, color: { argb: 'FFFFFFFF' } };
  periodCell.alignment = { horizontal: 'center', vertical: 'middle' };
  periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } };
  sheet.getRow(2).height = 24;
  sheet.mergeCells('A3:I3');
  const titleCell = sheet.getCell('A3');
  titleCell.value = "Managing Director's Approval Schedule";
  titleCell.font = { size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } };
  sheet.getRow(3).height = 24;
  sheet.getRow(4).height = 8;
  const headerRow = sheet.getRow(5);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C75' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 28;
  headerRow.eachCell((cell) => { cell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } }; });
  input.lines.forEach((line, i) => {
    const row = sheet.addRow({ sn: i + 1, staffName: line.staffName, departmentName: line.departmentName, pensionEmployee: line.pensionEmployee, pensionEmployer: line.pensionEmployer, monthlyTaxPayable: line.monthlyTaxPayable, otherDeductions: line.otherDeductions, netPayment: line.netPayment, otherEmolument: line.otherEmolument });
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    row.font = { size: 11 };
    row.eachCell((cell, colNumber) => {
      if (colNumber >= 4) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
      if (colNumber === 8) { cell.font = { bold: true, size: 11 }; }
      if (i % 2 === 1) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }; }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE8E8E8' } } };
    });
  });
  const totals = input.lines.reduce((acc, l) => { acc.pensionEmployee += l.pensionEmployee; acc.pensionEmployer += l.pensionEmployer; acc.monthlyTaxPayable += l.monthlyTaxPayable; acc.otherDeductions += l.otherDeductions; acc.netPayment += l.netPayment; acc.otherEmolument += l.otherEmolument; return acc; }, { pensionEmployee: 0, pensionEmployer: 0, monthlyTaxPayable: 0, otherDeductions: 0, netPayment: 0, otherEmolument: 0 });
  const totalRow = sheet.addRow({ sn: '', staffName: 'TOTAL', departmentName: '', pensionEmployee: totals.pensionEmployee, pensionEmployer: totals.pensionEmployer, monthlyTaxPayable: totals.monthlyTaxPayable, otherDeductions: totals.otherDeductions, netPayment: totals.netPayment, otherEmolument: totals.otherEmolument });
  totalRow.font = { bold: true, size: 12, color: { argb: 'FF0F4C75' } };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
  totalRow.alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
  totalRow.eachCell((cell, colNumber) => { if (colNumber >= 4) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; } cell.border = { top: { style: 'double', color: { argb: 'FF0F4C75' } }, bottom: { style: 'thin', color: { argb: 'FF0F4C75' } } }; });
  sheet.addRow([]); sheet.addRow([]);
  const signRow = sheet.addRow([]);
  signRow.getCell(2).value = 'Prepared By: HR / Finance'; signRow.getCell(2).font = { size: 11, bold: true };
  signRow.getCell(7).value = 'Approved By: Managing Director'; signRow.getCell(7).font = { size: 11, bold: true };
  const dateRow = sheet.addRow([]);
  dateRow.getCell(2).value = 'Date: _______________'; dateRow.getCell(2).font = { size: 10, color: { argb: 'FF999999' } };
  dateRow.getCell(7).value = 'Date: _______________'; dateRow.getCell(7).font = { size: 10, color: { argb: 'FF999999' } };
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
