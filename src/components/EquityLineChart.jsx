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

// Shows three lines over time: home value (with appreciation),
// loan balance remaining, and your equity (the difference + paydown).
export default function EquityLineChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line
            type="monotone"
            dataKey="homeValue"
            name="Home value"
            stroke="#a155f5"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="equity"
            name="Your equity"
            stroke="#00a663"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="remainingBalance"
            name="Loan balance"
            stroke="#d6443c"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
