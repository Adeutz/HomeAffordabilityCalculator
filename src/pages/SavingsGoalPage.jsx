import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import NumberField from '../components/NumberField.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  projectSimpleSavings,
  projectWaitAndSave,
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  comfortAnalysis,
} from '../lib/mortgage.js';
import { money } from '../lib/format.js';

function formatMonths(m) {
  if (m == null) return 'Never';
  return `${Math.floor(m / 12)} yrs ${m % 12} mos`;
}

export default function SavingsGoalPage() {
  const { inputs } = useInputs();
  const isTargetMode = inputs.calculatorMode === 'target';

  const goalPrices = useMemo(() => {
    const max = maxMonthlyHousingFromIncome({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
    });
    const lenderMax = maxAffordableHomePrice({
      maxMonthlyHousingPayment: max,
      downPayment: inputs.downPayment,
      interestRate: inputs.interestRate,
      loanTermYears: inputs.loanTermYears,
      propertyTaxRatePct: inputs.propertyTaxRatePct,
      homeInsuranceAnnual: inputs.homeInsuranceAnnual,
      hoaMonthly: inputs.hoaMonthly,
      creditScore: inputs.creditScore,
    });
    const nw = Number(inputs.totalNetWorth) || inputs.currentSavings;
    const comfort = comfortAnalysis({
      annualIncome: inputs.annualIncome,
      netWorth: nw,
      homePriceBeingChecked: lenderMax,
      monthlyHousing: 0,
      downPayment: inputs.downPayment,
      propertyTaxRatePct: inputs.propertyTaxRatePct,
      homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    });
    return {
      lenderMax,
      comfortable: Math.max(0, comfort.idealMax),
      target: inputs.targetHomePrice,
    };
  }, [inputs]);

  const goalHomePrice = isTargetMode
    ? goalPrices.target
    : goalPrices.comfortable;

  const defaultDownPct =
    goalHomePrice > 0
      ? Math.round((inputs.downPayment / goalHomePrice) * 100)
      : 20;

  // --- Simple fixed-target savings (original section) ---
  const [simpleTarget, setSimpleTarget] = useState(inputs.downPayment);
  const [current, setCurrent] = useState(inputs.currentSavings);
  const [monthly, setMonthly] = useState(750);
  const [returnPct, setReturnPct] = useState(4.5);

  const simpleResult = useMemo(
    () =>
      projectSimpleSavings({
        target: simpleTarget,
        current,
        monthly,
        returnPct,
      }),
    [simpleTarget, current, monthly, returnPct],
  );

  // --- Wait & save projection ---
  const [homeAppreciationPct, setHomeAppreciationPct] = useState(3);
  const [incomeGrowthPct, setIncomeGrowthPct] = useState(3);
  const [downPaymentMode, setDownPaymentMode] = useState('percent');
  const [downPaymentPercent, setDownPaymentPercent] = useState(
    Math.min(100, Math.max(0, defaultDownPct || 20)),
  );
  const [downPaymentFixed, setDownPaymentFixed] = useState(inputs.downPayment);

  const waitResult = useMemo(
    () =>
      projectWaitAndSave({
        inputs,
        goalHomePrice,
        monthlySavings: monthly,
        savingsReturnPct: returnPct,
        homeAppreciationPct,
        incomeGrowthPct,
        downPaymentMode,
        downPaymentPercent,
        downPaymentFixed,
        milestoneMonths: [0, 6, 12, 24],
      }),
    [
      inputs,
      goalHomePrice,
      monthly,
      returnPct,
      homeAppreciationPct,
      incomeGrowthPct,
      downPaymentMode,
      downPaymentPercent,
      downPaymentFixed,
    ],
  );

  return (
    <div>
      <div className="page-title">
        <h1>Savings goal &amp; wait timeline</h1>
        <span className="subtitle">
          When can you buy? What if you wait while saving — and homes get pricier?
        </span>
      </div>

      <Card title="Your savings plan">
        <div className="grid grid-two">
          <NumberField
            label="Already saved"
            prefix="$"
            value={current}
            onChange={setCurrent}
            step={500}
          />
          <NumberField
            label="Save per month"
            prefix="$"
            value={monthly}
            onChange={setMonthly}
            step={50}
          />
          <NumberField
            label="Annual return on savings"
            value={returnPct}
            onChange={setReturnPct}
            step={0.25}
            suffix="HYSA ~4–5%"
          />
          <NumberField
            label="Home prices rise per year"
            value={homeAppreciationPct}
            onChange={setHomeAppreciationPct}
            step={0.5}
            suffix="% while you wait"
          />
          <NumberField
            label="Your income grows per year"
            value={incomeGrowthPct}
            onChange={setIncomeGrowthPct}
            step={0.5}
            suffix="% while you wait"
          />
        </div>
      </Card>

      <Card title="Down payment target">
        <div className="mode-switch mb-16" role="group" aria-label="Down payment type">
          <button
            type="button"
            className={`mode-switch-btn ${downPaymentMode === 'percent' ? 'active' : ''}`}
            onClick={() => setDownPaymentMode('percent')}
          >
            % of home price
          </button>
          <button
            type="button"
            className={`mode-switch-btn ${downPaymentMode === 'fixed' ? 'active' : ''}`}
            onClick={() => setDownPaymentMode('fixed')}
          >
            Fixed dollar amount
          </button>
        </div>
        {downPaymentMode === 'percent' ? (
          <NumberField
            label="Down payment percent"
            value={downPaymentPercent}
            onChange={setDownPaymentPercent}
            step={1}
            min={0}
            max={100}
            suffix="% — if the house gets pricier, you need to save more"
          />
        ) : (
          <NumberField
            label="Down payment amount"
            prefix="$"
            value={downPaymentFixed}
            onChange={setDownPaymentFixed}
            step={1_000}
            suffix="same dollar goal even if home prices rise"
          />
        )}
      </Card>

      <Card
        title={
          isTargetMode
            ? 'When can you afford this house?'
            : 'When can you afford a comfortable home?'
        }
      >
        <div className="text-small muted mb-16">
          {isTargetMode ? (
            <>
              Goal home: <strong>{money(goalPrices.target)}</strong> (from
              &quot;I have a house in mind&quot; on the Calculator). Lender max
              today: {money(goalPrices.lenderMax)}.
            </>
          ) : (
            <>
              Goal home: <strong>{money(goalPrices.comfortable)}</strong>{' '}
              (comfortable 30/30/3 target). Lender max today:{' '}
              {money(goalPrices.lenderMax)}.
            </>
          )}
        </div>

        {waitResult.monthsToReady == null ? (
          <p className="muted">
            With these numbers you may not reach a ready-to-buy point within 50
            years. Try saving more per month, a lower goal price, or higher
            income growth.
          </p>
        ) : (
          <>
            <div className="afford-hero" style={{ padding: '4px 0 16px' }}>
              <div className="price" style={{ fontSize: 38 }}>
                {formatMonths(waitResult.monthsToReady)}
              </div>
              <div className="sub">
                Ready around{' '}
                <strong>
                  {waitResult.readyDate.toLocaleDateString(undefined, {
                    month: 'long',
                    year: 'numeric',
                  })}
                </strong>{' '}
                — enough cash at closing and lenders would likely approve.
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat">
                <div className="label">Home price then</div>
                <div className="value">{money(waitResult.finalSnap.homePrice)}</div>
                <div className="text-tiny muted" style={{ fontWeight: 500 }}>
                  Started at {money(waitResult.startingHomePrice)}
                </div>
              </div>
              <div className="stat">
                <div className="label">Your savings then</div>
                <div className="value">{money(waitResult.finalSnap.savings)}</div>
              </div>
              <div className="stat">
                <div className="label">Income then</div>
                <div className="value">{money(waitResult.finalSnap.annualIncome)}/yr</div>
              </div>
              <div className="stat">
                <div className="label">Cash needed at closing</div>
                <div className="value">{money(waitResult.finalSnap.cashNeeded)}</div>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card title="Snapshots: 6, 12, and 24 months">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Savings</th>
              <th>Home price</th>
              <th>Cash gap</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {waitResult.timeline.map((row) => (
              <tr key={row.month}>
                <td>{row.month === 0 ? 'Today' : `${row.month} mo`}</td>
                <td>{money(row.savings)}</td>
                <td>{money(row.homePrice)}</td>
                <td>
                  {row.ready ? (
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                      Ready
                    </span>
                  ) : row.cashGap > 0 ? (
                    `${money(row.cashGap)} short on cash`
                  ) : row.incomeGap > 0 ? (
                    `Need ~${money(row.incomeGap)}/yr more income`
                  ) : (
                    `${money(row.lenderGap)}/mo over lender limit`
                  )}
                </td>
                <td>
                  {row.ready ? (
                    <span className="pill green" style={{ fontSize: 11 }}>
                      <span className="dot" />
                      Go
                    </span>
                  ) : (
                    <span className="pill yellow" style={{ fontSize: 11 }}>
                      <span className="dot" />
                      Not yet
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Simple savings target (fixed dollars)">
        <div className="text-small muted mb-12">
          Ignore home prices — just &quot;when do I hit this dollar amount?&quot;
        </div>
        <div className="grid grid-two mb-16">
          <NumberField
            label="Target amount"
            prefix="$"
            value={simpleTarget}
            onChange={setSimpleTarget}
            step={1_000}
          />
        </div>

        {simpleResult.monthsToGoal == null ? (
          <p className="muted">Never at this savings rate — try saving more.</p>
        ) : (
          <div className="afford-hero" style={{ padding: '4px 0 8px' }}>
            <div className="price" style={{ fontSize: 32 }}>
              {formatMonths(simpleResult.monthsToGoal)}
            </div>
            <div className="sub">
              Hit {money(simpleTarget)} by{' '}
              {simpleResult.targetDate.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </div>
          </div>
        )}
      </Card>

      <Card title="What if you saved more?">
        <table>
          <thead>
            <tr>
              <th>Monthly savings</th>
              <th>Time to afford goal home</th>
            </tr>
          </thead>
          <tbody>
            {[monthly, monthly + 250, monthly + 500, monthly + 1000].map((m) => {
              const r = projectWaitAndSave({
                inputs,
                goalHomePrice,
                monthlySavings: m,
                savingsReturnPct: returnPct,
                homeAppreciationPct,
                incomeGrowthPct,
                downPaymentMode,
                downPaymentPercent,
                downPaymentFixed,
              });
              return (
                <tr key={m}>
                  <td>{money(m)}</td>
                  <td>{formatMonths(r.monthsToReady)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
