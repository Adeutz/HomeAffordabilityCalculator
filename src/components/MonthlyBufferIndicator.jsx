import { estimateNet } from '../lib/taxes.js';
import { monthlyDiscretionaryBuffer } from '../lib/mortgage.js';
import { money, percentFromRatio } from '../lib/format.js';

const COPY = {
  green: 'Comfortable slack after housing, debts, and a modest living-cost guess.',
  yellow: 'Thin — surprises or higher real spending pinch fast.',
  red: 'On paper this scenario spends more each month than your estimated take-home.',
};

export default function MonthlyBufferIndicator({
  annualIncome,
  monthlyHousing,
  monthlyDebts,
  stateAbbrev,
  filingStatus,
  overridePct,
}) {
  const tax = estimateNet({
    grossAnnual: annualIncome,
    stateAbbrev,
    filingStatus,
    overridePct:
      overridePct === '' || overridePct == null ? null : Number(overridePct),
  });
  const monthlyNet = tax.net / 12;

  const result = monthlyDiscretionaryBuffer({
    monthlyNet,
    monthlyHousing,
    monthlyDebts,
    annualIncome,
  });

  const widthPct =
    result.leftover <= 0
      ? 100
      : Math.min(
          100,
          Math.max(
            8,
            (result.leftover / Math.max(result.comfortFloor, 1)) * 100,
          ),
        );

  const pillShort =
    result.level === 'green'
      ? 'Comfortable'
      : result.level === 'yellow'
        ? 'Tight'
        : 'Underwater';

  return (
    <div className="indicator-card">
      <div className="indicator-head">
        <div>
          <div className="text-small muted">Monthly cash flow (rough)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {money(result.leftover)}/mo
          </div>
        </div>
        <span className={`pill ${result.level}`}>
          <span className="dot" />
          {pillShort}
        </span>
      </div>

      <div className="indicator-bar">
        <div
          className="fill"
          style={{
            width: `${widthPct}%`,
            background: `var(--${result.level})`,
          }}
        />
      </div>

      <div className="indicator-explain">{COPY[result.level]}</div>

      <div className="text-tiny muted" style={{ marginTop: 4 }}>
        Take-home {money(monthlyNet)}/mo − housing {money(monthlyHousing)} −
        other debts {money(monthlyDebts)} − est. living costs{' '}
        {money(result.livingExpensesMonthly)} (
        {percentFromRatio(0.25, 0)} of gross — same stub as emergency check).
        “Comfortable” floor here ≈ {percentFromRatio(0.1, 0)} of take-home or $200,
        whichever is larger.
      </div>
    </div>
  );
}
