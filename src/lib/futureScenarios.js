// "Future scenarios" engine — what does life look like out to retirement if
// income drops, you work less, or you stop working early, under different
// mortgage strategies (pay it off / recast it / keep the payment)?
//
// Unlike payoffProjection.js (which races a fixed monthly budget), this engine
// models the real household: take-home income comes in, bills go out, and the
// leftover is saved. When income can't cover the bills, savings get drawn
// down — cash first, then investments. That's what lets us answer the
// risk-averse questions: how long could we last, how little could I earn,
// and would we ever run dry?
//
// All functions are pure — no UI in here.

import { monthlyPI } from './mortgage.js';
import {
  capitalGainsTax,
  afterTaxNetWorth,
  toTodaysDollars,
} from './payoffProjection.js';

export { monthlyPI, capitalGainsTax, afterTaxNetWorth, toTodaysDollars };

// The three "market moods" the page sweeps across. Cautious is the one a
// risk-averse buyer should trust; a strategy only really wins if it wins here.
export const DEFAULT_MOODS = {
  cautiousReturnPct: 4,
  expectedReturnPct: 7,
  optimisticReturnPct: 9,
};

const monthlyRate = (annualPct) => annualPct / 100 / 12;

/**
 * Income multiplier for one month, given the life events being tested.
 * Events overlap by taking the *lowest* factor (you can't earn 75% of a
 * paycheck you also lost), which keeps combinations sane.
 *
 * events = {
 *   jobLoss:   { startYear, months, keepPct },  // temporary window
 *   incomeCut: { startYear, keepPct },          // permanent from startYear
 *   workLess:  { keepPct },                     // once the mortgage is gone
 *   stopWork:  { age },                         // income ends at this age
 * }
 */
function incomeFactor(month, events, { mortgageIsGone, currentAge }) {
  let factor = 1;

  const jl = events.jobLoss;
  if (jl) {
    const start = Math.max(0, Math.round((jl.startYear ?? 0) * 12));
    const len = Math.max(0, Math.round(jl.months ?? 0));
    if (month > start && month <= start + len) {
      factor = Math.min(factor, (jl.keepPct ?? 0) / 100);
    }
  }

  const cut = events.incomeCut;
  if (cut && month > Math.round((cut.startYear ?? 0) * 12)) {
    factor = Math.min(factor, (cut.keepPct ?? 100) / 100);
  }

  const wl = events.workLess;
  if (wl && mortgageIsGone) {
    factor = Math.min(factor, (wl.keepPct ?? 100) / 100);
  }

  const stop = events.stopWork;
  if (stop && currentAge + month / 12 > (stop.age ?? Infinity)) {
    factor = 0;
  }

  return factor;
}

/**
 * Simulate one household path month-by-month.
 *
 * Each month: mortgage takes its payment (if any loan is left), the household
 * pays its bills, and the leftover is split between investing and cash by
 * `investPctOfSurplus`. If income falls short, cash is drained first, then
 * investments are sold (cost basis reduced proportionally). If BOTH run out,
 * the shortfall accrues as informal debt and we flag the month — that's the
 * "this plan breaks here" signal.
 */
export function simulateHousehold({
  monthlyTakeHome,
  monthlyExpenses, // living costs excluding everything housing
  monthlyHousingOther, // property tax + insurance + HOA — never goes away
  startCash = 0, // emergency fund (earns nothing, spent first)
  startInvest = 0,
  start401k = 0,
  startMortgage,
  mortgageRatePct,
  monthlyPI: pi,
  investPctOfSurplus = 100,
  marketReturnPct,
  homePrice,
  homeAppreciationPct,
  months,
  currentAge,
  events = {},
}) {
  const rM = monthlyRate(mortgageRatePct);
  const rI = monthlyRate(marketReturnPct);
  const investShare = Math.min(100, Math.max(0, investPctOfSurplus)) / 100;

  let cash = Math.max(0, startCash);
  let invest = Math.max(0, startInvest);
  let basis = invest;
  let mortgage = Math.max(0, startMortgage);
  let shortfallDebt = 0; // bills we couldn't pay once everything ran out

  let mortgageFreeMonth = mortgage <= 0.01 ? 0 : null;
  let firstShortfallMonth = null; // first month income < bills
  let brokeMonth = null; // first month cash AND investments couldn't cover
  let lowestLiquid = { amount: cash + invest, month: 0 };

  const homeValueAtYear = (y) =>
    homePrice * Math.pow(1 + homeAppreciationPct / 100, y);
  const retirementAtYear = (y) =>
    start401k * Math.pow(1 + marketReturnPct / 100, y);

  const billsNow = (mtg) =>
    monthlyExpenses + monthlyHousingOther + (mtg > 0.01 ? pi : 0);

  const snapshot = (year) => {
    const homeValue = homeValueAtYear(year);
    const retirement = retirementAtYear(year);
    const homeEquity = homeValue - mortgage;
    const liquid = cash + invest;
    const bills = billsNow(mortgage);
    return {
      year,
      cash,
      invest,
      basis,
      mortgage,
      homeValue,
      homeEquity,
      retirement,
      netWorth: liquid + retirement + homeEquity - shortfallDebt,
      // Months the household could cover ALL bills with zero income, using
      // only touchable money (401k stays locked — this is the sleep-at-night
      // number, not the theoretical one).
      runwayMonths: bills > 0 ? liquid / bills : Infinity,
      // Smallest take-home income that keeps the lights on this year.
      minIncomeMonthly: bills,
    };
  };

  const series = [snapshot(0)];

  for (let m = 1; m <= months; m++) {
    // 1) Mortgage takes its cut.
    let payment = 0;
    if (mortgage > 0.01) {
      const interest = mortgage * rM;
      let principal = Math.max(0, pi - interest);
      if (principal >= mortgage) {
        payment = mortgage + interest;
        mortgage = 0;
      } else {
        payment = pi;
        mortgage -= principal;
      }
      if (mortgage <= 0.01 && mortgageFreeMonth == null) mortgageFreeMonth = m;
    }

    // 2) Income arrives (dented by whatever life event we're testing).
    const factor = incomeFactor(m, events, {
      mortgageIsGone: mortgage <= 0.01,
      currentAge,
    });
    const income = monthlyTakeHome * factor;

    // 3) Investments grow regardless.
    invest *= 1 + rI;

    // 4) Pay the bills; save or drain the difference.
    const surplus = income - (monthlyExpenses + monthlyHousingOther + payment);
    if (surplus >= 0) {
      const contribution = surplus * investShare;
      invest += contribution;
      basis += contribution;
      cash += surplus - contribution;
    } else {
      if (firstShortfallMonth == null) firstShortfallMonth = m;
      let need = -surplus;

      const fromCash = Math.min(cash, need);
      cash -= fromCash;
      need -= fromCash;

      if (need > 0 && invest > 0) {
        const fromInvest = Math.min(invest, need);
        basis -= basis * (fromInvest / invest);
        invest -= fromInvest;
        need -= fromInvest;
      }

      if (need > 0.01) {
        if (brokeMonth == null) brokeMonth = m;
        shortfallDebt += need;
      }
    }

    const liquid = cash + invest;
    if (liquid < lowestLiquid.amount) lowestLiquid = { amount: liquid, month: m };

    if (m % 12 === 0) series.push(snapshot(m / 12));
  }

  return {
    series,
    final: series[series.length - 1],
    mortgageFreeMonth,
    mortgageFreeYear: mortgageFreeMonth == null ? null : mortgageFreeMonth / 12,
    firstShortfallMonth,
    firstShortfallYear:
      firstShortfallMonth == null ? null : firstShortfallMonth / 12,
    brokeMonth,
    brokeYear: brokeMonth == null ? null : brokeMonth / 12,
    lowestLiquid: {
      amount: lowestLiquid.amount,
      year: lowestLiquid.month / 12,
    },
    shortfallDebt,
  };
}

/**
 * The three ways to aim one pool of money at the mortgage. All three spend
 * the SAME pool — what differs is the monthly payment that survives:
 *   - payoff: kill as much loan as possible; payment stays until the loan's
 *             gone (immediately, if the pool covers it), then it's $0.
 *   - recast: same principal paydown, but the payment is re-amortized over
 *             the remaining term — a permanently smaller bill from day one.
 *   - keep:   pool stays invested, payment stays as-is.
 */
export function buildStrategies({ pool, loanBalance, mortgageRatePct, yearsLeft }) {
  const pi = monthlyPI(loanBalance, mortgageRatePct, yearsLeft);
  const lump = Math.min(Math.max(0, pool), Math.max(0, loanBalance));
  const remaining = Math.max(0, loanBalance - lump);
  const recastPI = remaining > 0 ? monthlyPI(remaining, mortgageRatePct, yearsLeft) : 0;

  return {
    payoff: {
      key: 'payoff',
      label: 'Pay it off',
      startInvest: Math.max(0, pool - lump),
      startMortgage: remaining,
      pi,
    },
    recast: {
      key: 'recast',
      label: 'Recast the loan',
      startInvest: Math.max(0, pool - lump),
      startMortgage: remaining,
      pi: recastPI,
    },
    keep: {
      key: 'keep',
      label: 'Keep payment, stay invested',
      startInvest: Math.max(0, pool),
      startMortgage: Math.max(0, loanBalance),
      pi,
    },
  };
}

/**
 * Run all three strategies through the same life event at one market return.
 * `household` carries everything simulateHousehold needs except the
 * strategy-specific fields (startInvest / startMortgage / monthlyPI).
 */
export function compareStrategies({ household, strategies, marketReturnPct }) {
  const run = (s) =>
    simulateHousehold({
      ...household,
      marketReturnPct,
      startInvest: s.startInvest,
      startMortgage: s.startMortgage,
      monthlyPI: s.pi,
    });
  return {
    payoff: run(strategies.payoff),
    recast: run(strategies.recast),
    keep: run(strategies.keep),
  };
}

/**
 * Risk-averse verdict across the three market moods: who wins in the BAD
 * market, does anyone run dry, and how early can you breathe easy.
 * `byMood` = { cautious, expected, optimistic } → each a compareStrategies()
 * result. Final net worths passed in are after-tax, today's-dollars numbers
 * keyed by strategy, per mood.
 */
export function buildScenarioVerdict({ finals, byMood, retirementAge }) {
  const order = ['payoff', 'recast', 'keep'];
  const labels = {
    payoff: 'paying the house off',
    recast: 'recasting',
    keep: 'keeping the payment and staying invested',
  };

  const winnerIn = (mood) =>
    order.reduce((best, k) =>
      finals[mood][k] > finals[mood][best] ? k : best,
    order[0]);

  const cautiousWinner = winnerIn('cautious');
  const expectedWinner = winnerIn('expected');

  const broke = order.filter((k) => byMood.cautious[k].brokeYear != null);
  const points = [];

  if (broke.length > 0) {
    const names = broke.map((k) => labels[k]).join(' and ');
    points.push(
      `⚠ In a bad market, ${names} runs completely out of touchable money before age ${retirementAge}. Treat that path as off the table unless something else changes.`,
    );
  }

  if (cautiousWinner === expectedWinner) {
    points.push(
      `${capitalize(labels[cautiousWinner])} comes out ahead in the bad market AND the expected one — it wins without needing luck.`,
    );
  } else {
    points.push(
      `${capitalize(labels[expectedWinner])} wins if markets behave, but ${labels[cautiousWinner]} wins if they don't. Since only one of those is guaranteed, the cautious column is the one to trust.`,
    );
  }

  const gapPct = (mood) => {
    const w = winnerIn(mood);
    const vals = order.map((k) => finals[mood][k]);
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    return hi > 0 ? ((hi - lo) / hi) * 100 : 0;
  };
  if (gapPct('expected') < 8 && broke.length === 0) {
    points.push(
      'In the expected market the three paths land within ~8% of each other — close enough to call it a tie and pick whichever lets you sleep.',
    );
  }

  return {
    cautiousWinner,
    expectedWinner,
    anyBroke: broke.length > 0,
    brokeStrategies: broke,
    points,
  };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
