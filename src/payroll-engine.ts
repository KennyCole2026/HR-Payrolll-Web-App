/**
 * Payroll Calculation Engine — Nigeria Tax Act 2025 (effective 1 Jan 2026)
 * Source: PRD Section 8 (Calculation Engine) + Section 9 (Statutory Rules)
 *
 * Multi-company ready: every function accepts company-scoped config.
 * Nothing is hardcoded — all rates/bands/percentages are passed in as config,
 * sourced at runtime from `statutory_rate_tables` (platform-wide) and the
 * company's own `salary_structure_components` / `employer_cost_components` rows.
 */

export interface CompanyContext {
  company_id: string;
  user_id: string;
}

export interface PayeBand {
  upto: number | null;
  rate: number;
}

export interface StatutoryConfig {
  payeBands: PayeBand[];
  pensionEmployeeRate: number;
  pensionEmployerRate: number;
  nhfRate: number;
  nsitfRate: number;
  itfRate: number;
  rentReliefPercentageOfAnnualRent: number;
  rentReliefCap: number;
}

export interface TaxableSubComponent {
  name: string;
  percentageOfTaxable: number;
}

export interface SalaryStructureConfig {
  taxablePercent: number;
  reimbursementPercent: number;
  taxableSubComponents: TaxableSubComponent[];
}

export interface EmployerCostComponent {
  componentName: string;
  calculationType: 'percentage' | 'fixed';
  value: number;
}

export interface OtherLineItem {
  label: string;
  amount: number;
}

export interface EmployeeCalcInput {
  grossSalary: number;
  nhfApplies: boolean;
  annualRentDeclared: number;
  otherDeductions: OtherLineItem[];
  otherAdditions: OtherLineItem[];
}

export interface GrossToNetResult {
  grossSalary: number;
  taxableGross: number;
  reimbursementAmount: number;
  taxableSubBreakdown: Record<string, number>;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  rentRelief: number;
  chargeableIncome: number;
  annualTax: number;
  monthlyTaxPayable: number;
  otherDeductionsTotal: number;
  otherAdditionsTotal: number;
  netPay: number;
}

export interface EmployerCostResult {
  grossSalary: number;
  pensionEmployer: number;
  nsitf: number;
  itf: number;
  otherComponents: OtherLineItem[];
  totalCostToCompany: number;
}

export function computeGrossToNet(
  input: EmployeeCalcInput,
  structure: SalaryStructureConfig,
  statutory: StatutoryConfig
): GrossToNetResult {
  const { grossSalary, nhfApplies, annualRentDeclared, otherDeductions, otherAdditions } = input;

  assertStructureIsValid(structure);

  const taxableGross = round2(grossSalary * structure.taxablePercent);
  const reimbursementAmount = round2(grossSalary * structure.reimbursementPercent);

  const taxableSubBreakdown: Record<string, number> = {};
  for (const comp of structure.taxableSubComponents) {
    taxableSubBreakdown[comp.name] = round2(taxableGross * comp.percentageOfTaxable);
  }
  const pensionBase = sumValues(taxableSubBreakdown);

  const pensionEmployee = round2(pensionBase * statutory.pensionEmployeeRate);
  const pensionEmployer = round2(pensionBase * statutory.pensionEmployerRate);

  const basic = taxableSubBreakdown['Basic'] ?? 0;
  const nhf = nhfApplies ? round2(basic * statutory.nhfRate) : 0;

  const rentRelief =
    annualRentDeclared > 0
      ? Math.min(
          round2(annualRentDeclared * statutory.rentReliefPercentageOfAnnualRent),
          statutory.rentReliefCap
        )
      : 0;

  const chargeableIncome = Math.max(
    0,
    round2(taxableGross - pensionEmployee - nhf - rentRelief)
  );

  const annualTax = round2(applyProgressiveBands(chargeableIncome, statutory.payeBands));
  const monthlyTaxPayable = round2(annualTax / 12);

  const otherDeductionsTotal = round2(sumLineItems(otherDeductions));
  const otherAdditionsTotal = round2(sumLineItems(otherAdditions));

  const netPay = round2(
    grossSalary - pensionEmployee - nhf - monthlyTaxPayable - otherDeductionsTotal + otherAdditionsTotal
  );

  return {
    grossSalary: round2(grossSalary),
    taxableGross,
    reimbursementAmount,
    taxableSubBreakdown,
    pensionEmployee,
    pensionEmployer,
    nhf,
    rentRelief,
    chargeableIncome,
    annualTax,
    monthlyTaxPayable,
    otherDeductionsTotal,
    otherAdditionsTotal,
    netPay,
  };
}

export interface GrossUpOptions {
  toleranceNaira?: number;
  maxIterations?: number;
}

export interface GrossUpResult {
  resolvedGross: number;
  iterations: number;
  finalBreakdown: GrossToNetResult;
  converged: boolean;
}

export function computeNetToGross(
  targetNet: number,
  input: Omit<EmployeeCalcInput, 'grossSalary'>,
  structure: SalaryStructureConfig,
  statutory: StatutoryConfig,
  options: GrossUpOptions = {}
): GrossUpResult {
  const tolerance = options.toleranceNaira ?? 1;
  const maxIterations = options.maxIterations ?? 50;

  let grossGuess = targetNet / 0.85;
  let breakdown = computeGrossToNet({ ...input, grossSalary: grossGuess }, structure, statutory);
  let iterations = 0;
  let converged = false;

  let low = 0;
  let high = grossGuess * 3;

  for (iterations = 1; iterations <= maxIterations; iterations++) {
    breakdown = computeGrossToNet({ ...input, grossSalary: grossGuess }, structure, statutory);
    const diff = breakdown.netPay - targetNet;

    if (Math.abs(diff) <= tolerance) {
      converged = true;
      break;
    }

    if (diff > 0) {
      high = grossGuess;
    } else {
      low = grossGuess;
    }
    grossGuess = (low + high) / 2;
  }

  return {
    resolvedGross: round2(grossGuess),
    iterations,
    finalBreakdown: breakdown,
    converged,
  };
}

export function computeEmployerCost(
  grossSalary: number,
  pensionEmployer: number,
  statutory: StatutoryConfig,
  extraComponents: EmployerCostComponent[] = []
): EmployerCostResult {
  const nsitf = round2(grossSalary * statutory.nsitfRate);
  const itf = round2(grossSalary * statutory.itfRate);

  const otherComponents: OtherLineItem[] = extraComponents.map((c) => ({
    label: c.componentName,
    amount: round2(c.calculationType === 'percentage' ? grossSalary * c.value : c.value),
  }));

  const totalCostToCompany = round2(
    grossSalary + pensionEmployer + nsitf + itf + sumLineItems(otherComponents)
  );

  return {
    grossSalary: round2(grossSalary),
    pensionEmployer,
    nsitf,
    itf,
    otherComponents,
    totalCostToCompany,
  };
}

function applyProgressiveBands(chargeableIncome: number, bands: PayeBand[]): number {
  let tax = 0;
  let previousUpto = 0;

  for (const band of bands) {
    const bandCeiling = band.upto ?? Infinity;
    const incomeInBand = Math.max(0, Math.min(chargeableIncome, bandCeiling) - previousUpto);

    if (incomeInBand > 0) {
      tax += incomeInBand * band.rate;
    }

    if (chargeableIncome <= bandCeiling) break;
    previousUpto = bandCeiling;
  }

  return tax;
}

function assertStructureIsValid(structure: SalaryStructureConfig): void {
  const splitTotal = structure.taxablePercent + structure.reimbursementPercent;
  if (Math.abs(splitTotal - 1) > 0.001) {
    throw new Error(
      `Salary structure invalid: taxablePercent + reimbursementPercent = ${splitTotal}, must equal 1.0`
    );
  }
  const subTotal = structure.taxableSubComponents.reduce((sum, c) => sum + c.percentageOfTaxable, 0);
  if (Math.abs(subTotal - 1) > 0.001) {
    throw new Error(
      `Taxable sub-components invalid: percentages sum to ${subTotal}, must equal 1.0`
    );
  }
}

function sumValues(record: Record<string, number>): number {
  return Object.values(record).reduce((a, b) => a + b, 0);
}

function sumLineItems(items: OtherLineItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
