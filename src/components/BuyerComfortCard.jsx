import Card from './Card.jsx';
import { comfortAnalysis } from '../lib/mortgage.js';
import { money, percentFromRatio } from '../lib/format.js';

// Buyer comfort rules card — checks the lender's-max home price against
// Financial Samurai's 30/30/3 + Net Worth rule.

export default function BuyerComfortCard({
  annualIncome,
  netWorth,
  homePriceBeingChecked,
  monthlyHousing,
}) {
  const analysis = comfortAnalysis({
    annualIncome,
    netWorth,
    homePriceBeingChecked,
    monthlyHousing,
  });

  const headPill =
    analysis.overallLevel === 'green'
      ? 'Comfortable'
      : analysis.overallLevel === 'yellow'
        ? 'Stretched'
        : 'House poor risk';

  return (
    <Card title="Buyer comfort (30/30/3 + Net Worth rule)">
      <div className="flex-between stack-sm-start mb-16">
        <div className="text-small muted">
          Checked against your planned home price of{' '}
          <strong>{money(homePriceBeingChecked)}</strong>.
        </div>
        <span className={`pill ${analysis.overallLevel}`}>
          <span className="dot" />
          {headPill} — {analysis.passCount}/3 passed
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {analysis.rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </div>

      <div className="divider" />

      {/* Tier targets — the "comfortable" prices */}
      <div className="text-small muted mb-8">
        Comfortable price targets, given your income and net worth:
      </div>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Ideal target</div>
          <div className="value">{money(Math.max(0, analysis.idealMax))}</div>
          <div className="text-tiny muted" style={{ fontWeight: 500 }}>
            3× income, 30% NW
          </div>
        </div>
        <div className="stat">
          <div className="label">Reasonable target</div>
          <div className="value">{money(Math.max(0, analysis.reasonableMax))}</div>
          <div className="text-tiny muted" style={{ fontWeight: 500 }}>
            4× income, 50% NW
          </div>
        </div>
        <div className="stat">
          <div className="label">Stretch ceiling</div>
          <div className="value">{money(Math.max(0, analysis.stretchMax))}</div>
          <div className="text-tiny muted" style={{ fontWeight: 500 }}>
            5× income, 30% NW
          </div>
        </div>
      </div>

      <div className="text-tiny muted mt-8">
        Net worth here means your real net worth — cash + investments + retirement + home equity, minus debts. Set it in the advanced inputs.
        Sourced from{' '}
        <a href="https://www.financialsamurai.com/" target="_blank" rel="noopener noreferrer">
          Financial Samurai's
        </a>{' '}
        30/30/3 + Net Worth rule.
      </div>
    </Card>
  );
}

function RuleRow({ rule }) {
  const formattedCurrent = formatRuleValue(rule.currentValue, rule.kind);
  const formattedTarget = formatRuleValue(rule.target, rule.kind);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: rule.pass ? 'var(--green-soft)' : 'var(--red-soft)',
          color: rule.pass ? 'var(--green)' : 'var(--red)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {rule.pass ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </div>
      <div>
        <div style={{ fontWeight: 600 }}>{rule.label}</div>
        <div className="text-small muted">{rule.description}</div>
      </div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ fontWeight: 700, color: rule.pass ? 'var(--green)' : 'var(--red)' }}>
          {formattedCurrent}
        </div>
        <div className="text-tiny muted">target {formattedTarget}</div>
      </div>
    </div>
  );
}

function formatRuleValue(v, kind) {
  if (!Number.isFinite(v)) return '—';
  if (kind === 'ratio' || kind === 'ratio_min') return percentFromRatio(v, 0);
  if (kind === 'multiple') return `${v.toFixed(1)}×`;
  return v.toString();
}
