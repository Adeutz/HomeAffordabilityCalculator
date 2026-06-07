import { useEffect, useMemo, useRef, useState } from 'react';
import { money, percent } from '../lib/format.js';
import { useInputs } from '../state/InputsContext.jsx';

// A Zillow-style slider with an editable value.
// - Drag the slider to change the value visually.
// - Drag past the right edge: the slider auto-expands so you can keep going.
// - Or click the number on the right and type any value.
//
// `format` controls how the value is shown when not editing:
//   'money'   -> "$120,000"
//   'percent' -> "6.75%"
//   'integer' -> "740"
export default function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = 'money',
  hint,
  // When true, the slider keeps a fixed [min, max] range and never grows
  // past it (the user can still type a custom value beyond the range).
  // Useful when you have visuals positioned relative to the slider that
  // would shift if the slider stretched.
  noStretch = false,
  // Sandboxed sliders (what-if panels) should pass false so undo only tracks real inputs.
  trackUndo = true,
}) {
  const { beginGesture, endGesture } = useInputs();
  const trackRef = useRef(null);
  const inputRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // The slider's "stretched" maximum. Starts equal to the prop's max and
  // grows whenever the user drags to the right edge.
  const [stretchedMax, setStretchedMax] = useState(max);

  // We only allow ONE expansion per drag session. Otherwise the slider runs
  // away exponentially as the user keeps holding the mouse past the edge.
  // The user releases the mouse, drags again, and can stretch once more.
  const grewThisDragRef = useRef(false);

  // If the parent passes a different `max` prop (rare, but possible), reset
  // the stretch so we don't keep an old stale stretch.
  useEffect(() => {
    setStretchedMax((cur) => (cur < max ? max : cur));
  }, [max]);

  // The actual min/max the slider currently uses.
  // - Min can stretch left if a user typed a smaller value.
  // - Max grows to whichever is biggest: the prop, the typed-in value,
  //   or our stretchedMax (which grew when they dragged to the edge).
  const effectiveMin = noStretch ? min : Math.min(min, value);
  const effectiveMax = useMemo(() => {
    if (noStretch) return max;
    const fromValue = value > max ? nextNiceMaxAbove(value) : max;
    return Math.max(fromValue, stretchedMax);
  }, [max, value, stretchedMax, noStretch]);

  // When the user drags the slider, this fires. If their new value is at
  // (or basically at) the right edge, expand the slider ONCE so they can
  // keep dragging. Releasing the mouse re-arms the expansion.
  const handleSliderChange = (newValue) => {
    onChange(newValue);
    if (
      !noStretch &&
      newValue >= effectiveMax - step / 2 &&
      !grewThisDragRef.current
    ) {
      setStretchedMax((cur) => nextNiceMaxAbove(Math.max(cur, newValue)));
      grewThisDragRef.current = true;
    }
  };

  // Re-arm expansion when the user lets go.
  const handlePointerUp = () => {
    grewThisDragRef.current = false;
    if (trackUndo) endGesture();
  };

  const handlePointerDown = () => {
    if (trackUndo) beginGesture();
  };

  // Color-fill the part of the track to the left of the thumb.
  // We use a CSS background-image gradient that matches the slider's value.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ratio = (value - effectiveMin) / (effectiveMax - effectiveMin);
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    el.style.background = `linear-gradient(to right, var(--slider-fill) 0%, var(--slider-fill) ${pct}%, var(--slider-track) ${pct}%, var(--slider-track) 100%)`;
  }, [value, effectiveMin, effectiveMax]);

  const formattedValue = useMemo(() => {
    if (format === 'money') return money(value);
    if (format === 'percent') return percent(value, value < 10 ? 2 : 1);
    return Number(value).toLocaleString();
  }, [value, format]);

  // Estimate input width so the field hugs its content
  const inputSize = Math.max(6, formattedValue.length + 1);

  const startEditing = () => {
    setDraft(rawForEditing(value, format));
    setEditing(true);
    // Focus + select on the next tick so the user can immediately type over
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commit = () => {
    const parsed = parseLooseNumber(draft);
    if (Number.isFinite(parsed)) {
      // Don't allow negatives unless caller explicitly allowed it
      const clamped = Math.max(0, parsed);
      onChange(clamped);
    }
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div className="slider-row">
      <div className="slider-label">
        <span className="name">{label}</span>
        {editing ? (
          <span className="value-edit">
            {format === 'money' && <span className="affix">$</span>}
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKeyDown}
              size={inputSize}
              aria-label={`${label} (type a value)`}
            />
            {format === 'percent' && <span className="affix">%</span>}
          </span>
        ) : (
          <button
            type="button"
            className="value value-button"
            onClick={startEditing}
            aria-label={`${label}: ${formattedValue}. Click to edit.`}
            title="Click to type a value"
          >
            {formattedValue}
          </button>
        )}
      </div>
      <input
        ref={trackRef}
        type="range"
        min={effectiveMin}
        max={effectiveMax}
        step={step}
        value={value}
        onChange={(e) => handleSliderChange(Number(e.target.value))}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onBlur={handlePointerUp}
        title="Drag to the right edge once to expand the slider. Or click the value to type one."
      />
      {hint && <div className="hint text-tiny muted">{hint}</div>}
    </div>
  );
}

// Convert the current value into a string that's good for editing.
// e.g. 120000 -> "120000", 6.75 -> "6.75"
function rawForEditing(value, format) {
  if (format === 'percent') return String(value);
  if (format === 'money') return String(Math.round(value));
  return String(value);
}

// Parse "$120,000", "120k", "6.75%", " 120000 " etc.
function parseLooseNumber(input) {
  if (typeof input !== 'string') return NaN;
  let s = input.trim().toLowerCase().replace(/[$,%\s]/g, '');
  let multiplier = 1;
  if (s.endsWith('k')) {
    multiplier = 1_000;
    s = s.slice(0, -1);
  } else if (s.endsWith('m')) {
    multiplier = 1_000_000;
    s = s.slice(0, -1);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n * multiplier : NaN;
}

// Pad an out-of-range value up to a nice round number so the slider has
// some breathing room past the typed value. Used after typing a value bigger
// than the current max.
function niceRoundUp(value) {
  if (value <= 0) return 0;
  const target = value * 1.25;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  return Math.ceil(target / magnitude) * magnitude;
}

// Returns the next "nice" round number bigger than `value`, following the
// classic 1 → 2 → 5 → 10 progression used on chart axes.
//   500_000   -> 1_000_000
//   1_000_000 -> 2_000_000
//   2_000_000 -> 5_000_000
//   5_000_000 -> 10_000_000
//   12        -> 20  (interest-rate slider, percent values)
function nextNiceMaxAbove(value) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const lead = value / magnitude;
  let nextLead;
  if (lead < 2) nextLead = 2;
  else if (lead < 5) nextLead = 5;
  else nextLead = 10;
  return nextLead * magnitude;
}
