import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { money } from '../lib/format.js';

// Generic multi-line net-worth-over-time chart.
// `data` is an array of points like { year, payoff: 123, keep: 456, ... }
// `lines` describes each series: [{ key, name, color }]
export default function NetWorthCompareChart({ data, lines, height = 300 }) {
  if (!data || data.length === 0) return null;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tickFormatter={(y) => `Yr ${y}`}
            stroke="var(--text-muted)"
            fontSize={12}
          />
          <YAxis
            tickFormatter={(v) =>
              Math.abs(v) >= 1_000_000
                ? `$${(v / 1_000_000).toFixed(1)}M`
                : `$${Math.round(v / 1000)}k`
            }
            stroke="var(--text-muted)"
            fontSize={12}
            width={56}
          />
          <Tooltip
            formatter={(v, name) => [money(v), name]}
            labelFormatter={(y) => `Year ${y}`}
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {lines.map((ln) => (
            <Line
              key={ln.key}
              type="monotone"
              dataKey={ln.key}
              name={ln.name}
              stroke={ln.color}
              strokeWidth={ln.strokeWidth ?? 2.5}
              strokeDasharray={ln.dashed ? '5 4' : undefined}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
