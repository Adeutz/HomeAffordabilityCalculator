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

  const update = (patch) => setInputs((prev) => ({ ...prev, ...patch }));

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
