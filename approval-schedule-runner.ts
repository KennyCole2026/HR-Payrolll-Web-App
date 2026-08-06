import { generateApprovalScheduleHTML, generateApprovalScheduleExcel } from './md-approval-schedule';
import { writeFileSync } from 'fs';

// This should later come from DB, not hardcoded
const input = {
  companyName: 'Sample Company Ltd',
  periodLabel: 'JANUARY 2026',
  lines: [
    {
      staffName: 'ADEBIYI MICHAEL',
      departmentName: 'HEAD OFFICE',
      pensionEmployee: 22307.33,
      pensionEmployer: 27884.16,
      monthlyTaxPayable: 28048.78,
      otherDeductions: 3485.52,
      netPayment: 225000,
      otherEmolument: 275000,
    },
  ],
};

async function run() {
  const html = generateApprovalScheduleHTML(input);

  writeFileSync('./outputs/approval-schedule.html', html);

  const buffer = await generateApprovalScheduleExcel(input);

  writeFileSync('./outputs/approval-schedule.xlsx', Buffer.from(buffer));

  console.log('Approval schedule generated');
}

run();
