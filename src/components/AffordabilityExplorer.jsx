import { useMemo } from 'react';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  monthlyPaymentBreakdown,
  affordabilityComfort,
  estimateClosingCosts,
} from '../lib/mortgage.js';
import { money, percentFromRatio } from '../lib/format.js';

// "What if I bought a house at THIS price?" — pick the home price you're
// planning on; ResultsPanel lifts this value so every number on the right
// (payments, charts, health checks) uses the same planned price at once.
//
// `lenderMaxPrice` anchors the slider's "Lender max" tick and scales the
// %-of-max hint; it resets when incomes/debts change (handled by the parent).
export default function AffordabilityExplorer({
  lenderMaxPrice,
  scenarioPrice,
  onScenarioPriceChange,
}) {
  const { inputs } = useInputs();

  // Slider range. We lock it (noStretch) so the "Comfortable max" marker
  // can be precisely positioned without the scale shifting underneath it.
  // We aim for the comfortable max to sit roughly in the middle, with
  // generous room on either side. The user can still type a value past
  // the range using the editable number on the right.
  const sliderMin = useMemo(() => {
    return Math.max(50_000, Math.floor(inputs.downPayment / 10_000) * 10_000);
  }, [inputs.downPayment]);
  const sliderMax = useMemo(() => {
    // 2× lender max gives a clear "very aggressive" zone past the marker.
    return Math.max(lenderMaxPrice * 2, sliderMin + 200_000);
  }, [lenderMaxPrice, sliderMin]);

  // Clamp the slider's visual value so it never overflows the locked range.
  // (If the user types a number past the range, the typed value still shows
  // in the editable number above; the slider thumb just pins to the edge.)
  const sliderValue = Math.min(sliderMax, Math.max(sliderMin, scenarioPrice));

  const {
    breakdown,
    closingCosts,
    comfort,
    pctOfLenderMax,
  } = useMemo(() => {
    const breakdown = monthlyPaymentBreakdown({
      ...inputs,
      homePrice: scenarioPrice,
    });
    const closingCosts = estimateClosingCosts(
      scenarioPrice,
      inputs.closingCostsPct,
    );
    const comfort = affordabilityComfort({
      monthlyHousing: breakdown.total,
      monthlyDebts: inputs.monthlyDebts,
      annualIncome: inputs.annualIncome,
    });
    const pctOfLenderMax =
      lenderMaxPrice > 0 ? scenarioPrice / lenderMaxPrice : 0;

    return { breakdown, closingCosts, comfort, pctOfLenderMax };
  }, [scenarioPrice, inputs, lenderMaxPrice]);

  // Position of the "Comfortable max" marker on the slider track, as a
  // percentage of the locked slider range. Because the slider doesn't
  // stretch, this stays accurate while the user drags.
  const comfortableMarkerPct = useMemo(() => {
    const denom = sliderMax - sliderMin;
    if (denom <= 0) return 0;
    return Math.max(0, Math.min(1, (lenderMaxPrice - sliderMin) / denom)) * 100;
  }, [lenderMaxPrice, sliderMin, sliderMax]);

  // Compute a single 0..1 "stress" number that reflects which comfort zone
  // we're in AND how deep we are within it. Mapping it onto the green /
  // yellow / red bar (each zone is one third of the bar) keeps the pin
  // perfectly aligned with the pill label.
  //
  //   stress 0..1     → green zone        (0%   .. 33.3%)
  //   stress 1..1.286 → yellow zone       (33.3 .. 66.6%)
  //   stress 1.286+   → red zone          (66.6 .. 100%)
  //
  // We define stress = max(housing/0.28, dti/0.36) so it equals 1 exactly
  // at the green→yellow boundary, and ~1.286 at the yellow→red boundary
  // (matching the underlying comfort thresholds in mortgage.js).
  const comfortPinPct = useMemo(() => {
    const housingStress = comfort.housingRatio / 0.28;
    const dtiStress = comfort.dtiRatio / 0.36;
    const stress = Math.max(housingStress, dtiStress);
    if (stress <= 1) return Math.max(0, stress) * 33.33;
    if (stress <= 1.286) return 33.33 + ((stress - 1) / 0.286) * 33.33;
    return Math.min(100, 66.66 + ((stress - 1.286) / 0.714) * 33.33);
  }, [comfort.housingRatio, comfort.dtiRatio]);

  const description =
    comfort.level === 'green'
      ? 'A home at this price fits well within healthy lending limits. You\'d still have room to breathe each month.'
      : comfort.level === 'yellow'
        ? 'You could probably get approved at this price, but your monthly cash flow will feel tight. Less room for surprises.'
        : 'This is above what most lenders will approve, and your monthly budget would be very squeezed. Consider waiting, putting more down, or paying off other debts first.';

  return (
    <Card title="What if I bought a home at this price?">
      <div className="explorer-head">
        <div>
          <div className="text-small muted">Planned home price</div>
          <div className="explorer-price">{money(scenarioPrice)}</div>
          <div className="text-tiny muted">
            {pctOfLenderMax > 0
              ? `${(pctOfLenderMax * 100).toFixed(0)}% of lender's max home price (${money(lenderMaxPrice)})`
              : ''}
          </div>
        </div>
        <span className={`pill ${comfort.level}`}>
          <span className="dot" />
          {comfort.label}
        </span>
      </div>

      <div className="explorer-slider">
        <Slider
          label="Home price"
          value={sliderValue}
          onChange={onScenarioPriceChange}
          min={sliderMin}
          max={sliderMax}
          step={1_000}
          noStretch
        />
        {/* Tick at the lender's DTI ceiling so you see how far above/below
            you'd be vs what a bank might approve — not a "comfortability" guarantee. */}
        <div
          className="comfortable-marker"
          style={{ left: `${comfortableMarkerPct}%` }}
          title={`Lender max home price (DTI ceiling): ${money(lenderMaxPrice)}`}
        >
          <span className="marker-tick" />
          <span className="marker-label">Max home price</span>
        </div>
      </div>

      <div className="comfort-meter">
        <div className="comfort-meter-bar">
          <div className="zone green" />
          <div className="zone yellow" />
          <div className="zone red" />
          <div
            className={`comfort-meter-pin ${comfort.level}`}
            style={{ left: `${comfortPinPct}%` }}
          />
        </div>
        <div className="comfort-meter-legend">
          <span>Comfortable</span>
          <span>Stretching</span>
          <span>Aggressive</span>
        </div>
      </div>

      <div className="explorer-explain">{description}</div>

      <div className="stat-grid mt-16">
        <div className="stat">
          <div className="label">New monthly payment</div>
          <div className="value">{money(breakdown.total)}</div>
        </div>
        <div className="stat">
          <div className="label">% of gross income</div>
          <div className="value">{percentFromRatio(comfort.housingRatio, 1)}</div>
        </div>
        <div className="stat">
          <div className="label">Total DTI (with debts)</div>
          <div className="value">{percentFromRatio(comfort.dtiRatio, 1)}</div>
        </div>
        <div className="stat">
          <div className="label">Cash needed at closing</div>
          <div className="value">{money(inputs.downPayment + closingCosts)}</div>
        </div>
      </div>
    </Card>
  );
}
