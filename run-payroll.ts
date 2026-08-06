import { supabase } from './supabase-client';
import { computeGrossToNet } from './payroll-engine';
import { generatePayslip } from './report-generator';

export async function runPayroll(companyId: string, period: string) {
  // 1. Fetch employees
  const { data: employees, error } = await supabase
    .from('employees')
    .select('*')
    .eq('company_id', companyId);

  if (error) throw error;

  const results = [];

  for (const emp of employees || []) {
    // 2. Run payroll engine
    const result = computeGrossToNet({
      grossSalary: emp.base_salary,
      state: emp.state,
      pensionRate: 0.08, // later from DB
      nhfRate: 0.025,
    });

    // 3. Generate payslip
    const payslip = generatePayslip(
      emp.full_name,
      period,
      result
    );

    results.push({
      employee_id: emp.id,
      company_id: companyId,
      period,
      gross_salary: result.grossSalary,
      net_salary: result.netPay,
      tax: result.monthlyTaxPayable,
      pension: result.pensionEmployee,
      nhf: result.nhf,
      payload: payslip,
    });
  }

  return results;
}
