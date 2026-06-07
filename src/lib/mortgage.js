import { estimateNet } from './taxes.js';

// All the mortgage math lives here. Pure functions only (no UI), so it's easy
// to test, easy to read, and easy to swap into any component.
//
// Quick refresher on the variables you'll see:
//   P       = principal (loan amount in dollars)
//   r       = monthly interest rate (annualRate / 12, as a decimal)
//   n       = total number of monthly payments (years * 12)
//   PITI    = Principal + Interest + Taxes + Insurance (a "full" monthly payment)
//   PMI     = Private Mortgage Insurance (extra fee when down payment < 20%)
//   DTI     = Debt-to-Income ratio (a measure lenders use to decide how much
//             they'll lend you)

// ---------- Core formulas ---------------------------------------------------

/**
 * Standard fixed-rate mortgage monthly payment (Principal + Interest only).
 * Formula:  M = P * r * (1+r)^n / ((1+r)^n - 1)
 */
export function monthlyPI(loanAmount, annualRatePct, termYears) {
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (loanAmount <= 0 || n <= 0) return 0;
  if (r === 0) return loanAmount / n; // 0% interest edge case
  const factor = Math.pow(1 + r, n);
  return (loanAmount * r * factor) / (factor - 1);
}

/**
 * Annual PMI rate as a decimal of loan amount.
 * Real-world PMI ranges from about 0.3% to 1.5% per year depending on
 * credit score and loan-to-value ratio. We approximate.
 */
export function estimatePmiRate(creditScore, loanToValuePct) {
  if (loanToValuePct <= 80) return 0; // no PMI when you put 20%+ down
  let base = 0.005; // 0.5% baseline
  if (creditScore < 620) base = 0.0125;
  else if (creditScore < 680) base = 0.009;
  else if (creditScore < 740) base = 0.0065;
  else if (creditScore < 780) base = 0.005;
  else base = 0.0035;

  // Higher LTV (smaller down payment) = higher PMI
  if (loanToValuePct > 95) base += 0.002;
  else if (loanToValuePct > 90) base += 0.001;

  return base;
}

/** Monthly PMI given a homePrice, downPayment, and creditScore. */
export function monthlyPMI(homePrice, downPayment, creditScore) {
  const loanAmount = homePrice - downPayment;
  if (loanAmount <= 0) return 0;
  const ltv = (loanAmount / homePrice) * 100;
  const annualRate = estimatePmiRate(creditScore, ltv);
  return (loanAmount * annualRate) / 12;
}

/**
 * Suggested interest rate based on credit score.
 * Used when the user hasn't manually overridden the rate.
 * Numbers are rough averages, not a quote.
 */
export function suggestedRate(baseMarketRate, creditScore) {
  if (creditScore >= 760) return baseMarketRate - 0.25;
  if (creditScore >= 700) return baseMarketRate;
  if (creditScore >= 660) return baseMarketRate + 0.25;
  if (creditScore >= 620) return baseMarketRate + 0.75;
  return baseMarketRate + 1.5;
}

// ---------- The "full" monthly payment (PITI + HOA + PMI) -------------------

/**
 * Returns a breakdown object for the monthly payment.
 *   { principalAndInterest, propertyTax, homeInsurance, hoa, pmi, total }
 */
export function monthlyPaymentBreakdown(inputs) {
  const {
    homePrice,
    downPayment,
    interestRate,
    loanTermYears,
    propertyTaxRatePct, // annual, e.g. 1.1
    homeInsuranceAnnual,
    hoaMonthly,
    creditScore,
  } = inputs;

  const loan = Math.max(0, homePrice - downPayment);
  const pi = monthlyPI(loan, interestRate, loanTermYears);
  const tax = (homePrice * (propertyTaxRatePct / 100)) / 12;
  const ins = homeInsuranceAnnual / 12;
  const hoa = hoaMonthly;
  const pmi = monthlyPMI(homePrice, downPayment, creditScore);

  return {
    principalAndInterest: pi,
    propertyTax: tax,
    homeInsurance: ins,
    hoa,
    pmi,
    total: pi + tax + ins + hoa + pmi,
  };
}

// ---------- Affordability (the Zillow-style "max house price") --------------

/**
 * Given a max monthly housing payment the user can afford, work backwards
 * to figure out what home price that translates to.
 *
 * We hold loan term, rate, tax rate, insurance, HOA, and credit score
 * constant, then binary-search the home price.
 */
export function maxAffordableHomePrice({
  maxMonthlyHousingPayment,
  downPayment,
  interestRate,
  loanTermYears,
  propertyTaxRatePct,
  homeInsuranceAnnual,
  hoaMonthly,
  creditScore,
}) {
  if (maxMonthlyHousingPayment <= 0) return 0;

  let lo = downPayment; // can't be cheaper than your down payment
  let hi = 10_000_000; // safety cap

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const breakdown = monthlyPaymentBreakdown({
      homePrice: mid,
      downPayment,
      interestRate,
      loanTermYears,
      propertyTaxRatePct,
      homeInsuranceAnnual,
      hoaMonthly,
      creditScore,
    });
    if (breakdown.total > maxMonthlyHousingPayment) hi = mid;
    else lo = mid;
  }
  return Math.max(0, lo);
}

/**
 * The 28/36 rule: lenders typically want
 *   - housing payment <= 28% of gross monthly income
 *   - housing + other debts <= 36% of gross monthly income
 * Returns the lower of those two ceilings as the practical max.
 */
export function maxMonthlyHousingFromIncome({
  annualIncome,
  monthlyDebts,
  housingRatio = 0.28,
  totalDebtRatio = 0.36,
}) {
  const grossMonthlyIncome = annualIncome / 12;
  const cap1 = grossMonthlyIncome * housingRatio;
  const cap2 = grossMonthlyIncome * totalDebtRatio - monthlyDebts;
  return Math.max(0, Math.min(cap1, cap2));
}

// ---------- DTI traffic light -----------------------------------------------

/**
 * Returns 'green', 'yellow', or 'red' based on total monthly debt-to-income.
 * Green: <= 28% (very healthy)
 * Yellow: 28%-43% (most lenders OK, but tight)
 * Red: > 43% (most conventional lenders will say no)
 */
export function dtiHealth({ annualIncome, monthlyDebts, monthlyHousing }) {
  const grossMonthly = annualIncome / 12;
  if (grossMonthly <= 0) return { ratio: 0, level: 'red' };
  const ratio = (monthlyDebts + monthlyHousing) / grossMonthly;
  let level = 'green';
  if (ratio > 0.43) level = 'red';
  else if (ratio > 0.28) level = 'yellow';
  return { ratio, level };
}

/** Housing payment vs estimated monthly net (after tax); mirrors NetIncome UI. */
export function housingVsNetHealth(monthlyNet, monthlyHousing) {
  if (!Number.isFinite(monthlyNet) || monthlyNet <= 0) return 'red';
  const r = monthlyHousing / monthlyNet;
  if (r <= 0.3) return 'green';
  if (r <= 0.45) return 'yellow';
  return 'red';
}

// ---------- Affordability comfort level (for the price-explorer slider) ----

/**
 * Classify how "comfortable" a chosen home price is for a buyer, given their
 * income and other debts. We look at two ratios at once:
 *   - housing-to-income (the "front-end" ratio)
 *   - total debt-to-income, i.e. housing + other debts (the "back-end" ratio)
 *
 * The level is the WORSE of the two, because lenders (and your bank account)
 * care about both.
 *
 *   green  ("Comfortable") — housing <= 28% AND total DTI <= 36%
 *   yellow ("Stretching")  — housing <= 36% AND total DTI <= 43%
 *   red    ("Aggressive")  — anything beyond that
 */
export function affordabilityComfort({
  monthlyHousing,
  monthlyDebts,
  annualIncome,
}) {
  const grossMonthly = annualIncome / 12;
  if (grossMonthly <= 0) {
    return {
      level: 'red',
      label: 'Aggressive',
      housingRatio: 0,
      dtiRatio: 0,
    };
  }

  const housingRatio = monthlyHousing / grossMonthly;
  const dtiRatio = (monthlyHousing + monthlyDebts) / grossMonthly;

  let level = 'green';
  if (housingRatio > 0.36 || dtiRatio > 0.43) level = 'red';
  else if (housingRatio > 0.28 || dtiRatio > 0.36) level = 'yellow';

  const label =
    level === 'green'
      ? 'Comfortable'
      : level === 'yellow'
        ? 'Stretching'
        : 'Aggressive';

  return { level, label, housingRatio, dtiRatio };
}

// ---------- Buyer comfort: Financial Samurai's 30/30/3 + Net Worth rule -----
//
// Lenders will happily approve you for "lender's max" loans that leave you
// stretched thin. The 30/30/3 rule (Financial Samurai) is a more honest
// measure of what's actually comfortable:
//
//   30 - Housing ≤ 30% of gross income
//   30 - Net worth ≥ 30% of home price (down payment + reserves)
//   3  - (Loan + annual taxes + annual insurance) ≤ 3× annual gross income.
//        Uses loan balance vs sticker price so big down payments are not double-counted.
//
// We also expose three "tiers" inspired by the same chart:
//   - Stretch:    loan+tax+ins ≤ 5× income (vs gross), net worth ≥ 30% of home
//   - Reasonable: loan+tax+ins ≤ 4× income, net worth ≥ 50% of home
//   - Ideal:      loan+tax+ins ≤ 3× income, net worth ≥ 30% of home

/**
 * Dollars per year: starting loan principal + annual property tax (% of price) +
 * annual homeowner's insurance. Excludes HOA and PMI — a lighter-weight
 * heuristic than counting the whole sticker price toward the "× income" rule.
 */
export function annualLoanTaxInsuranceTotal({
  homePrice,
  downPayment,
  propertyTaxRatePct,
  homeInsuranceAnnual,
}) {
  const price = Math.max(0, homePrice);
  const dp = Math.max(0, downPayment);
  const loan = Math.max(0, price - dp);
  const t = Math.max(0, (Number(propertyTaxRatePct) || 0) / 100);
  const ins = Math.max(0, Number(homeInsuranceAnnual) || 0);
  return loan + price * t + ins;
}

/**
 * Largest home price (holding down payment fixed) whose annualLoanTaxInsuranceTotal
 * stays at or below `incomeMultipleCap × annualIncome`.
 */
export function maxHomePriceForLoanTaxInsuranceMultiple({
  annualIncome,
  downPayment,
  propertyTaxRatePct,
  homeInsuranceAnnual,
  incomeMultipleCap,
}) {
  const cap = incomeMultipleCap * Math.max(0, annualIncome);
  const dp = Math.max(0, downPayment);
  const t = Math.max(0, (Number(propertyTaxRatePct) || 0) / 100);
  const ins = Math.max(0, Number(homeInsuranceAnnual) || 0);
  if (cap <= 0 || incomeMultipleCap <= 0) return 0;

  const denom = 1 + t;
  const pLoan = denom > 0 ? (cap + dp - ins) / denom : 0;

  if (pLoan >= dp) return Math.max(0, pLoan);

  // Down payment exceeds the crossover price → treat as loan = 0, burden P·t + ins
  if (t > 0) {
    const pCash = (cap - ins) / t;
    return Math.max(0, Math.min(dp, pCash));
  }

  return ins <= cap ? dp : 0;
}

/** Pure rule-check helpers so the UI can render pass/fail nicely. */
export function comfortAnalysis({
  annualIncome,
  netWorth,
  homePriceBeingChecked,
  monthlyHousing,
  downPayment = 0,
  propertyTaxRatePct = 0,
  homeInsuranceAnnual = 0,
}) {
  const grossMonthly = annualIncome / 12;

  const stretchCap = maxHomePriceForLoanTaxInsuranceMultiple({
    annualIncome,
    downPayment,
    propertyTaxRatePct,
    homeInsuranceAnnual,
    incomeMultipleCap: 5,
  });
  const reasonableCap = maxHomePriceForLoanTaxInsuranceMultiple({
    annualIncome,
    downPayment,
    propertyTaxRatePct,
    homeInsuranceAnnual,
    incomeMultipleCap: 4,
  });
  const idealCap = maxHomePriceForLoanTaxInsuranceMultiple({
    annualIncome,
    downPayment,
    propertyTaxRatePct,
    homeInsuranceAnnual,
    incomeMultipleCap: 3,
  });

  // Tier max prices (what you could comfortably afford at each level)
  const stretchMax = Math.min(stretchCap, netWorth / 0.3);
  const reasonableMax = Math.min(reasonableCap, netWorth / 0.5);
  const idealMax = Math.min(idealCap, netWorth / 0.3);

  // Rule values for the home price being considered
  const housingRatio = grossMonthly > 0 ? monthlyHousing / grossMonthly : 1;
  const burdenAnnual = annualLoanTaxInsuranceTotal({
    homePrice: homePriceBeingChecked,
    downPayment,
    propertyTaxRatePct,
    homeInsuranceAnnual,
  });
  const loanTaxInsuranceMultiple =
    annualIncome > 0 ? burdenAnnual / annualIncome : Infinity;
  const networthRatio =
    homePriceBeingChecked > 0 ? netWorth / homePriceBeingChecked : 0;

  const rules = [
    {
      id: 'housing30',
      label: 'Housing ≤ 30% of gross income',
      description:
        'The first "30" in 30/30/3 — keep monthly housing under 30% of your gross income.',
      pass: housingRatio <= 0.3,
      currentValue: housingRatio,
      target: 0.3,
      kind: 'ratio',
    },
    {
      id: 'networth30',
      label: 'Net worth ≥ 30% of home price',
      description:
        'The second "30" in 30/30/3 — have at least 30% of the home price in net worth (down payment + reserves).',
      pass: networthRatio >= 0.3,
      currentValue: networthRatio,
      target: 0.3,
      kind: 'ratio_min',
    },
    {
      id: 'loanTaxIns3x',
      label: 'Loan + yearly tax + yearly insurance ≤ 3× gross income',
      description:
        'A mortgage-focused take on the "3×" guideline: compare your loan principal plus one year of property tax and homeowner\'s insurance to income (not HOA or PMI). Big down payments help here.',
      pass: loanTaxInsuranceMultiple <= 3,
      currentValue: loanTaxInsuranceMultiple,
      target: 3,
      kind: 'multiple',
    },
  ];

  const passCount = rules.filter((r) => r.pass).length;
  const overallLevel =
    passCount === 3 ? 'green' : passCount >= 2 ? 'yellow' : 'red';

  return {
    stretchMax,
    reasonableMax,
    idealMax,
    rules,
    passCount,
    overallLevel,
    housingRatio,
    /** Same as legacy "incomeMultiple" naming — ratio of burden to income. */
    incomeMultiple: loanTaxInsuranceMultiple,
    loanTaxInsuranceMultiple,
    networthRatio,
  };
}

// ---------- Reverse affordability ("I picked a house — make it work") --------

/**
 * Minimum gross annual income needed so lenders would typically approve
 * this home price (28/36 rule), holding debts and loan terms constant.
 */
export function minimumAnnualIncomeForHomePrice({
  targetHomePrice,
  monthlyDebts,
  downPayment,
  interestRate,
  loanTermYears,
  propertyTaxRatePct,
  homeInsuranceAnnual,
  hoaMonthly,
  creditScore,
}) {
  if (targetHomePrice <= 0) return 0;

  let lo = 0;
  let hi = 5_000_000;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const maxMonthly = maxMonthlyHousingFromIncome({
      annualIncome: mid,
      monthlyDebts,
    });
    const maxPrice = maxAffordableHomePrice({
      maxMonthlyHousingPayment: maxMonthly,
      downPayment,
      interestRate,
      loanTermYears,
      propertyTaxRatePct,
      homeInsuranceAnnual,
      hoaMonthly,
      creditScore,
    });
    if (maxPrice >= targetHomePrice) hi = mid;
    else lo = mid;
  }

  return Math.ceil(hi / 1000) * 1000;
}

/**
 * How much monthly debt you'd need to pay off so this home price fits the
 * 36% back-end DTI rule at your current income. Returns 0 if already OK,
 * or null if housing alone exceeds 36% of gross (debts can't fix it).
 */
export function debtPayoffForHomePrice({
  targetHomePrice,
  annualIncome,
  monthlyDebts,
  downPayment,
  interestRate,
  loanTermYears,
  propertyTaxRatePct,
  homeInsuranceAnnual,
  hoaMonthly,
  creditScore,
}) {
  const monthlyHousing = monthlyPaymentBreakdown({
    homePrice: targetHomePrice,
    downPayment,
    interestRate,
    loanTermYears,
    propertyTaxRatePct,
    homeInsuranceAnnual,
    hoaMonthly,
    creditScore,
  }).total;

  const grossMonthly = annualIncome / 12;
  const maxDebts = grossMonthly * 0.36 - monthlyHousing;

  if (maxDebts < 0) return null;
  if (monthlyDebts <= maxDebts) return 0;
  return Math.ceil((monthlyDebts - maxDebts) / 10) * 10;
}

/**
 * One-stop analysis for "I want THIS house — what do I need to change?"
 * Returns numeric gaps and a list of concrete action items.
 */
export function makeItWorkAnalysis(inputs, targetHomePrice) {
  const closingCosts = estimateClosingCosts(
    targetHomePrice,
    inputs.closingCostsPct,
  );
  const ccForCheck = inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0;
  const breakdown = monthlyPaymentBreakdown({
    ...inputs,
    homePrice: targetHomePrice,
  });
  const monthlyHousing = breakdown.total;
  const grossMonthly = inputs.annualIncome / 12;

  const maxMonthlyForApproval = maxMonthlyHousingFromIncome({
    annualIncome: inputs.annualIncome,
    monthlyDebts: inputs.monthlyDebts,
  });
  const lenderMaxAtCurrentIncome = maxAffordableHomePrice({
    maxMonthlyHousingPayment: maxMonthlyForApproval,
    downPayment: inputs.downPayment,
    interestRate: inputs.interestRate,
    loanTermYears: inputs.loanTermYears,
    propertyTaxRatePct: inputs.propertyTaxRatePct,
    homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    hoaMonthly: inputs.hoaMonthly,
    creditScore: inputs.creditScore,
  });

  const mortgageBase = {
    homePrice: targetHomePrice,
    downPayment: inputs.downPayment,
    interestRate: inputs.interestRate,
    loanTermYears: inputs.loanTermYears,
    propertyTaxRatePct: inputs.propertyTaxRatePct,
    homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    hoaMonthly: inputs.hoaMonthly,
    creditScore: inputs.creditScore,
  };

  const cashNeeded = inputs.downPayment + closingCosts;
  const cashShortfall = Math.max(0, cashNeeded - inputs.currentSavings);

  const maxHealthyHousingDTI = Math.max(
    0,
    grossMonthly * 0.28 - inputs.monthlyDebts,
  );
  let extraDPForDTI = 0;
  if (monthlyHousing > maxHealthyHousingDTI) {
    if (maxHealthyHousingDTI <= 0) {
      extraDPForDTI = null;
    } else {
      const neededDP = downPaymentForTargetMonthly(
        mortgageBase,
        maxHealthyHousingDTI,
      );
      extraDPForDTI =
        neededDP >= targetHomePrice
          ? null
          : Math.max(0, neededDP - inputs.downPayment);
    }
  }

  const taxResult = estimateNet({
    grossAnnual: inputs.annualIncome,
    stateAbbrev: inputs.stateAbbrev,
    filingStatus: inputs.filingStatus,
    overridePct:
      inputs.effectiveTaxRateOverride === '' ||
      inputs.effectiveTaxRateOverride == null
        ? null
        : Number(inputs.effectiveTaxRateOverride),
  });
  const monthlyNet = taxResult.net / 12;
  const maxHealthyHousingNet = monthlyNet * 0.3;
  let extraDPForNetIncome = 0;
  if (monthlyHousing > maxHealthyHousingNet && maxHealthyHousingNet > 0) {
    const neededDP = downPaymentForTargetMonthly(
      mortgageBase,
      maxHealthyHousingNet,
    );
    extraDPForNetIncome =
      neededDP >= targetHomePrice
        ? null
        : Math.max(0, neededDP - inputs.downPayment);
  }

  const debtPayoff = debtPayoffForHomePrice({
    targetHomePrice,
    annualIncome: inputs.annualIncome,
    monthlyDebts: inputs.monthlyDebts,
    ...mortgageBase,
  });

  const minIncome = minimumAnnualIncomeForHomePrice({
    targetHomePrice,
    monthlyDebts: inputs.monthlyDebts,
    downPayment: inputs.downPayment,
    interestRate: inputs.interestRate,
    loanTermYears: inputs.loanTermYears,
    propertyTaxRatePct: inputs.propertyTaxRatePct,
    homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    hoaMonthly: inputs.hoaMonthly,
    creditScore: inputs.creditScore,
  });
  const extraIncome = Math.max(0, minIncome - inputs.annualIncome);

  const livingExpenses = grossMonthly * 0.25;
  const totalMonthlyBurn = monthlyHousing + inputs.monthlyDebts + livingExpenses;
  const remainingSavings =
    inputs.currentSavings - inputs.downPayment - ccForCheck;
  const extraSavingsForEmergencyFund = Math.max(
    0,
    totalMonthlyBurn * 3 - remainingSavings,
  );

  const comfort = affordabilityComfort({
    monthlyHousing,
    monthlyDebts: inputs.monthlyDebts,
    annualIncome: inputs.annualIncome,
  });

  const lenderApproves = monthlyHousing <= maxMonthlyForApproval;
  const actions = [];

  if (cashShortfall > 0) {
    actions.push({
      id: 'cash',
      level: 'red',
      kind: 'cashShortfall',
      amount: cashShortfall,
      cashNeeded,
      currentSavings: inputs.currentSavings,
    });
  }

  if (!lenderApproves) {
    if (extraDPForDTI != null && extraDPForDTI > 0) {
      actions.push({
        id: 'down-dti',
        level: 'yellow',
        kind: 'downPayment',
        amount: extraDPForDTI,
        reason: 'dti',
      });
    }
    if (debtPayoff != null && debtPayoff > 0) {
      actions.push({
        id: 'debt',
        level: 'yellow',
        kind: 'debtPayoff',
        amount: debtPayoff,
      });
    }
    if (extraIncome > 0) {
      actions.push({
        id: 'income',
        level: 'yellow',
        kind: 'income',
        amount: extraIncome,
        targetIncome: minIncome,
      });
    }
    if (
      extraDPForDTI === null &&
      (debtPayoff === null || debtPayoff <= 0) &&
      extraIncome <= 0
    ) {
      actions.push({
        id: 'too-expensive',
        level: 'red',
        kind: 'tooExpensive',
        lenderMaxAtCurrentIncome,
      });
    }
  }

  if (extraDPForNetIncome != null && extraDPForNetIncome > 0) {
    actions.push({
      id: 'down-net',
      level: 'yellow',
      kind: 'downPayment',
      amount: extraDPForNetIncome,
      reason: 'netIncome',
    });
  }

  if (extraSavingsForEmergencyFund > 0) {
    actions.push({
      id: 'emergency',
      level: 'yellow',
      kind: 'emergencyFund',
      amount: extraSavingsForEmergencyFund,
    });
  }

  const severity = { red: 0, yellow: 1, green: 2 };
  actions.sort((a, b) => severity[a.level] - severity[b.level]);

  return {
    targetHomePrice,
    monthlyHousing,
    closingCosts,
    lenderApproves,
    lenderMaxAtCurrentIncome,
    comfort,
    actions,
    allClear: actions.length === 0,
    gaps: {
      cashShortfall,
      extraDPForDTI,
      extraDPForNetIncome,
      debtPayoff,
      extraIncome,
      minIncome,
      extraSavingsForEmergencyFund,
    },
  };
}

// ---------- Down-payment solver ---------------------------------------------

/**
 * Binary-search for the minimum down payment that brings the total monthly
 * housing payment at or below `targetMonthly` for a fixed home price.
 *
 * Returns the required down payment amount. If even paying all cash (zero
 * loan) can't get the monthly **strictly below** target (taxes + insurance +
 * HOA floor alone are too high), returns `homePrice` as a sentinel meaning
 * "not achievable at or under target."
 */
export function downPaymentForTargetMonthly(inputs, targetMonthly) {
  const { homePrice } = inputs;
  // Check if paying all-cash still exceeds target (taxes + insurance + HOA floor)
  const allCashMonthly = monthlyPaymentBreakdown({ ...inputs, downPayment: homePrice }).total;
  if (allCashMonthly > targetMonthly) return homePrice;

  let lo = Math.min(Math.max(0, inputs.downPayment), homePrice);
  let hi = homePrice;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const monthly = monthlyPaymentBreakdown({ ...inputs, downPayment: mid }).total;
    if (monthly > targetMonthly) lo = mid;
    else hi = mid;
  }
  return hi;
}

const DP_EPS = 1;

/**
 * At this exact home price and income, what each buyer-comfort lever would need.
 * Uses the same definitions as `comfortAnalysis` (30% gross for housing,
 * loan+annual tax+ins for the "3×" line).
 *
 * @param mergedInputs Fields required by `monthlyPaymentBreakdown` plus `homePrice`
 * @param netWorth Total net worth (same field as buyer comfort card)
 */
export function buyerComfortMinimumRequirements(mergedInputs, netWorth) {
  const {
    homePrice,
    annualIncome,
    propertyTaxRatePct,
    homeInsuranceAnnual,
  } = mergedInputs;

  const price = Math.max(0, homePrice);
  const grossMonthly = Math.max(0, annualIncome) / 12;
  const targetHousing = grossMonthly * 0.3;

  const baseForSearch = { ...mergedInputs, downPayment: 0 };

  const allCashMonthly = monthlyPaymentBreakdown({
    ...mergedInputs,
    downPayment: price,
  }).total;

  let housing30;
  if (allCashMonthly > targetHousing + 1e-6) {
    housing30 = {
      id: 'housing30',
      mode: 'down_payment',
      impossible: true,
      minDownPayment: null,
    };
  } else {
    const dp = downPaymentForTargetMonthly(baseForSearch, targetHousing);
    housing30 = {
      id: 'housing30',
      mode: 'down_payment',
      impossible: false,
      minDownPayment: Math.min(price, Math.max(0, dp)),
    };
  }

  const minNetWorth = price * 0.3;
  const nwGap = Math.max(0, minNetWorth - netWorth);
  const networth30 = {
    id: 'networth30',
    mode: 'net_worth',
    minNetWorth,
    gap: nwGap,
  };

  const t = Math.max(0, (Number(propertyTaxRatePct) || 0) / 100);
  const ins = Math.max(0, Number(homeInsuranceAnnual) || 0);
  const cap3 = 3 * Math.max(0, annualIncome);
  const rawMinDp = price * (1 + t) + ins - cap3;

  let loanTaxIns3x;
  if (rawMinDp > price + DP_EPS) {
    loanTaxIns3x = {
      id: 'loanTaxIns3x',
      mode: 'down_payment',
      impossible: true,
      minDownPayment: null,
    };
  } else {
    loanTaxIns3x = {
      id: 'loanTaxIns3x',
      mode: 'down_payment',
      impossible: false,
      minDownPayment: Math.max(0, Math.min(price, rawMinDp)),
    };
  }

  return { housing30, networth30, loanTaxIns3x };
}

// ---------- Closing costs ---------------------------------------------------

/**
 * Closing costs are typically 2-5% of the home price. We use 3% as a
 * reasonable default and expose the percentage as an input.
 */
export function estimateClosingCosts(homePrice, percent = 3) {
  return (homePrice * percent) / 100;
}

// ---------- Amortization schedule ------------------------------------------

/**
 * Returns an array, one row per month, showing how each payment is split
 * between principal and interest over the life of the loan.
 *
 * Supports an optional extra monthly principal payment, so users can see
 * how much faster they pay the loan off.
 *
 * Each row: { month, payment, interest, principal, extra, balance }
 */
export function amortizationSchedule({
  loanAmount,
  annualRatePct,
  termYears,
  extraMonthlyPrincipal = 0,
}) {
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  const basePayment = monthlyPI(loanAmount, annualRatePct, termYears);

  const rows = [];
  let balance = loanAmount;
  for (let month = 1; month <= n && balance > 0.01; month++) {
    const interest = balance * r;
    let principal = basePayment - interest;
    let extra = extraMonthlyPrincipal;
    // Don't overpay the last month
    if (principal + extra > balance) {
      principal = Math.max(0, balance - extra);
      if (principal + extra > balance) extra = balance - principal;
    }
    balance = balance - principal - extra;
    rows.push({
      month,
      payment: basePayment + extra,
      interest,
      principal,
      extra,
      balance: Math.max(0, balance),
    });
    if (balance <= 0) break;
  }
  return rows;
}

/** Total interest paid over the schedule. */
export function totalInterest(schedule) {
  return schedule.reduce((sum, row) => sum + row.interest, 0);
}

// ---------- Mortgage payoff (extra payments) -------------------------------
//
// A richer cousin of `amortizationSchedule` that supports three flavors of
// extra principal at once, just like the Ramsey payoff calculator:
//   extraMonthly  - added to every single payment
//   extraYearly   - added once a year (on each 12th payment)
//   oneTimeAmount - a single lump sum, applied in month `oneTimeMonth`
//
// Each row: { month, payment, interest, principal, extra, balance }

/**
 * Build a month-by-month payoff schedule with optional extra principal.
 */
export function payoffSchedule({
  loanAmount,
  annualRatePct,
  termYears,
  extraMonthly = 0,
  extraYearly = 0,
  oneTimeAmount = 0,
  oneTimeMonth = 12,
}) {
  const r = annualRatePct / 100 / 12;
  const n = Math.round(termYears * 12);
  const basePayment = monthlyPI(loanAmount, annualRatePct, termYears);

  const rows = [];
  let balance = Math.max(0, loanAmount);

  for (let month = 1; month <= n && balance > 0.01; month++) {
    const interest = balance * r;
    let principal = basePayment - interest;
    if (principal < 0) principal = 0; // safety for tiny balances / 0% edge cases

    let extra = Math.max(0, extraMonthly);
    if (extraYearly > 0 && month % 12 === 0) extra += extraYearly;
    if (oneTimeAmount > 0 && month === oneTimeMonth) extra += oneTimeAmount;

    // Never pay more than what's actually owed this month.
    if (principal > balance) {
      principal = balance;
      extra = 0;
    } else if (principal + extra > balance) {
      extra = balance - principal;
    }

    balance = balance - principal - extra;
    rows.push({
      month,
      payment: basePayment + extra,
      interest,
      principal,
      extra,
      balance: Math.max(0, balance),
    });
    if (balance <= 0.01) break;
  }
  return rows;
}

/**
 * Compare a loan with extra payments against the plain "minimum payments only"
 * baseline. Returns how much sooner you'd be debt-free and how much interest
 * you'd save, plus both schedules (handy for charts and tables).
 */
export function mortgagePayoffAnalysis({
  loanAmount,
  annualRatePct,
  termYears,
  extraMonthly = 0,
  extraYearly = 0,
  oneTimeAmount = 0,
  oneTimeMonth = 12,
}) {
  const basePayment = monthlyPI(loanAmount, annualRatePct, termYears);

  const baseline = payoffSchedule({ loanAmount, annualRatePct, termYears });
  const accelerated = payoffSchedule({
    loanAmount,
    annualRatePct,
    termYears,
    extraMonthly,
    extraYearly,
    oneTimeAmount,
    oneTimeMonth,
  });

  const baselineInterest = totalInterest(baseline);
  const acceleratedInterest = totalInterest(accelerated);
  const hasExtra =
    (extraMonthly || 0) + (extraYearly || 0) + (oneTimeAmount || 0) > 0;

  return {
    basePayment,
    baseline,
    accelerated,
    baselineMonths: baseline.length,
    acceleratedMonths: accelerated.length,
    monthsSaved: Math.max(0, baseline.length - accelerated.length),
    baselineInterest,
    acceleratedInterest,
    interestSaved: Math.max(0, baselineInterest - acceleratedInterest),
    hasExtra,
  };
}

/**
 * A payoff schedule that also models a recast at `recastMonth`.
 *
 * Before the recast: same as `payoffSchedule` — base payment plus any extra
 * payments (monthly, yearly, one-time). At the recast, the remaining balance is
 * re-amortized over the remaining term at the same rate, so the required
 * payment drops. After the recast we pay that new lower payment straight
 * through to the original payoff date (extra payments stop, matching the
 * "lower my payment, keep my payoff date" goal of a recast).
 *
 * If `recastMonth` is falsy this behaves just like `payoffSchedule`.
 */
export function payoffScheduleWithRecast({
  loanAmount,
  annualRatePct,
  termYears,
  extraMonthly = 0,
  extraYearly = 0,
  oneTimeAmount = 0,
  oneTimeMonth = 12,
  recastMonth = 0,
}) {
  const r = annualRatePct / 100 / 12;
  const n = Math.round(termYears * 12);
  let basePayment = monthlyPI(loanAmount, annualRatePct, termYears);

  const rows = [];
  let balance = Math.max(0, loanAmount);
  let recasted = false;

  for (let month = 1; month <= n && balance > 0.01; month++) {
    // Recast kicks in the month AFTER the chosen recast month, re-amortizing
    // whatever balance is left over the months that remain.
    if (!recasted && recastMonth > 0 && month === recastMonth + 1) {
      const remainingMonths = n - (month - 1);
      basePayment = monthlyPI(balance, annualRatePct, remainingMonths / 12);
      recasted = true;
    }

    const interest = balance * r;
    let principal = basePayment - interest;
    if (principal < 0) principal = 0;

    // Extra payments only apply up to (and including) the recast month.
    let extra = 0;
    if (!recasted) {
      extra = Math.max(0, extraMonthly);
      if (extraYearly > 0 && month % 12 === 0) extra += extraYearly;
      if (oneTimeAmount > 0 && month === oneTimeMonth) extra += oneTimeAmount;
    }

    if (principal > balance) {
      principal = balance;
      extra = 0;
    } else if (principal + extra > balance) {
      extra = balance - principal;
    }

    balance = balance - principal - extra;
    rows.push({
      month,
      payment: basePayment + extra,
      interest,
      principal,
      extra,
      balance: Math.max(0, balance),
    });
    if (balance <= 0.01) break;
  }
  return rows;
}

/**
 * Mortgage recast: after you've paid down the loan (e.g. with extra payments
 * or a lump sum), the lender re-amortizes the *remaining* balance over the
 * *remaining* term at the same rate. The payoff date stays the same, but your
 * required monthly payment drops.
 *
 * We read the balance straight off a `payoffSchedule` (so it already reflects
 * any extra payments), recalc the payment for the months that are left, and
 * report how much lower it is than the original required payment.
 *
 * Returns null if the recast doesn't make sense (loan already paid off, recast
 * timed at/after the final payment, etc.).
 *
 * @param schedule           rows from payoffSchedule (the "with extras" plan)
 * @param recastMonth        1-based month the recast happens (e.g. year 5 = 60)
 * @param annualRatePct      same rate as the original loan
 * @param originalTermMonths total months of the original loan (years * 12)
 * @param originalPayment    the original required monthly P&I (for the "drop")
 */
export function recastPayment({
  schedule,
  recastMonth,
  annualRatePct,
  originalTermMonths,
  originalPayment,
}) {
  const month = Math.round(recastMonth);
  if (month <= 0 || month >= originalTermMonths) return null;

  const idx = month - 1;
  // Loan already fully paid off before the recast date — nothing to recast.
  if (idx >= schedule.length) return null;

  const balanceAtRecast = schedule[idx].balance;
  if (balanceAtRecast <= 0.01) return null;

  const remainingMonths = originalTermMonths - month;
  if (remainingMonths <= 0) return null;

  const newPayment = monthlyPI(
    balanceAtRecast,
    annualRatePct,
    remainingMonths / 12,
  );

  return {
    balanceAtRecast,
    remainingMonths,
    newPayment,
    monthlyDrop: Math.max(0, originalPayment - newPayment),
  };
}

/** Equity built each year (home appreciation + principal paid down). */
export function equityOverTime({
  homePrice,
  downPayment,
  schedule,
  annualAppreciationPct = 3,
}) {
  // Group amortization by year
  const yearly = [];
  let principalPaid = 0;
  for (let y = 0; y < Math.ceil(schedule.length / 12); y++) {
    const slice = schedule.slice(y * 12, (y + 1) * 12);
    principalPaid += slice.reduce((s, row) => s + row.principal + row.extra, 0);
    const appreciatedValue = homePrice * Math.pow(1 + annualAppreciationPct / 100, y + 1);
    const equity = appreciatedValue - (homePrice - downPayment - principalPaid);
    yearly.push({
      year: y + 1,
      homeValue: appreciatedValue,
      principalPaid,
      equity,
      remainingBalance: Math.max(0, homePrice - downPayment - principalPaid),
    });
  }
  return yearly;
}

// ---------- Stress tests ----------------------------------------------------

/**
 * Run a "what if" against an existing scenario and return the new monthly
 * payment + how it compares.
 *
 * scenario  -> the user's current inputs (same shape as the calculator)
 * variant   -> 'rate_up_1' | 'rate_down_1' | 'job_loss_3mo' | 'job_loss_6mo'
 */
export function stressTest(scenario, variant) {
  const base = monthlyPaymentBreakdown(scenario);

  switch (variant) {
    case 'rate_up_1': {
      const stressed = monthlyPaymentBreakdown({
        ...scenario,
        interestRate: scenario.interestRate + 1,
      });
      return {
        label: 'Interest rates rise by 1%',
        baseline: base.total,
        stressed: stressed.total,
        delta: stressed.total - base.total,
        description:
          'Your rate locks at signing, so this only matters if you have an ARM or you buy later. Useful to see what your payment would look like if you wait.',
      };
    }
    case 'rate_down_1': {
      const stressed = monthlyPaymentBreakdown({
        ...scenario,
        interestRate: Math.max(0, scenario.interestRate - 1),
      });
      return {
        label: 'Interest rates drop by 1%',
        baseline: base.total,
        stressed: stressed.total,
        delta: stressed.total - base.total,
        description:
          'What if you waited and rates fell? You could refinance later and save this much per month.',
      };
    }
    case 'job_loss_3mo':
    case 'job_loss_6mo': {
      const months = variant === 'job_loss_3mo' ? 3 : 6;
      const cushionNeeded = base.total * months;
      return {
        label: `Income gap of ${months} months`,
        baseline: base.total,
        stressed: cushionNeeded,
        delta: cushionNeeded,
        description: `You would need at least ${months}x your monthly housing payment in savings just to cover the mortgage during a ${months}-month gap. (You'd also still need food, transport, etc.)`,
      };
    }
    default:
      return null;
  }
}

// ---------- Emergency fund check --------------------------------------------

/**
 * After buying, do they still have a healthy emergency fund?
 * Healthy = at least 3 months of TOTAL monthly expenses (housing + debts +
 * living expenses we estimate from income).
 */
export function emergencyFundCheck({
  currentSavings,
  downPayment,
  closingCosts,
  monthlyHousing,
  monthlyDebts,
  annualIncome,
}) {
  const remainingSavings = currentSavings - downPayment - closingCosts;
  // Rough estimate: living expenses (food, gas, utilities) ~ 25% of gross income
  const livingExpenses = (annualIncome / 12) * 0.25;
  const totalMonthlyBurn = monthlyHousing + monthlyDebts + livingExpenses;
  const monthsCovered = totalMonthlyBurn > 0 ? remainingSavings / totalMonthlyBurn : 0;

  let level = 'green';
  if (monthsCovered < 1) level = 'red';
  else if (monthsCovered < 3) level = 'yellow';

  return {
    remainingSavings,
    monthsCovered,
    level,
    recommended3mo: totalMonthlyBurn * 3,
    recommended6mo: totalMonthlyBurn * 6,
  };
}

// ---------- Cash left after closing (distinct from emergency months) --------

/**
 * Do you keep a tangible dollar cushion right after wiring down payment +
 * closing costs, before judging reserves in months?
 *
 * Threshold: max($2,500, 3% of gross annual income) — a light floor before
 * the emergency-fund countdown.
 */
export function cashAfterClosingHealth({
  currentSavings,
  downPayment,
  closingCosts,
  annualIncome,
}) {
  const remainingSavings = currentSavings - downPayment - closingCosts;
  const minComfort = Math.max(2500, (annualIncome || 0) * 0.03);

  let level = 'green';
  if (remainingSavings <= 0) level = 'red';
  else if (remainingSavings < minComfort) level = 'yellow';

  return {
    remainingSavings,
    minComfort,
    level,
    shortfall: remainingSavings < 0 ? -remainingSavings : 0,
  };
}

/**
 * Monthly slack after housing + debts + user-entered living costs.
 * `monthlySpending` = groceries, gas, fun, subscriptions, etc. (no rent/mortgage/debts).
 * `extraHomeownerSpending` = expected bump once you own (utilities, upkeep, …).
 */
export function monthlyDiscretionaryBuffer({
  monthlyNet,
  monthlyHousing,
  monthlyDebts,
  monthlySpending = 0,
  extraHomeownerSpending = 0,
  annualIncome,
}) {
  const livingExpensesMonthly =
    monthlySpending > 0
      ? monthlySpending + extraHomeownerSpending
      : (annualIncome > 0 ? (annualIncome / 12) * 0.25 : 0) +
        extraHomeownerSpending;

  const leftover =
    monthlyNet - monthlyHousing - monthlyDebts - livingExpensesMonthly;

  const comfortFloor =
    monthlyNet > 0 ? Math.max(200, monthlyNet * 0.1) : 200;

  let level = 'green';
  if (leftover <= 0) level = 'red';
  else if (leftover < comfortFloor) level = 'yellow';

  return {
    leftover,
    livingExpensesMonthly,
    baseSpending: monthlySpending,
    extraHomeownerSpending,
    comfortFloor,
    level,
    monthlyNet,
  };
}

// ---------- Simple savings projection ---------------------------------------

/** Month-by-month savings until a fixed dollar target is hit. */
export function projectSimpleSavings({
  target,
  current,
  monthly,
  returnPct,
  maxMonths = 600,
}) {
  const r = returnPct / 100 / 12;
  let balance = current;
  let totalContributed = current;
  let monthsToGoal = null;

  for (let m = 1; m <= maxMonths; m++) {
    balance = balance * (1 + r) + monthly;
    totalContributed += monthly;
    if (balance >= target && monthsToGoal == null) {
      monthsToGoal = m;
      break;
    }
  }

  const targetDate = new Date();
  if (monthsToGoal != null) {
    targetDate.setMonth(targetDate.getMonth() + monthsToGoal);
  }

  return {
    monthsToGoal,
    targetDate,
    totalContributed,
    finalBalance: balance,
    interestEarned: balance - totalContributed,
  };
}

// ---------- Wait & save ("what if I wait?") ---------------------------------

function downPaymentNeeded(homePrice, downPaymentMode, downPaymentPercent, downPaymentFixed) {
  if (downPaymentMode === 'fixed') return downPaymentFixed;
  return homePrice * (downPaymentPercent / 100);
}

function waitSnapshot({
  inputs,
  savings,
  homePrice,
  annualIncome,
  downPaymentMode,
  downPaymentPercent,
  downPaymentFixed,
}) {
  const downNeeded = downPaymentNeeded(
    homePrice,
    downPaymentMode,
    downPaymentPercent,
    downPaymentFixed,
  );
  const closing = estimateClosingCosts(homePrice, inputs.closingCostsPct);
  const cashNeeded = downNeeded + closing;
  const cashGap = Math.max(0, cashNeeded - savings);
  const hasCash = cashGap <= 0;

  const maxMonthly = maxMonthlyHousingFromIncome({
    annualIncome,
    monthlyDebts: inputs.monthlyDebts,
  });
  const monthlyHousing = monthlyPaymentBreakdown({
    ...inputs,
    homePrice,
    downPayment: downNeeded,
  }).total;
  const lenderOk = monthlyHousing <= maxMonthly;
  const lenderGap = Math.max(0, monthlyHousing - maxMonthly);

  const minIncome = minimumAnnualIncomeForHomePrice({
    targetHomePrice: homePrice,
    monthlyDebts: inputs.monthlyDebts,
    downPayment: downNeeded,
    interestRate: inputs.interestRate,
    loanTermYears: inputs.loanTermYears,
    propertyTaxRatePct: inputs.propertyTaxRatePct,
    homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    hoaMonthly: inputs.hoaMonthly,
    creditScore: inputs.creditScore,
  });
  const incomeGap = Math.max(0, minIncome - annualIncome);

  return {
    savings,
    homePrice,
    annualIncome,
    downNeeded,
    closing,
    cashNeeded,
    cashGap,
    hasCash,
    monthlyHousing,
    maxMonthly,
    lenderOk,
    lenderGap,
    minIncome,
    incomeGap,
    ready: hasCash && lenderOk,
  };
}

/**
 * Project saving while home prices and income grow. Finds when the buyer
 * can afford the goal home (cash at closing + lender 28/36 approval).
 */
export function projectWaitAndSave({
  inputs,
  goalHomePrice,
  monthlySavings,
  savingsReturnPct,
  homeAppreciationPct,
  incomeGrowthPct,
  downPaymentMode = 'percent',
  downPaymentPercent = 20,
  downPaymentFixed = 40_000,
  milestoneMonths = [6, 12, 24],
  maxMonths = 600,
}) {
  const r = savingsReturnPct / 100 / 12;
  const homeGrowth = 1 + homeAppreciationPct / 100;
  const incomeGrowth = 1 + incomeGrowthPct / 100;

  let savings = inputs.currentSavings;
  let homePrice = goalHomePrice;
  let annualIncome = inputs.annualIncome;
  let monthsToReady = null;
  const timeline = [];

  for (let m = 0; m <= maxMonths; m++) {
    if (m > 0) {
      savings = savings * (1 + r) + monthlySavings;
      if (m % 12 === 0) {
        homePrice *= homeGrowth;
        annualIncome *= incomeGrowth;
      }
    }

    const snap = waitSnapshot({
      inputs,
      savings,
      homePrice,
      annualIncome,
      downPaymentMode,
      downPaymentPercent,
      downPaymentFixed,
    });

    if (milestoneMonths.includes(m)) {
      timeline.push({ month: m, ...snap });
    }

    if (snap.ready && monthsToReady == null && m > 0) {
      monthsToReady = m;
    }
  }

  const readyDate = new Date();
  if (monthsToReady != null) {
    readyDate.setMonth(readyDate.getMonth() + monthsToReady);
  }

  const finalSnap =
    monthsToReady != null
      ? waitSnapshot({
          inputs,
          savings: (() => {
            let s = inputs.currentSavings;
            let hp = goalHomePrice;
            let inc = inputs.annualIncome;
            for (let m = 1; m <= monthsToReady; m++) {
              s = s * (1 + r) + monthlySavings;
              if (m % 12 === 0) {
                hp *= homeGrowth;
                inc *= incomeGrowth;
              }
            }
            return s;
          })(),
          homePrice: (() => {
            let hp = goalHomePrice;
            for (let m = 1; m <= monthsToReady; m++) {
              if (m % 12 === 0) hp *= homeGrowth;
            }
            return hp;
          })(),
          annualIncome: (() => {
            let inc = inputs.annualIncome;
            for (let m = 1; m <= monthsToReady; m++) {
              if (m % 12 === 0) inc *= incomeGrowth;
            }
            return inc;
          })(),
          downPaymentMode,
          downPaymentPercent,
          downPaymentFixed,
        })
      : waitSnapshot({
          inputs,
          savings,
          homePrice,
          annualIncome,
          downPaymentMode,
          downPaymentPercent,
          downPaymentFixed,
        });

  return {
    monthsToReady,
    readyDate,
    finalSnap,
    timeline,
    startingHomePrice: goalHomePrice,
  };
}

// ---------- Refinance analysis ----------------------------------------------

/**
 * Compare current loan payment vs a refi at a new rate (same remaining term).
 */
export function refinanceAnalysis({
  loanBalance,
  currentRatePct,
  newRatePct,
  yearsRemaining,
  refiClosingCosts,
}) {
  if (loanBalance <= 0 || yearsRemaining <= 0) {
    return {
      currentPayment: 0,
      newPayment: 0,
      monthlySavings: 0,
      breakEvenMonths: null,
      lifetimeSavings: 0,
      worthwhile: false,
    };
  }

  const currentPayment = monthlyPI(loanBalance, currentRatePct, yearsRemaining);
  const newPayment = monthlyPI(loanBalance, newRatePct, yearsRemaining);
  const monthlySavings = currentPayment - newPayment;
  const totalMonths = yearsRemaining * 12;

  let breakEvenMonths = null;
  if (monthlySavings > 0) {
    breakEvenMonths = Math.ceil(refiClosingCosts / monthlySavings);
  }

  const lifetimeSavings =
    monthlySavings > 0
      ? monthlySavings * totalMonths - refiClosingCosts
      : -refiClosingCosts;

  const worthwhile =
    monthlySavings > 0 &&
    breakEvenMonths != null &&
    breakEvenMonths <= totalMonths;

  return {
    currentPayment,
    newPayment,
    monthlySavings,
    breakEvenMonths,
    lifetimeSavings,
    worthwhile,
    totalMonths,
  };
}

/** Loan snapshot from calculator inputs at a given home price. */
export function loanSnapshotFromInputs(inputs, homePrice) {
  const loanBalance = Math.max(0, homePrice - inputs.downPayment);
  return {
    loanBalance,
    currentRatePct: inputs.interestRate,
    yearsRemaining: inputs.loanTermYears,
    homePrice,
  };
}

// ---------- Rent vs Buy ----------------------------------------------------

/**
 * Returns the year at which buying becomes cheaper than renting (the
 * "break-even point"). Approximation that ignores taxes/maintenance details
 * but is good enough for a back-of-the-napkin answer.
 */
export function rentVsBuy({
  homePrice,
  downPayment,
  closingCosts,
  monthlyHousing, // PITI + PMI + HOA
  monthlyMaintenancePct = 1, // 1% of home value per year for maintenance
  monthlyRent,
  annualRentIncreasePct = 3,
  annualHomeAppreciationPct = 3,
  investmentReturnPct = 6, // if you instead invested your down payment
  yearsToProject = 30,
}) {
  let buyTotalCost = downPayment + closingCosts;
  let rentTotalCost = 0;
  let currentRent = monthlyRent;
  let homeValue = homePrice;
  let investmentValue = downPayment + closingCosts;

  const points = [];
  let breakEvenYear = null;

  for (let year = 1; year <= yearsToProject; year++) {
    const annualMaintenance = homeValue * (monthlyMaintenancePct / 100);
    buyTotalCost += monthlyHousing * 12 + annualMaintenance;

    rentTotalCost += currentRent * 12;
    currentRent *= 1 + annualRentIncreasePct / 100;

    homeValue *= 1 + annualHomeAppreciationPct / 100;
    investmentValue *= 1 + investmentReturnPct / 100;

    // "Net cost of buying" = money out the door minus the home you own
    const netBuyCost = buyTotalCost - homeValue;
    // "Net cost of renting" = money out the door minus the investment account
    // you'd have if you'd invested the down payment instead
    const netRentCost = rentTotalCost - investmentValue;

    points.push({ year, netBuyCost, netRentCost, homeValue, investmentValue });

    if (breakEvenYear === null && netBuyCost < netRentCost) {
      breakEvenYear = year;
    }
  }
  return { points, breakEvenYear };
}
