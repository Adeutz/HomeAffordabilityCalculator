import { useMemo } from 'react';
import Card from '../components/Card.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  monthlyPaymentBreakdown,
  stressTest,
} from '../lib/mortgage.js';
import { money } from '../lib/format.js';

const TESTS = ['rate_up_1', 'rate_down_1', 'job_loss_3mo', 'job_loss_6mo'];

export default function StressTestPage() {
  const { inputs } = useInputs();

  const scenario = useMemo(() => {
    const max = maxMonthlyHousingFromIncome({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
    });
    const homePrice = maxAffordableHomePrice({
      maxMonthlyHousingPayment: max,
      ...inputs,
    });
    return { ...inputs, homePrice };
  }, [inputs]);

  const baseline = monthlyPaymentBreakdown(scenario);

  return (
    <div>
      <div className="page-title">
        <h1>Stress test your purchase</h1>
        <span className="subtitle">
          What if rates change? What if your income disappears for a few months?
        </span>
      </div>

      <Card title="Baseline">
        <div className="afford-hero" style={{ padding: '8px 0 16px' }}>
          <div className="price" style={{ fontSize: 32 }}>{money(baseline.total)}</div>
          <div className="sub">your current monthly housing payment</div>
        </div>
      </Card>

      <div className="grid grid-two">
        {TESTS.map((id) => {
          const result = stressTest(scenario, id);
          if (!result) return null;
          const isCushion = id.startsWith('job_loss');
          return (
            <Card key={id} title={result.label}>
              {!isCushion ? (
                <>
                  <div className="afford-hero" style={{ padding: '4px 0 12px' }}>
                    <div className="price" style={{ fontSize: 30 }}>
                      {money(result.stressed)}
                    </div>
                    <div className="sub">new monthly payment</div>
                  </div>
                  <div className="text-small" style={{ marginTop: 8 }}>
                    {result.delta >= 0 ? (
                      <>
                        That's <strong style={{ color: 'var(--red)' }}>+{money(result.delta)}</strong> /month vs your baseline.
                      </>
                    ) : (
                      <>
                        That's <strong style={{ color: 'var(--green)' }}>{money(result.delta)}</strong> /month vs your baseline.
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="afford-hero" style={{ padding: '4px 0 12px' }}>
                    <div className="price" style={{ fontSize: 30 }}>
                      {money(result.stressed)}
                    </div>
                    <div className="sub">cash needed in savings to cover your mortgage</div>
                  </div>
                  <SavingsCheck currentSavings={inputs.currentSavings - inputs.downPayment} cushionNeeded={result.stressed} />
                </>
              )}
              <div className="indicator-explain mt-8">{result.description}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SavingsCheck({ currentSavings, cushionNeeded }) {
  const left = currentSavings - cushionNeeded;
  const ok = left >= 0;
  return (
    <div className={`pill ${ok ? 'green' : 'red'}`} style={{ marginTop: 8 }}>
      <span className="dot" />
      {ok
        ? `You'd have ${money(left)} left over after this`
        : `You'd be ${money(-left)} short`}
    </div>
  );
}
