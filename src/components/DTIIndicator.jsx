import { dtiHealth } from '../lib/mortgage.js';
import { percentFromRatio } from '../lib/format.js';

const COPY = {
  green: 'Healthy. Lenders are very comfortable here.',
  yellow: 'Most lenders will say yes, but you\'re tight on monthly cash flow.',
  red: 'Above 43% — most conventional lenders will say no, and life will feel squeezed.',
};

export default function DTIIndicator({ annualIncome, monthlyDebts, monthlyHousing }) {
  const { ratio, level } = dtiHealth({ annualIncome, monthlyDebts, monthlyHousing });
  const widthPct = Math.min(100, ratio * 100);

  return (
    <div className="indicator-card">
      <div className="indicator-head">
        <div>
          <div className="text-small muted">Debt-to-Income (DTI)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {percentFromRatio(ratio, 1)}
          </div>
        </div>
        <span className={`pill ${level}`}>
          <span className="dot" />
          {level === 'green' ? 'Healthy' : level === 'yellow' ? 'Tight' : 'Risky'}
        </span>
      </div>
      <div className="indicator-bar">
        <div
          className="fill"
          style={{
            width: `${widthPct}%`,
            background: `var(--${level})`,
          }}
        />
      </div>
      <div className="indicator-explain">{COPY[level]}</div>
    </div>
  );
}
