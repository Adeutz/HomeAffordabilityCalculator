import { useEffect, useMemo, useState } from 'react';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  monthlyPaymentBreakdown,
  affordabilityComfort,
  estimateClosingCosts,
} from '../lib/mortgage.js';
import { money, percentFromRatio } from '../lib/format.js';

// "What if I bought a house at THIS price?" — a Zillow-style price slider
// that lets the user explore prices above/below their comfortable max and
// see, in real time, how stretched their budget would be.
//
// We keep the explored price in local state (not in the global inputs
// context) because it doesn't change the user's situation — it's purely a
// what-if. When the underlying inputs change in a way that shifts the
// comfortable max, we resync to the new max so the slider always starts
// "centered" on a reasonable number.
export default function AffordabilityExplorer({ comfortableMax }) {
  const { inputs } = useInputs();

  const [exploredPrice, setExploredPrice] = useState(comfortableMax);
  // Track the last comfortableMax we synced to. When it changes (because the
  // user moved a slider in "Your situation"), reset the explored price.
  const [lastSyncedMax, setLastSyncedMax] = useState(comfortableMax);

  useEffect(() => {
    if (Math.abs(comfortableMax - lastSyncedMax) > 1) {
      setExploredPrice(comfortableMax);
      setLastSyncedMax(comfortableMax);
    }
  }, [comfortableMax, lastSyncedMax]);

  // Slider range. We lock it (noStretch) so the "Comfortable max" marker
  // can be precisely positioned without the scale shifting underneath it.
  // We aim for the comfortable max to sit roughly in the middle, with
  // generous room on either side. The user can still type a value past
  // the range using the editable number on the right.
  const sliderMin = useMemo(() => {
    return Math.max(50_000, Math.floor(inputs.downPayment / 10_000) * 10_000);
  }, [inputs.downPayment]);
  const sliderMax = useMemo(() => {
    // 2x comfortable max gives a clear "very aggressive" zone past the marker.
    return Math.max(comfortableMax * 2, sliderMin + 200_000);
  }, [comfortableMax, sliderMin]);

  // Clamp the slider's visual value so it never overflows the locked range.
  // (If the user types a number past the range, the typed value still shows
  // in the editable number above; the slider thumb just pins to the edge.)
  const sliderValue = Math.min(sliderMax, Math.max(sliderMin, exploredPrice));

  const {
    breakdown,
    closingCosts,
    comfort,
    pctOfComfortableMax,
  } = useMemo(() => {
    const breakdown = monthlyPaymentBreakdown({
      ...inputs,
      homePrice: exploredPrice,
    });
    const closingCosts = estimateClosingCosts(
      exploredPrice,
      inputs.closingCostsPct,
    );
    const comfort = affordabilityComfort({
      monthlyHousing: breakdown.total,
      monthlyDebts: inputs.monthlyDebts,
      annualIncome: inputs.annualIncome,
    });
    const pctOfComfortableMax =
      comfortableMax > 0 ? exploredPrice / comfortableMax : 0;

    return { breakdown, closingCosts, comfort, pctOfComfortableMax };
  }, [exploredPrice, inputs, comfortableMax]);

  // Position of the "Comfortable max" marker on the slider track, as a
  // percentage of the locked slider range. Because the slider doesn't
  // stretch, this stays accurate while the user drags.
  const comfortableMarkerPct = useMemo(() => {
    const denom = sliderMax - sliderMin;
    if (denom <= 0) return 0;
    return Math.max(0, Math.min(1, (comfortableMax - sliderMin) / denom)) * 100;
  }, [comfortableMax, sliderMin, sliderMax]);

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
          <div className="text-small muted">Exploring a home price of</div>
          <div className="explorer-price">{money(exploredPrice)}</div>
          <div className="text-tiny muted">
            {pctOfComfortableMax > 0
              ? `${(pctOfComfortableMax * 100).toFixed(0)}% of your comfortable max (${money(comfortableMax)})`
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
          onChange={setExploredPrice}
          min={sliderMin}
          max={sliderMax}
          step={1_000}
          noStretch
        />
        {/* A labeled tick that floats below the slider track at the exact
            position of the user's "comfortable max" — so they can see at a
            glance how far they've pushed past it (or pulled back from it). */}
        <div
          className="comfortable-marker"
          style={{ left: `${comfortableMarkerPct}%` }}
          title={`Comfortable max: ${money(comfortableMax)}`}
        >
          <span className="marker-tick" />
          <span className="marker-label">Comfortable max</span>
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
