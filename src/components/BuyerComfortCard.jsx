import { useMemo } from 'react';
import Card from './Card.jsx';
import {
  comfortAnalysis,
  buyerComfortMinimumRequirements,
} from '../lib/mortgage.js';
import { money, percentFromRatio } from '../lib/format.js';

// Buyer comfort rules card — planned price vs 30/30/3 + net worth style checks.

export default function BuyerComfortCard({
  solverInputs,
  annualIncome,
  netWorth,
  homePriceBeingChecked,
  monthlyHousing,
  downPayment,
  propertyTaxRatePct,
  homeInsuranceAnnual,
}) {
  const analysis = comfortAnalysis({
    annualIncome,
    netWorth,
    homePriceBeingChecked,
    monthlyHousing,
    downPayment,
    propertyTaxRatePct,
    homeInsuranceAnnual,
  });

  const mergedSolver = useMemo(
    () => ({ ...solverInputs, homePrice: homePriceBeingChecked }),
    [solverInputs, homePriceBeingChecked],
  );

  const requirements = useMemo(
    () => buyerComfortMinimumRequirements(mergedSolver, netWorth),
    [mergedSolver, netWorth],
  );

  const reqById = {
    housing30: requirements.housing30,
    networth30: requirements.networth30,
    loanTaxIns3x: requirements.loanTaxIns3x,
  };

  const headPill =
    analysis.overallLevel === 'green'
      ? 'Comfortable'
      : analysis.overallLevel === 'yellow'
        ? 'Stretched'
        : 'House poor risk';

  return (
    <Card id="health-detail-buyer-rules" title="Buyer comfort (30/30/3 + Net Worth rule)">
      <div className="flex-between stack-sm-start mb-16">
        <div className="text-small muted">
          Checked against your <strong>planned home price</strong> of{' '}
          <strong>{money(homePriceBeingChecked)}</strong>. The third rule uses your loan
          plus one year of property tax and insurance (not the full sticker price).
        </div>
        <span className={`pill ${analysis.overallLevel}`}>
          <span className="dot" />
          {headPill} — {analysis.passCount}/3 passed
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {analysis.rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            requirement={reqById[rule.id]}
            currentDownPayment={downPayment}
          />
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
            loan+tax+ins ≤ 3× income, 30% NW
          </div>
        </div>
        <div className="stat">
          <div className="label">Reasonable target</div>
          <div className="value">{money(Math.max(0, analysis.reasonableMax))}</div>
          <div className="text-tiny muted" style={{ fontWeight: 500 }}>
            loan+tax+ins ≤ 4× income, 50% NW
          </div>
        </div>
        <div className="stat">
          <div className="label">Stretch ceiling</div>
          <div className="value">{money(Math.max(0, analysis.stretchMax))}</div>
          <div className="text-tiny muted" style={{ fontWeight: 500 }}>
            loan+tax+ins ≤ 5× income, 30% NW
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

function RuleRow({ rule, requirement, currentDownPayment }) {
  const formattedCurrent = formatRuleValue(rule.currentValue, rule.kind);
  const formattedTarget = formatRuleValue(rule.target, rule.kind);
  const reqLine = formatRequirementLine(
    requirement,
    currentDownPayment,
  );

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
        <div className="text-tiny muted" style={{ marginTop: 6, fontWeight: 500 }}>
          {reqLine}
        </div>
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

function formatRequirementLine(req, currentDownPayment) {
  if (!req) return null;

  if (req.mode === 'net_worth') {
    const bar = money(req.minNetWorth);
    if (req.gap <= 1) {
      return (
        <>
          Minimum for this slice: net worth ≥ <strong>{bar}</strong> — you hit that bar.
          (Still not the same thing as "down payment only.")
        </>
      );
    }
    return (
      <>
        Minimum for this slice: net worth ≥ <strong>{bar}</strong> (30% of the price).
        This rule cares about total net worth — not down payment alone. You are roughly{' '}
        <strong>{money(req.gap)}</strong> under that bar.
      </>
    );
  }

  if (req.impossible) {
    if (req.id === 'housing30') {
      return (
        <>
          No down-payment amount fixes this: even with no mortgage, recurring housing
          (taxes + insurance + HOA etc.) eats more than 30% of your gross income at this
          price. Raise income or pick a cheaper home.
        </>
      );
    }
    return (
      <>
        No down payment fixes this bundle at this sticker price versus your income — you
        would need more income or a smaller price (the loan+yearly tax+insurance stack is
        too big for 3×).
      </>
    );
  }

  const minDp = Number.isFinite(req.minDownPayment) ? Math.max(0, req.minDownPayment) : 0;
  let compare = '';
  if (Number.isFinite(currentDownPayment)) {
    const shortfall = Math.max(0, minDp - currentDownPayment);
    if (shortfall > 1) {
      compare = ` You plan ${money(currentDownPayment)} down — roughly ${money(shortfall)} short for only this slice.`;
    } else if (minDp > 1 || currentDownPayment > 1) {
      compare = ` You plan ${money(currentDownPayment)} down — that clears only this slice.`;
    }
  }

  const dpText = minDp <= 1 ? '$0' : money(minDp);
  return (
    <>
      Minimum down payment for only this slice: <strong>{dpText}</strong>.{compare}
    </>
  );
}
