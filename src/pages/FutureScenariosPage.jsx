import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import NumberField from '../components/NumberField.jsx';
import NetWorthCompareChart from '../components/NetWorthCompareChart.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import { load, save, KEYS } from '../lib/storage.js';
import { money } from '../lib/format.js';
import { netMonthly } from '../lib/taxes.js';
import {
  buildStrategies,
  compareStrategies,
  buildScenarioVerdict,
  afterTaxNetWorth,
  DEFAULT_MOODS,
} from '../lib/futureScenarios.js';

const COLORS = {
  payoff: '#00a663', // green — guaranteed / safe
  recast: '#a155f5', // purple — the middle path
  keep: '#006aff', // blue — stay invested
};

const STRATEGY_ORDER = ['payoff', 'recast', 'keep'];

const SCENARIOS = [
  {
    id: 'steady',
    label: 'Steady as she goes',
    desc: 'No surprises — income holds the whole way out. The pure "where does each path land" race.',
  },
  {
    id: 'jobLoss',
    label: 'Job loss',
    desc: 'Income disappears (or mostly disappears) for a stretch. How hard does it hit, and which mortgage shape softens the blow?',
  },
  {
    id: 'incomeCut',
    label: 'Income drops for good',
    desc: 'Household income steps down and stays there — an earner steps back, hours shrink, a career changes.',
  },
  {
    id: 'workLess',
    label: 'Work less once paid off',
    desc: 'The moment the house is paid off, you deliberately earn less and take the time back with the kids. Paying off makes that possible on day one — the other paths make you wait for it.',
  },
  {
    id: 'stopEarly',
    label: 'Stop working early',
    desc: 'You stop working entirely at an age you pick and coast on savings until retirement. Does the money last?',
  },
];

const MOODS = [
  { id: 'cautious', label: 'Bad market' },
  { id: 'expected', label: 'Expected' },
  { id: 'optimistic', label: 'Good market' },
];

function buildDefaults(inputs) {
  const homePrice = Number(inputs.targetHomePrice) || 400_000;

  // Reuse whatever the user already told the Payoff vs Invest page and the
  // "Could you pay off this house?" card, so numbers carry across the app.
  const pv = load(KEYS.payoffVsInvest, null) || {};
  const card = load(KEYS.payoffPlanCard, null);
  const bal = card && typeof card.balances === 'object' ? card.balances : null;

  const fundable = bal
    ? (Number(bal.cash) || 0) +
      (Number(bal.brokerage) || 0) +
      (Number(bal.otherInvestments) || 0) +
      (Number(bal.otherHouseEquity) || 0)
    : Number(inputs.currentSavings) || 0;

  const loanBalance =
    pv.loanBalance != null
      ? Number(pv.loanBalance)
      : card && card.loanOutstanding != null
        ? Number(card.loanOutstanding)
        : Math.max(0, homePrice - (Number(inputs.downPayment) || 0));

  const housingOther = Math.round(
    (homePrice * ((Number(inputs.propertyTaxRatePct) || 0) / 100)) / 12 +
      (Number(inputs.homeInsuranceAnnual) || 0) / 12 +
      (Number(inputs.hoaMonthly) || 0),
  );

  const expenses = Math.round(
    (Number(inputs.monthlySpendingExcludingHousing) || 0) +
      (Number(inputs.extraHomeownerSpendingMonthly) || 0) +
      (Number(inputs.monthlyDebts) || 0),
  );

  return {
    // Household cash flow
    grossIncome: Number(inputs.annualIncome) || 90_000,
    expenses,
    housingOther,
    emergencyFund: Math.round((6 * expenses) / 1000) * 1000,
    pool: pv.pool != null ? Number(pv.pool) : Math.round(fundable),
    investPctOfSurplus: 100,
    // Mortgage
    loanBalance: Math.round(loanBalance),
    mortgageRatePct: Number(pv.mortgageRatePct) || Number(inputs.interestRate) || 6.75,
    yearsLeft: Number(pv.loanTermYears) || Number(inputs.loanTermYears) || 30,
    homePrice,
    // Timeline
    currentAge: Number(pv.currentAge) || 35,
    retirementAge: Number(pv.retirementAge) || 65,
    start401k: Number(pv.start401k) || 0,
    // Assumptions
    ...DEFAULT_MOODS,
    inflationPct: Number(pv.inflationPct) || 3,
    homeAppreciationPct:
      Number(pv.homeAppreciationPct) || Number(inputs.annualHomeAppreciationPct) || 3,
    capGainsPct: Number(pv.capGainsPct) || 15,
    showReal: true,
    mood: 'expected',
    // Scenario picker + knobs
    scenarioId: 'jobLoss',
    jobLossYear: 3,
    jobLossMonths: 6,
    jobLossKeepPct: 0,
    cutYear: 2,
    cutKeepPct: 70,
    workLessKeepPct: 75,
    stopAge: 55,
  };
}

function loadSettings(inputs) {
  const defaults = buildDefaults(inputs);
  const saved = load(KEYS.futureScenarios, null);
  if (!saved || typeof saved !== 'object') return defaults;
  return { ...defaults, ...saved };
}

const fmtRunway = (m) =>
  !Number.isFinite(m)
    ? 'Forever'
    : m >= 24
      ? `${(m / 12).toFixed(1)} yrs`
      : `${Math.round(m)} mo`;

export default function FutureScenariosPage() {
  const { inputs } = useInputs();

  const [settings, setSettings] = useState(() => loadSettings(inputs));
  const set = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(KEYS.futureScenarios, next);
      return next;
    });
  };

  const {
    grossIncome,
    expenses,
    housingOther,
    emergencyFund,
    pool,
    investPctOfSurplus,
    loanBalance,
    mortgageRatePct,
    yearsLeft,
    homePrice,
    currentAge,
    retirementAge,
    start401k,
    cautiousReturnPct,
    expectedReturnPct,
    optimisticReturnPct,
    inflationPct,
    homeAppreciationPct,
    capGainsPct,
    showReal,
    mood,
    scenarioId,
    jobLossYear,
    jobLossMonths,
    jobLossKeepPct,
    cutYear,
    cutKeepPct,
    workLessKeepPct,
    stopAge,
  } = settings;

  const horizonYears = Math.max(1, Math.round(retirementAge - currentAge));
  const months = horizonYears * 12;
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  // Gross annual → estimated monthly take-home, using the filing status,
  // state, and tax override the user already set on the Calculator page.
  const takeHome = useMemo(() => {
    const override =
      inputs.effectiveTaxRateOverride === '' ||
      inputs.effectiveTaxRateOverride == null
        ? null
        : Number(inputs.effectiveTaxRateOverride);
    return Math.round(
      netMonthly({
        grossAnnual: Number(grossIncome) || 0,
        stateAbbrev: inputs.stateAbbrev,
        filingStatus: inputs.filingStatus,
        overridePct: override,
      }),
    );
  }, [
    grossIncome,
    inputs.stateAbbrev,
    inputs.filingStatus,
    inputs.effectiveTaxRateOverride,
  ]);

  const events = useMemo(() => {
    switch (scenarioId) {
      case 'jobLoss':
        return {
          jobLoss: {
            startYear: jobLossYear,
            months: jobLossMonths,
            keepPct: jobLossKeepPct,
          },
        };
      case 'incomeCut':
        return { incomeCut: { startYear: cutYear, keepPct: cutKeepPct } };
      case 'workLess':
        return { workLess: { keepPct: workLessKeepPct } };
      case 'stopEarly':
        return { stopWork: { age: stopAge } };
      default:
        return {};
    }
  }, [
    scenarioId,
    jobLossYear,
    jobLossMonths,
    jobLossKeepPct,
    cutYear,
    cutKeepPct,
    workLessKeepPct,
    stopAge,
  ]);

  const strategies = useMemo(
    () => buildStrategies({ pool, loanBalance, mortgageRatePct, yearsLeft }),
    [pool, loanBalance, mortgageRatePct, yearsLeft],
  );

  const household = useMemo(
    () => ({
      monthlyTakeHome: takeHome,
      monthlyExpenses: expenses,
      monthlyHousingOther: housingOther,
      startCash: emergencyFund,
      start401k,
      mortgageRatePct,
      investPctOfSurplus,
      homePrice,
      homeAppreciationPct,
      months,
      currentAge,
      events,
    }),
    [
      takeHome,
      expenses,
      housingOther,
      emergencyFund,
      start401k,
      mortgageRatePct,
      investPctOfSurplus,
      homePrice,
      homeAppreciationPct,
      months,
      currentAge,
      events,
    ],
  );

  const byMood = useMemo(
    () => ({
      cautious: compareStrategies({
        household,
        strategies,
        marketReturnPct: cautiousReturnPct,
      }),
      expected: compareStrategies({
        household,
        strategies,
        marketReturnPct: expectedReturnPct,
      }),
      optimistic: compareStrategies({
        household,
        strategies,
        marketReturnPct: optimisticReturnPct,
      }),
    }),
    [household, strategies, cautiousReturnPct, expectedReturnPct, optimisticReturnPct],
  );

  // Display helper: optionally show everything in today's dollars.
  const adj = (v, y) => (showReal ? v / Math.pow(1 + inflationPct / 100, y) : v);
  const dollarsLabel = showReal ? "today's dollars" : 'future dollars';

  // Final net worths: after selling investments (cap gains paid), per mood.
  const finals = useMemo(() => {
    const out = {};
    for (const m of MOODS) {
      out[m.id] = {};
      for (const k of STRATEGY_ORDER) {
        out[m.id][k] = adj(
          afterTaxNetWorth(byMood[m.id][k].final, capGainsPct),
          horizonYears,
        );
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byMood, capGainsPct, horizonYears, showReal, inflationPct]);

  const verdict = useMemo(
    () => buildScenarioVerdict({ finals, byMood, retirementAge }),
    [finals, byMood, retirementAge],
  );

  const active = byMood[mood];

  const chartData = useMemo(
    () =>
      active.payoff.series.map((p, i) => ({
        year: p.year,
        payoff: adj(p.netWorth, p.year),
        recast: adj(active.recast.series[i].netWorth, p.year),
        keep: adj(active.keep.series[i].netWorth, p.year),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, showReal, inflationPct],
  );

  const tableYears = useMemo(() => {
    const ys = [1, 5, 10, 15, 20, 25, 30, 35, 40].filter((y) => y <= horizonYears);
    if (!ys.includes(horizonYears)) ys.push(horizonYears);
    return ys.sort((a, b) => a - b);
  }, [horizonYears]);

  const strategyLabels = {
    payoff: 'Pay it off',
    recast: 'Recast the loan',
    keep: 'Keep payment, stay invested',
  };
  const verdictLabels = {
    payoff: 'Paying the house off',
    recast: 'Recasting the loan',
    keep: 'Keeping the payment & staying invested',
  };

  const canFullyPayoff = pool >= loanBalance;
  const coastBills = expenses + housingOther;

  return (
    <div>
      <div className="page-title">
        <h1>Future scenarios</h1>
        <span className="subtitle">
          Paint a picture of what life might look like — job loss, working less,
          stepping back — under each way of handling the mortgage.
        </span>
      </div>

      <Card>
        <p className="text-small muted" style={{ margin: 0 }}>
          Every scenario below runs your real household month by month: paychecks
          come in, bills go out, and the leftover gets saved. When income can't
          cover the bills, savings get drained — cash first, then investments.
          Three ways of aiming your {money(pool)} pool at the mortgage race side
          by side: <strong style={{ color: COLORS.payoff }}>pay it off</strong>,{' '}
          <strong style={{ color: COLORS.recast }}>recast</strong> (same paydown,
          but the required payment shrinks for good), or{' '}
          <strong style={{ color: COLORS.keep }}>keep the payment and stay
          invested</strong>.
        </p>
      </Card>

      {/* ---------------- Household ---------------- */}
      <Card title="Your household, month to month">
        <div className="grid grid-two">
          <NumberField
            label="Household income per year (gross)"
            prefix="$"
            value={grossIncome}
            onChange={(v) => set({ grossIncome: v })}
            step={5000}
            suffix={`≈ ${money(takeHome)}/mo take-home, estimated with your filing status & state from the Calculator page`}
          />
          <NumberField
            label="Living expenses per month (not housing)"
            prefix="$"
            value={expenses}
            onChange={(v) => set({ expenses: v })}
            step={100}
            suffix="Food, cars, kids, debts, fun — everything but the house"
          />
          <NumberField
            label="Housing costs that never go away"
            prefix="$"
            value={housingOther}
            onChange={(v) => set({ housingOther: v })}
            step={50}
            suffix="Property tax + insurance + HOA — you pay these even with no mortgage"
          />
          <NumberField
            label="Emergency fund (stays in cash)"
            prefix="$"
            value={emergencyFund}
            onChange={(v) => set({ emergencyFund: v })}
            step={1000}
            suffix="Drained first when income falls short"
          />
          <NumberField
            label="Money pool (pay off, recast, or invest)"
            prefix="$"
            value={pool}
            onChange={(v) => set({ pool: v })}
            step={5000}
            suffix="Cash + brokerage beyond the emergency fund"
          />
          <NumberField
            label="How much of monthly leftover gets invested"
            value={investPctOfSurplus}
            onChange={(v) => set({ investPctOfSurplus: v })}
            step={5}
            suffix="% — the rest piles up as cash. Set 0% to model 'not investing'"
          />
        </div>
      </Card>

      {/* ---------------- Mortgage & timeline ---------------- */}
      <Card title="The mortgage &amp; your timeline">
        <div className="grid grid-two">
          <NumberField
            label="Mortgage balance"
            prefix="$"
            value={loanBalance}
            onChange={(v) => set({ loanBalance: v })}
            step={5000}
            suffix={`Required P&I: ${money(strategies.keep.pi)}/mo · recast would make it ${money(strategies.recast.pi)}/mo`}
          />
          <NumberField
            label="Mortgage rate"
            value={mortgageRatePct}
            onChange={(v) => set({ mortgageRatePct: v })}
            step={0.125}
            suffix="%"
          />
          <NumberField
            label="Years left on the loan"
            value={yearsLeft}
            onChange={(v) => set({ yearsLeft: v })}
            step={1}
            suffix="years"
          />
          <NumberField
            label="Home value today"
            prefix="$"
            value={homePrice}
            onChange={(v) => set({ homePrice: v })}
            step={10000}
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
            label="Retirement (401k) you already have"
            prefix="$"
            value={start401k}
            onChange={(v) => set({ start401k: v })}
            step={5000}
            suffix="Locked until retirement — never counted as runway"
          />
        </div>
        {!canFullyPayoff && (
          <div className="allocation-warning yellow mt-16">
            Your pool ({money(pool)}) doesn't cover the whole balance (
            {money(loanBalance)}). The payoff path clears what it can and keeps
            the same payment (loan dies early); the recast path clears the same
            amount but re-spreads the rest, dropping the payment to{' '}
            {money(strategies.recast.pi)}/mo.
          </div>
        )}
      </Card>

      {/* ---------------- Scenario picker ---------------- */}
      <Card title="Pick a future to test">
        <div className="mode-switch" role="group" aria-label="Scenario" style={{ flexWrap: 'wrap' }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`mode-switch-btn ${scenarioId === s.id ? 'active' : ''}`}
              onClick={() => set({ scenarioId: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-small muted mt-8" style={{ marginBottom: scenarioId === 'steady' ? 0 : 12 }}>
          {scenario.desc}
        </p>

        {scenarioId === 'jobLoss' && (
          <div className="grid grid-two">
            <NumberField
              label="Happens in year"
              value={jobLossYear}
              onChange={(v) => set({ jobLossYear: v })}
              step={1}
              suffix={`Age ${currentAge + Number(jobLossYear || 0)}`}
            />
            <NumberField
              label="How long it lasts"
              value={jobLossMonths}
              onChange={(v) => set({ jobLossMonths: v })}
              step={1}
              suffix="months"
            />
            <NumberField
              label="Income you'd still have during it"
              value={jobLossKeepPct}
              onChange={(v) => set({ jobLossKeepPct: v })}
              step={5}
              suffix="% — severance, unemployment, a partner's paycheck"
            />
          </div>
        )}

        {scenarioId === 'incomeCut' && (
          <div className="grid grid-two">
            <NumberField
              label="Starts in year"
              value={cutYear}
              onChange={(v) => set({ cutYear: v })}
              step={1}
              suffix={`Age ${currentAge + Number(cutYear || 0)}`}
            />
            <NumberField
              label="Income that remains, permanently"
              value={cutKeepPct}
              onChange={(v) => set({ cutKeepPct: v })}
              step={5}
              suffix={`% — ${money((takeHome * cutKeepPct) / 100)}/mo instead of ${money(takeHome)}/mo`}
            />
          </div>
        )}

        {scenarioId === 'workLess' && (
          <div className="grid grid-two">
            <NumberField
              label="Income once the house is paid off"
              value={workLessKeepPct}
              onChange={(v) => set({ workLessKeepPct: v })}
              step={5}
              suffix={`% — kicks in the moment each path becomes mortgage-free`}
            />
          </div>
        )}

        {scenarioId === 'stopEarly' && (
          <div className="grid grid-two">
            <NumberField
              label="Age you stop working"
              value={stopAge}
              onChange={(v) => set({ stopAge: v })}
              step={1}
              suffix={`Then coast ${Math.max(0, retirementAge - stopAge)} years to ${retirementAge} on savings`}
            />
          </div>
        )}
      </Card>

      {/* ---------------- Assumptions ---------------- */}
      <Card title="Market assumptions (three moods)">
        <div className="grid grid-two">
          <NumberField
            label="Bad market return"
            value={cautiousReturnPct}
            onChange={(v) => set({ cautiousReturnPct: v })}
            step={0.5}
            suffix="%/yr — the one a cautious person should trust"
          />
          <NumberField
            label="Expected return"
            value={expectedReturnPct}
            onChange={(v) => set({ expectedReturnPct: v })}
            step={0.5}
            suffix="%/yr — long-run average, not guaranteed"
          />
          <NumberField
            label="Good market return"
            value={optimisticReturnPct}
            onChange={(v) => set({ optimisticReturnPct: v })}
            step={0.5}
            suffix="%/yr"
          />
          <NumberField
            label="Inflation"
            value={inflationPct}
            onChange={(v) => set({ inflationPct: v })}
            step={0.25}
            suffix="% — used to show today's dollars"
          />
          <NumberField
            label="Home value growth"
            value={homeAppreciationPct}
            onChange={(v) => set({ homeAppreciationPct: v })}
            step={0.5}
            suffix="%/yr — same in every path"
          />
          <NumberField
            label="Capital gains tax when selling"
            value={capGainsPct}
            onChange={(v) => set({ capGainsPct: v })}
            step={1}
            suffix="%"
          />
        </div>

        <div className="divider" />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="mode-switch" role="group" aria-label="Market mood shown below">
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mode-switch-btn ${mood === m.id ? 'active' : ''}`}
                onClick={() => set({ mood: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
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
        </div>
        <div className="text-tiny muted mt-8">
          The chart, survival table, and year-by-year numbers below follow the
          selected mood. The headline card always shows all three.
        </div>
      </Card>

      {/* ---------------- Headline ---------------- */}
      <Card
        title={`Net worth at age ${retirementAge} — "${scenario.label}" (${dollarsLabel}, after selling investments)`}
      >
        <div className="stat-grid">
          {STRATEGY_ORDER.map((k) => (
            <div className="stat" key={k}>
              <div className="label">
                <span className="swatch" style={{ background: COLORS[k] }} />{' '}
                {strategyLabels[k]}
              </div>
              <div className="value" style={{ color: COLORS[k] }}>
                {money(finals[mood][k])}
              </div>
              <div className="text-tiny muted" style={{ fontWeight: 500 }}>
                Bad market {money(finals.cautious[k])} · good{' '}
                {money(finals.optimistic[k])}
              </div>
            </div>
          ))}
        </div>

        <div
          className={`allocation-warning ${
            verdict.anyBroke
              ? 'red'
              : verdict.cautiousWinner === verdict.expectedWinner
                ? 'green'
                : 'yellow'
          } mt-16`}
          style={{ fontWeight: 600 }}
        >
          {verdict.anyBroke
            ? 'One of these paths runs out of money in a bad market — details below.'
            : verdict.cautiousWinner === verdict.expectedWinner
              ? `${verdictLabels[verdict.cautiousWinner]} wins this scenario in good markets AND bad — no luck required.`
              : `${verdictLabels[verdict.expectedWinner]} wins if markets behave; ${verdictLabels[verdict.cautiousWinner].toLowerCase()} wins if they don't.`}
        </div>
        <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
          {verdict.points.map((pt, i) => (
            <li key={i} className="text-small" style={{ marginBottom: 8 }}>
              {pt}
            </li>
          ))}
        </ul>
      </Card>

      {/* ---------------- Survival ---------------- */}
      <Card title={`Could you survive it? (${MOODS.find((m) => m.id === mood).label.toLowerCase()})`}>
        <table>
          <thead>
            <tr>
              <th>Path</th>
              <th>Paycheck needed /mo</th>
              <th>Runway today</th>
              <th>Lowest savings point</th>
              <th>Runs dry?</th>
            </tr>
          </thead>
          <tbody>
            {STRATEGY_ORDER.map((k) => {
              const sim = active[k];
              const first = sim.series[0];
              return (
                <tr key={k}>
                  <td>
                    <span className="swatch" style={{ background: COLORS[k] }} />{' '}
                    {strategyLabels[k]}
                  </td>
                  <td>{money(first.minIncomeMonthly)}</td>
                  <td>{fmtRunway(first.runwayMonths)}</td>
                  <td>
                    {money(adj(sim.lowestLiquid.amount, sim.lowestLiquid.year))}
                    {sim.lowestLiquid.year > 0
                      ? ` (yr ${Math.round(sim.lowestLiquid.year)})`
                      : ''}
                  </td>
                  <td>
                    {sim.brokeYear != null ? (
                      <span className="pill red" style={{ fontSize: 11 }}>
                        <span className="dot" />
                        Year {Math.ceil(sim.brokeYear)} (age{' '}
                        {Math.round(currentAge + sim.brokeYear)})
                      </span>
                    ) : sim.firstShortfallYear != null ? (
                      <span className="pill yellow" style={{ fontSize: 11 }}>
                        <span className="dot" />
                        Dips into savings yr {Math.ceil(sim.firstShortfallYear)}
                      </span>
                    ) : (
                      <span className="pill green" style={{ fontSize: 11 }}>
                        <span className="dot" />
                        Never
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="text-tiny muted mt-8">
          <strong>Paycheck needed</strong> is the smallest take-home that covers
          every bill today. <strong>Runway</strong> is how long the emergency
          fund + investments could cover everything with zero income. Once a
          house is fully paid off, the bills drop to {money(coastBills)}/mo —
          that's the paycheck you'd need to coast while the kids grow up.
        </div>
      </Card>

      {/* ---------------- Chart ---------------- */}
      <Card title={`Net worth over time (${dollarsLabel})`}>
        <NetWorthCompareChart
          data={chartData}
          lines={[
            { key: 'keep', name: strategyLabels.keep, color: COLORS.keep },
            { key: 'recast', name: strategyLabels.recast, color: COLORS.recast },
            { key: 'payoff', name: strategyLabels.payoff, color: COLORS.payoff },
          ]}
        />
        <div className="text-tiny muted mt-8">
          On-paper net worth (cash + investments + retirement + home equity),
          before sale taxes. A dip is the scenario biting; the question is which
          line bends least — and whether any of them break.
        </div>
      </Card>

      {/* ---------------- Year-by-year ---------------- */}
      <Card title={`Year-by-year (${dollarsLabel})`}>
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Age</th>
              <th>Pay it off</th>
              <th>Recast</th>
              <th>Keep &amp; invest</th>
            </tr>
          </thead>
          <tbody>
            {tableYears.map((y) => (
              <tr key={y}>
                <td>{y}</td>
                <td>{currentAge + y}</td>
                <td>{money(adj(active.payoff.series[y].netWorth, y))}</td>
                <td>{money(adj(active.recast.series[y].netWorth, y))}</td>
                <td>{money(adj(active.keep.series[y].netWorth, y))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="text-tiny muted" style={{ margin: 0 }}>
          Educational estimate, not financial advice. Returns are smoothed
          (real markets lurch), taxes are simplified, recasts usually charge a
          small fee, and living expenses are held flat in real terms. When a
          scenario cuts your income, take-home is scaled proportionally — in
          reality taxes shrink faster than income, so lean stretches would
          feel slightly less harsh than shown (a deliberately cautious bias).
          The shape of the answer — which paths survive your fears and which
          don't — is the reliable part, not the exact dollars.
        </div>
      </Card>
    </div>
  );
}
