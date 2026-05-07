import { useMemo, useState } from 'react';
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
import Card from '../components/Card.jsx';
import NumberField from '../components/NumberField.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  rentVsBuy,
  monthlyPaymentBreakdown,
  estimateClosingCosts,
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
} from '../lib/mortgage.js';
import { money } from '../lib/format.js';

export default function RentVsBuyPage() {
  const { inputs } = useInputs();
  const [monthlyRent, setMonthlyRent] = useState(2000);
  const [rentIncreasePct, setRentIncreasePct] = useState(3);
  const [investmentReturnPct, setInvestmentReturnPct] = useState(6);
  const [maintenancePct, setMaintenancePct] = useState(1);

  const projection = useMemo(() => {
    const max = maxMonthlyHousingFromIncome({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
    });
    const homePrice = maxAffordableHomePrice({
      maxMonthlyHousingPayment: max,
      ...inputs,
    });
    const breakdown = monthlyPaymentBreakdown({ ...inputs, homePrice });
    const closingCosts = estimateClosingCosts(homePrice, inputs.closingCostsPct);

    return rentVsBuy({
      homePrice,
      downPayment: inputs.downPayment,
      closingCosts,
      monthlyHousing: breakdown.total,
      monthlyMaintenancePct: maintenancePct,
      monthlyRent,
      annualRentIncreasePct: rentIncreasePct,
      annualHomeAppreciationPct: inputs.annualHomeAppreciationPct,
      investmentReturnPct,
      yearsToProject: 30,
    });
  }, [inputs, monthlyRent, rentIncreasePct, investmentReturnPct, maintenancePct]);

  return (
    <div>
      <div className="page-title">
        <h1>Rent vs buy</h1>
        <span className="subtitle">
          When does buying actually beat renting?
        </span>
      </div>

      <Card title="Renting assumptions">
        <div className="grid grid-two">
          <NumberField
            label="Current rent"
            prefix="$"
            value={monthlyRent}
            onChange={setMonthlyRent}
            step={50}
            suffix="per month"
          />
          <NumberField
            label="Annual rent increase"
            value={rentIncreasePct}
            onChange={setRentIncreasePct}
            step={0.5}
            suffix="% per year"
          />
          <NumberField
            label="Investment return on saved cash"
            value={investmentReturnPct}
            onChange={setInvestmentReturnPct}
            step={0.5}
            suffix="% per year (S&P 500 historical ~7-10%)"
          />
          <NumberField
            label="Home maintenance"
            value={maintenancePct}
            onChange={setMaintenancePct}
            step={0.25}
            suffix="% of home value per year (typical: 1-2%)"
          />
        </div>
      </Card>

      <Card title="The verdict">
        {projection.breakEvenYear ? (
          <p>
            Buying becomes cheaper than renting around <strong>year {projection.breakEvenYear}</strong> in
            this scenario. If you'll be in this home longer than that, buying probably makes sense.
          </p>
        ) : (
          <p>
            Within the next 30 years, buying does <strong>not</strong> overtake renting in this
            scenario. Try a higher home appreciation rate or lower the closing/maintenance costs.
          </p>
        )}
      </Card>

      <Card title="Net cost over 30 years">
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={projection.points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tickFormatter={(y) => `Yr ${y}`} stroke="var(--text-muted)" fontSize={12} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="var(--text-muted)" fontSize={12} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Line type="monotone" dataKey="netBuyCost" name="Net cost of buying" stroke="#006aff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="netRentCost" name="Net cost of renting" stroke="#d49b00" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-tiny muted mt-8">
          "Net cost" means money out the door minus the asset you have left
          (a house if you bought, an investment account if you rented and
          invested the down payment instead). Lower = better.
        </p>
      </Card>
    </div>
  );
}
