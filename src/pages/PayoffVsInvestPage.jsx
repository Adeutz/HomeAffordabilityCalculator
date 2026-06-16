import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import NumberField from '../components/NumberField.jsx';
import NetWorthCompareChart from '../components/NetWorthCompareChart.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import { load, save, KEYS } from '../lib/storage.js';
import { money, percent } from '../lib/format.js';
import {
  monthlyPI,
  buildComparison,
  buildAccelerated,
  buildSensitivity,
  buildVerdict,
  crossoverYear,
  afterTaxNetWorth,
  toTodaysDollars,
} from '../lib/payoffProjection.js';

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

  const comparison = useMemo(() => buildComparison(baseArgs), [baseArgs]);
  const { payoff, keep, baseline } = comparison;

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

  // Headline numbers: net worth at retirement, AFTER cashing out (cap gains
  // paid), in today's dollars (if toggled on).
  const finalPayoff = adj(
    afterTaxNetWorth(payoff.final, capGainsPct),
    horizonYears,
  );
  const finalKeep = adj(afterTaxNetWorth(keep.final, capGainsPct), horizonYears);
  const finalBaseline = adj(
    afterTaxNetWorth(baseline.final, capGainsPct),
    horizonYears,
  );

  const verdict = useMemo(
    () =>
      buildVerdict({
        payoffNetWorth: finalPayoff,
        keepNetWorth: finalKeep,
        mortgageRatePct,
        marketReturnPct,
        years: horizonYears,
        canFullyPayoff,
      }),
    [
      finalPayoff,
      finalKeep,
      mortgageRatePct,
      marketReturnPct,
      horizonYears,
      canFullyPayoff,
    ],
  );

  const chartData = useMemo(
    () =>
      payoff.series.map((p, i) => ({
        year: p.year,
        payoff: adj(p.netWorth, p.year),
        keep: adj(keep.series[i].netWorth, p.year),
        baseline: adj(baseline.series[i].netWorth, p.year),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payoff, keep, baseline, showReal, inflationPct],
  );

  const crossover = useMemo(
    () => crossoverYear(payoff.series, keep.series),
    [payoff, keep],
  );

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
          both forward to age {retirementAge}.
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

      {/* ---------------- Headline result ---------------- */}
      <Card title={`Net worth at age ${retirementAge} (${dollarsLabel}, after selling investments)`}>
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
              Mortgage gone {payoff.mortgageFreeYear === 0
                ? 'on day one'
                : `in ${Math.round(payoff.mortgageFreeYear ?? horizonYears)} yrs`}
              , then you invest the freed-up {money(pi)}/mo.
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
              Your {money(pool)} pool stays invested while you pay the mortgage
              normally.
            </div>
          </div>
        </div>

        <div className="stat-grid mt-16">
          <div className="stat">
            <div className="label">Difference between the two</div>
            <div className="value">
              {money(Math.abs(finalKeep - finalPayoff))}
            </div>
            <div className="text-tiny muted" style={{ fontWeight: 500 }}>
              {finalKeep > finalPayoff ? 'Keep & invest ahead' : 'Payoff ahead'}
            </div>
          </div>
          <div className="stat">
            <div className="label">If you do nothing extra</div>
            <div className="value" style={{ color: COLORS.baseline }}>
              {money(finalBaseline)}
            </div>
            <div className="text-tiny muted" style={{ fontWeight: 500 }}>
              Pool sits in cash — the lazy floor
            </div>
          </div>
          <div className="stat">
            <div className="label">Crossover point</div>
            <div className="value">
              {crossover == null ? 'Never flips' : `Year ${crossover}`}
            </div>
            <div className="text-tiny muted" style={{ fontWeight: 500 }}>
              When the lead changes hands
            </div>
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
      <Card title={`Net worth over time (${dollarsLabel})`}>
        <NetWorthCompareChart
          data={chartData}
          lines={[
            { key: 'keep', name: 'Keep mortgage & invest', color: COLORS.keep },
            { key: 'payoff', name: 'Pay off the house', color: COLORS.payoff },
            {
              key: 'baseline',
              name: 'Do nothing extra',
              color: COLORS.baseline,
              strokeWidth: 1.8,
              dashed: true,
            },
          ]}
        />
        <div className="text-tiny muted mt-8">
          Lines show net worth on paper (investments + retirement + home equity),
          before any sale taxes. Both active paths usually start apart and
          converge — the gap at the end is what really matters.
        </div>
      </Card>

      {/* ---------------- Milestones ---------------- */}
      <Card title="Milestones">
        <div className="funding-summary">
          <MilestoneRow
            label="Mortgage-free if you pay it off"
            value={
              payoff.mortgageFreeYear === 0
                ? 'Immediately'
                : `~${Math.round(payoff.mortgageFreeYear ?? horizonYears)} years`
            }
          />
          <MilestoneRow
            label="Mortgage-free if you keep it"
            value={
              keep.mortgageFreeYear == null
                ? `After ${horizonYears}+ years`
                : `~${Math.round(keep.mortgageFreeYear)} years`
            }
          />
          <MilestoneRow
            label="Crossover year (lead changes hands)"
            value={crossover == null ? 'One path leads the whole way' : `Year ${crossover}`}
          />
          <MilestoneRow
            label={`Net worth gap at age ${retirementAge}`}
            value={`${money(Math.abs(finalKeep - finalPayoff))} (${
              finalKeep > finalPayoff ? 'keep & invest' : 'payoff'
            })`}
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
      <Card title={`Year-by-year (${dollarsLabel})`}>
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Age</th>
              <th>Pay off</th>
              <th>Keep &amp; invest</th>
              <th>Do nothing</th>
            </tr>
          </thead>
          <tbody>
            {tableYears.map((y) => (
              <tr key={y}>
                <td>{y}</td>
                <td>{currentAge + y}</td>
                <td>{money(adj(payoff.series[y].netWorth, y))}</td>
                <td>{money(adj(keep.series[y].netWorth, y))}</td>
                <td>{money(adj(baseline.series[y].netWorth, y))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-tiny muted mt-8">
          On-paper net worth (no sale taxes), so these run a touch higher than
          the after-tax headline numbers up top.
        </div>
      </Card>

      {/* ---------------- Accelerated (no lump sum) ---------------- */}
      <Card title="No big lump sum? Throw extra at the mortgage vs. invest it">
        <p className="text-small muted mb-12">
          If you can't pay the whole thing off at once, here's the everyday
          version: send an extra amount toward the mortgage each month, OR invest
          that same amount. Same money out of your pocket either way.
        </p>
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
