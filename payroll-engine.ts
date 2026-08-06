/**
 * Payroll Calculation Engine — Nigeria Tax Act 2025 (effective 1 Jan 2026)
 * Source: PRD Section 8 (Calculation Engine) + Section 9 (Statutory Rules)
 *
 * Design principle carried over from the PRD: nothing here is hardcoded.
 * Every rate/band/percentage is passed in as config, sourced at runtime
 * from `statutory_rate_tables` (platform-wide) and the company's own
 * `salary_structure_components` / `employer_cost_components` rows.
 * This file has zero Supabase imports — it's pure functions, easy to
 * unit-test and safe to hand to any AI builder without it touching your
 * database credentials.
 */

// ─────────────────────────────────────────────────────────────────────────
// Types — shapes mirror the config_json your statutory_rate_tables and
// salary_structure_components rows will actually contain.
// ─────────────────────────────────────────────────────────────────────────

export interface PayeBand {
  /** Cumulative upper bound of chargeable income for this band, in NGN. `null` = no upper bound (top band). */
  upto: number | null;
  /** Rate applied to the slice of income that falls inside this band. */
  rate: number;
}

export interface StatutoryConfig {
  payeBands: PayeBand[]; // ordered ascending by `upto`
  pensionEmployeeRate: number; // e.g. 0.08
  pensionEmployerRate: number; // e.g. 0.10
  nhfRate: number; // e.g. 0.025 — applied only if nhfApplies is true
  nsitfRate: number; // e.g. 0.01 — employer cost
  itfRate: number; // e.g. 0.01 — employer cost
  rentReliefPercentageOfAnnualRent: number; // e.g. 0.20
  rentReliefCap: number; // e.g. 500000
}

export interface TaxableSubComponent {
  /** e.g. "Basic", "Housing", "Transport" */
  name: string;
  /** Percentage of the TAXABLE portion (Section 8.1) — all sub-components must sum to 1.0 */
  percentageOfTaxable: number;
}

export interface SalaryStructureConfig {
  /** Portion of gross that is taxable, e.g. 0.45. taxablePercent + reimbursementPercent must equal 1.0 */
  taxablePercent: number;
  reimbursementPercent: number;
  taxableSubComponents: TaxableSubComponent[];
}

export interface EmployerCostComponent {
  componentName: string;
  calculationType: 'percentage' | 'fixed';
  /** If percentage: fraction of gross (e.g. 0.10 for HMO at 10% of gross). If fixed: NGN amount. */
  value: number;
}

export interface OtherLineItem {
  label: string;
  amount: number;
}

export interface EmployeeCalcInput {
  grossSalary: number;
  /** True only if the employee has actually declared rent AND the company + employee have opted into NHF (Section 9.1). */
  nhfApplies: boolean;
  /** Annual rent paid, as declared by the employee. 0 if none declared → Rent Relief = 0. */
  annualRentDeclared: number;
  otherDeductions: OtherLineItem[];
  otherAdditions: OtherLineItem[];
}

export interface GrossToNetResult {
  grossSalary: number;
  taxableGross: number;
  reimbursementAmount: number;
  taxableSubBreakdown: Record<string, number>; // e.g. { Basic: 123, Housing: 456, ... }
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

// ─────────────────────────────────────────────────────────────────────────
// Section 8.2 — Gross-to-Net (the core deterministic calculation)
// ─────────────────────────────────────────────────────────────────────────

export function computeGrossToNet(
  input: EmployeeCalcInput,
  structure: SalaryStructureConfig,
  statutory: StatutoryConfig
): GrossToNetResult {
  const { grossSalary, nhfApplies, annualRentDeclared, otherDeductions, otherAdditions } = input;

  assertStructureIsValid(structure);

  // 1. Taxable / Reimbursement split
  const taxableGross = round2(grossSalary * structure.taxablePercent);
  const reimbursementAmount = round2(grossSalary * structure.reimbursementPercent);

  // 2. Taxable sub-components (Basic, Housing, Transport, ...)
  const taxableSubBreakdown: Record<string, number> = {};
  for (const comp of structure.taxableSubComponents) {
    taxableSubBreakdown[comp.name] = round2(taxableGross * comp.percentageOfTaxable);
  }
  const pensionBase = sumValues(taxableSubBreakdown); // "Basic + Housing + Transport" per Section 8.2

  // 3. Pension (Employee) — 8% of pensionable base, deductible
  const pensionEmployee = round2(pensionBase * statutory.pensionEmployeeRate);
  const pensionEmployer = round2(pensionBase * statutory.pensionEmployerRate);

  // 4. NHF — 2.5% of Basic, only if opted in (company toggle AND employee consent)
  const basic = taxableSubBreakdown['Basic'] ?? 0;
  const nhf = nhfApplies ? round2(basic * statutory.nhfRate) : 0;

  // 5. Rent Relief — lower of (20% of annual rent) or the statutory cap; 0 if no rent declared
  const rentRelief =
    annualRentDeclared > 0
      ? Math.min(
          round2(annualRentDeclared * statutory.rentReliefPercentageOfAnnualRent),
          statutory.rentReliefCap
        )
      : 0;

  // 6. Chargeable Income
  const chargeableIncome = Math.max(
    0,
    round2(taxableGross - pensionEmployee - nhf - rentRelief)
  );

  // 7. Progressive PAYE
  const annualTax = round2(applyProgressiveBands(chargeableIncome, statutory.payeBands));
  const monthlyTaxPayable = round2(annualTax / 12);

  // 8. Other deductions / additions
  const otherDeductionsTotal = round2(sumLineItems(otherDeductions));
  const otherAdditionsTotal = round2(sumLineItems(otherAdditions));

  // 9. Net Pay
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

// ─────────────────────────────────────────────────────────────────────────
// Section 8.3 — Net-to-Gross (iterative gross-up; PAYE is progressive so
// there is no closed-form inverse)
// ─────────────────────────────────────────────────────────────────────────

export interface GrossUpOptions {
  /** Stop once |resultingNet - targetNet| is within this many Naira. Section 8.3 default: ₦1. */
  toleranceNaira?: number;
  /** Safety cap so a bad config can't spin forever. Section 8.3 notes convergence typically in 5–8 iterations. */
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
  const maxIterations = options.maxIterations ?? 50; // generous ceiling; PRD expects 5–8 in practice

  // Seed guess per Section 8.3
  let grossGuess = targetNet / 0.85;
  let breakdown = computeGrossToNet({ ...input, grossSalary: grossGuess }, structure, statutory);
  let iterations = 0;
  let converged = false;

  // Simple secant-style bisection: adjust guess proportionally to the error,
  // then narrow with bisection once we bracket the target — robust against
  // the PAYE function's band-boundary kinks, unlike a naive linear scale-up.
  let low = 0;
  let high = grossGuess * 3; // generous upper bracket

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

// ─────────────────────────────────────────────────────────────────────────
// Section 8.4 — Employer Cost / Cost to Company (C2C)
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

function applyProgressiveBands(chargeableIncome: number, bands: PayeBand[]): number {
  let tax = 0;
  let previousUpto = 0;

  for (const band of bands) {
    const bandCeiling = band.upto ?? Infinity;
    const bandWidth = bandCeiling - previousUpto;
    const incomeInBand = Math.max(0, Math.min(chargeableIncome, bandCeiling) - previousUpto);

    if (incomeInBand > 0) {
      tax += incomeInBand * band.rate;
    }

    if (chargeableIncome <= bandCeiling) break;
    previousUpto = bandCeiling;
    void bandWidth; // kept for readability/debugging, not used in the sum
  }

  return tax;
}

function assertStructureIsValid(structure: SalaryStructureConfig): void {
  const splitTotal = structure.taxablePercent + structure.reimbursementPercent;
  if (Math.abs(splitTotal - 1) > 0.001) {
    throw new Error(
      `Salary structure invalid: taxablePercent + reimbursementPercent = ${splitTotal}, must equal 1.0 (Section 6.4 validation rule)`
    );
  }
  const subTotal = structure.taxableSubComponents.reduce((sum, c) => sum + c.percentageOfTaxable, 0);
  if (Math.abs(subTotal - 1) > 0.001) {
    throw new Error(
      `Taxable sub-components invalid: percentages sum to ${subTotal}, must equal 1.0 of the taxable portion (Section 6.4 validation rule)`
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

// ─────────────────────────────────────────────────────────────────────────
// Example config + smoke test — run with `npx ts-node payroll-engine.ts`
// This is illustrative only: your uploaded MD Approval Schedule template's
// sample figures don't disclose the underlying salary-structure percentages
// used to produce them, so this does NOT attempt to reproduce those exact
// numbers. It's here to prove the engine runs end-to-end on a plausible
// config. Replace with real assertions once you seed a real company.
// ─────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const statutory: StatutoryConfig = {
    payeBands: [
      { upto: 800_000, rate: 0.0 },
      { upto: 3_000_000, rate: 0.15 },
      { upto: 10_000_000, rate: 0.18 },
      { upto: 25_000_000, rate: 0.21 },
      { upto: 50_000_000, rate: 0.23 },
      { upto: null, rate: 0.25 },
    ],
    pensionEmployeeRate: 0.08,
    pensionEmployerRate: 0.1,
    nhfRate: 0.025,
    nsitfRate: 0.01,
    itfRate: 0.01,
    rentReliefPercentageOfAnnualRent: 0.2,
    rentReliefCap: 500_000,
  };

  const structure: SalaryStructureConfig = {
    taxablePercent: 0.45,
    reimbursementPercent: 0.55,
    taxableSubComponents: [
      { name: 'Basic', percentageOfTaxable: 0.4 },
      { name: 'Housing', percentageOfTaxable: 0.35 },
      { name: 'Transport', percentageOfTaxable: 0.25 },
    ],
  };

  const gross = 500_000;
  const result = computeGrossToNet(
    {
      grossSalary: gross,
      nhfApplies: false,
      annualRentDeclared: 1_200_000,
      otherDeductions: [],
      otherAdditions: [],
    },
    structure,
    statutory
  );
  console.log('Gross-to-Net @ ₦500,000 gross:', result);

  const grossUp = computeNetToGross(
    350_000,
    { nhfApplies: false, annualRentDeclared: 1_200_000, otherDeductions: [], otherAdditions: [] },
    structure,
    statutory
  );
  console.log(
    `Net-to-Gross for ₦350,000 target net → resolved gross ₦${grossUp.resolvedGross} in ${grossUp.iterations} iterations (converged: ${grossUp.converged})`
  );

  const c2c = computeEmployerCost(gross, result.pensionEmployer, statutory);
  console.log('Employer Cost (C2C):', c2c);
}
