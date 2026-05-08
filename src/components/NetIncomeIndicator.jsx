import { estimateNet } from '../lib/taxes.js';
import { money, percentFromRatio } from '../lib/format.js';

// Health levels for "% of NET take-home going to housing".
// (These thresholds are stricter than the gross-income 28/36 rule because
// you live on the net, not the gross.)
function netHealth(ratio) {
  if (ratio <= 0.30) return 'green';
  if (ratio <= 0.45) return 'yellow';
  return 'red';
}

const COPY = {
  green: 'Plenty of breathing room in your monthly budget.',
  yellow: 'Doable but tight — close to "house poor" territory.',
  red: 'House poor zone — most of your take-home pay goes to housing.',
};

export default function NetIncomeIndicator({
  annualIncome,
  monthlyHousing,
  monthlyDebts,
  stateAbbrev,
  filingStatus,
  overridePct,
  extraDownPaymentNeeded,
}) {
  const tax = estimateNet({
    grossAnnual: annualIncome,
    stateAbbrev,
    filingStatus,
    overridePct: overridePct === '' || overridePct == null ? null : Number(overridePct),
  });
  const monthlyNet = tax.net / 12;

  const housingRatio = monthlyNet > 0 ? monthlyHousing / monthlyNet : 0;
  const totalRatio =
    monthlyNet > 0 ? (monthlyHousing + monthlyDebts) / monthlyNet : 0;
  const level = netHealth(housingRatio);

  return (
    <div className="indicator-card">
      <div className="indicator-head">
        <div>
          <div className="text-small muted">Housing % of take-home pay</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {percentFromRatio(housingRatio, 1)}
          </div>
        </div>
        <span className={`pill ${level}`}>
          <span className="dot" />
          {level === 'green' ? 'Healthy' : level === 'yellow' ? 'Tight' : 'House poor'}
        </span>
      </div>

      <div className="indicator-bar">
        <div
          className="fill"
          style={{
            width: `${Math.min(100, housingRatio * 100)}%`,
            background: `var(--${level})`,
          }}
        />
      </div>

      <div className="indicator-explain">{COPY[level]}</div>

      <div
        className="text-tiny muted"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}
      >
        <span>
          <strong>Take-home:</strong> {money(monthlyNet)}/mo ({money(tax.net)}/yr)
        </span>
        <span>
          <strong>Effective tax:</strong> {tax.effectiveRatePct.toFixed(1)}%
          {tax.isOverride ? ' (your override)' : ' (estimated)'}
        </span>
        <span>
          <strong>Housing + debts:</strong> {percentFromRatio(totalRatio, 1)} of net
        </span>
      </div>
      {level !== 'green' && (
        extraDownPaymentNeeded === null
          ? (
            <div className="indicator-hint impossible">
              Even paying all cash, housing costs at this price exceed 30% of take-home — consider a less expensive home.
            </div>
          )
          : extraDownPaymentNeeded > 0 && (
            <div className="indicator-hint">
              Add ~{money(extraDownPaymentNeeded)} more to your down payment to reach Healthy (&le;30% of take-home).
            </div>
          )
      )}
    </div>
  );
}
