import { useMemo, useState } from 'react';
import Slider from './Slider.jsx';
import NumberField from './NumberField.jsx';
import Card from './Card.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import { lookupZip, defaultsForState } from '../lib/zipLookup.js';
import {
  estimateClosingCosts,
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  suggestedRate,
} from '../lib/mortgage.js';
import { money } from '../lib/format.js';

export default function InputsPanel() {
  const { inputs, update, reset } = useInputs();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState('');
  const isTargetMode = inputs.calculatorMode === 'target';

  // Live "savings after closing" math, shown right under the savings slider
  // so the user can see the impact of their down payment + closing costs as
  // they drag.
  const savingsAfterClosing = useMemo(() => {
    const max = maxMonthlyHousingFromIncome({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
    });
    const homePrice = maxAffordableHomePrice({
      maxMonthlyHousingPayment: max,
      ...inputs,
    });
    const closing = estimateClosingCosts(homePrice, inputs.closingCostsPct);
    return {
      remaining: inputs.currentSavings - inputs.downPayment - closing,
      closing,
      homePrice,
    };
  }, [inputs]);

  const onZipBlur = async (e) => {
    const zip = e.target.value.trim();
    if (!/^\d{5}$/.test(zip)) {
      if (zip.length > 0) setZipError('ZIP must be 5 digits');
      return;
    }
    setZipBusy(true);
    setZipError('');
    try {
      const place = await lookupZip(zip);
      const taxIns = defaultsForState(place.stateAbbrev);
      update({
        zip,
        city: place.city,
        state: place.state,
        stateAbbrev: place.stateAbbrev,
        ...taxIns,
      });
    } catch (err) {
      setZipError(err.message || 'ZIP lookup failed');
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <Card
      title="Your situation"
      action={
        <button className="button ghost small" onClick={reset} title="Reset all inputs">
          Reset
        </button>
      }
    >
      {isTargetMode && (
        <>
          <Slider
            label="House price you're looking at"
            value={inputs.targetHomePrice}
            onChange={(v) => update({ targetHomePrice: v })}
            min={50_000}
            max={2_000_000}
            step={5_000}
            hint="The listing price or offer you're thinking about. Everything on the right checks whether you can swing it."
          />
          <div className="divider" />
        </>
      )}

      <Slider
        label="Annual gross income"
        value={inputs.annualIncome}
        onChange={(v) => update({ annualIncome: v })}
        min={0}
        max={1_000_000}
        step={1_000}
      />

      <Slider
        label="Down payment"
        value={inputs.downPayment}
        onChange={(v) => update({ downPayment: v })}
        min={0}
        max={2_000_000}
        step={1_000}
      />

      <Slider
        label="Monthly debts (cars, cards, student loans)"
        value={inputs.monthlyDebts}
        onChange={(v) => update({ monthlyDebts: v })}
        min={0}
        max={5_000}
        step={50}
      />

      <Slider
        label="Interest rate"
        value={inputs.interestRate}
        onChange={(v) => update({ interestRate: v })}
        min={1}
        max={12}
        step={0.05}
        format="percent"
      />

      <Slider
        label="Liquid savings (cash + brokerage)"
        value={inputs.currentSavings}
        onChange={(v) => update({ currentSavings: v })}
        min={0}
        max={500_000}
        step={1_000}
        hint="Money you can actually withdraw — pays the down payment, closing costs, and emergency fund. Don't include retirement or home equity here."
      />

      <SavingsAfterClosingHint
        remaining={savingsAfterClosing.remaining}
        downPayment={inputs.downPayment}
        closing={savingsAfterClosing.closing}
      />

      <Slider
        label="Total net worth"
        value={inputs.totalNetWorth}
        onChange={(v) => update({ totalNetWorth: v })}
        min={0}
        max={1_000_000}
        step={5_000}
        hint="All assets (cash + investments + retirement + home equity, minus debts). Used by the 30/30/3 + Net Worth rule. Set this higher than liquid savings if you have retirement accounts."
      />

      <div className="divider" />

      <button
        className="button ghost small"
        onClick={() => setShowAdvanced((s) => !s)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? '− Hide' : '+ Show'} advanced inputs
      </button>

      {showAdvanced && (
        <div className="grid grid-two mt-16">
          <div className="field">
            <label>ZIP code (auto-fills tax & insurance)</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              maxLength={5}
              defaultValue={inputs.zip}
              placeholder="e.g. 78701"
              onBlur={onZipBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
            {zipBusy && <div className="hint">Looking up…</div>}
            {zipError && <div className="hint" style={{ color: 'var(--red)' }}>{zipError}</div>}
            {inputs.city && (
              <div className="hint">
                {inputs.city}, {inputs.stateAbbrev}
              </div>
            )}
          </div>

          <div className="field">
            <label>Loan term</label>
            <select
              value={inputs.loanTermYears}
              onChange={(e) => update({ loanTermYears: Number(e.target.value) })}
            >
              <option value={15}>15 years</option>
              <option value={20}>20 years</option>
              <option value={30}>30 years</option>
            </select>
          </div>

          <NumberField
            label="Property tax rate"
            value={inputs.propertyTaxRatePct}
            onChange={(v) => update({ propertyTaxRatePct: v })}
            step={0.05}
            min={0}
            max={5}
            suffix="% of home value per year"
          />

          <NumberField
            label="Home insurance"
            prefix="$"
            value={inputs.homeInsuranceAnnual}
            onChange={(v) => update({ homeInsuranceAnnual: v })}
            step={50}
            min={0}
            suffix="per year"
          />

          <NumberField
            label="HOA fees"
            prefix="$"
            value={inputs.hoaMonthly}
            onChange={(v) => update({ hoaMonthly: v })}
            step={10}
            min={0}
            suffix="per month"
          />

          <NumberField
            label="Credit score"
            value={inputs.creditScore}
            onChange={(v) => update({ creditScore: v })}
            min={300}
            max={850}
            step={5}
            suffix={`Suggested rate at this score: ${suggestedRate(inputs.interestRate, inputs.creditScore).toFixed(2)}%`}
          />

          <NumberField
            label="Closing costs"
            value={inputs.closingCostsPct}
            onChange={(v) => update({ closingCostsPct: v })}
            step={0.25}
            min={0}
            max={6}
            suffix="% of home price (typical: 2-5%)"
          />

          <NumberField
            label="Extra principal payment"
            prefix="$"
            value={inputs.extraMonthlyPrincipal}
            onChange={(v) => update({ extraMonthlyPrincipal: v })}
            step={25}
            min={0}
            suffix="extra per month — pays off the loan faster"
          />

          <div className="field">
            <label>Tax filing status</label>
            <select
              value={inputs.filingStatus}
              onChange={(e) => update({ filingStatus: e.target.value })}
            >
              <option value="single">Single</option>
              <option value="mfj">Married, filing jointly</option>
            </select>
            <div className="hint">Used to estimate take-home pay.</div>
          </div>

          <NumberField
            label="Effective tax rate override"
            value={inputs.effectiveTaxRateOverride}
            onChange={(v) => update({ effectiveTaxRateOverride: v })}
            step={0.5}
            min={0}
            max={60}
            placeholder="auto"
            allowEmpty
            suffix="leave blank to auto-estimate from federal + FICA + state"
          />
        </div>
      )}
    </Card>
  );
}

// Tiny visual cue under the savings slider. Shows what's left of your
// savings after you've handed over the down payment + closing costs.
// Goes red if it's negative (you can't actually afford to close).
function SavingsAfterClosingHint({ remaining, downPayment, closing }) {
  const isNegative = remaining < 0;
  return (
    <div
      style={{
        marginTop: -8,
        marginBottom: 12,
        padding: '8px 10px',
        borderRadius: 8,
        background: isNegative ? 'var(--red-soft)' : 'var(--bg-soft)',
        border: `1px solid ${isNegative ? 'var(--red)' : 'var(--border)'}`,
        fontSize: 13,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span className="muted">
        After down payment ({money(downPayment)}) + closing ({money(closing)}):
      </span>
      <strong style={{ color: isNegative ? 'var(--red)' : 'var(--green)' }}>
        {money(remaining)} left
      </strong>
    </div>
  );
}
