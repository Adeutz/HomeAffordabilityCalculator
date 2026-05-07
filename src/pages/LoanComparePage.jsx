import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  amortizationSchedule,
  monthlyPaymentBreakdown,
  totalInterest,
} from '../lib/mortgage.js';
import { money, yearsHumanized } from '../lib/format.js';

// Compares two loan terms (15 vs 30 by default) using the user's current
// inputs. Each side recomputes with its own term.
const TERMS = [15, 20, 30];

export default function LoanComparePage() {
  const { inputs } = useInputs();
  const [a, setA] = useState(15);
  const [b, setB] = useState(30);

  const results = useMemo(
    () => ({
      a: computeLoan({ ...inputs, loanTermYears: a }),
      b: computeLoan({ ...inputs, loanTermYears: b }),
    }),
    [inputs, a, b]
  );

  return (
    <div>
      <div className="page-title">
        <h1>15 vs 30 (or any term)</h1>
        <span className="subtitle">
          Same home, same rate — see how the term changes everything.
        </span>
      </div>

      <Card>
        <div className="row">
          <label className="text-small muted">Compare:</label>
          <select className="input" value={a} onChange={(e) => setA(Number(e.target.value))}>
            {TERMS.map((t) => <option key={t} value={t}>{t} years</option>)}
          </select>
          <span className="muted">vs</span>
          <select className="input" value={b} onChange={(e) => setB(Number(e.target.value))}>
            {TERMS.map((t) => <option key={t} value={t}>{t} years</option>)}
          </select>
        </div>
      </Card>

      <div className="grid grid-two">
        <LoanCard term={a} result={results.a} />
        <LoanCard term={b} result={results.b} />
      </div>

      <Card title="The bottom line">
        <p>
          Going with the <strong>{Math.min(a, b)}-year</strong> instead of the{' '}
          <strong>{Math.max(a, b)}-year</strong> on this loan means:
        </p>
        <ul>
          <li>
            Monthly payment is{' '}
            <strong>
              {money(
                Math.abs(
                  results.a.breakdown.principalAndInterest -
                    results.b.breakdown.principalAndInterest
                )
              )}
            </strong>{' '}
            higher on the shorter loan.
          </li>
          <li>
            But you save{' '}
            <strong>
              {money(Math.abs(results.a.totalInterest - results.b.totalInterest))}
            </strong>{' '}
            in total interest over the life of the loan.
          </li>
          <li>
            And you own the home outright{' '}
            <strong>{Math.abs(a - b)} years sooner</strong>.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function computeLoan(inputsWithTerm) {
  const breakdown = monthlyPaymentBreakdown({
    ...inputsWithTerm,
    homePrice: inputsWithTerm.homePrice ?? guessHomePrice(inputsWithTerm),
  });
  const schedule = amortizationSchedule({
    loanAmount: Math.max(
      0,
      (inputsWithTerm.homePrice ?? guessHomePrice(inputsWithTerm)) -
        inputsWithTerm.downPayment
    ),
    annualRatePct: inputsWithTerm.interestRate,
    termYears: inputsWithTerm.loanTermYears,
    extraMonthlyPrincipal: inputsWithTerm.extraMonthlyPrincipal,
  });
  return { breakdown, schedule, totalInterest: totalInterest(schedule) };
}

// If we don't know the home price, estimate it from the affordability formula
// (using the current 30yr-style assumptions) so both sides compare a similar home.
function guessHomePrice(inputs) {
  // Use a fixed reasonable test price = down payment + 5x annual income
  return inputs.downPayment + inputs.annualIncome * 5;
}

function LoanCard({ term, result }) {
  const pi = result.breakdown.principalAndInterest;
  return (
    <Card title={`${term}-year loan`}>
      <div className="afford-hero" style={{ padding: '4px 0 12px' }}>
        <div className="price" style={{ fontSize: 32 }}>{money(pi)}</div>
        <div className="sub">monthly principal &amp; interest</div>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Total interest</div>
          <div className="value">{money(result.totalInterest)}</div>
        </div>
        <div className="stat">
          <div className="label">Total paid</div>
          <div className="value">
            {money(result.totalInterest + result.schedule.reduce((s, r) => s + r.principal + r.extra, 0))}
          </div>
        </div>
        <div className="stat">
          <div className="label">Payoff time</div>
          <div className="value">
            {yearsHumanized(result.schedule.length / 12)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Term length</div>
          <div className="value">{term} years</div>
        </div>
      </div>
    </Card>
  );
}
