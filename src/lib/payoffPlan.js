// Sandbox math for the "could I pay off this house?" check.
//
// The user takes a mortgage at closing, but wants to know: do I have enough
// across my accounts to wipe out the loan at will AND still keep an
// emergency fund + sinking funds untouched?

export const PAYOFF_ACCOUNTS = [
  { key: 'cash', label: 'Cash / savings', color: '#006aff' },
  { key: 'brokerage', label: 'Brokerage', color: '#00a663' },
  { key: 'otherInvestments', label: 'Other investments', color: '#a155f5' },
  { key: 'otherHouseEquity', label: 'Other house (equity)', color: '#d49b00' },
  {
    key: 'retirement401k',
    label: '401(k) / retirement',
    color: '#d6443c',
    excluded: true,
  },
];

// Money is pulled from accounts in this order (most liquid first).
export const SPEND_ORDER = ['cash', 'brokerage', 'otherInvestments', 'otherHouseEquity'];

// Reserves must live somewhere liquid — home equity can't be an emergency fund.
export const RESERVE_ORDER = ['cash', 'brokerage', 'otherInvestments'];

/** Same monthly burn stub as emergencyFundCheck in mortgage.js. */
export function monthlyExpenseBurn({ annualIncome, monthlyHousing, monthlyDebts }) {
  const livingExpenses = (annualIncome / 12) * 0.25;
  return monthlyHousing + monthlyDebts + livingExpenses;
}

/**
 * Biggest loan balance a given monthly payment can support (present value
 * of the payment stream at the loan's rate).
 */
export function loanBalanceForPayment({ monthlyPayment, annualRatePct, termYears }) {
  const n = Math.max(1, Math.round(termYears * 12));
  const r = annualRatePct / 100 / 12;
  if (monthlyPayment <= 0) return 0;
  if (r <= 0) return monthlyPayment * n;
  return (monthlyPayment * (1 - Math.pow(1 + r, -n))) / r;
}

// Long-run stock market average we assume for the invest-vs-payoff call.
export const EXPECTED_MARKET_RETURN_PCT = 7;

/**
 * Two payment-based "ideal mortgage balance" benchmarks:
 *  - 28% rule: P&I payment ≤ 28% of GROSS monthly income, at your rate & term.
 *  - Dave Ramsey: payment ≤ 25% of NET (take-home) monthly income on a 15-year loan.
 */
export function idealMortgageBalances({
  grossAnnual,
  netAnnual,
  annualRatePct,
  termYears,
}) {
  const rule28 = loanBalanceForPayment({
    monthlyPayment: (grossAnnual / 12) * 0.28,
    annualRatePct,
    termYears,
  });
  const ramsey = loanBalanceForPayment({
    monthlyPayment: (netAnnual / 12) * 0.25,
    annualRatePct,
    termYears: 15,
  });
  return {
    rule28: { balance: rule28, monthlyPayment: (grossAnnual / 12) * 0.28 },
    ramsey: { balance: ramsey, monthlyPayment: (netAnnual / 12) * 0.25 },
  };
}

/**
 * Carrying the mortgage and investing vs. paying it off.
 * Paying off "earns" the mortgage rate, guaranteed. Investing is expected to
 * earn ~7%/yr, not guaranteed. Returns the annual dollar edge of the winner.
 */
export function payoffVsInvest({
  loanOutstanding,
  mortgageRatePct,
  expectedReturnPct = EXPECTED_MARKET_RETURN_PCT,
}) {
  const investWins = expectedReturnPct > mortgageRatePct;
  const edgePct = Math.abs(expectedReturnPct - mortgageRatePct);
  return {
    investWins,
    edgePct,
    annualDollarEdge: (loanOutstanding * edgePct) / 100,
    expectedReturnPct,
  };
}

/**
 * Run the payoff plan.
 *
 * Order of operations:
 *   1. Earmark reserves (emergency fund + sinking funds) in liquid accounts.
 *   2. Spend what's left on: down payment + closing costs, then full loan payoff.
 *   3. Whatever survives is the "free leftover".
 */
export function computePayoffPlan({
  balances,
  cashNeededAtClosing,
  loanAmount,
  reserveTarget,
}) {
  const bal = (k) => Math.max(0, balances[k] ?? 0);

  // 1) Earmark reserves in liquid accounts.
  const earmarks = {};
  let reserveLeft = Math.max(0, reserveTarget);
  RESERVE_ORDER.forEach((k) => {
    const take = Math.min(bal(k), reserveLeft);
    earmarks[k] = take;
    reserveLeft -= take;
  });
  const reserveShortfall = reserveLeft;

  // 2) Spend on closing + payoff from non-earmarked money.
  const need = Math.max(0, cashNeededAtClosing) + Math.max(0, loanAmount);
  let needLeft = need;
  const spent = {};
  SPEND_ORDER.forEach((k) => {
    const available = Math.max(0, bal(k) - (earmarks[k] ?? 0));
    const take = Math.min(available, needLeft);
    spent[k] = take;
    needLeft -= take;
  });
  const shortfall = needLeft;

  // 3) What's left sitting in each account (reserves still live here).
  const remaining = {};
  PAYOFF_ACCOUNTS.forEach(({ key }) => {
    remaining[key] = bal(key) - (spent[key] ?? 0);
  });

  const totalFundable = SPEND_ORDER.reduce((s, k) => s + bal(k), 0);
  const leftoverFree = totalFundable - need - Math.max(0, reserveTarget);

  return {
    earmarks,
    spent,
    remaining,
    need,
    shortfall,
    reserveShortfall,
    totalFundable,
    leftoverFree,
  };
}
