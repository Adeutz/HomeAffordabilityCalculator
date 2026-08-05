// Regression checks for the Monte Carlo engine.
//
// Run with:  node scripts/verify-monte-carlo.mjs
//
// The headline check is EQUIVALENCE: if you remove all the randomness (every
// year gets the same return) and use the old engine's month-rate convention,
// the new simulator must reproduce payoffProjection.js to the penny. If that
// holds, the new plumbing is trustworthy and any difference we see later is
// coming from the randomness we deliberately added — not from a bug.

import {
  simulatePath,
  buildComparison,
  afterTaxNetWorth,
  monthlyPI,
} from '../src/lib/payoffProjection.js';

import {
  simulatePathWithReturns,
  runMonteCarlo,
  makeRng,
  bootstrapReturns,
  normalReturns,
  annualToMonthlyRate,
  percentileFromSorted,
  scorePoint,
  returnStats,
  recenterReturns,
  RETURN_MODES,
  SP500_RETURN_VALUES,
} from '../src/lib/monteCarlo.js';

let failures = 0;
let checks = 0;

function check(name, ok, detail = '') {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// A realistic-ish scenario used by several checks.
// ---------------------------------------------------------------------------
const SCENARIO = {
  pool: 400_000,
  loanBalance: 350_000,
  mortgageRatePct: 6.5,
  loanTermYears: 30,
  homePrice: 500_000,
  homeAppreciationPct: 3,
  start401k: 150_000,
  monthlyExtraInvest: 500,
  horizonYears: 30,
  marketReturnPct: 7,
  capGainsPct: 15,
  inflationPct: 3,
};

const PI = monthlyPI(
  SCENARIO.loanBalance,
  SCENARIO.mortgageRatePct,
  SCENARIO.loanTermYears,
);
const MONTHS = SCENARIO.horizonYears * 12;

const SHARED = {
  monthlyPI: PI,
  mortgageRatePct: SCENARIO.mortgageRatePct,
  months: MONTHS,
  homePrice: SCENARIO.homePrice,
  homeAppreciationPct: SCENARIO.homeAppreciationPct,
  start401k: SCENARIO.start401k,
};

const STRATEGIES = [
  {
    key: 'payoff',
    label: 'Pay off the house',
    startInvest: Math.max(0, SCENARIO.pool - SCENARIO.loanBalance),
    startMortgage: Math.max(0, SCENARIO.loanBalance - SCENARIO.pool),
    monthlyContribution: SCENARIO.monthlyExtraInvest,
    investFreedPayment: true,
  },
  {
    key: 'keep',
    label: 'Keep mortgage & invest',
    startInvest: SCENARIO.pool,
    startMortgage: SCENARIO.loanBalance,
    monthlyContribution: SCENARIO.monthlyExtraInvest,
    investFreedPayment: true,
  },
];

// ===========================================================================
section('1. Equivalence with the existing deterministic engine');
// ===========================================================================
//
// Constant returns + the old 'nominal' (annual/12) month convention should
// reproduce simulatePath() exactly.

for (const strat of STRATEGIES) {
  const oldPath = simulatePath({
    ...SHARED,
    startInvest: strat.startInvest,
    startMortgage: strat.startMortgage,
    monthlyContribution: strat.monthlyContribution,
    investFreedPayment: strat.investFreedPayment,
    marketReturnPct: SCENARIO.marketReturnPct,
  });

  const newPath = simulatePathWithReturns({
    ...SHARED,
    startInvest: strat.startInvest,
    startMortgage: strat.startMortgage,
    monthlyContribution: strat.monthlyContribution,
    investFreedPayment: strat.investFreedPayment,
    annualReturnsPct: new Array(SCENARIO.horizonYears).fill(
      SCENARIO.marketReturnPct,
    ),
    compounding: 'nominal',
  });

  check(
    `${strat.key}: series length matches`,
    oldPath.series.length === newPath.series.length,
    `${oldPath.series.length} vs ${newPath.series.length}`,
  );

  let maxDiff = 0;
  let worstYear = -1;
  for (let i = 0; i < oldPath.series.length; i++) {
    for (const field of ['invest', 'basis', 'mortgage', 'retirement', 'homeEquity', 'netWorth']) {
      const d = Math.abs(oldPath.series[i][field] - newPath.series[i][field]);
      if (d > maxDiff) {
        maxDiff = d;
        worstYear = i;
      }
    }
  }
  check(
    `${strat.key}: every yearly value matches to < $0.01`,
    maxDiff < 0.01,
    `max diff ${maxDiff.toExponential(2)} at year ${worstYear}`,
  );

  check(
    `${strat.key}: mortgage-free month matches`,
    oldPath.mortgageFreeMonth === newPath.mortgageFreeMonth,
    `${oldPath.mortgageFreeMonth} vs ${newPath.mortgageFreeMonth}`,
  );
}

// Same test, but through the full runMonteCarlo driver against buildComparison.
{
  const old = buildComparison({
    pool: SCENARIO.pool,
    loanBalance: SCENARIO.loanBalance,
    monthlyPI: PI,
    mortgageRatePct: SCENARIO.mortgageRatePct,
    monthlyExtraInvest: SCENARIO.monthlyExtraInvest,
    marketReturnPct: SCENARIO.marketReturnPct,
    homePrice: SCENARIO.homePrice,
    homeAppreciationPct: SCENARIO.homeAppreciationPct,
    start401k: SCENARIO.start401k,
    months: MONTHS,
  });

  const mc = runMonteCarlo({
    strategies: STRATEGIES,
    shared: SHARED,
    runs: 1,
    mode: RETURN_MODES.CONSTANT,
    constantPct: SCENARIO.marketReturnPct,
    compounding: 'nominal',
    capGainsPct: SCENARIO.capGainsPct,
    inflationPct: SCENARIO.inflationPct,
    real: false,
  });

  for (const key of ['payoff', 'keep']) {
    const expected = afterTaxNetWorth(old[key].final, SCENARIO.capGainsPct);
    const actual = mc.byStrategy[key].final.p50;
    check(
      `driver: ${key} after-tax final matches buildComparison`,
      Math.abs(expected - actual) < 0.01,
      `${usd(expected)} vs ${usd(actual)}`,
    );
  }
}

// ===========================================================================
section('2. Compounding conventions');
// ===========================================================================

{
  const eff = annualToMonthlyRate(7, 'effective');
  const twelve = (Math.pow(1 + eff, 12) - 1) * 100;
  check(
    "'effective' compounds to exactly the stated annual rate",
    Math.abs(twelve - 7) < 1e-9,
    `12 months of ${(eff * 100).toFixed(4)}%/mo = ${twelve.toFixed(6)}%`,
  );

  const nom = annualToMonthlyRate(7, 'nominal');
  const twelveNom = (Math.pow(1 + nom, 12) - 1) * 100;
  check(
    "'nominal' overshoots (this is the old engine's quirk)",
    twelveNom > 7.2 && twelveNom < 7.3,
    `7% -> ${twelveNom.toFixed(4)}% effective`,
  );

  const badYearNom = (Math.pow(1 + annualToMonthlyRate(-43.84, 'nominal'), 12) - 1) * 100;
  check(
    "'nominal' badly distorts big negative years",
    badYearNom > -37 && badYearNom < -35,
    `-43.84% becomes ${badYearNom.toFixed(2)}%`,
  );
}

// ===========================================================================
section('3. Historical return table');
// ===========================================================================

{
  const stats = returnStats();
  check('98 years of data (1928-2025)', stats.count === 98, `count = ${stats.count}`);
  check('first year is 1928', stats.firstYear === 1928, `${stats.firstYear}`);
  check('last year is 2025', stats.lastYear === 2025, `${stats.lastYear}`);
  check(
    'geometric mean is below arithmetic mean',
    stats.geometricMeanPct < stats.arithmeticMeanPct,
    `geo ${stats.geometricMeanPct.toFixed(2)}% < arith ${stats.arithmeticMeanPct.toFixed(2)}%`,
  );
  check(
    'geometric mean is in a believable range (9-11%)',
    stats.geometricMeanPct > 9 && stats.geometricMeanPct < 11,
    `${stats.geometricMeanPct.toFixed(2)}%`,
  );
  check(
    'about a third of years are negative',
    stats.negativeYearPct > 25 && stats.negativeYearPct < 35,
    `${stats.negativeYears}/${stats.count} = ${stats.negativeYearPct.toFixed(1)}%`,
  );
  check(
    'worst year is 1931 at -43.84%',
    Math.abs(stats.minPct - -43.84) < 1e-9,
    `${stats.minPct}%`,
  );
  check(
    'best year is 1954 at +52.56%',
    Math.abs(stats.maxPct - 52.56) < 1e-9,
    `${stats.maxPct}%`,
  );
  console.log(
    `        stdev ${stats.stdDevPct.toFixed(2)}%  |  arithmetic ${stats.arithmeticMeanPct.toFixed(2)}%  |  geometric ${stats.geometricMeanPct.toFixed(2)}%`,
  );
}

// ===========================================================================
section('4. Randomness behaves');
// ===========================================================================

{
  // Determinism: same seed, same numbers.
  const a = runMonteCarlo({ strategies: STRATEGIES, shared: SHARED, runs: 200, seed: 42 });
  const b = runMonteCarlo({ strategies: STRATEGIES, shared: SHARED, runs: 200, seed: 42 });
  const c = runMonteCarlo({ strategies: STRATEGIES, shared: SHARED, runs: 200, seed: 43 });
  check(
    'same seed reproduces identical results',
    a.byStrategy.keep.final.p50 === b.byStrategy.keep.final.p50,
  );
  check(
    'different seed produces different results',
    a.byStrategy.keep.final.p50 !== c.byStrategy.keep.final.p50,
  );

  // Bootstrap should reproduce the table's own average over many draws.
  const rng = makeRng(7);
  const drawn = bootstrapReturns(200_000, { rng });
  const mean = drawn.reduce((s, v) => s + v, 0) / drawn.length;
  const tableMean =
    SP500_RETURN_VALUES.reduce((s, v) => s + v, 0) / SP500_RETURN_VALUES.length;
  check(
    'bootstrap mean converges to the table mean',
    Math.abs(mean - tableMean) < 0.15,
    `${mean.toFixed(3)}% vs ${tableMean.toFixed(3)}%`,
  );
  check(
    'bootstrap only ever draws real historical values',
    drawn.slice(0, 5000).every((v) => SP500_RETURN_VALUES.includes(v)),
  );

  // Block bootstrap must preserve consecutive runs of history.
  const blocked = bootstrapReturns(10, { rng: makeRng(3), blockYears: 5 });
  const idx = SP500_RETURN_VALUES.indexOf(blocked[0]);
  check(
    'block bootstrap copies consecutive years',
    blocked[1] === SP500_RETURN_VALUES[(idx + 1) % SP500_RETURN_VALUES.length],
  );

  // Normal draws should land near the requested mean and spread.
  const norm = normalReturns(200_000, { rng: makeRng(9), meanPct: 7, stdDevPct: 15 });
  const nMean = norm.reduce((s, v) => s + v, 0) / norm.length;
  const nSd = Math.sqrt(
    norm.reduce((s, v) => s + (v - nMean) ** 2, 0) / (norm.length - 1),
  );
  check('normal mode hits its target mean', Math.abs(nMean - 7) < 0.2, `${nMean.toFixed(3)}%`);
  check('normal mode hits its target stdev', Math.abs(nSd - 15) < 0.3, `${nSd.toFixed(3)}%`);

  // Fat tails: history should produce more extreme years than a bell curve.
  const histExtreme = SP500_RETURN_VALUES.filter((v) => v < 7 - 2 * 15).length /
    SP500_RETURN_VALUES.length;
  const normExtreme = norm.filter((v) => v < 7 - 2 * 15).length / norm.length;
  check(
    'history has fatter left tail than a bell curve',
    histExtreme > normExtreme,
    `history ${(histExtreme * 100).toFixed(2)}% vs normal ${(normExtreme * 100).toFixed(2)}% below -23%`,
  );
}

// ===========================================================================
section('5. Recentering history onto the user\'s own return assumption');
// ===========================================================================

{
  const raw = returnStats();
  const shifted = recenterReturns(SP500_RETURN_VALUES, 7);
  const shiftedStats = returnStats(shifted);

  check(
    'recentered table hits the target geometric mean exactly',
    Math.abs(shiftedStats.geometricMeanPct - 7) < 1e-9,
    `${shiftedStats.geometricMeanPct.toFixed(10)}%`,
  );
  check(
    'recentering leaves the year count alone',
    shifted.length === SP500_RETURN_VALUES.length,
  );
  check(
    'volatility is preserved (shape of history kept)',
    Math.abs(shiftedStats.stdDevPct - raw.stdDevPct) < 1.0,
    `${raw.stdDevPct.toFixed(2)}% -> ${shiftedStats.stdDevPct.toFixed(2)}%`,
  );
  check(
    'bad years are still bad',
    shiftedStats.minPct < -35,
    `worst year ${shiftedStats.minPct.toFixed(2)}%`,
  );
  check(
    'the ordering of years is untouched',
    shifted.every(
      (v, i) =>
        i === 0 ||
        Math.sign(v - shifted[i - 1]) ===
          Math.sign(SP500_RETURN_VALUES[i] - SP500_RETURN_VALUES[i - 1]),
    ),
  );

  // The whole point: recentered bootstrap should land near the deterministic
  // engine, not 2x above it.
  const centered = runMonteCarlo({
    strategies: STRATEGIES,
    shared: SHARED,
    runs: 4000,
    seed: 12345,
    mode: RETURN_MODES.BOOTSTRAP,
    blockYears: 5,
    recenterToPct: SCENARIO.marketReturnPct,
    capGainsPct: SCENARIO.capGainsPct,
    inflationPct: SCENARIO.inflationPct,
    real: true,
  });

  const old = buildComparison({
    pool: SCENARIO.pool,
    loanBalance: SCENARIO.loanBalance,
    monthlyPI: PI,
    mortgageRatePct: SCENARIO.mortgageRatePct,
    monthlyExtraInvest: SCENARIO.monthlyExtraInvest,
    marketReturnPct: SCENARIO.marketReturnPct,
    homePrice: SCENARIO.homePrice,
    homeAppreciationPct: SCENARIO.homeAppreciationPct,
    start401k: SCENARIO.start401k,
    months: MONTHS,
  });
  const oldKeep =
    afterTaxNetWorth(old.keep.final, SCENARIO.capGainsPct) /
    Math.pow(1 + SCENARIO.inflationPct / 100, SCENARIO.horizonYears);
  const newKeepMedian = centered.byStrategy.keep.final.p50;

  check(
    'recentered median lands in the same ballpark as the 7% engine',
    newKeepMedian > oldKeep * 0.75 && newKeepMedian < oldKeep * 1.25,
    `deterministic ${usd(oldKeep)} vs MC median ${usd(newKeepMedian)}`,
  );
  console.log(
    `        (median sits slightly below the smooth projection, which is expected:`,
  );
  console.log(
    `         volatility drags compounded outcomes below the average path)`,
  );
}

// ===========================================================================
section('6. Percentile helper');
// ===========================================================================

{
  const sorted = Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  check('p0 is the minimum', percentileFromSorted(sorted, 0) === 0);
  check('p100 is the maximum', percentileFromSorted(sorted, 100) === 10);
  check('p50 is the median', percentileFromSorted(sorted, 50) === 5);
  check('interpolates between points', percentileFromSorted(sorted, 25) === 2.5);
  check('single-element array works', percentileFromSorted(Float64Array.from([42]), 90) === 42);
  check('empty array does not crash', percentileFromSorted(Float64Array.from([]), 50) === 0);
}

// ===========================================================================
section('7. Monte Carlo output sanity');
// ===========================================================================

let realRun;
{
  const t0 = Date.now();
  realRun = runMonteCarlo({
    strategies: STRATEGIES,
    shared: SHARED,
    runs: 5000,
    seed: 12345,
    mode: RETURN_MODES.BOOTSTRAP,
    blockYears: 5,
    recenterToPct: SCENARIO.marketReturnPct,
    capGainsPct: SCENARIO.capGainsPct,
    inflationPct: SCENARIO.inflationPct,
    real: true,
  });
  const ms = Date.now() - t0;

  check('5,000 runs complete in under 2s', ms < 2000, `${ms}ms`);

  const keep = realRun.byStrategy.keep;
  const payoff = realRun.byStrategy.payoff;

  check(
    'percentiles are ordered p5 <= p50 <= p95',
    keep.final.p5 <= keep.final.p50 && keep.final.p50 <= keep.final.p95,
  );
  check(
    'bands widen over time (uncertainty grows)',
    keep.bands.p95[realRun.years] - keep.bands.p5[realRun.years] >
      keep.bands.p95[1] - keep.bands.p5[1],
  );
  check(
    'payoff path is less uncertain than the invest path',
    payoff.final.p95 - payoff.final.p5 < keep.final.p95 - keep.final.p5,
    `payoff spread ${usd(payoff.final.p95 - payoff.final.p5)} vs keep ${usd(keep.final.p95 - keep.final.p5)}`,
  );
  check(
    'year 0 has no uncertainty yet',
    Math.abs(keep.bands.p95[0] - keep.bands.p5[0]) < 0.01,
  );

  const h2h = realRun.headToHead['payoff-vs-keep'];
  check(
    'win rates sum to 1',
    Math.abs(h2h.aWinRate + h2h.bWinRate - 1) < 1e-9,
  );
  check(
    'win rate is a genuine probability, not 0 or 100%',
    h2h.aWinRate > 0.01 && h2h.aWinRate < 0.99,
    `payoff wins ${(h2h.aWinRate * 100).toFixed(1)}% of futures`,
  );
}

// ===========================================================================
section('8. What the new engine actually says about this scenario');
// ===========================================================================

{
  const old = buildComparison({
    pool: SCENARIO.pool,
    loanBalance: SCENARIO.loanBalance,
    monthlyPI: PI,
    mortgageRatePct: SCENARIO.mortgageRatePct,
    monthlyExtraInvest: SCENARIO.monthlyExtraInvest,
    marketReturnPct: SCENARIO.marketReturnPct,
    homePrice: SCENARIO.homePrice,
    homeAppreciationPct: SCENARIO.homeAppreciationPct,
    start401k: SCENARIO.start401k,
    months: MONTHS,
  });
  const real = (v) => v / Math.pow(1 + SCENARIO.inflationPct / 100, SCENARIO.horizonYears);
  const oldPayoff = real(afterTaxNetWorth(old.payoff.final, SCENARIO.capGainsPct));
  const oldKeep = real(afterTaxNetWorth(old.keep.final, SCENARIO.capGainsPct));

  const keep = realRun.byStrategy.keep.final;
  const payoff = realRun.byStrategy.payoff.final;
  const h2h = realRun.headToHead['payoff-vs-keep'];

  console.log(`  Scenario: ${usd(SCENARIO.pool)} pool, ${usd(SCENARIO.loanBalance)} loan`);
  console.log(`            at ${SCENARIO.mortgageRatePct}%, ${SCENARIO.horizonYears}-year horizon`);
  console.log(`            (all figures after tax, in today's dollars)\n`);
  console.log('  OLD ENGINE — one smooth 7% future, stated as fact:');
  console.log(`    pay off          ${usd(oldPayoff)}`);
  console.log(`    keep & invest    ${usd(oldKeep)}`);
  console.log(`    -> "keep & invest wins by ${usd(oldKeep - oldPayoff)}"\n`);
  console.log('  NEW ENGINE — 5,000 bootstrapped futures, recentered to 7%:');
  console.log(`                     worst 10%        median         best 10%`);
  console.log(
    `    pay off       ${usd(payoff.p10).padStart(12)}  ${usd(payoff.p50).padStart(12)}  ${usd(payoff.p90).padStart(12)}`,
  );
  console.log(
    `    keep & invest ${usd(keep.p10).padStart(12)}  ${usd(keep.p50).padStart(12)}  ${usd(keep.p90).padStart(12)}`,
  );

  // h2h.gap is the distribution of (payoff - keep) across runs, so flip the
  // sign to describe things from "keep & invest"'s point of view.
  const keepEdgeMedian = -h2h.gap.p50;
  const keepEdgeBadCase = -h2h.gap.p90; // p90 for payoff = p10 for keep
  console.log(
    `\n    keep & invest ends ahead in ${(h2h.bWinRate * 100).toFixed(1)}% of futures`,
  );
  console.log(`    typical (median) advantage:  ${usd(keepEdgeMedian)}`);
  console.log(
    `    in its worst 10% of futures: ${
      keepEdgeBadCase < 0
        ? `${usd(Math.abs(keepEdgeBadCase))} BEHIND paying it off`
        : `still ${usd(keepEdgeBadCase)} ahead`
    }`,
  );
  console.log(
    `\n  That is the whole point: one number became a probability plus a downside.`,
  );
}

// ===========================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`${checks - failures}/${checks} checks passed`);
console.log('='.repeat(60));
process.exit(failures > 0 ? 1 : 0);
