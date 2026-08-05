import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { money } from '../lib/format.js';

// Fan chart — plots a RANGE of possible futures instead of one line.
//
// The solid line is the median outcome (half the simulated futures did better,
// half did worse). The shaded cone around it is the 10th-to-90th percentile
// band: 80% of simulated futures landed inside it.
//
// Why a cone and not a line: the whole point of the Monte Carlo work is that a
// single projected number hides how much is unknown. Two strategies can have
// almost the same median and wildly different amounts of risk — and that
// difference IS the decision. A cone shows it instantly; no table can.
//
// Reading it: the paid-off house draws a narrow ribbon, because a paid-off
// house doesn't care what the market does. Keeping the mortgage and investing
// draws a wide cone. Where the wide cone's bottom edge sits is the number that
// should actually drive your choice.
//
// Data shape — one row per year, with two fields per series:
//   { year: 5, payoffBand: [lowValue, highValue], payoffMed: medianValue, ... }
// `series` names them: [{ key: 'payoff', name: 'Pay off the house', color }]
export default function FanChart({
  data,
  series,
  height = 340,
  bandLabel = '80% of futures land in here',
}) {
  if (!data || data.length === 0 || !series?.length) return null;

  const compact = (v) => {
    if (!v) return '$0';
    return Math.abs(v) >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : `$${Math.round(v / 1000)}k`;
  };

  // A 30-year horizon means 31 ticks, which collide into an unreadable smear.
  // Thin them to ~8 and always keep the first and last.
  const tickInterval = Math.max(0, Math.ceil(data.length / 8) - 1);

  // Draw the widest cone first so narrower ones stay visible on top of it.
  // Without this the wider band simply paints over the narrower one, hiding
  // the exact contrast the chart exists to show.
  const last = data[data.length - 1];
  const bandWidth = (s) => {
    const b = last?.[`${s.key}Band`];
    return Array.isArray(b) ? b[1] - b[0] : 0;
  };
  const bandsByWidth = [...series].sort((a, b) => bandWidth(b) - bandWidth(a));

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            {/* Solid hairline grid — dashes read as "threshold" when they're
                just a grid, and add noise behind a translucent band. */}
            <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="year"
              tickFormatter={(y) => `Yr ${y}`}
              stroke="var(--text-muted)"
              fontSize={12}
              interval={tickInterval}
              minTickGap={12}
            />
            <YAxis
              tickFormatter={compact}
              stroke="var(--text-muted)"
              fontSize={12}
              width={56}
            />
            <Tooltip
              content={<FanTooltip series={series} bandLabel={bandLabel} />}
              cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
            />

            {/* Bands first so the median lines draw on top of them. A range
                Area takes a [low, high] pair as its value. ~14% opacity keeps
                it a wash rather than a saturated block, so the two cones stay
                readable where they overlap. */}
            {bandsByWidth.map((s) => (
              <Area
                key={`${s.key}-band`}
                dataKey={`${s.key}Band`}
                stroke="none"
                fill={s.color}
                fillOpacity={0.14}
                isAnimationActive={false}
                activeDot={false}
              />
            ))}

            {series.map((s) => (
              <Line
                key={`${s.key}-median`}
                type="monotone"
                dataKey={`${s.key}Med`}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Custom legend: a legend is always present for 2+ series, and this one
          also has to explain that the pale cone and the solid line are the
          same series — a stock legend can't say that. */}
      <div className="fan-legend">
        {series.map((s) => (
          <span key={s.key} className="fan-legend-item">
            <span className="fan-legend-key" aria-hidden="true">
              <span className="fan-legend-band" style={{ background: s.color }} />
              <span className="fan-legend-line" style={{ background: s.color }} />
            </span>
            {s.name}
          </span>
        ))}
        <span className="fan-legend-note">
          solid = median future · shaded = {bandLabel}
        </span>
      </div>
    </div>
  );
}

/**
 * Tooltip that reports the median AND the range for every series at once —
 * the range is the reason this chart exists, so it can't be hover-only trivia
 * on a single series.
 */
function FanTooltip({ active, payload, label, series, bandLabel }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 13,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Year {label}</div>
      {series.map((s) => {
        const band = row[`${s.key}Band`];
        const med = row[`${s.key}Med`];
        if (med == null) return null;
        return (
          <div key={s.key} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 3,
                  borderRadius: 2,
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--text-muted)' }}>{s.name}</span>
            </div>
            <div style={{ paddingLeft: 16, fontWeight: 600 }}>{money(med)}</div>
            {Array.isArray(band) && (
              <div
                style={{
                  paddingLeft: 16,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                {money(band[0])} to {money(band[1])}
              </div>
            )}
          </div>
        );
      })}
      <div
        style={{
          marginTop: 4,
          paddingTop: 6,
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        range = {bandLabel}
      </div>
    </div>
  );
}
