import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import NumberField from '../components/NumberField.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  refinanceAnalysis,
  loanSnapshotFromInputs,
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
} from '../lib/mortgage.js';
import { money, yearsHumanized } from '../lib/format.js';

export default function RefinancePage() {
  const { inputs } = useInputs();
  const [newRate, setNewRate] = useState(() =>
    Math.max(0, inputs.interestRate - 1),
  );
  const [closingCostsPct, setClosingCostsPct] = useState(2);

  const loan = useMemo(() => {
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
    const price =
      inputs.calculatorMode === 'target'
        ? inputs.targetHomePrice
        : lenderMax;
    return loanSnapshotFromInputs(inputs, price);
  }, [inputs]);

  const refiClosingCosts = (loan.loanBalance * closingCostsPct) / 100;

  const result = useMemo(
    () =>
      refinanceAnalysis({
        loanBalance: loan.loanBalance,
        currentRatePct: loan.currentRatePct,
        newRatePct: newRate,
        yearsRemaining: loan.yearsRemaining,
        refiClosingCosts,
      }),
    [loan, newRate, refiClosingCosts],
  );

  return (
    <div>
      <div className="page-title">
        <h1>Refinance calculator</h1>
        <span className="subtitle">
          Should you refi? Uses your calculator loan — change rate and closing
          costs to see break-even.
        </span>
      </div>

      <Card title="Your loan (from calculator)">
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Home price</div>
            <div className="value">{money(loan.homePrice)}</div>
          </div>
          <div className="stat">
            <div className="label">Loan balance</div>
            <div className="value">{money(loan.loanBalance)}</div>
          </div>
          <div className="stat">
            <div className="label">Current rate</div>
            <div className="value">{loan.currentRatePct.toFixed(2)}%</div>
          </div>
          <div className="stat">
            <div className="label">Years remaining</div>
            <div className="value">{loan.yearsRemaining} yrs</div>
          </div>
        </div>
        <div className="text-tiny muted mt-8">
          Assumes you just bought (full {inputs.loanTermYears}-year term left).
          Update income, down payment, and rate on the Calculator page first.
        </div>
      </Card>

      <Card title="Refi scenario">
        <div className="grid grid-two">
          <NumberField
            label="New interest rate"
            value={newRate}
            onChange={setNewRate}
            step={0.05}
            min={0}
            max={15}
            suffix="%"
          />
          <NumberField
            label="Refi closing costs"
            value={closingCostsPct}
            onChange={setClosingCostsPct}
            step={0.25}
            min={0}
            max={6}
            suffix={`% of balance (${money(refiClosingCosts)})`}
          />
        </div>
      </Card>

      <Card title="The verdict">
        {result.monthlySavings <= 0 ? (
          <p className="muted">
            The new rate ({newRate.toFixed(2)}%) isn&apos;t lower than your
            current rate ({loan.currentRatePct.toFixed(2)}%), so a refi
            wouldn&apos;t save you on the payment.
          </p>
        ) : (
          <>
            <div className="afford-hero" style={{ padding: '4px 0 16px' }}>
              <div className="price" style={{ fontSize: 38 }}>
                {result.breakEvenMonths != null
                  ? `${Math.floor(result.breakEvenMonths / 12)} yrs ${result.breakEvenMonths % 12} mos`
                  : '—'}
              </div>
              <div className="sub">
                Break-even — how long until refi savings pay back{' '}
                {money(refiClosingCosts)} in closing costs
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat">
                <div className="label">Current P&amp;I</div>
                <div className="value">{money(result.currentPayment)}/mo</div>
              </div>
              <div className="stat">
                <div className="label">New P&amp;I</div>
                <div className="value">{money(result.newPayment)}/mo</div>
              </div>
              <div className="stat">
                <div className="label">Monthly savings</div>
                <div className="value" style={{ color: 'var(--green)' }}>
                  {money(result.monthlySavings)}/mo
                </div>
              </div>
              <div className="stat">
                <div className="label">Net savings over loan</div>
                <div
                  className="value"
                  style={{
                    color: result.lifetimeSavings >= 0 ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {money(result.lifetimeSavings)}
                </div>
              </div>
            </div>

            <div
              className="text-small mt-16"
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: result.worthwhile
                  ? 'var(--green-soft)'
                  : 'var(--yellow-soft)',
                border: `1px solid ${result.worthwhile ? 'var(--green)' : 'var(--yellow)'}`,
              }}
            >
              {result.worthwhile ? (
                <>
                  <strong>Probably worth it.</strong> You&apos;d break even in{' '}
                  {yearsHumanized(result.breakEvenMonths / 12)} and still have{' '}
                  {Math.max(
                    0,
                    loan.yearsRemaining - Math.ceil(result.breakEvenMonths / 12),
                  )}{' '}
                  years of lower payments after that.
                </>
              ) : (
                <>
                  <strong>Maybe not worth it.</strong> Break-even is{' '}
                  {result.breakEvenMonths != null
                    ? yearsHumanized(result.breakEvenMonths / 12)
                    : 'never'}
                  , which is a big chunk of your remaining{' '}
                  {loan.yearsRemaining}-year loan. Run the numbers with a lender
                  before paying closing costs.
                </>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
