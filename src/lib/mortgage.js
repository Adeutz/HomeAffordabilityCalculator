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
//   3  - Home price ≤ 3× annual gross income
//
// We also expose three "tiers" inspired by the same chart:
//   - Stretch:    home ≤ 5× income, net worth ≥ 30% of home
//   - Reasonable: home ≤ 4× income, net worth ≥ 50% of home
//   - Ideal:      home ≤ 3× income, net worth ≥ 30% of home (the "3" target)

/** Pure rule-check helpers so the UI can render pass/fail nicely. */
export function comfortAnalysis({
  annualIncome,
  netWorth,
  homePriceBeingChecked,
  monthlyHousing,
}) {
  const grossMonthly = annualIncome / 12;

  // Tier max prices (what you could comfortably afford at each level)
  const stretchMax = Math.min(annualIncome * 5, netWorth / 0.3);
  const reasonableMax = Math.min(annualIncome * 4, netWorth / 0.5);
  const idealMax = Math.min(annualIncome * 3, netWorth / 0.3);

  // Rule values for the home price being considered
  const housingRatio = grossMonthly > 0 ? monthlyHousing / grossMonthly : 1;
  const incomeMultiple =
    annualIncome > 0 ? homePriceBeingChecked / annualIncome : Infinity;
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
      id: 'income3x',
      label: 'Home price ≤ 3× annual income',
      description:
        'The "3" in 30/30/3 — the recommended sweet spot for long-term affordability.',
      pass: incomeMultiple <= 3,
      currentValue: incomeMultiple,
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
    incomeMultiple,
    networthRatio,
  };
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
