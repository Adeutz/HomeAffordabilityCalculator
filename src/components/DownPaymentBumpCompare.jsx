import { useMemo, useState } from 'react';
import { monthlyPaymentBreakdown } from '../lib/mortgage.js';
import { money } from '../lib/format.js';

const BUMPS = [50_000, 100_000, 200_000, 300_000];

function computeBumpRow(bump, inputs, homePrice, currentMonthlyTotal) {
  const newDown = Math.min(inputs.downPayment + bump, homePrice);
  const applied = newDown - inputs.downPayment;
  if (applied <= 0) {
    return { bump, applied: 0, skipped: true };
  }
  const breakdown = monthlyPaymentBreakdown({
    ...inputs,
    homePrice,
    downPayment: newDown,
  });
  return {
    bump,
    applied,
    capped: applied < bump,
    newDown,
    total: breakdown.total,
    saves: currentMonthlyTotal - breakdown.total,
    skipped: false,
  };
}

function BumpRow({ row, rowKey }) {
  if (row.skipped) {
    return (
      <tr key={rowKey}>
        <td>+{money(row.bump)}</td>
        <td colSpan={3} className="muted" style={{ textAlign: 'left' }}>
          Already at max down for this price
        </td>
      </tr>
    );
  }

  return (
    <tr key={rowKey}>
      <td>
        +{money(row.bump)}
        {row.capped ? (
          <span
            className="text-tiny muted"
            title={`Only ${money(row.applied)} more room before 100% down`}
          >
            {' '}
            (max +{money(row.applied)})
          </span>
        ) : null}
      </td>
      <td>{money(row.newDown)}</td>
      <td>{money(row.total)}</td>
      <td style={{ color: row.saves > 0 ? 'var(--green)' : undefined }}>
        {row.saves > 0
          ? `−${money(row.saves)}`
          : row.saves < 0
            ? `+${money(-row.saves)}`
            : '—'}
      </td>
    </tr>
  );
}

/**
 * Side-by-side: if you added $50k / $100k / … to today's down payment,
 * what would the total monthly payment be vs now?
 */
export default function DownPaymentBumpCompare({
  inputs,
  homePrice,
  currentMonthlyTotal,
}) {
  const [customExtraDown, setCustomExtraDown] = useState(0);

  const maxExtraDown = Math.max(0, homePrice - inputs.downPayment);

  const presetRows = useMemo(() => {
    if (homePrice <= 0) return [];
    return BUMPS.map((bump) =>
      computeBumpRow(bump, inputs, homePrice, currentMonthlyTotal),
    );
  }, [inputs, homePrice, currentMonthlyTotal]);

  const customRow = useMemo(() => {
    if (homePrice <= 0 || customExtraDown <= 0) return null;
    const bump = Math.min(customExtraDown, maxExtraDown);
    return computeBumpRow(bump, inputs, homePrice, currentMonthlyTotal);
  }, [
    customExtraDown,
    maxExtraDown,
    inputs,
    homePrice,
    currentMonthlyTotal,
  ]);

  const rows = presetRows;
  if (rows.length === 0) return null;

  const allSkipped = rows.every((r) => r.skipped);
  if (allSkipped) {
    return (
      <div className="down-bump-compare mt-16">
        <div className="text-small muted">
          Down payment already covers the full home price — putting more down
          won&apos;t change the monthly payment.
        </div>
      </div>
    );
  }

  return (
    <div className="down-bump-compare mt-16">
      <div className="text-small" style={{ fontWeight: 600, marginBottom: 4 }}>
        What if you put more down?
      </div>
      <div className="text-tiny muted mb-8">
        Same home price ({money(homePrice)}). Adds to your current{' '}
        {money(inputs.downPayment)} down — lowers the loan, P&amp;I, and PMI when
        applicable.
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Extra down</th>
              <th>Total down</th>
              <th>Monthly payment</th>
              <th>Saves / mo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <BumpRow key={row.bump} row={row} rowKey={row.bump} />
            ))}
            {customRow && !customRow.skipped ? (
              <BumpRow row={customRow} rowKey="custom" />
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="field mt-12" style={{ maxWidth: 320 }}>
        <label htmlFor="custom-down-bump">Custom extra down</label>
        <input
          id="custom-down-bump"
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          max={maxExtraDown}
          step={1_000}
          value={customExtraDown || ''}
          placeholder="e.g. 75000"
          onChange={(e) => {
            const n = Number(e.target.value);
            setCustomExtraDown(
              Number.isFinite(n) ? Math.max(0, Math.min(n, maxExtraDown)) : 0,
            );
          }}
        />
        <div className="hint">
          {maxExtraDown > 0
            ? `Type any amount up to ${money(maxExtraDown)} — results show in the table above.`
            : 'No room to add more down on this price.'}
        </div>
      </div>
    </div>
  );
}
