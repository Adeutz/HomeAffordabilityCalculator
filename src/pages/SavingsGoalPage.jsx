import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import NumberField from '../components/NumberField.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import { money } from '../lib/format.js';

export default function SavingsGoalPage() {
  const { inputs } = useInputs();
  const [target, setTarget] = useState(60_000);
  const [current, setCurrent] = useState(inputs.currentSavings);
  const [monthly, setMonthly] = useState(750);
  const [returnPct, setReturnPct] = useState(4.5); // a HYSA-ish return

  const result = useMemo(
    () => projectSavings({ target, current, monthly, returnPct }),
    [target, current, monthly, returnPct]
  );

  return (
    <div>
      <div className="page-title">
        <h1>Down payment savings goal</h1>
        <span className="subtitle">
          When can you actually afford to buy?
        </span>
      </div>

      <Card title="Your plan">
        <div className="grid grid-two">
          <NumberField
            label="Target down payment"
            prefix="$"
            value={target}
            onChange={setTarget}
            step={1_000}
          />
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
            suffix="HYSA ~4-5%, S&P 500 historical ~7-10%"
          />
        </div>
      </Card>

      <Card title="When you'll hit the goal">
        {result.monthsToGoal == null ? (
          <p className="muted">
            With these numbers you'll never quite reach the goal. Try saving more
            per month or lowering your target.
          </p>
        ) : (
          <>
            <div className="afford-hero" style={{ padding: '4px 0 16px' }}>
              <div className="price" style={{ fontSize: 38 }}>
                {Math.floor(result.monthsToGoal / 12)} yrs {result.monthsToGoal % 12} mos
              </div>
              <div className="sub">
                That's around <strong>{result.targetDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat">
                <div className="label">Total contributions</div>
                <div className="value">{money(result.totalContributed)}</div>
              </div>
              <div className="stat">
                <div className="label">Interest earned</div>
                <div className="value">{money(result.interestEarned)}</div>
              </div>
              <div className="stat">
                <div className="label">Final balance</div>
                <div className="value">{money(result.finalBalance)}</div>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card title="What if you saved more?">
        <table>
          <thead>
            <tr>
              <th>Monthly savings</th>
              <th>Time to goal</th>
              <th>Interest earned</th>
            </tr>
          </thead>
          <tbody>
            {[monthly, monthly + 250, monthly + 500, monthly + 1000].map((m) => {
              const r = projectSavings({ target, current, monthly: m, returnPct });
              return (
                <tr key={m}>
                  <td>{money(m)}</td>
                  <td>
                    {r.monthsToGoal == null
                      ? 'Never'
                      : `${Math.floor(r.monthsToGoal / 12)} yrs ${r.monthsToGoal % 12} mos`}
                  </td>
                  <td>{money(r.interestEarned)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Projects a savings balance month-by-month.
// Stops when balance hits the target or after 50 years (whichever first).
function projectSavings({ target, current, monthly, returnPct }) {
  const r = returnPct / 100 / 12;
  let balance = current;
  let totalContributed = current;
  let monthsToGoal = null;

  for (let m = 1; m <= 600; m++) {
    balance = balance * (1 + r) + monthly;
    totalContributed += monthly;
    if (balance >= target && monthsToGoal == null) {
      monthsToGoal = m;
      break;
    }
  }

  const targetDate = new Date();
  if (monthsToGoal != null) {
    targetDate.setMonth(targetDate.getMonth() + monthsToGoal);
  }

  return {
    monthsToGoal,
    targetDate,
    totalContributed,
    finalBalance: balance,
    interestEarned: balance - totalContributed,
  };
}
