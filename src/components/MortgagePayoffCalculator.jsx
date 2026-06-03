import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import Card from './Card.jsx';
import NumberField from './NumberField.jsx';
import { mortgagePayoffAnalysis, recastPayment } from '../lib/mortgage.js';
import { money, moneyExact } from '../lib/format.js';

// Pay-off-early calculator for the "I have a house in mind" mode.
//
// It auto-fills the loan balance, rate, and term from the house you're
// checking, but every field is editable (use "Reset to this house" to snap
// back). Add extra payments — monthly, yearly, or a one-time lump sum — to see
// how much sooner you'd be debt-free and how much interest you'd save.
//
// `defaultLoanAmount`, `defaultRate`, `defaultTermYears` come from the house in
// mind. We keep per-field "overrides" (null = follow the house) so that
// tweaking the house upstream flows through to any field you haven't touched.
export default function MortgagePayoffCalculator({
  defaultLoanAmount,
  defaultRate,
  defaultTermYears,
  onRecastResult,
}) {
  const [balanceOverride, setBalanceOverride] = useState(null);
  const [rateOverride, setRateOverride] = useState(null);
  const [termOverride, setTermOverride] = useState(null);

  const [extraMonthly, setExtraMonthly] = useState(0);
  const [extraYearly, setExtraYearly] = useState(0);
  const [oneTimeAmount, setOneTimeAmount] = useState(0);
  const [oneTimeYear, setOneTimeYear] = useState(1);

  const [recastEnabled, setRecastEnabled] = useState(false);
  const [recastYear, setRecastYear] = useState(5);

  const [showTable, setShowTable] = useState(false);

  const balance = balanceOverride ?? Math.round(Math.max(0, defaultLoanAmount));
  const rate = rateOverride ?? defaultRate;
  const term = termOverride ?? defaultTermYears;

  const isEdited =
    balanceOverride != null || rateOverride != null || termOverride != null;

  const resetToHouse = () => {
    setBalanceOverride(null);
    setRateOverride(null);
    setTermOverride(null);
  };

  const analysis = useMemo(
    () =>
      mortgagePayoffAnalysis({
        loanAmount: balance,
        annualRatePct: rate,
        termYears: term,
        extraMonthly,
        extraYearly,
        oneTimeAmount,
        oneTimeMonth: Math.max(1, Math.round(oneTimeYear)) * 12,
      }),
    [balance, rate, term, extraMonthly, extraYearly, oneTimeAmount, oneTimeYear],
  );

  const {
    basePayment,
    baseline,
    accelerated,
    acceleratedMonths,
    monthsSaved,
    interestSaved,
    baselineInterest,
    acceleratedInterest,
    hasExtra,
  } = analysis;

  // One row per year-end: loan balance with vs without the extra payments.
  const chartData = useMemo(() => {
    const yearsCount = Math.ceil(
      Math.max(baseline.length, accelerated.length) / 12,
    );
    const rows = [{ year: 0, noExtra: balance, withExtra: balance }];
    for (let y = 1; y <= yearsCount; y++) {
      const idx = y * 12 - 1;
      rows.push({
        year: y,
        noExtra: idx < baseline.length ? baseline[idx].balance : 0,
        withExtra: idx < accelerated.length ? accelerated[idx].balance : 0,
      });
    }
    return rows;
  }, [baseline, accelerated, balance]);

  const payoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + acceleratedMonths);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [acceleratedMonths]);

  // Keep the recast year inside a sensible range for this loan.
  const maxRecastYear = Math.max(1, term - 1);
  const safeRecastYear = Math.min(maxRecastYear, Math.max(1, recastYear));

  const recast = useMemo(() => {
    if (!recastEnabled) return null;
    return recastPayment({
      schedule: accelerated,
      recastMonth: safeRecastYear * 12,
      annualRatePct: rate,
      originalTermMonths: Math.round(term * 12),
      originalPayment: basePayment,
    });
  }, [recastEnabled, accelerated, safeRecastYear, rate, term, basePayment]);

  const recastActive = !!(recastEnabled && recast && recast.monthlyDrop > 0.5);

  // Lift the active recast up to the parent so it can render the post-recast
  // breakdown / health / take-home cards below this calculator.
  useEffect(() => {
    if (!onRecastResult) return undefined;
    onRecastResult(
      recastActive
        ? {
            newPI: recast.newPayment,
            balanceAtRecast: recast.balanceAtRecast,
            remainingMonths: recast.remainingMonths,
            recastYear: safeRecastYear,
          }
        : null,
    );
    return () => onRecastResult(null);
  }, [onRecastResult, recastActive, recast, safeRecastYear]);

  return (
    <Card
      title="Mortgage payoff calculator"
      action={
        isEdited ? (
          <button className="button small secondary" onClick={resetToHouse}>
            Reset to this house
          </button>
        ) : null
      }
    >
      <div className="text-small muted mb-12">
        See how paying a little extra toward your loan's principal gets you
        debt-free sooner — and saves you interest. Starts from your house in
        mind; tweak anything you like.
      </div>

      {/* Loan basics */}
      <div className="grid grid-three">
        <NumberField
          label="Remaining loan balance"
          prefix="$"
          value={balance}
          onChange={(v) => setBalanceOverride(Math.max(0, v))}
          step={1000}
          min={0}
        />
        <NumberField
          label="Interest rate"
          prefix="%"
          value={rate}
          onChange={(v) => setRateOverride(Math.max(0, v))}
          step={0.1}
          min={0}
        />
        <NumberField
          label="Loan term"
          suffix="years"
          value={term}
          onChange={(v) => setTermOverride(Math.max(1, Math.round(v)))}
          step={1}
          min={1}
          max={40}
        />
      </div>

      {/* Extra payments */}
      <div className="text-small mt-16 mb-8" style={{ fontWeight: 600 }}>
        Extra payments toward principal
      </div>
      <div className="grid grid-three">
        <NumberField
          label="Extra each month"
          prefix="$"
          value={extraMonthly}
          onChange={(v) => setExtraMonthly(Math.max(0, v))}
          step={25}
          min={0}
        />
        <NumberField
          label="Extra each year"
          prefix="$"
          value={extraYearly}
          onChange={(v) => setExtraYearly(Math.max(0, v))}
          step={100}
          min={0}
        />
        <NumberField
          label="One-time payment"
          prefix="$"
          value={oneTimeAmount}
          onChange={(v) => setOneTimeAmount(Math.max(0, v))}
          step={500}
          min={0}
        />
      </div>
      <div className="grid grid-three mt-8">
        <NumberField
          label="Make the one-time payment in year"
          suffix={
            oneTimeAmount > 0
              ? `Applied around ${oneTimeYear * 12} months in`
              : 'Set when your one-time payment lands'
          }
          value={oneTimeYear}
          onChange={(v) => setOneTimeYear(Math.min(term, Math.max(1, Math.round(v))))}
          step={1}
          min={1}
          max={term}
        />
      </div>

      {/* Summary */}
      <div className="stat-grid mt-16">
        <div className="stat">
          <div className="label">Regular monthly payment (P&amp;I)</div>
          <div className="value">{money(basePayment)}</div>
        </div>
        <div className="stat">
          <div className="label">Debt-free by</div>
          <div className="value">{payoffDate}</div>
        </div>
        <div className="stat">
          <div className="label">Pay off sooner</div>
          <div className="value" style={{ color: hasExtra ? 'var(--green)' : undefined }}>
            {hasExtra ? fmtDuration(monthsSaved) : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Interest saved</div>
          <div className="value" style={{ color: hasExtra ? 'var(--green)' : undefined }}>
            {hasExtra ? money(interestSaved) : '—'}
          </div>
        </div>
      </div>

      {hasExtra ? (
        <div className="text-small mt-12">
          By paying extra, you'd be done in{' '}
          <strong>{fmtDuration(acceleratedMonths)}</strong> instead of{' '}
          <strong>{fmtDuration(baseline.length)}</strong>, and pay{' '}
          <strong>{money(acceleratedInterest)}</strong> in interest instead of{' '}
          <strong>{money(baselineInterest)}</strong>.
        </div>
      ) : (
        <div className="text-small muted mt-12">
          Add an extra payment above to see how much faster you'd own your home
          free and clear.
        </div>
      )}

      {/* Recast (optional) */}
      <div
        className="mt-16"
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 16,
        }}
      >
        <label
          className="row text-small"
          style={{ fontWeight: 600, cursor: 'pointer', gap: 8 }}
        >
          <input
            type="checkbox"
            checked={recastEnabled}
            onChange={(e) => setRecastEnabled(e.target.checked)}
          />
          Recast my loan after paying it down
        </label>
        <div className="text-small muted mt-8">
          A recast re-figures your monthly payment off the lower balance once
          you've paid extra, keeping the same rate and the same payoff date — so
          your required payment goes down. We read your balance at the year you
          pick straight off the curve below (it already includes your extra
          payments).
        </div>

        {recastEnabled && (
          <>
            <div className="grid grid-three mt-12">
              <NumberField
                label="Recast in year"
                suffix={`Uses your balance ${safeRecastYear * 12} months in`}
                value={safeRecastYear}
                onChange={(v) =>
                  setRecastYear(
                    Math.min(maxRecastYear, Math.max(1, Math.round(v))),
                  )
                }
                step={1}
                min={1}
                max={maxRecastYear}
              />
            </div>

            {recast && recast.monthlyDrop > 0.5 ? (
              <>
                <div className="stat-grid mt-12">
                  <div className="stat">
                    <div className="label">Balance when you recast</div>
                    <div className="value">{money(recast.balanceAtRecast)}</div>
                  </div>
                  <div className="stat">
                    <div className="label">New monthly payment (P&amp;I)</div>
                    <div className="value" style={{ color: 'var(--green)' }}>
                      {money(recast.newPayment)}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="label">Payment drops by</div>
                    <div className="value" style={{ color: 'var(--green)' }}>
                      {money(recast.monthlyDrop)}/mo
                    </div>
                  </div>
                </div>
                <div className="text-small mt-12">
                  Recasting in year {safeRecastYear} would lower your required
                  payment from <strong>{money(basePayment)}</strong> to{' '}
                  <strong>{money(recast.newPayment)}</strong> a month for the
                  remaining {Math.round(recast.remainingMonths / 12)} years —
                  same rate, same payoff date.
                </div>
              </>
            ) : recast ? (
              <div className="text-small muted mt-12">
                There's no meaningful payment drop here. Recasting only helps
                after you've paid extra toward principal — add some extra
                payments above first, then pick a recast year.
              </div>
            ) : (
              <div className="text-small muted mt-12">
                With these extra payments your loan is already paid off by year{' '}
                {safeRecastYear}, so there's nothing left to recast. Try an
                earlier recast year.
              </div>
            )}
          </>
        )}
      </div>

      {/* Balance over time */}
      <div className="text-small mt-16 mb-8" style={{ fontWeight: 600 }}>
        Loan balance over time
      </div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="year"
              tickFormatter={(y) => `Yr ${y}`}
              stroke="var(--text-muted)"
              fontSize={12}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              stroke="var(--text-muted)"
              fontSize={12}
            />
            <Tooltip
              formatter={(v) => money(v)}
              labelFormatter={(y) => `Year ${y}`}
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {recastEnabled && recast && recast.monthlyDrop > 0.5 && (
              <ReferenceLine
                x={safeRecastYear}
                stroke="var(--brand)"
                strokeDasharray="4 4"
                label={{
                  value: 'Recast',
                  position: 'top',
                  fill: 'var(--brand)',
                  fontSize: 12,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="noExtra"
              name="Minimum payments"
              stroke="#d6443c"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="withExtra"
              name="With extra payments"
              stroke="#00a663"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Month-by-month table (collapsed by default) */}
      <div className="row mt-16">
        <button
          className="button small secondary"
          onClick={() => setShowTable((s) => !s)}
          aria-expanded={showTable}
        >
          {showTable ? 'Hide month-by-month table' : 'Show month-by-month table'}
        </button>
      </div>

      {showTable && (
        <div className="table-wrap mt-12" style={{ maxHeight: 480 }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Payment</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Extra</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accelerated.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{moneyExact(r.payment)}</td>
                  <td>{moneyExact(r.principal)}</td>
                  <td>{moneyExact(r.interest)}</td>
                  <td>{r.extra > 0 ? moneyExact(r.extra) : '—'}</td>
                  <td>{moneyExact(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Turn a number of months into a friendly "X yrs Y mos" string. */
function fmtDuration(months) {
  if (!Number.isFinite(months) || months <= 0) return '0 mos';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y > 0) parts.push(`${y} yr${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} mo${m === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 mos';
}
