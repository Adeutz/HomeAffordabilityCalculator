import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import { load, save, KEYS } from '../lib/storage.js';
import {
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  monthlyPaymentBreakdown,
} from '../lib/mortgage.js';
import { money, percentFromRatio } from '../lib/format.js';
import { dtiHealth } from '../lib/mortgage.js';

// Computes the headline numbers for a saved scenario so we can compare them
// side-by-side without recomputing on every render.
function summarize(inputs) {
  const max = maxMonthlyHousingFromIncome({
    annualIncome: inputs.annualIncome,
    monthlyDebts: inputs.monthlyDebts,
  });
  const homePrice = maxAffordableHomePrice({
    maxMonthlyHousingPayment: max,
    downPayment: inputs.downPayment,
    interestRate: inputs.interestRate,
    loanTermYears: inputs.loanTermYears,
    propertyTaxRatePct: inputs.propertyTaxRatePct,
    homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    hoaMonthly: inputs.hoaMonthly,
    creditScore: inputs.creditScore,
  });
  const breakdown = monthlyPaymentBreakdown({ ...inputs, homePrice });
  const dti = dtiHealth({
    annualIncome: inputs.annualIncome,
    monthlyDebts: inputs.monthlyDebts,
    monthlyHousing: breakdown.total,
  });
  return { homePrice, monthly: breakdown.total, breakdown, dti };
}

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState(() => load(KEYS.scenarios, []));
  const { setInputs } = useInputs();
  const nav = useNavigate();

  const sorted = useMemo(
    () => [...scenarios].sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1)),
    [scenarios]
  );

  const remove = (id) => {
    const next = scenarios.filter((s) => s.id !== id);
    setScenarios(next);
    save(KEYS.scenarios, next);
  };

  const loadScenario = (s) => {
    setInputs(s.inputs);
    nav('/');
  };

  return (
    <div>
      <div className="page-title">
        <h1>Saved scenarios</h1>
        <span className="subtitle">
          Compare different "what ifs" side-by-side.
        </span>
      </div>

      {sorted.length === 0 && (
        <Card>
          <p className="muted">
            You haven't saved any scenarios yet. Go to the calculator and click
            <strong> Save scenario</strong> to add one.
          </p>
        </Card>
      )}

      {sorted.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {sorted.map((s) => {
            const { homePrice, monthly, dti } = summarize(s.inputs);
            return (
              <Card key={s.id}>
                <div className="flex-between mb-8">
                  <h3 style={{ margin: 0 }}>{s.name}</h3>
                  <span className={`pill ${dti.level}`}>
                    <span className="dot" />
                    DTI {percentFromRatio(dti.ratio, 0)}
                  </span>
                </div>

                <div className="afford-hero" style={{ padding: '4px 0 12px' }}>
                  <div className="price" style={{ fontSize: 32 }}>
                    {money(homePrice)}
                  </div>
                  <div className="sub">
                    {money(monthly)} / month
                  </div>
                </div>

                <div className="stat-grid mt-8">
                  <div className="stat">
                    <div className="label">Income</div>
                    <div className="value">{money(s.inputs.annualIncome)}</div>
                  </div>
                  <div className="stat">
                    <div className="label">Down</div>
                    <div className="value">{money(s.inputs.downPayment)}</div>
                  </div>
                  <div className="stat">
                    <div className="label">Rate</div>
                    <div className="value">{s.inputs.interestRate}%</div>
                  </div>
                  <div className="stat">
                    <div className="label">Term</div>
                    <div className="value">{s.inputs.loanTermYears} yr</div>
                  </div>
                </div>

                <div className="row mt-16">
                  <button className="button small" onClick={() => loadScenario(s)}>
                    Load
                  </button>
                  <button className="button danger small" onClick={() => remove(s.id)}>
                    Delete
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
