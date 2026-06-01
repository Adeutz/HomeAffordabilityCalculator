// Estimates take-home pay (net income) from gross annual income.
//
// This is a simplified model — real tax bills depend on filing status,
// deductions, retirement contributions, HSAs, kids, etc. But for a "what's
// my realistic monthly cash flow?" calculator this is good enough to
// dramatically beat just using gross income.
//
// We model:
//   - Federal income tax (single filer, 2024 brackets, standard deduction)
//   - FICA (Social Security + Medicare)
//   - State income tax (rough effective rate by state)

// 2024 single-filer federal brackets (marginal rates).
// Each entry: [income threshold, rate].
const FEDERAL_BRACKETS_SINGLE = [
  [0, 0.10],
  [11_600, 0.12],
  [47_150, 0.22],
  [100_525, 0.24],
  [191_950, 0.32],
  [243_725, 0.35],
  [609_350, 0.37],
];

// 2024 married-filing-jointly federal brackets
const FEDERAL_BRACKETS_MFJ = [
  [0, 0.10],
  [23_200, 0.12],
  [94_300, 0.22],
  [201_050, 0.24],
  [383_900, 0.32],
  [487_450, 0.35],
  [731_200, 0.37],
];

const STANDARD_DEDUCTION = {
  single: 14_600,
  mfj: 29_200,
};

// FICA 2024: 6.2% Social Security up to wage base, 1.45% Medicare uncapped,
// +0.9% additional Medicare over the threshold.
const SS_RATE = 0.062;
const SS_WAGE_BASE_2024 = 168_600;
const MEDICARE_RATE = 0.0145;
const ADDL_MEDICARE_THRESHOLD_SINGLE = 200_000;
const ADDL_MEDICARE_THRESHOLD_MFJ = 250_000;
const ADDL_MEDICARE_RATE = 0.009;

// Rough effective state income tax rate by state (after typical state
// standard deduction). 0% for states with no income tax.
const STATE_RATES = {
  AL: 4.0, AK: 0, AZ: 2.5, AR: 4.4, CA: 6.5,
  CO: 4.4, CT: 5.5, DE: 5.0, FL: 0, GA: 5.5,
  HI: 7.0, ID: 5.8, IL: 4.95, IN: 3.05, IA: 5.7,
  KS: 5.0, KY: 4.5, LA: 4.25, ME: 6.0, MD: 5.0,
  MA: 5.0, MI: 4.25, MN: 6.5, MS: 4.7, MO: 4.95,
  MT: 5.9, NE: 6.0, NV: 0, NH: 0, NJ: 5.5,
  NM: 4.9, NY: 6.0, NC: 4.5, ND: 2.0, OH: 3.0,
  OK: 4.75, OR: 8.0, PA: 3.07, RI: 4.75, SC: 6.4,
  SD: 0, TN: 0, TX: 0, UT: 4.65, VT: 6.5,
  VA: 5.0, WA: 0, WV: 5.0, WI: 5.3, WY: 0,
  DC: 6.5,
};

/** Tax owed on `taxableIncome` for given marginal-rate brackets. */
function taxFromBrackets(taxableIncome, brackets) {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [thresh, rate] = brackets[i];
    const next = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (taxableIncome > thresh) {
      const taxedHere = Math.min(taxableIncome, next) - thresh;
      tax += taxedHere * rate;
    } else {
      break;
    }
  }
  return tax;
}

/** Estimate FICA owed on wage income. */
function fica(gross, filingStatus) {
  const ss = Math.min(gross, SS_WAGE_BASE_2024) * SS_RATE;
  const medicare = gross * MEDICARE_RATE;
  const addlThreshold =
    filingStatus === 'mfj'
      ? ADDL_MEDICARE_THRESHOLD_MFJ
      : ADDL_MEDICARE_THRESHOLD_SINGLE;
  const addl = Math.max(0, gross - addlThreshold) * ADDL_MEDICARE_RATE;
  return ss + medicare + addl;
}

/**
 * Estimate annual net (take-home) income.
 * Returns { net, federal, fica, state, effectiveRatePct }.
 *
 * If `overridePct` is a number, that's used as the effective tax rate
 * (gross * overridePct/100 = total tax) — useful when the user knows their
 * real tax burden better than our model.
 */
export function estimateNet({
  grossAnnual,
  stateAbbrev = '',
  filingStatus = 'single',
  overridePct = null,
}) {
  if (overridePct != null && overridePct !== '' && Number.isFinite(overridePct)) {
    const totalTax = (grossAnnual * overridePct) / 100;
    return {
      gross: grossAnnual,
      net: Math.max(0, grossAnnual - totalTax),
      federal: totalTax * 0.7, // approx breakdown for display only
      fica: totalTax * 0.2,
      state: totalTax * 0.1,
      effectiveRatePct: overridePct,
      isOverride: true,
    };
  }

  const brackets =
    filingStatus === 'mfj' ? FEDERAL_BRACKETS_MFJ : FEDERAL_BRACKETS_SINGLE;
  const stdDeduction = STANDARD_DEDUCTION[filingStatus] ?? STANDARD_DEDUCTION.single;
  const taxable = Math.max(0, grossAnnual - stdDeduction);
  const federal = taxFromBrackets(taxable, brackets);
  const ficaTax = fica(grossAnnual, filingStatus);
  const stateRate = (STATE_RATES[stateAbbrev] ?? 5.0) / 100; // assume ~5% if state unknown
  const state = Math.max(0, grossAnnual - stdDeduction) * stateRate;

  const totalTax = federal + ficaTax + state;
  const net = Math.max(0, grossAnnual - totalTax);
  const effectiveRatePct =
    grossAnnual > 0 ? (totalTax / grossAnnual) * 100 : 0;

  return {
    gross: grossAnnual,
    net,
    federal,
    fica: ficaTax,
    state,
    effectiveRatePct,
    isOverride: false,
  };
}

/** Convenience: net monthly take-home. */
export function netMonthly(args) {
  return estimateNet(args).net / 12;
}

// ---------- Mortgage tax benefit (rough, year-one estimate) ----------------

const SALT_DEDUCTION_CAP = 10_000;

/** Year-one mortgage interest (sum of first 12 amortization months). */
function yearOneMortgageInterest(loanAmount, annualRatePct, termYears) {
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (loanAmount <= 0 || n <= 0) return 0;
  const factor = Math.pow(1 + r, n);
  const payment =
    r === 0 ? loanAmount / n : (loanAmount * r * factor) / (factor - 1);
  let balance = loanAmount;
  let interest = 0;
  for (let m = 0; m < 12 && balance > 0; m++) {
    const i = balance * r;
    interest += i;
    balance -= payment - i;
  }
  return interest;
}

/**
 * Rough annual tax savings from deducting mortgage interest + property tax
 * (with SALT cap), compared to taking the standard deduction.
 * Not tax advice — real returns depend on AMT, other deductions, etc.
 */
export function estimateMortgageTaxBenefit({
  grossAnnual,
  filingStatus = 'single',
  stateAbbrev = '',
  loanAmount,
  annualRatePct,
  termYears,
  homePrice,
  propertyTaxRatePct,
}) {
  const empty = {
    annualBenefit: 0,
    monthlyBenefit: 0,
    itemizes: false,
    yearOneInterest: 0,
    annualPropertyTax: 0,
    saltDeduction: 0,
    itemizedDeductions: 0,
    standardDeduction: STANDARD_DEDUCTION[filingStatus] ?? STANDARD_DEDUCTION.single,
    federalBenefit: 0,
    stateBenefit: 0,
  };

  if (loanAmount <= 0 || homePrice <= 0 || grossAnnual <= 0) return empty;

  const yearOneInterest = yearOneMortgageInterest(
    loanAmount,
    annualRatePct,
    termYears,
  );
  const annualPropertyTax = homePrice * (propertyTaxRatePct / 100);

  const brackets =
    filingStatus === 'mfj' ? FEDERAL_BRACKETS_MFJ : FEDERAL_BRACKETS_SINGLE;
  const stdDeduction =
    STANDARD_DEDUCTION[filingStatus] ?? STANDARD_DEDUCTION.single;
  const stateRate = (STATE_RATES[stateAbbrev] ?? 5.0) / 100;
  const estimatedStateTax =
    Math.max(0, grossAnnual - stdDeduction) * stateRate;

  const saltDeduction = Math.min(
    SALT_DEDUCTION_CAP,
    annualPropertyTax + estimatedStateTax,
  );
  const itemizedDeductions = yearOneInterest + saltDeduction;

  const federalWithStandard = taxFromBrackets(
    Math.max(0, grossAnnual - stdDeduction),
    brackets,
  );
  const deductionUsed = Math.max(stdDeduction, itemizedDeductions);
  const federalWithItemized = taxFromBrackets(
    Math.max(0, grossAnnual - deductionUsed),
    brackets,
  );
  const federalBenefit = Math.max(0, federalWithStandard - federalWithItemized);

  const extraDeduction = Math.max(0, itemizedDeductions - stdDeduction);
  const stateBenefit = extraDeduction * stateRate;

  const annualBenefit = federalBenefit + stateBenefit;

  return {
    annualBenefit,
    monthlyBenefit: annualBenefit / 12,
    itemizes: itemizedDeductions > stdDeduction,
    yearOneInterest,
    annualPropertyTax,
    saltDeduction,
    itemizedDeductions,
    standardDeduction: stdDeduction,
    federalBenefit,
    stateBenefit,
  };
}
