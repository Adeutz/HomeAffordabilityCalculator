// Long-horizon "pay off the house vs keep the mortgage and invest" engine.
//
// The big idea: every strategy commits the SAME fixed amount of money each
// month (a "household budget"). The mortgage eats its share; whatever is left
// over gets invested. So the strategies are apples-to-apples — the only thing
// that changes is *where your money sits* (in the house vs in the market) and
// *how fast the mortgage disappears*. That keeps the comparison honest.
//
// All functions here are pure (no UI), so they're easy to read and test.

import { monthlyPI } from './mortgage.js';

export { monthlyPI };

export const DEFAULT_ASSUMPTIONS = {
  marketReturnPct: 7, // long-run stock market average (not guaranteed!)
  inflationPct: 3, // to show results in today's dollars
  homeAppreciationPct: 3,
  capGainsPct: 15, // long-term federal capital-gains rate (typical)
  currentAge: 35,
  retirementAge: 65,
};

// Market returns we sweep across in the sensitivity table.
export const SENSITIVITY_RETURNS = [4, 5, 6, 7, 8, 10];

const monthlyRate = (annualPct) => annualPct / 100 / 12;

/**
 * Simulate one path month-by-month.
 *
 * Budget = monthlyPI + extraMortgagePrincipal + monthlyContribution. Each month
 * the mortgage takes what it needs; the rest is invested. Once the mortgage is
 * gone, the freed-up payment flows into investing too (unless investFreedPayment
 * is false, which models the "lazy" baseline that just spends it).
 *
 * Home value and the separate retirement (401k) bucket compound yearly. The
 * taxable investment account compounds monthly and tracks a cost basis so we
 * can apply capital-gains tax later.
 */
export function simulatePath({
  startInvest,
  startMortgage,
  monthlyPI: pi,
  mortgageRatePct,
  extraMortgagePrincipal = 0,
  monthlyContribution = 0,
  marketReturnPct,
  months,
  homePrice,
  homeAppreciationPct,
  start401k = 0,
  // 401(k) keeps growing at the real market return even in paths where the
  // taxable pool sits in cash (the baseline), so it adds equally everywhere.
  retirementReturnPct = marketReturnPct,
  investFreedPayment = true,
}) {
  const rM = monthlyRate(mortgageRatePct);
  const rI = monthlyRate(marketReturnPct);
  const budget = pi + extraMortgagePrincipal + monthlyContribution;

  let invest = Math.max(0, startInvest);
  let basis = Math.max(0, startInvest); // money you put in (not taxed again)
  let mortgage = Math.max(0, startMortgage);
  let mortgageFreeMonth = mortgage <= 0.01 ? 0 : null;

  const homeValueAtYear = (y) =>
    homePrice * Math.pow(1 + homeAppreciationPct / 100, y);
  const retirementAtYear = (y) =>
    start401k * Math.pow(1 + retirementReturnPct / 100, y);

  const series = [
    yearPoint({
      year: 0,
      invest,
      basis,
      mortgage,
      homeValue: homeValueAtYear(0),
      retirement: retirementAtYear(0),
    }),
  ];

  for (let m = 1; m <= months; m++) {
    // 1) Mortgage takes its cut.
    let cashToMortgage = 0;
    if (mortgage > 0.01) {
      const interest = mortgage * rM;
      let payment = pi + extraMortgagePrincipal;
      let principal = payment - interest;
      if (principal < 0) principal = 0;
      if (principal >= mortgage) {
        // Final payment — don't overpay.
        principal = mortgage;
        payment = principal + interest;
      }
      mortgage -= principal;
      cashToMortgage = payment;
      if (mortgage <= 0.01 && mortgageFreeMonth == null) {
        mortgageFreeMonth = m;
      }
    }

    // 2) Whatever budget the mortgage didn't use gets invested.
    const contribution = investFreedPayment
      ? Math.max(0, budget - cashToMortgage)
      : monthlyContribution;

    invest = invest * (1 + rI) + contribution;
    basis += contribution;

    // 3) Record a snapshot each year.
    if (m % 12 === 0) {
      const y = m / 12;
      series.push(
        yearPoint({
          year: y,
          invest,
          basis,
          mortgage,
          homeValue: homeValueAtYear(y),
          retirement: retirementAtYear(y),
        }),
      );
    }
  }

  return {
    series,
    final: series[series.length - 1],
    mortgageFreeMonth,
    mortgageFreeYear: mortgageFreeMonth == null ? null : mortgageFreeMonth / 12,
  };
}

function yearPoint({ year, invest, basis, mortgage, homeValue, retirement }) {
  const homeEquity = homeValue - mortgage;
  return {
    year,
    invest,
    basis,
    mortgage,
    homeValue,
    homeEquity,
    retirement,
    // "On paper" net worth — nothing sold yet, so no taxes applied.
    netWorth: invest + retirement + homeEquity,
  };
}

/** Capital-gains tax owed if you sold the taxable investments today. */
export function capitalGainsTax(invest, basis, capGainsPct) {
  const gains = Math.max(0, invest - basis);
  return (gains * capGainsPct) / 100;
}

/** Net worth assuming you cash out the taxable investments (gains taxed). */
export function afterTaxNetWorth(point, capGainsPct) {
  const tax = capitalGainsTax(point.invest, point.basis, capGainsPct);
  return point.netWorth - tax;
}

/** Convert a future dollar amount into today's purchasing power. */
export function toTodaysDollars(futureValue, inflationPct, years) {
  return futureValue / Math.pow(1 + inflationPct / 100, years);
}

/**
 * Build the headline three-way comparison from one pool of money:
 *   - payoff:   spend the pool to kill the mortgage, invest the freed payment
 *   - keep:     keep the pool invested, pay the mortgage normally
 *   - baseline: do nothing extra (pool sits in cash, freed payment is spent)
 */
export function buildComparison({
  pool,
  loanBalance,
  monthlyPI: pi,
  mortgageRatePct,
  monthlyExtraInvest = 0,
  marketReturnPct,
  homePrice,
  homeAppreciationPct,
  start401k = 0,
  months,
}) {
  const common = {
    monthlyPI: pi,
    mortgageRatePct,
    marketReturnPct,
    months,
    homePrice,
    homeAppreciationPct,
    start401k,
  };

  const paid = Math.min(pool, loanBalance); // how much of the pool clears the loan

  const payoff = simulatePath({
    ...common,
    startInvest: Math.max(0, pool - loanBalance),
    startMortgage: Math.max(0, loanBalance - pool),
    monthlyContribution: monthlyExtraInvest,
    investFreedPayment: true,
  });

  const keep = simulatePath({
    ...common,
    startInvest: pool,
    startMortgage: loanBalance,
    monthlyContribution: monthlyExtraInvest,
    investFreedPayment: true,
  });

  const baseline = simulatePath({
    ...common,
    marketReturnPct: 0, // pool just sits in cash, earning nothing
    retirementReturnPct: marketReturnPct, // but the 401(k) still grows normally
    startInvest: pool,
    startMortgage: loanBalance,
    monthlyContribution: 0,
    investFreedPayment: false,
  });

  return { payoff, keep, baseline, lumpUsedForPayoff: paid };
}

/**
 * The "no lump sum" pair: throw an extra amount at the mortgage every month,
 * vs. investing that same extra amount. Same total budget either way.
 */
export function buildAccelerated({
  pool,
  loanBalance,
  monthlyPI: pi,
  mortgageRatePct,
  monthlyExtraInvest = 0,
  extraMortgagePrincipal,
  marketReturnPct,
  homePrice,
  homeAppreciationPct,
  start401k = 0,
  months,
}) {
  const common = {
    monthlyPI: pi,
    mortgageRatePct,
    marketReturnPct,
    months,
    homePrice,
    homeAppreciationPct,
    start401k,
    startInvest: pool,
    startMortgage: loanBalance,
    investFreedPayment: true,
  };

  const accelerate = simulatePath({
    ...common,
    extraMortgagePrincipal,
    monthlyContribution: monthlyExtraInvest,
  });

  const investExtra = simulatePath({
    ...common,
    extraMortgagePrincipal: 0,
    monthlyContribution: monthlyExtraInvest + extraMortgagePrincipal,
  });

  return { accelerate, investExtra };
}

/**
 * First year (after the start) where the leader flips between two paths.
 * Returns null if one path leads the whole way.
 */
export function crossoverYear(seriesA, seriesB) {
  if (!seriesA?.length || !seriesB?.length) return null;
  const diff0 = seriesA[0].netWorth - seriesB[0].netWorth;
  let prevSign = Math.sign(diff0);
  for (let i = 1; i < Math.min(seriesA.length, seriesB.length); i++) {
    const diff = seriesA[i].netWorth - seriesB[i].netWorth;
    const sign = Math.sign(diff);
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) {
      return seriesA[i].year;
    }
    if (sign !== 0) prevSign = sign;
  }
  return null;
}

/**
 * Sweep market returns and report final (today's-dollars, after-tax) net worth
 * for payoff vs keep at each return, plus who wins and by how much.
 */
export function buildSensitivity({
  pool,
  loanBalance,
  monthlyPI: pi,
  mortgageRatePct,
  monthlyExtraInvest = 0,
  homePrice,
  homeAppreciationPct,
  start401k = 0,
  months,
  inflationPct,
  capGainsPct,
  returns = SENSITIVITY_RETURNS,
}) {
  const years = months / 12;
  return returns.map((r) => {
    const { payoff, keep } = buildComparison({
      pool,
      loanBalance,
      monthlyPI: pi,
      mortgageRatePct,
      monthlyExtraInvest,
      marketReturnPct: r,
      homePrice,
      homeAppreciationPct,
      start401k,
      months,
    });
    const payoffNW = toTodaysDollars(
      afterTaxNetWorth(payoff.final, capGainsPct),
      inflationPct,
      years,
    );
    const keepNW = toTodaysDollars(
      afterTaxNetWorth(keep.final, capGainsPct),
      inflationPct,
      years,
    );
    return {
      returnPct: r,
      payoffNetWorth: payoffNW,
      keepNetWorth: keepNW,
      gap: keepNW - payoffNW,
      winner: keepNW > payoffNW ? 'keep' : 'payoff',
    };
  });
}

/**
 * Plain-English verdict. Returns a tone + headline + supporting points so the
 * UI can render it nicely. Built to reassure an anxious buyer: it always points
 * out that paying off is the guaranteed, lower-stress option.
 */
export function buildVerdict({
  payoffNetWorth,
  keepNetWorth,
  mortgageRatePct,
  marketReturnPct,
  years,
  canFullyPayoff,
}) {
  const keepWins = keepNetWorth > payoffNetWorth;
  const gap = Math.abs(keepNetWorth - payoffNetWorth);
  const winnerNetWorth = Math.max(keepNetWorth, payoffNetWorth);
  const pctGap = winnerNetWorth > 0 ? (gap / winnerNetWorth) * 100 : 0;
  const closeCall = pctGap < 8; // within 8% is basically a tie given the guesswork

  const points = [];

  if (!canFullyPayoff) {
    points.push(
      "Heads up: your pool isn't quite enough to wipe out the whole mortgage, so the payoff path clears as much as it can and keeps paying the rest.",
    );
  }

  if (closeCall) {
    points.push(
      `Over ${years} years these two paths land within about ${pctGap.toFixed(0)}% of each other — close enough that it's basically a tie. That means you can pick the one that lets you sleep at night.`,
    );
    points.push(
      'Paying off the house is the guaranteed, lower-stress choice: no payment, no risk, total peace of mind. Keeping the mortgage might edge ahead, but only if the market behaves.',
    );
  } else if (keepWins) {
    points.push(
      `On average, keeping the ${mortgageRatePct.toFixed(2)}% mortgage and investing comes out ahead by about ${'$' + Math.round(gap).toLocaleString()} — because ${marketReturnPct}% expected market growth is higher than your mortgage rate.`,
    );
    points.push(
      "But that edge is NOT guaranteed — it leans on the market averaging out over time. Paying off the house is a guaranteed return equal to your mortgage rate, with zero risk and one less bill every month.",
    );
  } else {
    points.push(
      `Paying off the house actually wins here by about ${'$' + Math.round(gap).toLocaleString()} — your ${mortgageRatePct.toFixed(2)}% mortgage costs more than the ${marketReturnPct}% you'd expect from investing, so killing the loan is both safer AND richer.`,
    );
  }

  points.push(
    'Either way, keep your emergency fund and sinking funds untouched, and keep contributing to retirement. Those guardrails matter more than squeezing out the last dollar.',
  );

  return {
    keepWins,
    closeCall,
    gap,
    pctGap,
    tone: closeCall ? 'tie' : keepWins ? 'keep' : 'payoff',
    headline: closeCall
      ? "It's close to a tie — so choose peace of mind"
      : keepWins
        ? 'Keeping the mortgage edges ahead on paper'
        : 'Paying it off is the smarter AND safer move',
    points,
  };
}
