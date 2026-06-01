import { cashAfterClosingHealth } from '../lib/mortgage.js';
import { money } from '../lib/format.js';

const COPY = {
  green:
    'You aren’t wiping out every spare dollar just to hit the closing table.',
  yellow:
    'You can afford to close, but very little slack is left before building reserves.',
  red: 'Not enough saved for down payment plus closing costs (or barely negative).',
};

export default function CashAfterClosingIndicator({
  currentSavings,
  downPayment,
  closingCosts,
  annualIncome,
}) {
  const result = cashAfterClosingHealth({
    currentSavings,
    downPayment,
    closingCosts,
    annualIncome,
  });

  const widthPct =
    result.remainingSavings <= 0
      ? 100
      : Math.min(
          100,
          Math.max(8, (result.remainingSavings / Math.max(result.minComfort, 1)) * 100),
        );

  const pillShort =
    result.level === 'green'
      ? 'Healthy'
      : result.level === 'yellow'
        ? 'Thin cushion'
        : 'Shortfall';

  return (
    <div className="indicator-card">
      <div className="indicator-head">
        <div>
          <div className="text-small muted">Cash left after closing</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {money(result.remainingSavings)}
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

      <div className="text-tiny muted">
        After down payment + closing costs ·         Quick floor we like:{' '}
        <strong>{money(result.minComfort)}</strong> left after signing (small
        surprises; pair this with the Emergency fund card for months of runway).
      </div>
      {result.shortfall > 0 && (
        <div className="text-tiny muted" style={{ marginTop: 6 }}>
          You’re short about <strong>{money(result.shortfall)}</strong> to cover
          down + closing out of savings.
        </div>
      )}
    </div>
  );
}
