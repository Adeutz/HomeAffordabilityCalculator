import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_INPUTS } from '../lib/defaults.js';
import { load, save, KEYS } from '../lib/storage.js';
import { readSharedFromHash } from '../lib/shareLink.js';

// One central place to hold the calculator inputs. Every page reads from
// here and updates flow back here, so changing a slider on the calculator
// page is also reflected on the amortization page, etc.

const InputsContext = createContext(null);

export function InputsProvider({ children }) {
  const [inputs, setInputs] = useState(() => {
    // Priority order:
    //   1. URL share link (someone sent us a scenario)
    //   2. Saved local inputs
    //   3. App defaults
    const fromShare = readSharedFromHash();
    if (fromShare) return migrate({ ...DEFAULT_INPUTS, ...fromShare });
    const savedInputs = load(KEYS.inputs);
    if (savedInputs) return migrate({ ...DEFAULT_INPUTS, ...savedInputs });
    return DEFAULT_INPUTS;
  });

  // Persist to localStorage whenever inputs change
  useEffect(() => {
    save(KEYS.inputs, inputs);
  }, [inputs]);

  // `update` enforces sensible relationships between sliders. Specifically:
  //   down_payment ≤ liquid_savings ≤ total_net_worth
  // If you nudge one slider in a way that would break the chain, the
  // dependent sliders move along with you so the picture stays internally
  // consistent.
  const update = (patch) => setInputs((prev) => applyCascades(prev, patch));

  const reset = () => setInputs(DEFAULT_INPUTS);

  const value = useMemo(
    () => ({ inputs, setInputs, update, reset }),
    [inputs]
  );

  return (
    <InputsContext.Provider value={value}>{children}</InputsContext.Provider>
  );
}

export function useInputs() {
  const ctx = useContext(InputsContext);
  if (!ctx) throw new Error('useInputs must be used inside <InputsProvider>');
  return ctx;
}

// Forward-compat: anyone who has an old shape saved in localStorage gets
// transparently upgraded to the current shape on next load. Avoids "stale
// empty string crashes the slider" kinds of bugs.
function migrate(inputs) {
  const out = { ...inputs };
  if (out.totalNetWorth === '' || out.totalNetWorth == null || Number.isNaN(Number(out.totalNetWorth))) {
    out.totalNetWorth = out.currentSavings ?? DEFAULT_INPUTS.totalNetWorth;
  } else {
    out.totalNetWorth = Number(out.totalNetWorth);
  }
  return out;
}

// Enforces the natural ordering between the three "money" sliders:
//   down_payment ≤ liquid_savings ≤ total_net_worth
//
// When the user moves one slider, the others may need to follow:
//   - If you raise down payment past your savings, savings rises with it
//     (and net worth follows along if needed).
//   - If you raise savings past your net worth, net worth rises with it.
//   - If you LOWER net worth below your savings, savings (and possibly down
//     payment) come down with it.
//   - Same for lowering savings below the down payment.
//
// We use the keys present in `patch` to figure out which way to push so the
// slider the user is actively dragging is treated as authoritative.
function applyCascades(prev, patch) {
  const next = { ...prev, ...patch };

  const userChangedDown = 'downPayment' in patch;
  const userChangedSavings = 'currentSavings' in patch;
  const userChangedNetWorth = 'totalNetWorth' in patch;

  // Constraint 1: down payment ≤ liquid savings
  if (next.downPayment > next.currentSavings) {
    if (userChangedDown && !userChangedSavings) {
      // User pushed down payment up — pull savings up to follow.
      next.currentSavings = next.downPayment;
    } else {
      // Savings was the user's intent (or both moved) — cap down payment.
      next.downPayment = next.currentSavings;
    }
  }

  // Constraint 2: liquid savings ≤ total net worth
  if (next.currentSavings > next.totalNetWorth) {
    if (userChangedNetWorth && !userChangedSavings && !userChangedDown) {
      // User pulled net worth down — pull savings (and down payment) down.
      next.currentSavings = next.totalNetWorth;
      if (next.downPayment > next.currentSavings) {
        next.downPayment = next.currentSavings;
      }
    } else {
      // Savings rose (directly, or because down payment cascaded) — push
      // net worth up with it.
      next.totalNetWorth = next.currentSavings;
    }
  }

  return next;
}
