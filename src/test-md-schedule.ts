import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateApprovalScheduleHTML, generateApprovalScheduleExcel } from './md-approval-schedule';
import { testSupabaseConnection } from './supabase-client';

const sampleInput = {
  companyName: 'Acme Manufacturing Ltd',
  periodLabel: 'JANUARY 2026',
  lines: [
    {
      staffName: 'ADEBIYI MICHAEL',
      departmentName: 'Head Office',
      pensionEmployee: 22307.33,
      pensionEmployer: 27884.16,
      monthlyTaxPayable: 28048.78,
      otherDeductions: 3485.52,
      netPayment: 225000.0,
      otherEmolument: 275000.0,
    },
    {
      staffName: 'OKAFOR CHINEDU',
      departmentName: 'Operations',
      pensionEmployee: 18000.0,
      pensionEmployer: 22500.0,
      monthlyTaxPayable: 19250.5,
      otherDeductions: 1500.0,
      netPayment: 180000.0,
      otherEmolument: 220000.0,
    },
    {
      staffName: 'FATIMA BELLO',
      departmentName: 'Finance',
      pensionEmployee: 31200.0,
      pensionEmployer: 39000.0,
      monthlyTaxPayable: 45600.25,
      otherDeductions: 5200.0,
      netPayment: 312000.0,
      otherEmolument: 388000.0,
    },
    {
      staffName: 'EMEKA OBI',
      departmentName: 'Sales',
      pensionEmployee: 15600.0,
      pensionEmployer: 19500.0,
      monthlyTaxPayable: 14800.0,
      otherDeductions: 0.0,
      netPayment: 156000.0,
      otherEmolument: 190000.0,
    },
    {
      staffName: 'GRACE AKINOLA',
      departmentName: 'Human Resources',
      pensionEmployee: 26800.0,
      pensionEmployer: 33500.0,
      monthlyTaxPayable: 34200.75,
      otherDeductions: 2800.0,
      netPayment: 268000.0,
      otherEmolument: 332000.0,
    },
  ],
};

async function main() {
  console.log('=== MD Approval Schedule Test Runner ===\n');

  console.log('1. Testing Supabase connection...');
  const connected = await testSupabaseConnection();
  if (!connected) {
    console.error('   Supabase connection failed. Continuing with report generation...\n');
  }

  const outputsDir = join(process.cwd(), 'outputs');
  mkdirSync(outputsDir, { recursive: true });

  console.log('2. Generating HTML report...');
  const html = generateApprovalScheduleHTML(sampleInput);
  const htmlPath = join(outputsDir, 'sample.html');
  writeFileSync(htmlPath, html);
  console.log(`   HTML generated: ${htmlPath}`);

  console.log('3. Generating Excel report...');
  const excelBuffer = await generateApprovalScheduleExcel(sampleInput);
  const excelPath = join(outputsDir, 'sample.xlsx');
  writeFileSync(excelPath, Buffer.from(excelBuffer));
  console.log(`   Excel generated: ${excelPath}`);

  console.log('\n=== All reports generated successfully ===');
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
