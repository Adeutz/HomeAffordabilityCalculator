import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import NumberField from '../components/NumberField.jsx';
import FanChart from '../components/FanChart.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import { load, save, KEYS } from '../lib/storage.js';
import { money, percent } from '../lib/format.js';
import {
  monthlyPI,
  buildComparison,
  buildAccelerated,
  buildSensitivity,
  afterTaxNetWorth,
} from '../lib/payoffProjection.js';
import {
  runMonteCarlo,
  buildMonteCarloVerdict,
  returnStats,
  RETURN_MODES,
} from '../lib/monteCarlo.js';

const COLORS = {
  payoff: '#00a663', // green — guaranteed / safe
  keep: '#006aff', // blue — keep mortgage, invest
  baseline: '#d6443c', // red — do nothing
};

function buildDefaults(inputs) {
  const homePrice = Number(inputs.targetHomePrice) || 400_000;
  const loanAmount = Math.max(0, homePrice - (Number(inputs.downPayment) || 0));

  // Pull the saved "Could you pay off this house?" card, if the user filled it.
  const card = load(KEYS.payoffPlanCard, null);
  const bal = card && typeof card.balances === 'object' ? card.balances : null;

  const fundable = bal
    ? (Number(bal.cash) || 0) +
      (Number(bal.brokerage) || 0) +
      (Number(bal.otherInvestments) || 0) +
      (Number(bal.otherHouseEquity) || 0)
    : Number(inputs.currentSavings) || 0;

  const loanBalance =
    card && card.loanOutstanding != null
      ? Number(card.loanOutstanding)
      : loanAmount;

  const start401k = bal ? Number(bal.retirement401k) || 0 : 0;

  return {
    homePrice,
    pool: Math.round(fundable),
    loanBalance: Math.round(loanBalance),
    mortgageRatePct: Number(inputs.interestRate) || 6.75,
    loanTermYears: Number(inputs.loanTermYears) || 30,
    currentAge: 35,
    retirementAge: 65,
    monthlyExtraInvest: 0,
    start401k: Math.round(start401k),
    extraMortgagePrincipal: 500,
    // Balanced default assumptions (user picked the "Balanced" preset).
    marketReturnPct: 7,
    inflationPct: 3,
    homeAppreciationPct: Number(inputs.annualHomeAppreciationPct) || 3,
    capGainsPct: 15,
    showReal: true,
    // --- Monte Carlo settings ---
    // 'bootstrap' replays real historical years; 'normal' draws from a bell
    // curve. Bootstrap is the default because real markets have fatter tails
    // than a bell curve admits.
    returnMode: RETURN_MODES.BOOTSTRAP,
    simRuns: 5000,
    // Copy 5 consecutive historical years at a time so crashes keep their
    // recoveries attached instead of being shuffled apart.
    blockYears: 5,
    stdDevPct: 15,
    // Slide history's average onto the user's own expected return (see
    // recenterReturns in monteCarlo.js). Turning this off bootstraps raw
    // history, which averages ~10%/yr and roughly doubles every number.
    recenterToExpected: true,
  };
}

function loadSettings(inputs) {
  const defaults = buildDefaults(inputs);
  const saved = load(KEYS.payoffVsInvest, null);
  if (!saved || typeof saved !== 'object') return defaults;
  return { ...defaults, ...saved };
}

export default function PayoffVsInvestPage() {
  const { inputs } = useInputs();

  const [settings, setSettings] = useState(() => loadSettings(inputs));
  const set = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(KEYS.payoffVsInvest, next);
      return next;
    });
  };

  const {
    homePrice,
    pool,
    loanBalance,
    mortgageRatePct,
    loanTermYears,
    currentAge,
    retirementAge,
    monthlyExtraInvest,
    start401k,
    extraMortgagePrincipal,
    marketReturnPct,
    inflationPct,
    homeAppreciationPct,
    capGainsPct,
    showReal,
    returnMode,
    simRuns,
    blockYears,
    stdDevPct,
    recenterToExpected,
  } = settings;

  const horizonYears = Math.max(1, Math.round(retirementAge - currentAge));
  const months = horizonYears * 12;
  const pi = useMemo(
    () => monthlyPI(loanBalance, mortgageRatePct, loanTermYears),
    [loanBalance, mortgageRatePct, loanTermYears],
  );
  const canFullyPayoff = pool >= loanBalance;

  const baseArgs = useMemo(
    () => ({
      pool,
      loanBalance,
      monthlyPI: pi,
      mortgageRatePct,
      monthlyExtraInvest,
      marketReturnPct,
      homePrice,
      homeAppreciationPct,
      start401k,
      months,
    }),
    [
      pool,
      loanBalance,
      pi,
      mortgageRatePct,
      monthlyExtraInvest,
      marketReturnPct,
      homePrice,
      homeAppreciationPct,
      start401k,
      months,
    ],
  );

  // The deterministic engine still powers three things that don't need (or
  // can't use) randomness: the "do nothing" cash floor, the extra-payment
  // comparison, and the fixed-return sensitivity table.
  const comparison = useMemo(() => buildComparison(baseArgs), [baseArgs]);
  const { baseline } = comparison;

  const accelerated = useMemo(
    () => buildAccelerated({ ...baseArgs, extraMortgagePrincipal }),
    [baseArgs, extraMortgagePrincipal],
  );

  const sensitivity = useMemo(
    () => buildSensitivity({ ...baseArgs, inflationPct, capGainsPct }),
    [baseArgs, inflationPct, capGainsPct],
  );

  // Display helper: optionally convert future dollars to today's dollars.
  const realFactor = (y) =>
    showReal ? Math.pow(1 + inflationPct / 100, y) : 1;
  const adj = (v, y) => v / realFactor(y);

  // ---------------- Monte Carlo ----------------
  //
  // Both strategies commit the same monthly budget; the only difference is
  // where the money sits. Each simulated future hands BOTH strategies the same
  // market history, so every comparison asks "given this future, which choice
  // would have been better?" rather than comparing a lucky version of one plan
  // against an unlucky version of the other.
  const strategies = useMemo(
    () => [
      {
        key: 'payoff',
        label: 'Pay off the house',
        startInvest: Math.max(0, pool - loanBalance),
        startMortgage: Math.max(0, loanBalance - pool),
        monthlyContribution: monthlyExtraInvest,
        investFreedPayment: true,
      },
      {
        key: 'keep',
        label: 'Keep mortgage & invest',
        startInvest: pool,
        startMortgage: loanBalance,
        monthlyContribution: monthlyExtraInvest,
        investFreedPayment: true,
      },
    ],
    [pool, loanBalance, monthlyExtraInvest],
  );

  const mc = useMemo(
    () =>
      runMonteCarlo({
        strategies,
        shared: {
          monthlyPI: pi,
          mortgageRatePct,
          months,
          homePrice,
          homeAppreciationPct,
          start401k,
        },
        runs: simRuns,
        seed: 12345, // fixed, so the numbers don't flicker on every re-render
        mode: returnMode,
        meanReturnPct: marketReturnPct,
        stdDevPct,
        blockYears,
        recenterToPct: recenterToExpected ? marketReturnPct : null,
        capGainsPct,
        inflationPct,
        real: showReal,
      }),
    [
      strategies,
      pi,
      mortgageRatePct,
      months,
      homePrice,
      homeAppreciationPct,
      start401k,
      simRuns,
      returnMode,
      marketReturnPct,
      stdDevPct,
      blockYears,
      recenterToExpected,
      capGainsPct,
      inflationPct,
      showReal,
    ],
  );

  const payoffMc = mc.byStrategy.payoff;
  const keepMc = mc.byStrategy.keep;

  // headToHead measures (payoff - keep). Flip it so everything below reads
  // from "keep & invest"'s point of view, which is how the page is written.
  // Note the percentiles also mirror: keep's bad case is payoff's good case.
  const h2h = mc.headToHead['payoff-vs-keep'];
  const keepEdge = useMemo(
    () => ({
      p10: -h2h.gap.p90,
      p25: -h2h.gap.p75,
      p50: -h2h.gap.p50,
      p75: -h2h.gap.p25,
      p90: -h2h.gap.p10,
    }),
    [h2h],
  );

  const finalPayoff = payoffMc.final.p50;
  const finalKeep = keepMc.final.p50;
  const finalBaseline = adj(
    afterTaxNetWorth(baseline.final, capGainsPct),
    horizonYears,
  );

  const verdict = useMemo(
    () =>
      buildMonteCarloVerdict({
        keepWinRate: h2h.bWinRate,
        keepEdge,
        years: horizonYears,
        mortgageRatePct,
        marketReturnPct,
        canFullyPayoff,
        runs: mc.runs,
      }),
    [
      h2h,
      keepEdge,
      horizonYears,
      mortgageRatePct,
      marketReturnPct,
      canFullyPayoff,
      mc.runs,
    ],
  );

  const chartData = useMemo(
    () =>
      mc.yearLabels.map((y, i) => ({
        year: y,
        payoffBand: [payoffMc.bands.p10[i], payoffMc.bands.p90[i]],
        payoffMed: payoffMc.bands.p50[i],
        keepBand: [keepMc.bands.p10[i], keepMc.bands.p90[i]],
        keepMed: keepMc.bands.p50[i],
      })),
    [mc, payoffMc, keepMc],
  );

  const histStats = useMemo(() => returnStats(), []);

  // Curated set of years for the breakdown table.
  const tableYears = useMemo(() => {
    const set = new Set([1, 5, 10, 15, 20, 25, 30, 35, 40]);
    const ys = [...set].filter((y) => y <= horizonYears);
    if (!ys.includes(horizonYears)) ys.push(horizonYears);
    return ys.sort((a, b) => a - b);
  }, [horizonYears]);

  // Accelerated pair final numbers (today's dollars, after tax).
  const accelPayoffNW = adj(
    afterTaxNetWorth(accelerated.accelerate.final, capGainsPct),
    horizonYears,
  );
  const accelInvestNW = adj(
    afterTaxNetWorth(accelerated.investExtra.final, capGainsPct),
    horizonYears,
  );

  const dollarsLabel = showReal ? "today's dollars" : 'future dollars';

  return (
    <div>
      <div className="page-title">
        <h1>Pay it off, or keep the mortgage &amp; invest?</h1>
        <span className="subtitle">
          Race both choices out to retirement and see where your net worth lands
          — so you can buy this house with calm nerves.
        </span>
      </div>

      <Card>
        <p className="text-small muted" style={{ margin: 0 }}>
          You've got a pile of money. You can use it to <strong>wipe out the
          mortgage</strong> (and then invest the payment you no longer owe), or
          <strong> keep the mortgage and invest that pile instead</strong>. Both
          choices spend the exact same amount each month — the only difference is
          where your money lives and how fast the loan disappears. Below, we play
          both forward to age {retirementAge}{' '}
          <strong>{mc.runs.toLocaleString()} different times</strong>, with a
          different market history each time, because the honest answer here
          isn't a number — it's a probability and a worst case.
        </p>
      </Card>

      {/* ---------------- Inputs ---------------- */}
      <Card title="Your money &amp; timeline">
        <div className="grid grid-two">
          <NumberField
            label="Money pool (the pile you'd pay off OR invest)"
            prefix="$"
            value={pool}
            onChange={(v) => set({ pool: v })}
            step={5_000}
            suffix="Cash + brokerage + investments. Keep your emergency fund out of this."
          />
          <NumberField
            label="Mortgage balance to deal with"
            prefix="$"
            value={loanBalance}
            onChange={(v) => set({ loanBalance: v })}
            step={5_000}
            suffix={`Monthly P&I works out to ${money(pi)}/mo`}
          />
          <NumberField
            label="Mortgage rate"
            value={mortgageRatePct}
            onChange={(v) => set({ mortgageRatePct: v })}
            step={0.125}
            suffix="% — your loan's interest rate"
          />
          <NumberField
            label="Years left on the loan"
            value={loanTermYears}
            onChange={(v) => set({ loanTermYears: v })}
            step={1}
            suffix="years"
          />
          <NumberField
            label="Your age now"
            value={currentAge}
            onChange={(v) => set({ currentAge: v })}
            step={1}
          />
          <NumberField
            label="Retirement age"
            value={retirementAge}
            onChange={(v) => set({ retirementAge: v })}
            step={1}
            suffix={`Projecting ${horizonYears} years`}
          />
          <NumberField
            label="Extra invested every month (all paths)"
            prefix="$"
            value={monthlyExtraInvest}
            onChange={(v) => set({ monthlyExtraInvest: v })}
            step={100}
            suffix="Normal retirement contributions, etc."
          />
          <NumberField
            label="Retirement (401k) you already have"
            prefix="$"
            value={start401k}
            onChange={(v) => set({ start401k: v })}
            step={5_000}
            suffix="Grows the same in every path"
          />
        </div>
        {!canFullyPayoff && (
          <div className="allocation-warning yellow mt-16">
            Your pool ({money(pool)}) is smaller than the mortgage balance (
            {money(loanBalance)}). The payoff path clears as much as it can and
            keeps paying the leftover loan.
          </div>
        )}
      </Card>

      <Card title="Assumptions (change these to match your beliefs)">
        <div className="grid grid-two">
          <NumberField
            label="Investment return per year"
            value={marketReturnPct}
            onChange={(v) => set({ marketReturnPct: v })}
            step={0.5}
            suffix="% — long-run stock market avg is ~7% (NOT guaranteed)"
          />
          <NumberField
            label="Inflation per year"
            value={inflationPct}
            onChange={(v) => set({ inflationPct: v })}
            step={0.25}
            suffix="% — used to show today's dollars"
          />
          <NumberField
            label="Home value growth per year"
            value={homeAppreciationPct}
            onChange={(v) => set({ homeAppreciationPct: v })}
            step={0.5}
            suffix="% — same for both paths"
          />
          <NumberField
            label="Capital gains tax (when you sell investments)"
            value={capGainsPct}
            onChange={(v) => set({ capGainsPct: v })}
            step={1}
            suffix="% — 15% is typical for long-term gains"
          />
        </div>

        <div className="divider" />
        <div className="mode-switch" role="group" aria-label="Dollar display">
          <button
            type="button"
            className={`mode-switch-btn ${showReal ? 'active' : ''}`}
            onClick={() => set({ showReal: true })}
          >
            Today's dollars
          </button>
          <button
            type="button"
            className={`mode-switch-btn ${!showReal ? 'active' : ''}`}
            onClick={() => set({ showReal: false })}
          >
            Future dollars
          </button>
        </div>
        <div className="text-tiny muted mt-8">
          {showReal
            ? 'Showing what the money would be worth in today\u2019s purchasing power (adjusted for inflation).'
            : 'Showing the raw future dollar amounts (not adjusted for inflation).'}
        </div>
      </Card>

      {/* ---------------- Simulation settings ---------------- */}
      <Card title="How the futures are simulated">
        <p className="text-small muted mt-0 mb-12">
          Rather than assuming the market returns exactly{' '}
          {percent(marketReturnPct, 1)} every single year — which no market has
          ever done — we run {mc.runs.toLocaleString()} different futures and
          look at the spread. Lumpy returns are the whole reason this decision is
          hard, so the model has to have lumps in it.
        </p>

        <div className="mode-switch" role="group" aria-label="Return model">
          <button
            type="button"
            className={`mode-switch-btn ${
              returnMode === RETURN_MODES.BOOTSTRAP ? 'active' : ''
            }`}
            onClick={() => set({ returnMode: RETURN_MODES.BOOTSTRAP })}
          >
            Replay real history
          </button>
          <button
            type="button"
            className={`mode-switch-btn ${
              returnMode === RETURN_MODES.NORMAL ? 'active' : ''
            }`}
            onClick={() => set({ returnMode: RETURN_MODES.NORMAL })}
          >
            Bell curve
          </button>
        </div>

        <div className="text-tiny muted mt-8">
          {returnMode === RETURN_MODES.BOOTSTRAP ? (
            <>
              Each simulated year copies an actual S&amp;P 500 year drawn at
              random from {histStats.firstYear}–{histStats.lastYear} (
              {histStats.count} years, {blockYears} consecutive at a time so
              crashes keep their recoveries attached). Real history includes{' '}
              {percent(histStats.minPct, 1)} and {percent(histStats.maxPct, 1)}{' '}
              years — a bell curve says those should essentially never happen,
              and yet they did.
            </>
          ) : (
            <>
              Each year is drawn from a bell curve centred on{' '}
              {percent(marketReturnPct, 1)} with a {percent(stdDevPct, 0)} spread.
              Easier to reason about, but it understates how often extreme years
              actually occur — real history has fatter tails than this.
            </>
          )}
        </div>

        {returnMode === RETURN_MODES.NORMAL && (
          <div className="grid grid-two mt-12">
            <NumberField
              label="Year-to-year swing (standard deviation)"
              value={stdDevPct}
              onChange={(v) => set({ stdDevPct: Math.max(0, v) })}
              step={1}
              suffix="% — the S&P's own historical figure is about 19%"
            />
          </div>
        )}

        <div className="divider" />

        <label className="row text-small" style={{ fontWeight: 600, cursor: 'pointer', gap: 8 }}>
          <input
            type="checkbox"
            checked={recenterToExpected}
            onChange={(e) => set({ recenterToExpected: e.target.checked })}
          />
          Match history to my {percent(marketReturnPct, 1)} return assumption
        </label>
        <div className="text-tiny muted mt-8">
          {recenterToExpected ? (
            <>
              History's actual long-run average is{' '}
              {percent(histStats.geometricMeanPct, 2)} a year — noticeably higher
              than the {percent(marketReturnPct, 1)} you set above. We keep
              history's ups, downs and crashes exactly as they were, but slide the
              whole thing down so its average matches what you actually believe.
              Untick to use raw history instead, which will make every number
              here much bigger.
            </>
          ) : (
            <>
              ⚠ Using raw history, which averaged{' '}
              {percent(histStats.geometricMeanPct, 2)} a year — well above the{' '}
              {percent(marketReturnPct, 1)} assumption you set above. Every
              number on this page is now considerably more optimistic than your
              own assumption implies.
            </>
          )}
        </div>

        <div className="grid grid-two mt-12">
          <NumberField
            label="Number of futures to simulate"
            value={simRuns}
            onChange={(v) => set({ simRuns: Math.min(20000, Math.max(200, Math.round(v))) })}
            step={1000}
            suffix="More runs = steadier numbers. 5,000 is plenty."
          />
          {returnMode === RETURN_MODES.BOOTSTRAP && (
            <NumberField
              label="Consecutive years copied at a time"
              value={blockYears}
              onChange={(v) => set({ blockYears: Math.min(20, Math.max(1, Math.round(v))) })}
              step={1}
              suffix="1 = shuffle every year independently. 5 keeps market streaks intact."
            />
          )}
        </div>
      </Card>

      {/* ---------------- Headline result ---------------- */}
      <Card
        title={`Net worth at age ${retirementAge} across ${mc.runs.toLocaleString()} possible futures (${dollarsLabel}, after selling investments)`}
      >
        <p className="text-small muted mt-0 mb-12">
          These are <strong>median</strong> outcomes — half of simulated futures
          did better, half did worse. The range underneath each one is where 80%
          of futures landed, and that range is the part most calculators hide.
        </p>

        <div className="hero-prices">
          <div className="hero-price-block">
            <div className="label">
              <span className="swatch" style={{ background: COLORS.payoff }} />{' '}
              Pay off the house
            </div>
            <div className="price" style={{ color: COLORS.payoff }}>
              {money(finalPayoff)}
            </div>
            <div className="sub">
              {money(payoffMc.final.p10)} to {money(payoffMc.final.p90)}
            </div>
          </div>

          <div className="hero-price-divider" aria-hidden="true" />

          <div className="hero-price-block">
            <div className="label">
              <span className="swatch" style={{ background: COLORS.keep }} />{' '}
              Keep mortgage &amp; invest
            </div>
            <div className="price" style={{ color: COLORS.keep }}>
              {money(finalKeep)}
            </div>
            <div className="sub">
              {money(keepMc.final.p10)} to {money(keepMc.final.p90)}
            </div>
          </div>
        </div>

        {/* Win probability — the single most useful number on this page. */}
        <div className="divider" />
        <div className="text-small mb-8" style={{ fontWeight: 600 }}>
          Who ends up ahead, across {mc.runs.toLocaleString()} futures?
        </div>
        <div className="mc-winbar">
          <div
            className="mc-winbar-seg"
            style={{
              background: COLORS.payoff,
              width: `${verdict.payoffPct}%`,
            }}
          >
            {verdict.payoffPct >= 12 ? `${verdict.payoffPct.toFixed(0)}%` : ''}
          </div>
          <div
            className="mc-winbar-seg"
            style={{ background: COLORS.keep, width: `${verdict.keepPct}%` }}
          >
            {verdict.keepPct >= 12 ? `${verdict.keepPct.toFixed(0)}%` : ''}
          </div>
        </div>
        <div className="text-tiny muted mt-8">
          Pay off wins {verdict.payoffPct.toFixed(1)}% of the time · keep &amp;
          invest wins {verdict.keepPct.toFixed(1)}%
        </div>

        <div className="mc-outcome-grid mt-16">
          {/* These two tiles report a GAP between the strategies, so the number
              itself stays in plain ink — a coloured swatch on the caption says
              which side is ahead. Colouring the figure red here would collide
              with red's other job on this page (the "do nothing" series). */}
          <div className="mc-outcome">
            <div className="label">Typical edge to keeping</div>
            <div className="value">
              {keepEdge.p50 >= 0 ? '+' : '−'}
              {money(Math.abs(keepEdge.p50))}
            </div>
            <div className="sub">
              <span
                className="swatch"
                style={{
                  background: keepEdge.p50 >= 0 ? COLORS.keep : COLORS.payoff,
                }}
              />{' '}
              Median gap — {keepEdge.p50 >= 0 ? 'keep & invest' : 'paying off'}{' '}
              ahead in the middle case.
            </div>
          </div>

          <div className="mc-outcome">
            <div className="label">Keeping's bad case</div>
            <div className="value">
              {keepEdge.p10 >= 0 ? '+' : '−'}
              {money(Math.abs(keepEdge.p10))}
            </div>
            <div className="sub">
              <span
                className="swatch"
                style={{
                  background: keepEdge.p10 >= 0 ? COLORS.keep : COLORS.payoff,
                }}
              />{' '}
              In its worst 10% of futures, keeping the mortgage lands this far{' '}
              {keepEdge.p10 < 0 ? 'behind' : 'ahead of'} paying it off.
            </div>
          </div>

          <div className="mc-outcome">
            <div className="label">Range of outcomes</div>
            <div className="value">
              {money(keepMc.final.p90 - keepMc.final.p10)}
            </div>
            <div className="sub">
              How wide keeping's spread is, vs{' '}
              {money(payoffMc.final.p90 - payoffMc.final.p10)} for paying off.
            </div>
          </div>

          <div className="mc-outcome">
            <div className="label">If you do nothing extra</div>
            <div className="value" style={{ color: COLORS.baseline }}>
              {money(finalBaseline)}
            </div>
            <div className="sub">Pool sits in cash — the lazy floor.</div>
          </div>
        </div>
      </Card>

      {/* ---------------- Verdict ---------------- */}
      <Card title="The verdict">
        <div
          className={`allocation-warning ${
            verdict.tone === 'keep' ? 'yellow' : 'green'
          }`}
          style={{ fontWeight: 600 }}
        >
          {verdict.headline}
        </div>
        <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
          {verdict.points.map((pt, i) => (
            <li key={i} className="text-small" style={{ marginBottom: 8 }}>
              {pt}
            </li>
          ))}
        </ul>
      </Card>

      {/* ---------------- Chart ---------------- */}
      <Card title={`The range of futures (${dollarsLabel})`}>
        <FanChart
          data={chartData}
          series={[
            { key: 'payoff', name: 'Pay off the house', color: COLORS.payoff },
            { key: 'keep', name: 'Keep mortgage & invest', color: COLORS.keep },
          ]}
          bandLabel="80% of futures land in here"
        />
        <div className="text-tiny muted mt-8">
          The cones start at a single point — today, you know exactly where you
          stand — and widen as uncertainty compounds. Notice that the two are not
          the same width: a paid-off house doesn't care what the market does, so
          its cone stays narrow. That difference in width is the risk you'd be
          taking on, and it's the thing a single projected number can't show you.
        </div>
      </Card>

      {/* ---------------- Milestones ---------------- */}
      <Card title="Milestones">
        <div className="funding-summary">
          <MilestoneRow
            label="Mortgage-free if you pay it off"
            value={
              payoffMc.mortgageFreeYear.p50 === 0
                ? 'Immediately'
                : `~${Math.round(payoffMc.mortgageFreeYear.p50)} years`
            }
          />
          <MilestoneRow
            label="Mortgage-free if you keep it"
            value={`~${Math.round(keepMc.mortgageFreeYear.p50)} years`}
          />
          <MilestoneRow
            label="Chance keeping & investing ends ahead"
            value={`${verdict.keepPct.toFixed(1)}% of futures`}
          />
          <MilestoneRow
            label={`Median net worth gap at age ${retirementAge}`}
            value={`${money(Math.abs(keepEdge.p50))} (${
              keepEdge.p50 >= 0 ? 'keep & invest' : 'payoff'
            })`}
          />
          <MilestoneRow
            label="Worst 10% for keeping & investing"
            value={`${money(Math.abs(keepEdge.p10))} ${
              keepEdge.p10 < 0 ? 'behind payoff' : 'ahead of payoff'
            }`}
          />
        </div>
      </Card>

      {/* ---------------- Sensitivity ---------------- */}
      <Card title="What if the market does worse — or better?">
        <div className="text-small muted mb-12">
          Net worth at age {retirementAge} ({dollarsLabel}, after tax) at
          different average market returns. Your {percent(mortgageRatePct, 2)}{' '}
          mortgage is the bar investing has to beat.
        </div>
        <div className="allocation-warning mb-12" style={{ fontSize: 13 }}>
          Unlike everything above, this table assumes one perfectly smooth
          return every year — no crashes, no recoveries. Read it as "which side
          of the line am I on", not as a forecast. The cones above are the
          realistic version.
        </div>
        <table>
          <thead>
            <tr>
              <th>Market return</th>
              <th>Pay off</th>
              <th>Keep &amp; invest</th>
              <th>Winner</th>
            </tr>
          </thead>
          <tbody>
            {sensitivity.map((row) => (
              <tr key={row.returnPct}>
                <td>
                  {percent(row.returnPct, 0)}
                  {row.returnPct === 7 ? ' (avg)' : ''}
                </td>
                <td>{money(row.payoffNetWorth)}</td>
                <td>{money(row.keepNetWorth)}</td>
                <td>
                  <span
                    className={`pill ${row.winner === 'keep' ? 'yellow' : 'green'}`}
                    style={{ fontSize: 11 }}
                  >
                    <span className="dot" />
                    {row.winner === 'keep' ? 'Keep & invest' : 'Pay off'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-tiny muted mt-8">
          Notice how paying off wins whenever returns dip near or below your
          mortgage rate — that's the safety net the payoff gives you.
        </div>
      </Card>

      {/* ---------------- Year-by-year ---------------- */}
      {/* The table view of the fan chart — every number in the cones is
          reachable here without hovering anything. */}
      <Card title={`Year-by-year (${dollarsLabel})`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Age</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>
                  Pay off the house
                </th>
                <th colSpan={3} style={{ textAlign: 'center' }}>
                  Keep mortgage &amp; invest
                </th>
              </tr>
              <tr>
                <th />
                <th />
                <th>Worst 10%</th>
                <th>Median</th>
                <th>Best 10%</th>
                <th>Worst 10%</th>
                <th>Median</th>
                <th>Best 10%</th>
              </tr>
            </thead>
            <tbody>
              {tableYears.map((y) => (
                <tr key={y}>
                  <td>{y}</td>
                  <td>{currentAge + y}</td>
                  <td>{money(payoffMc.bands.p10[y])}</td>
                  <td style={{ fontWeight: 600 }}>
                    {money(payoffMc.bands.p50[y])}
                  </td>
                  <td>{money(payoffMc.bands.p90[y])}</td>
                  <td>{money(keepMc.bands.p10[y])}</td>
                  <td style={{ fontWeight: 600 }}>
                    {money(keepMc.bands.p50[y])}
                  </td>
                  <td>{money(keepMc.bands.p90[y])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-tiny muted mt-8">
          After-tax net worth, same basis as the headline. "Worst 10%" means 10%
          of simulated futures came out below that number — it is not a floor,
          and things can land below it.
        </div>
      </Card>

      {/* ---------------- Accelerated (no lump sum) ---------------- */}
      <Card title="No big lump sum? Throw extra at the mortgage vs. invest it">
        <p className="text-small muted mb-12">
          If you can't pay the whole thing off at once, here's the everyday
          version: send an extra amount toward the mortgage each month, OR invest
          that same amount. Same money out of your pocket either way.
        </p>
        <div className="allocation-warning mb-12" style={{ fontSize: 13 }}>
          This section still runs a single smooth {percent(marketReturnPct, 1)}{' '}
          projection rather than the {mc.runs.toLocaleString()} futures used
          above, so treat its margin as indicative. It's next in line to be
          replaced by a full sweep across every possible split.
        </div>
        <div className="grid grid-two mb-16">
          <NumberField
            label="Extra per month"
            prefix="$"
            value={extraMortgagePrincipal}
            onChange={(v) => set({ extraMortgagePrincipal: v })}
            step={100}
            suffix="Toward the loan, or into investments"
          />
        </div>
        <div className="hero-prices">
          <div className="hero-price-block">
            <div className="label">
              <span className="swatch" style={{ background: COLORS.payoff }} />{' '}
              Pay the mortgage down faster
            </div>
            <div className="price" style={{ color: COLORS.payoff }}>
              {money(accelPayoffNW)}
            </div>
            <div className="sub">
              Loan gone in ~
              {Math.round(
                accelerated.accelerate.mortgageFreeYear ?? horizonYears,
              )}{' '}
              yrs (vs {loanTermYears}), then you invest the whole payment.
            </div>
          </div>
          <div className="hero-price-divider" aria-hidden="true" />
          <div className="hero-price-block">
            <div className="label">
              <span className="swatch" style={{ background: COLORS.keep }} />{' '}
              Invest the extra instead
            </div>
            <div className="price" style={{ color: COLORS.keep }}>
              {money(accelInvestNW)}
            </div>
            <div className="sub">
              Keep the normal mortgage, put the extra {money(extraMortgagePrincipal)}/mo
              in the market from day one.
            </div>
          </div>
        </div>
        <div
          className={`allocation-warning ${
            accelInvestNW > accelPayoffNW ? 'yellow' : 'green'
          } mt-16`}
        >
          {accelInvestNW > accelPayoffNW
            ? `Investing the extra edges ahead by ${money(accelInvestNW - accelPayoffNW)} over ${horizonYears} years — but paying the loan down is the guaranteed, lower-stress win.`
            : `Paying the loan down faster wins by ${money(accelPayoffNW - accelInvestNW)} over ${horizonYears} years — and it's the safer choice too.`}
        </div>
      </Card>

      <Card>
        <div className="text-tiny muted" style={{ margin: 0 }}>
          This is an educational estimate, not financial advice. Real returns
          bounce around year to year, taxes are simplified, and your 401(k) will
          owe income tax on withdrawal (not the capital-gains rate shown here).
          The big takeaways — guaranteed vs. expected, and roughly how the paths
          compare — hold up well even though the exact dollars won't be perfect.
        </div>
      </Card>
    </div>
  );
}

function MilestoneRow({ label, value }) {
  return (
    <div className="funding-summary-row">
      <span>{label}</span>
      <strong style={{ marginLeft: 'auto' }}>{value}</strong>
    </div>
  );
}
