// Monte Carlo engine — run the same decision through thousands of possible
// futures instead of one smooth, made-up one.
//
// WHY THIS EXISTS
// ---------------
// payoffProjection.js grows your investments at a fixed rate: the same number,
// 360 months in a row. That's a smooth exponential curve with no bad years in
// it, and it quietly pre-decides the answer — if your assumed return is above
// your mortgage rate, investing "wins" by a mile, with zero uncertainty shown.
//
// Real markets are lumpy, and the lumpiness is the entire reason this decision
// is hard. A crash in year 2 (small balance, 28 years to recover) is very
// different from the same crash in year 28. That's called SEQUENCE OF RETURNS
// RISK, and a constant-rate model is structurally blind to it.
//
// So instead of one path, we run thousands with randomized returns and report
// the distribution: "keeping the mortgage ends ahead in 71% of futures; in the
// worst 10% you finish $180k behind." That's the honest answer.
//
// WHY IT MATTERS EXTRA HERE
// -------------------------
// The mortgage payment is a FIXED obligation that doesn't care what the market
// did. In the "keep the mortgage and invest" path, a crash shrinks your
// investments while the bill stays exactly the same. In the "paid it off" path
// there is no bill at all. That asymmetry is invisible under constant returns
// and it is the real risk being weighed. Monte Carlo makes it show up.
//
// Everything here is pure (numbers in, numbers out) and dependency-free, so it
// runs offline and is easy to test in a plain Node script.

import { SP500_RETURN_VALUES, returnStats } from './historicalReturns.js';

export { SP500_RETURN_VALUES, returnStats };

// -------------------------------------------------------------------------
// 1. Seeded randomness
// -------------------------------------------------------------------------
//
// We deliberately do NOT use Math.random(). React re-renders components all
// the time; if the dice were re-rolled on every render, the numbers on screen
// would flicker and the app would look broken. A seeded generator means the
// same inputs always produce the same 5,000 futures — random, but repeatable.
//
// mulberry32 is a small, fast, well-distributed PRNG. Plenty good for this;
// not for cryptography.

/** Returns a function that yields the next float in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A tiny random-number toolkit built on one seed.
 *
 * `normal()` uses the Box-Muller transform, which turns two uniform random
 * numbers into one bell-curve-distributed number. We generate them in pairs
 * and cache the spare, because the transform produces two at a time.
 */
export function makeRng(seed = 12345) {
  const next = mulberry32(seed);
  let spare = null;

  return {
    next,
    /** Random integer in [0, n). */
    int(n) {
      return Math.floor(next() * n);
    },
    /** Standard normal (mean 0, standard deviation 1). */
    normal() {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      // u must be > 0 or Math.log blows up.
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mag * Math.cos(2 * Math.PI * v);
    },
  };
}

// -------------------------------------------------------------------------
// 2. Generating a sequence of yearly returns
// -------------------------------------------------------------------------

export const RETURN_MODES = {
  BOOTSTRAP: 'bootstrap',
  NORMAL: 'normal',
  CONSTANT: 'constant',
};

/** Every year identical — reproduces the old deterministic behaviour. */
export function constantReturns(years, annualPct) {
  return new Array(years).fill(annualPct);
}

/**
 * Draw from a bell curve. Useful for asking "what if the future is calmer or
 * wilder than the past?", but understates extreme years — see the note at the
 * top of historicalReturns.js.
 */
export function normalReturns(years, { rng, meanPct, stdDevPct }) {
  const out = new Array(years);
  for (let i = 0; i < years; i++) {
    // Floor at -95%: the arithmetic below breaks at -100% and a total
    // wipeout of a diversified index isn't a scenario worth modelling.
    out[i] = Math.max(-95, meanPct + rng.normal() * stdDevPct);
  }
  return out;
}

/**
 * Bootstrap: build a future by drawing real historical years at random.
 *
 * `blockYears` controls how many CONSECUTIVE historical years get copied at a
 * time. With blockYears = 1 every year is independent, which throws away the
 * fact that markets cluster — crashes tend to be followed by recoveries, and
 * booms by hangovers. Drawing blocks of, say, 5 years preserves some of that
 * real-world texture. 1 is the simple default; 5 is more realistic.
 */
export function bootstrapReturns(
  years,
  { rng, table = SP500_RETURN_VALUES, blockYears = 1 },
) {
  const out = new Array(years);
  const n = table.length;
  const block = Math.max(1, Math.round(blockYears));

  let i = 0;
  while (i < years) {
    const start = rng.int(n);
    for (let b = 0; b < block && i < years; b++, i++) {
      // Wrap around the end of history rather than stopping short.
      out[i] = table[(start + b) % n];
    }
  }
  return out;
}

/**
 * Rescale a table of historical returns so its long-run (geometric) average
 * equals `targetGeometricPct`, while keeping the shape of history intact.
 *
 * WHY THIS IS NEEDED
 * ------------------
 * The S&P 500's actual long-run geometric return since 1928 is about 10%/yr
 * nominal. But this app's default assumption is 7%, which is a deliberately
 * more conservative forward-looking number (most people arguing for lower
 * future returns point at today's valuations and the fact that a big chunk of
 * the historical record came from a one-off century). If we bootstrapped raw
 * history, we'd silently overrule the user's own assumption and roughly double
 * the headline numbers — which would look like a bug, and would quietly make
 * "keep the mortgage and invest" seem far safer than the app otherwise claims.
 *
 * So: we keep history's VOLATILITY, its fat tails, and its ordering — all the
 * things a bell curve gets wrong — but slide the whole distribution so its
 * average matches whatever return the user actually believes in.
 *
 * The mechanics: every year is a growth factor (a -10% year is 0.90). Multiply
 * every factor by the same constant and the geometric mean scales by exactly
 * that constant, while the spread in log-space is untouched. That's precisely
 * the "same shape, different center" we want.
 */
export function recenterReturns(table, targetGeometricPct) {
  const n = table.length;
  const growth = table.reduce((p, v) => p * (1 + v / 100), 1);
  const currentGeometric = Math.pow(growth, 1 / n);
  const scale = (1 + targetGeometricPct / 100) / currentGeometric;
  return table.map((v) => ((1 + v / 100) * scale - 1) * 100);
}

/** Dispatch to whichever generator the caller asked for. */
export function generateReturns(years, opts) {
  const {
    mode = RETURN_MODES.BOOTSTRAP,
    rng,
    meanReturnPct = 7,
    stdDevPct = 15,
    constantPct = 7,
    table = SP500_RETURN_VALUES,
    blockYears = 1,
  } = opts;

  if (mode === RETURN_MODES.CONSTANT) return constantReturns(years, constantPct);
  if (mode === RETURN_MODES.NORMAL) {
    return normalReturns(years, { rng, meanPct: meanReturnPct, stdDevPct });
  }
  return bootstrapReturns(years, { rng, table, blockYears });
}

// -------------------------------------------------------------------------
// 3. Turning a yearly return into a monthly one
// -------------------------------------------------------------------------
//
// There are two conventions and they don't agree:
//
//   'nominal'   annual / 12.  Simple, and what payoffProjection.js does today.
//               But compounding that monthly OVERSHOOTS: 7% / 12 compounded
//               twelve times gives 7.23%, not 7%. Small, but it accumulates
//               over 30 years — and it's badly wrong for big negative years
//               (-43.84% / 12, compounded, comes out to only about -36%).
//
//   'effective' the true 12th root, so twelve months compound to exactly the
//               stated annual figure. Correct, and required for bootstrapping
//               real annual returns.
//
// 'effective' is the default. 'nominal' exists so we can reproduce the old
// engine's numbers exactly and prove the two agree (see the verify script).
export function annualToMonthlyRate(annualPct, compounding = 'effective') {
  if (compounding === 'nominal') return annualPct / 100 / 12;
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

// -------------------------------------------------------------------------
// 4. The path simulator
// -------------------------------------------------------------------------

/**
 * Simulate one future, month by month, given an explicit sequence of yearly
 * returns.
 *
 * This mirrors simulatePath() in payoffProjection.js exactly, except the
 * market return can change every year instead of being frozen. Same
 * budget-equalised idea: every strategy commits the SAME total each month
 * (mortgage payment + extra principal + investing). The mortgage takes what it
 * needs; the rest is invested. When the loan disappears, its payment flows
 * into investing instead. That's what keeps the comparison apples-to-apples.
 *
 * `startBasis` is the cost basis of the starting pool — what you originally
 * paid for it. It defaults to the pool's value (i.e. no embedded gains), which
 * matches today's behaviour. Once Item 4 lands, the real basis gets passed in
 * so that selling investments to pay off the mortgage costs tax, like it does
 * in real life.
 */
export function simulatePathWithReturns({
  startInvest,
  startBasis = null,
  startMortgage,
  monthlyPI: pi,
  mortgageRatePct,
  extraMortgagePrincipal = 0,
  monthlyContribution = 0,
  investFreedPayment = true,
  months,
  homePrice,
  homeAppreciationPct,
  start401k = 0,
  annualReturnsPct,
  retirementReturnsPct = null,
  compounding = 'effective',
}) {
  const years = Math.ceil(months / 12);
  if (!Array.isArray(annualReturnsPct) || annualReturnsPct.length < years) {
    throw new Error(
      `simulatePathWithReturns: need at least ${years} yearly returns, got ${
        annualReturnsPct?.length ?? 0
      }`,
    );
  }
  const retReturns = retirementReturnsPct ?? annualReturnsPct;

  const rM = mortgageRatePct / 100 / 12; // mortgage rates ARE quoted as /12
  const budget = pi + extraMortgagePrincipal + monthlyContribution;

  let invest = Math.max(0, startInvest);
  let basis = startBasis == null ? invest : Math.max(0, startBasis);
  let mortgage = Math.max(0, startMortgage);
  let retirement = Math.max(0, start401k);
  let mortgageFreeMonth = mortgage <= 0.01 ? 0 : null;

  const homeValueAtYear = (y) =>
    homePrice * Math.pow(1 + homeAppreciationPct / 100, y);

  const point = (year) => {
    const homeValue = homeValueAtYear(year);
    return {
      year,
      invest,
      basis,
      mortgage,
      homeValue,
      homeEquity: homeValue - mortgage,
      retirement,
      // "On paper" — nothing sold yet, so no taxes applied here.
      netWorth: invest + retirement + homeValue - mortgage,
    };
  };

  const series = [point(0)];

  for (let m = 1; m <= months; m++) {
    const yi = Math.floor((m - 1) / 12);
    const rI = annualToMonthlyRate(annualReturnsPct[yi], compounding);

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
      if (mortgage <= 0.01 && mortgageFreeMonth == null) mortgageFreeMonth = m;
    }

    // 2) Whatever the mortgage didn't use gets invested.
    const contribution = investFreedPayment
      ? Math.max(0, budget - cashToMortgage)
      : monthlyContribution;

    invest = invest * (1 + rI) + contribution;
    basis += contribution;

    // 3) Year boundary: grow the 401(k) and take a snapshot.
    if (m % 12 === 0) {
      retirement *= 1 + retReturns[yi] / 100;
      series.push(point(m / 12));
    }
  }

  return {
    series,
    final: series[series.length - 1],
    mortgageFreeMonth,
    mortgageFreeYear: mortgageFreeMonth == null ? null : mortgageFreeMonth / 12,
  };
}

// -------------------------------------------------------------------------
// 5. Scoring a snapshot
// -------------------------------------------------------------------------

/** Capital-gains tax owed if you sold the taxable investments right now. */
export function capitalGainsTax(invest, basis, capGainsPct) {
  return (Math.max(0, invest - basis) * capGainsPct) / 100;
}

/**
 * Turn a snapshot into the single number we rank futures by.
 *
 * Defaults to after-tax (you'd owe capital gains to actually spend it) and in
 * today's dollars (so a number 30 years out means something you can feel).
 * These match the headline on the Payoff vs Invest page.
 */
export function scorePoint(
  point,
  { capGainsPct = 15, inflationPct = 3, real = true } = {},
) {
  const afterTax =
    point.netWorth - capitalGainsTax(point.invest, point.basis, capGainsPct);
  if (!real) return afterTax;
  return afterTax / Math.pow(1 + inflationPct / 100, point.year);
}

// -------------------------------------------------------------------------
// 6. Percentiles
// -------------------------------------------------------------------------

export const PERCENTILE_KEYS = [5, 10, 25, 50, 75, 90, 95];

/** Linear-interpolated percentile from an already-sorted ascending array. */
export function percentileFromSorted(sorted, p) {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function percentileSet(sorted, keys = PERCENTILE_KEYS) {
  const out = {};
  keys.forEach((p) => {
    out[`p${p}`] = percentileFromSorted(sorted, p);
  });
  return out;
}

// -------------------------------------------------------------------------
// 7. The driver
// -------------------------------------------------------------------------

/**
 * Run every strategy through the SAME thousands of futures.
 *
 * The "same" matters enormously. Each run generates one market history and
 * hands that identical history to every strategy. If each strategy got its own
 * independent dice, a win rate would be meaningless — you'd be comparing a
 * lucky version of one plan against an unlucky version of another. Pairing
 * them means every comparison asks the right question: "given THIS future,
 * which choice would have been better?"
 *
 * @param strategies Array of { key, label, ...simulatePathWithReturns params }
 * @param shared     Params common to all strategies (rate, months, home, etc.)
 * @returns per-strategy percentile bands + head-to-head win rates
 */
export function runMonteCarlo({
  strategies,
  shared,
  runs = 5000,
  seed = 12345,
  mode = RETURN_MODES.BOOTSTRAP,
  meanReturnPct = 7,
  stdDevPct = 15,
  constantPct = 7,
  returnTable = SP500_RETURN_VALUES,
  blockYears = 1,
  // Slide history's average to match the return the user actually believes in,
  // keeping its volatility and fat tails. Pass null to bootstrap raw history
  // (which averages ~10%/yr, well above this app's 7% default). See
  // recenterReturns() for why this matters.
  recenterToPct = null,
  compounding = 'effective',
  capGainsPct = 15,
  inflationPct = 3,
  real = true,
}) {
  const months = shared.months;
  // Returns are generated per calendar year, so a partial final year still
  // needs one. Snapshots, though, only happen at completed year boundaries —
  // so the two counts differ when months isn't a clean multiple of 12.
  const yearsOfReturns = Math.ceil(months / 12);
  const years = Math.floor(months / 12);
  const cols = years + 1; // year 0 through year N
  const rng = makeRng(seed);
  const scoreOpts = { capGainsPct, inflationPct, real };

  // Recenter once up front, not once per run.
  const table =
    recenterToPct == null
      ? returnTable
      : recenterReturns(returnTable, recenterToPct);

  // scores[key] is a flat runs x cols grid, laid out row by row.
  const scores = {};
  const finals = {};
  const mortgageFreeYears = {};
  strategies.forEach((s) => {
    scores[s.key] = new Float64Array(runs * cols);
    finals[s.key] = new Float64Array(runs);
    mortgageFreeYears[s.key] = new Float64Array(runs);
  });

  for (let r = 0; r < runs; r++) {
    // ONE market history for this run, shared by every strategy.
    const annualReturnsPct = generateReturns(yearsOfReturns, {
      mode,
      rng,
      meanReturnPct,
      stdDevPct,
      constantPct,
      table,
      blockYears,
    });

    for (const s of strategies) {
      const path = simulatePathWithReturns({
        ...shared,
        ...s,
        annualReturnsPct,
        compounding,
      });

      const row = r * cols;
      for (let y = 0; y < cols; y++) {
        scores[s.key][row + y] = scorePoint(path.series[y], scoreOpts);
      }
      finals[s.key][r] = scores[s.key][row + cols - 1];
      mortgageFreeYears[s.key][r] = path.mortgageFreeYear ?? years;
    }
  }

  // ---- Percentile bands, one column (year) at a time ----
  const byStrategy = {};
  const scratch = new Float64Array(runs);

  strategies.forEach((s) => {
    const bands = {};
    PERCENTILE_KEYS.forEach((p) => {
      bands[`p${p}`] = new Array(cols);
    });

    for (let y = 0; y < cols; y++) {
      for (let r = 0; r < runs; r++) scratch[r] = scores[s.key][r * cols + y];
      const sorted = Float64Array.prototype.slice.call(scratch).sort();
      PERCENTILE_KEYS.forEach((p) => {
        bands[`p${p}`][y] = percentileFromSorted(sorted, p);
      });
    }

    const sortedFinals = Float64Array.prototype.slice.call(finals[s.key]).sort();
    const sortedFreeYears = Float64Array.prototype.slice
      .call(mortgageFreeYears[s.key])
      .sort();

    byStrategy[s.key] = {
      key: s.key,
      label: s.label ?? s.key,
      bands,
      finals: sortedFinals,
      final: {
        ...percentileSet(sortedFinals),
        mean: sortedFinals.reduce((a, b) => a + b, 0) / runs,
        min: sortedFinals[0],
        max: sortedFinals[runs - 1],
      },
      mortgageFreeYear: percentileSet(sortedFreeYears, [10, 50, 90]),
    };
  });

  // ---- Head to head ----
  //
  // Note we percentile the per-run DIFFERENCES, not the difference of the
  // percentiles. Those aren't the same thing: the future where A does worst
  // usually isn't the future where B does worst, so subtracting two p10s
  // would describe a future that never actually happened.
  const headToHead = {};
  for (let i = 0; i < strategies.length; i++) {
    for (let j = i + 1; j < strategies.length; j++) {
      const a = strategies[i].key;
      const b = strategies[j].key;
      const diffs = new Float64Array(runs);
      let aWins = 0;
      for (let r = 0; r < runs; r++) {
        const d = finals[a][r] - finals[b][r];
        diffs[r] = d;
        if (d > 0) aWins++;
      }
      const sortedDiffs = Float64Array.prototype.slice.call(diffs).sort();
      headToHead[`${a}-vs-${b}`] = {
        a,
        b,
        aWinRate: aWins / runs,
        bWinRate: 1 - aWins / runs,
        gap: percentileSet(sortedDiffs),
      };
    }
  }

  return {
    runs,
    years,
    mode,
    compounding,
    byStrategy,
    headToHead,
    // Handy for axis labels: [0, 1, 2, ... years]
    yearLabels: Array.from({ length: cols }, (_, i) => i),
  };
}

// -------------------------------------------------------------------------
// 8. Putting it in plain English
// -------------------------------------------------------------------------

const usd = (n) =>
  `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

/**
 * Turn the distribution into a verdict a human can act on.
 *
 * The old deterministic verdict had to pick a winner, because a single number
 * always has one. A distribution can say something much more useful and much
 * more honest: how OFTEN each choice wins, and what it costs you when it
 * doesn't. A 51% edge and a 95% edge are completely different decisions, and
 * the old version reported both as simply "wins".
 *
 * @param keepWinRate  fraction of futures where keeping the mortgage ends ahead
 * @param keepEdge     percentiles of (keep - payoff) across runs
 */
export function buildMonteCarloVerdict({
  keepWinRate,
  keepEdge,
  years,
  mortgageRatePct,
  marketReturnPct,
  canFullyPayoff = true,
  runs,
}) {
  const keepPct = keepWinRate * 100;
  const payoffPct = 100 - keepPct;
  // Within 55/45 either way there is no real signal here — saying otherwise
  // would be dressing up noise as a recommendation, which is exactly the
  // failure mode this whole engine exists to fix.
  const coinFlip = keepPct >= 45 && keepPct <= 55;
  const keepFavored = keepPct > 55;
  const strong = keepPct >= 70 || keepPct <= 30;

  const points = [];

  if (!canFullyPayoff) {
    points.push(
      "Heads up: your pool isn't quite enough to wipe out the whole mortgage, so the payoff path clears as much as it can and keeps paying the rest.",
    );
  }

  if (coinFlip) {
    points.push(
      `Across ${runs.toLocaleString('en-US')} simulated futures, keeping the mortgage came out ahead ${keepPct.toFixed(0)}% of the time and paying it off won the other ${payoffPct.toFixed(0)}%. That is a coin flip, not an answer — the difference between these two paths is smaller than the uncertainty in either one.`,
    );
    points.push(
      'When it is this close, the tiebreaker is not math, it is which mistake you could live with. Paying it off is the guaranteed, lower-stress option: no payment, no market risk, one less bill forever.',
    );
  } else if (keepFavored) {
    points.push(
      `Keeping the ${mortgageRatePct.toFixed(2)}% mortgage and investing ended ahead in ${keepPct.toFixed(0)}% of ${runs.toLocaleString('en-US')} simulated futures, by a typical margin of ${usd(keepEdge.p50)}.`,
    );
    points.push(
      `But it lost in the other ${payoffPct.toFixed(0)}%. In its worst 10% of futures it finished ${usd(keepEdge.p10)} BEHIND simply paying the house off — and those are the futures where a market crash lands while you still owe a payment every month.`,
    );
    if (!strong) {
      points.push(
        `A ${keepPct.toFixed(0)}% win rate is a lean, not a certainty. Treat it as "slightly favoured", not "correct".`,
      );
    }
  } else {
    points.push(
      `Paying the house off ended ahead in ${payoffPct.toFixed(0)}% of ${runs.toLocaleString('en-US')} simulated futures — your ${mortgageRatePct.toFixed(2)}% mortgage is a high bar for a ${marketReturnPct}% expected return to clear, especially after tax.`,
    );
    points.push(
      'That makes this the rare case where the safer choice is also the richer one, so there is not much of a trade-off to agonise over.',
    );
  }

  points.push(
    'Worth remembering what the two risks actually are: paying it off earns your mortgage rate, guaranteed, but locks the money in a house you cannot spend from. Investing has the higher expected return but leaves a fixed monthly bill that does not care what the market did.',
  );

  points.push(
    'Either way, keep your emergency fund and sinking funds untouched, and keep contributing to retirement. Those guardrails matter more than squeezing out the last dollar.',
  );

  return {
    keepWinRate,
    keepPct,
    payoffPct,
    coinFlip,
    keepFavored,
    strong,
    tone: coinFlip ? 'tie' : keepFavored ? 'keep' : 'payoff',
    headline: coinFlip
      ? `It's a ${keepPct.toFixed(0)}/${payoffPct.toFixed(0)} coin flip — so choose peace of mind`
      : keepFavored
        ? `Keeping the mortgage wins ${keepPct.toFixed(0)}% of the time — but not always`
        : `Paying it off wins ${payoffPct.toFixed(0)}% of the time — safer AND richer`,
    points,
  };
}
