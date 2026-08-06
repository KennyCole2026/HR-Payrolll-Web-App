import { GrossToNetResult, EmployerCostResult } from './payroll-engine';

export interface Payslip {
  employeeName: string;
  period: string;

  earnings: {
    grossSalary: number;
    additions: number;
  };

  deductions: {
    tax: number;
    pension: number;
    nhf: number;
    other: number;
  };

  breakdown: GrossToNetResult;

  netPay: number;
}

export interface CompanyPayrollReport {
  totalGross: number;
  totalNet: number;
  totalTax: number;
  totalPension: number;
  employeeCount: number;
}

export function generatePayslip(
  employeeName: string,
  period: string,
  result: GrossToNetResult
): Payslip {
  return {
    employeeName,
    period,

    earnings: {
      grossSalary: result.grossSalary,
      additions: result.otherAdditionsTotal,
    },

    deductions: {
      tax: result.monthlyTaxPayable,
      pension: result.pensionEmployee,
      nhf: result.nhf,
      other: result.otherDeductionsTotal,
    },

    breakdown: result,

    netPay: result.netPay,
  };
}

export function generateCompanyReport(
  results: GrossToNetResult[]
): CompanyPayrollReport {
  let totalGross = 0;
  let totalNet = 0;
  let totalTax = 0;
  let totalPension = 0;

  for (const r of results) {
    totalGross += r.grossSalary;
    totalNet += r.netPay;
    totalTax += r.monthlyTaxPayable;
    totalPension += r.pensionEmployee;
  }

  return {
    totalGross,
    totalNet,
    totalTax,
    totalPension,
    employeeCount: results.length,
  };
}
