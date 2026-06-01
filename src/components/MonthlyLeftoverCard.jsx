import { useMemo } from 'react';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import { estimateNet } from '../lib/taxes.js';
import { monthlyDiscretionaryBuffer } from '../lib/mortgage.js';
import { money } from '../lib/format.js';

const COPY = {
  green: 'Nice cushion for savings, fun, and surprises.',
  yellow: 'Doable, but one big bill could sting.',
  red: "You're spending more than you take home on paper — something has to give.",
};

export default function MonthlyLeftoverCard({ monthlyHousing }) {
  const { inputs, update } = useInputs();

  const normalizedOverride =
    inputs.effectiveTaxRateOverride === '' ||
    inputs.effectiveTaxRateOverride == null
      ? null
      : Number(inputs.effectiveTaxRateOverride);

  const result = useMemo(() => {
    const tax = estimateNet({
      grossAnnual: inputs.annualIncome,
      stateAbbrev: inputs.stateAbbrev,
      filingStatus: inputs.filingStatus,
      overridePct: normalizedOverride,
    });
    return monthlyDiscretionaryBuffer({
      monthlyNet: tax.net / 12,
      monthlyHousing,
      monthlyDebts: inputs.monthlyDebts,
      monthlySpending: inputs.monthlySpendingExcludingHousing,
      extraHomeownerSpending: inputs.extraHomeownerSpendingMonthly,
      annualIncome: inputs.annualIncome,
    });
  }, [inputs, monthlyHousing, normalizedOverride]);

  const pillShort =
    result.level === 'green'
      ? 'Comfortable'
      : result.level === 'yellow'
        ? 'Tight'
        : 'Underwater';

  return (
    <Card title="What's left after all bills?" id="health-detail-monthly-buffer">
      <div className="flex-between stack-sm-start mb-16">
        <div>
          <div className="text-small muted">Leftover each month (estimated)</div>
          <div
            className="explorer-price"
            style={{
              marginTop: 4,
              color:
                result.level === 'green'
                  ? 'var(--green)'
                  : result.level === 'yellow'
                    ? 'var(--yellow)'
                    : 'var(--red)',
            }}
          >
            {money(result.leftover)}
          </div>
        </div>
        <span className={`pill ${result.level}`}>
          <span className="dot" />
          {pillShort}
        </span>
      </div>

      <p className="text-small muted mb-16" style={{ lineHeight: 1.5 }}>
        Take-home pay minus your new mortgage payment, other debt payments, and
        the spending you enter below.{' '}
        <strong>Don&apos;t include rent or mortgage</strong> in &quot;what I
        spend now&quot; — the mortgage line already covers housing.
      </p>

      <Slider
        label="What I spend now (no rent/mortgage or debts)"
        value={inputs.monthlySpendingExcludingHousing}
        onChange={(v) => update({ monthlySpendingExcludingHousing: v })}
        min={0}
        max={15_000}
        step={50}
        hint="Groceries, gas, phone, streaming, eating out, kid stuff, etc."
      />

      <Slider
        label="Extra I'd spend as a homeowner"
        value={inputs.extraHomeownerSpendingMonthly}
        onChange={(v) => update({ extraHomeownerSpendingMonthly: v })}
        min={0}
        max={2_000}
        step={25}
        hint="Utilities might go up, yard care, small repairs — on top of what you spend now."
      />

      <div
        className="mt-16"
        style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-soft)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="text-small muted mb-8" style={{ fontWeight: 600 }}>
          The math
        </div>
        <BreakdownLine label="Take-home pay" amount={result.monthlyNet} />
        <BreakdownLine
          label="New mortgage payment (PITI + PMI + HOA)"
          amount={-monthlyHousing}
          subtract
        />
        <BreakdownLine
          label="Other debts (cars, cards, loans)"
          amount={-inputs.monthlyDebts}
          subtract
        />
        <BreakdownLine
          label="What I spend now"
          amount={-result.baseSpending}
          subtract
        />
        {result.extraHomeownerSpending > 0 && (
          <BreakdownLine
            label="Extra as a homeowner"
            amount={-result.extraHomeownerSpending}
            subtract
          />
        )}
        <div className="breakdown-row total mt-8">
          <span className="left">Leftover</span>
          <span
            className="right"
            style={{
              color:
                result.leftover >= 0 ? 'var(--green)' : 'var(--red)',
            }}
          >
            {money(result.leftover)}/mo
          </span>
        </div>
      </div>

      <p className="text-tiny muted mt-12">{COPY[result.level]}</p>
    </Card>
  );
}

function BreakdownLine({ label, amount, subtract }) {
  const display = subtract ? money(Math.abs(amount)) : money(amount);
  return (
    <div
      className="breakdown-row"
      style={{ padding: '6px 0', fontSize: 14 }}
    >
      <span className="left text-small">{subtract ? `− ${label}` : label}</span>
      <span className="right">{display}</span>
    </div>
  );
}
