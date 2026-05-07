import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  amortizationSchedule,
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  totalInterest,
} from '../lib/mortgage.js';
import { money, moneyExact, yearsHumanized } from '../lib/format.js';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const VIEW_OPTIONS = [
  { id: 'yearly', label: 'Yearly' },
  { id: 'monthly', label: 'Monthly' },
];

export default function AmortizationPage() {
  const { inputs, update } = useInputs();
  const [view, setView] = useState('yearly');

  const { schedule, scheduleNoExtra, homePrice, loanAmount } = useMemo(() => {
    const max = maxMonthlyHousingFromIncome({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
    });
    const homePrice = maxAffordableHomePrice({
      maxMonthlyHousingPayment: max,
      ...inputs,
    });
    const loanAmount = Math.max(0, homePrice - inputs.downPayment);
    const schedule = amortizationSchedule({
      loanAmount,
      annualRatePct: inputs.interestRate,
      termYears: inputs.loanTermYears,
      extraMonthlyPrincipal: inputs.extraMonthlyPrincipal,
    });
    const scheduleNoExtra = amortizationSchedule({
      loanAmount,
      annualRatePct: inputs.interestRate,
      termYears: inputs.loanTermYears,
      extraMonthlyPrincipal: 0,
    });
    return { schedule, scheduleNoExtra, homePrice, loanAmount };
  }, [inputs]);

  const totalInt = totalInterest(schedule);
  const totalIntNoExtra = totalInterest(scheduleNoExtra);
  const interestSaved = totalIntNoExtra - totalInt;
  const monthsSaved = scheduleNoExtra.length - schedule.length;

  // For the chart, group rows by year
  const chartData = useMemo(() => {
    const rows = [];
    for (let y = 0; y < Math.ceil(schedule.length / 12); y++) {
      const slice = schedule.slice(y * 12, (y + 1) * 12);
      const interest = slice.reduce((s, r) => s + r.interest, 0);
      const principal = slice.reduce((s, r) => s + r.principal + r.extra, 0);
      rows.push({ year: y + 1, interest, principal });
    }
    return rows;
  }, [schedule]);

  return (
    <div>
      <div className="page-title">
        <h1>Amortization schedule</h1>
        <span className="subtitle">
          Where every dollar of every payment actually goes.
        </span>
      </div>

      <Card title="Loan summary">
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Home price (auto)</div>
            <div className="value">{money(homePrice)}</div>
          </div>
          <div className="stat">
            <div className="label">Loan amount</div>
            <div className="value">{money(loanAmount)}</div>
          </div>
          <div className="stat">
            <div className="label">Rate</div>
            <div className="value">{inputs.interestRate}%</div>
          </div>
          <div className="stat">
            <div className="label">Term</div>
            <div className="value">{inputs.loanTermYears} years</div>
          </div>
          <div className="stat">
            <div className="label">Total interest paid</div>
            <div className="value">{money(totalInt)}</div>
          </div>
          <div className="stat">
            <div className="label">Loan paid off in</div>
            <div className="value">
              {yearsHumanized(schedule.length / 12)}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Extra principal payment">
        <div className="row">
          <label className="text-small">Extra per month:</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            min={0}
            step={25}
            value={inputs.extraMonthlyPrincipal}
            onChange={(e) =>
              update({ extraMonthlyPrincipal: Number(e.target.value) || 0 })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            style={{ width: 120 }}
          />
          {inputs.extraMonthlyPrincipal > 0 ? (
            <div className="text-small">
              You'd pay off the loan{' '}
              <strong>{Math.floor(monthsSaved / 12)} yrs {monthsSaved % 12} mos</strong>{' '}
              early and save <strong>{money(interestSaved)}</strong> in interest.
            </div>
          ) : (
            <div className="text-small muted">
              Add some extra principal to see the magic.
            </div>
          )}
        </div>
      </Card>

      <Card title="Principal vs interest each year">
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tickFormatter={(y) => `Yr ${y}`} stroke="var(--text-muted)" fontSize={12} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="var(--text-muted)" fontSize={12} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Line type="monotone" dataKey="interest" name="Interest paid" stroke="#d6443c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="principal" name="Principal paid" stroke="#00a663" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="Schedule"
        action={
          <div className="row">
            {VIEW_OPTIONS.map((o) => (
              <button
                key={o.id}
                className={`button small ${view === o.id ? '' : 'secondary'}`}
                onClick={() => setView(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        }
      >
        <ScheduleTable schedule={schedule} view={view} />
      </Card>
    </div>
  );
}

function ScheduleTable({ schedule, view }) {
  const rows = useMemo(() => {
    if (view === 'monthly') return schedule.slice(0, 360); // safety cap
    // Group by year
    const out = [];
    for (let y = 0; y < Math.ceil(schedule.length / 12); y++) {
      const slice = schedule.slice(y * 12, (y + 1) * 12);
      const payment = slice.reduce((s, r) => s + r.payment, 0);
      const interest = slice.reduce((s, r) => s + r.interest, 0);
      const principal = slice.reduce((s, r) => s + r.principal + r.extra, 0);
      const balance = slice.length ? slice[slice.length - 1].balance : 0;
      out.push({ year: y + 1, payment, interest, principal, balance });
    }
    return out;
  }, [schedule, view]);

  return (
    <div className="table-wrap" style={{ maxHeight: 480 }}>
      <table>
        <thead>
          <tr>
            <th>{view === 'monthly' ? 'Month' : 'Year'}</th>
            <th>Payment</th>
            <th>Interest</th>
            <th>Principal</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{view === 'monthly' ? r.month : r.year}</td>
              <td>{moneyExact(r.payment)}</td>
              <td>{moneyExact(r.interest)}</td>
              <td>{moneyExact(view === 'monthly' ? r.principal + r.extra : r.principal)}</td>
              <td>{moneyExact(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
