import { useLayoutEffect, useRef, useState } from 'react';
import { groupNumericString, parseMoneyInput } from '../lib/format.js';

// The typing brain behind every number box in the app.
//
// Why not <input type="number">? Because browsers make it miserable:
//   - it can't display thousands separators at all,
//   - clearing the field snaps a "0" back under your cursor,
//   - typing "6." collapses to "6" (the decimal point vanishes mid-thought),
//   - scrolling the page while focused silently changes the value.
//
// So we render type="text" and manage a local "draft" string while the field
// is focused: commas are inserted live as you type (caret preserved), complete
// numbers flow into app state immediately, and half-typed states like "6." or
// "-" wait patiently for the next keystroke. On blur the draft is parsed for
// real ("120k" and "$1,200" both work), clamped to min/max, and re-formatted.
//
// Re-group a raw input string with commas and figure out where the caret
// should land afterwards: after the same count of non-comma characters the
// user had to the left of their caret. Shared by every live-comma input.
export function regroupForCaret(raw, caret) {
  const formatted = groupNumericString(raw);
  const significant = raw.slice(0, caret ?? raw.length).replace(/,/g, '').length;
  let pos = 0;
  let seen = 0;
  while (pos < formatted.length && seen < significant) {
    if (formatted[pos] !== ',') seen += 1;
    pos += 1;
  }
  return { formatted, caret: pos };
}

// Returns { inputProps } — spread them onto an <input>.
export function useNumericDraft({
  value, // number | '' (empty only meaningful with allowEmpty)
  onChange, // (number | '') => void
  min,
  max,
  step = 1,
  allowEmpty = false,
  commas = true,
}) {
  const inputRef = useRef(null);
  const caretRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const fmt = (v) => {
    if (v === '' || v == null) return '';
    return commas ? groupNumericString(String(v)) : String(v);
  };

  const displayed = focused ? draft : fmt(value);

  // Re-place the caret after we inject/remove commas around it.
  useLayoutEffect(() => {
    if (caretRef.current == null) return;
    inputRef.current?.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  });

  const clamp = (n) => {
    let out = n;
    if (min != null && out < min) out = min;
    if (max != null && out > max) out = max;
    return out;
  };

  // Push complete numbers into app state as they're typed; let half-typed
  // states ("-", "6.", "120k") ride in the draft until blur.
  const commitLive = (s) => {
    const bare = s.replace(/,/g, '');
    if (bare === '') {
      onChange(allowEmpty ? '' : 0);
      return;
    }
    if (/^-?\d+(\.\d+)?$/.test(bare)) onChange(Number(bare));
  };

  const handleChange = (e) => {
    const el = e.target;
    const raw = el.value;
    let formatted;
    if (commas) {
      const result = regroupForCaret(raw, el.selectionStart);
      formatted = result.formatted;
      caretRef.current = result.caret;
    } else {
      formatted = raw.replace(/[^\d.km-]/gi, '');
    }

    setDraft(formatted);
    commitLive(formatted);
  };

  const handleFocus = () => {
    setDraft(fmt(value));
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    const bare = draft.replace(/,/g, '').trim();
    if (bare === '') {
      onChange(allowEmpty ? '' : clamp(0));
      return;
    }
    const parsed = parseMoneyInput(draft); // handles commas, $, k/m
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    // Unparseable garbage: change nothing; display falls back to the last
    // good value on its own.
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    // type="text" loses the native spinner — give the keyboard back its
    // up/down stepping, honoring the field's step size.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const cur =
        Number(String(focused ? draft : (value ?? '')).replace(/,/g, '')) || 0;
      const decimals = (String(step).split('.')[1] || '').length;
      const next = clamp(Number((cur + dir * step).toFixed(decimals)));
      onChange(next);
      setDraft(fmt(next));
    }
  };

  return {
    inputProps: {
      ref: inputRef,
      type: 'text',
      inputMode: 'decimal',
      autoComplete: 'off',
      spellCheck: false,
      enterKeyHint: 'done',
      value: displayed,
      onChange: handleChange,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
    },
  };
}
