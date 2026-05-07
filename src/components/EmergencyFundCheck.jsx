import { emergencyFundCheck } from '../lib/mortgage.js';
import { money, yearsHumanized } from '../lib/format.js';

const COPY = {
  green: 'You\'ll still have a healthy emergency fund after closing.',
  yellow: 'Tight. Try to keep 3-6 months of expenses in savings after closing.',
  red: 'Risky. After closing you\'d have less than 1 month of expenses in savings.',
};

export default function EmergencyFundCheck(props) {
  const result = emergencyFundCheck(props);
  const months = result.monthsCovered;
  // Cap the bar at 6 months for visual purposes
  const widthPct = Math.min(100, (months / 6) * 100);

  return (
    <div className="indicator-card">
      <div className="indicator-head">
        <div>
          <div className="text-small muted">Emergency fund after closing</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {Math.max(0, months).toFixed(1)} months
          </div>
        </div>
        <span className={`pill ${result.level}`}>
          <span className="dot" />
          {result.level === 'green' ? 'Healthy' : result.level === 'yellow' ? 'Tight' : 'Risky'}
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
        Cash left after down payment + closing: <strong>{money(result.remainingSavings)}</strong>.
        Aim for at least {money(result.recommended3mo)} (3 months) — ideally {money(result.recommended6mo)} (6 months).
      </div>
    </div>
  );
}
