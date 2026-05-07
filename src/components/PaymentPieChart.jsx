import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { money } from '../lib/format.js';

// Colors for each slice. Defined here so the legend below the chart matches.
export const PIE_COLORS = {
  'Principal & Interest': '#006aff',
  'Property Tax': '#00a663',
  'Home Insurance': '#d49b00',
  HOA: '#a155f5',
  PMI: '#d6443c',
};

export default function PaymentPieChart({ breakdown }) {
  const data = [
    { name: 'Principal & Interest', value: breakdown.principalAndInterest },
    { name: 'Property Tax', value: breakdown.propertyTax },
    { name: 'Home Insurance', value: breakdown.homeInsurance },
    { name: 'HOA', value: breakdown.hoa },
    { name: 'PMI', value: breakdown.pmi },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <div className="muted center">Set some inputs to see the breakdown.</div>;
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            innerRadius={50}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            stroke="var(--bg-card)"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={PIE_COLORS[entry.name]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [money(value), name]}
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
