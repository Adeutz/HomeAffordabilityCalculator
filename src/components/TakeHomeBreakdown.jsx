import { estimateNet } from '../lib/taxes.js';
import { money, percentFromRatio } from '../lib/format.js';
import { PIE_COLORS } from './PaymentPieChart.jsx';

// Visual: a horizontal stacked bar showing where each dollar of GROSS pay
// goes — federal tax, FICA, state tax, housing, other debts, leftover.
const COLORS = {
  federal: '#d6443c',
  fica: '#a155f5',
  state: '#0099b5',
  housing: PIE_COLORS['Principal & Interest'],
  debts: '#d49b00',
  leftover: '#00a663',
};

export default function TakeHomeBreakdown({
  annualIncome,
  stateAbbrev,
  filingStatus,
  overridePct,
  monthlyHousing,
  monthlyDebts,
}) {
  const tax = estimateNet({
    grossAnnual: annualIncome,
    stateAbbrev,
    filingStatus,
    overridePct: overridePct === '' || overridePct == null ? null : Number(overridePct),
  });

  const gross = annualIncome / 12;
  const federalM = tax.federal / 12;
  const ficaM = tax.fica / 12;
  const stateM = tax.state / 12;
  const housingM = monthlyHousing;
  const debtsM = monthlyDebts;
  const leftoverM = Math.max(0, gross - federalM - ficaM - stateM - housingM - debtsM);

  const segments = [
    { key: 'federal', label: 'Federal tax', amount: federalM },
    { key: 'fica', label: 'FICA (SS + Medicare)', amount: ficaM },
    { key: 'state', label: stateAbbrev ? `State tax (${stateAbbrev})` : 'State tax', amount: stateM },
    { key: 'housing', label: 'Housing (PITI + HOA + PMI)', amount: housingM },
    { key: 'debts', label: 'Other debts', amount: debtsM },
    { key: 'leftover', label: 'Leftover for everything else', amount: leftoverM },
  ];
  const total = gross > 0 ? gross : 1;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
        <div className="stat" style={{ flex: '1 1 140px' }}>
          <div className="label">Gross / month</div>
          <div className="value">{money(gross)}</div>
        </div>
        <div className="stat" style={{ flex: '1 1 140px' }}>
          <div className="label">Take-home / month</div>
          <div className="value">{money(tax.net / 12)}</div>
        </div>
        <div className="stat" style={{ flex: '1 1 140px' }}>
          <div className="label">Effective tax rate</div>
          <div className="value">
            {tax.effectiveRatePct.toFixed(1)}%
            <div className="text-tiny muted" style={{ fontWeight: 500 }}>
              {tax.isOverride ? 'your override' : 'estimated'}
            </div>
          </div>
        </div>
        <div className="stat" style={{ flex: '1 1 140px' }}>
          <div className="label">Leftover / month</div>
          <div
            className="value"
            style={{ color: leftoverM >= 0 ? 'var(--green)' : 'var(--red)' }}
          >
            {money(leftoverM)}
          </div>
        </div>
      </div>

      {/* Stacked horizontal bar */}
      <div
        style={{
          display: 'flex',
          height: 24,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'var(--bg-soft)',
          border: '1px solid var(--border)',
        }}
        role="img"
        aria-label="Gross monthly income breakdown bar"
      >
        {segments.map((s) =>
          s.amount > 0 ? (
            <div
              key={s.key}
              title={`${s.label}: ${money(s.amount)} (${percentFromRatio(s.amount / total, 1)})`}
              style={{
                width: `${(s.amount / total) * 100}%`,
                background: COLORS[s.key],
                height: '100%',
              }}
            />
          ) : null
        )}
      </div>

      {/* Legend / numbers */}
      <div style={{ marginTop: 12 }}>
        {segments.map((s) => (
          <div className="breakdown-row" key={s.key}>
            <span className="left">
              <span className="swatch" style={{ background: COLORS[s.key] }} />
              {s.label}
            </span>
            <span className="right">
              {money(s.amount)}
              <span className="muted text-tiny" style={{ marginLeft: 8, fontWeight: 500 }}>
                {percentFromRatio(s.amount / total, 1)} of gross
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="text-tiny muted mt-8">
        Federal taxes use 2024 brackets ({filingStatus === 'mfj' ? 'married filing jointly' : 'single'}{' '}
        + standard deduction). State tax is a state-average effective rate.
        Real numbers depend on deductions, retirement contributions, kids, etc.
      </div>
    </div>
  );
}
