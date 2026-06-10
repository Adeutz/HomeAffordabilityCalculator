import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_INPUTS } from '../lib/defaults.js';
import { load, save, KEYS } from '../lib/storage.js';
import { readSharedFromHash } from '../lib/shareLink.js';

// One central place to hold the calculator inputs. Every page reads from
// here and updates flow back here, so changing a slider on the calculator
// page is also reflected on the amortization page, etc.

const InputsContext = createContext(null);
const MAX_HISTORY = 50;

export function InputsProvider({ children }) {
  const [activeScenarioId, setActiveScenarioId] = useState(null);
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

  const inputsRef = useRef(inputs);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const gesturingRef = useRef(false);
  const gestureStartRef = useRef(null);
  /** @type {React.MutableRefObject<Map<string, { getExtras: () => object, applyExtras: (data: object) => void }>>} */
  const extrasApisRef = useRef(new Map());
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    inputsRef.current = inputs;
  }, [inputs]);

  const bumpHistory = useCallback(() => {
    setHistoryTick((n) => n + 1);
  }, []);

  const snapshotsEqual = useCallback((a, b) => {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }, []);

  const captureExtras = useCallback(() => {
    const out = {};
    extrasApisRef.current.forEach((api, key) => {
      out[key] = structuredClone(api.getExtras());
    });
    return out;
  }, []);

  const applyExtrasSnapshot = useCallback((extras) => {
    if (!extras || typeof extras !== 'object') return;
    // Older undo entries stored scenario fields at the top level.
    if (
      'scenarioPrice' in extras ||
      'stickyPlannedPrice' in extras ||
      'lastSyncedLenderMax' in extras
    ) {
      extrasApisRef.current.get('scenario')?.applyExtras(extras);
      return;
    }
    Object.entries(extras).forEach(([key, data]) => {
      extrasApisRef.current.get(key)?.applyExtras(data ?? {});
    });
  }, []);

  const captureSnapshot = useCallback(() => {
    return {
      inputs: structuredClone(inputsRef.current),
      extras: captureExtras(),
    };
  }, [captureExtras]);

  const pushPast = useCallback(
    (snapshot) => {
      const past = pastRef.current;
      if (past.length > 0 && snapshotsEqual(past[past.length - 1], snapshot)) {
        return;
      }
      pastRef.current = [...past.slice(-(MAX_HISTORY - 1)), snapshot];
      futureRef.current = [];
      bumpHistory();
    },
    [bumpHistory, snapshotsEqual],
  );

  const restoreSnapshot = useCallback((snapshot) => {
    setInputs(snapshot.inputs);
    applyExtrasSnapshot(snapshot.extras);
  }, [applyExtrasSnapshot]);

  const beginGesture = useCallback(() => {
    if (gesturingRef.current) return;
    gesturingRef.current = true;
    gestureStartRef.current = captureSnapshot();
    pushPast(gestureStartRef.current);
  }, [captureSnapshot, pushPast]);

  const endGesture = useCallback(() => {
    if (!gesturingRef.current) return;
    gesturingRef.current = false;
    if (
      gestureStartRef.current &&
      snapshotsEqual(gestureStartRef.current, captureSnapshot())
    ) {
      pastRef.current = pastRef.current.slice(0, -1);
      bumpHistory();
    }
    gestureStartRef.current = null;
  }, [bumpHistory, captureSnapshot, snapshotsEqual]);

  // Persist to localStorage whenever inputs change
  useEffect(() => {
    save(KEYS.inputs, inputs);
  }, [inputs]);

  // `update` enforces sensible relationships between sliders. Specifically:
  //   down_payment ≤ liquid_savings ≤ total_net_worth
  // If you nudge one slider in a way that would break the chain, the
  // dependent sliders move along with you so the picture stays internally
  // consistent.
  const snapshotFrom = useCallback(
    (inputState) => ({
      inputs: structuredClone(inputState),
      extras: captureExtras(),
    }),
    [captureExtras],
  );

  const recordUndoPoint = useCallback(() => {
    if (!gesturingRef.current) {
      pushPast(captureSnapshot());
    }
  }, [captureSnapshot, pushPast]);

  const update = useCallback(
    (patch) => {
      setInputs((prev) => {
        if (!gesturingRef.current) {
          pushPast(snapshotFrom(prev));
        }
        return applyCascades(prev, patch);
      });
    },
    [pushPast, snapshotFrom],
  );

  const setInputsWithHistory = useCallback(
    (next) => {
      setInputs((prev) => {
        pushPast(captureSnapshot());
        return typeof next === 'function' ? next(prev) : next;
      });
    },
    [captureSnapshot, pushPast],
  );

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [captureSnapshot(), ...futureRef.current].slice(
      0,
      MAX_HISTORY,
    );
    restoreSnapshot(previous);
    bumpHistory();
  }, [bumpHistory, captureSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, captureSnapshot()].slice(
      -MAX_HISTORY,
    );
    restoreSnapshot(next);
    bumpHistory();
  }, [bumpHistory, captureSnapshot, restoreSnapshot]);

  const reset = useCallback(() => {
    pushPast(captureSnapshot());
    setActiveScenarioId(null);
    setInputs(DEFAULT_INPUTS);
  }, [captureSnapshot, pushPast]);

  const registerCalculatorExtras = useCallback((key, api) => {
    extrasApisRef.current.set(key, api);
    return () => {
      extrasApisRef.current.delete(key);
    };
  }, []);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const value = useMemo(
    () => ({
      inputs,
      setInputs: setInputsWithHistory,
      update,
      reset,
      undo,
      redo,
      canUndo,
      canRedo,
      beginGesture,
      endGesture,
      recordUndoPoint,
      registerCalculatorExtras,
      activeScenarioId,
      setActiveScenarioId,
    }),
  // historyTick keeps undo/redo button disabled state in sync with the stacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputs, activeScenarioId, historyTick, update, reset, undo, redo, beginGesture, endGesture, recordUndoPoint, registerCalculatorExtras, setInputsWithHistory],
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
  if (out.calculatorMode !== 'afford' && out.calculatorMode !== 'target') {
    out.calculatorMode = DEFAULT_INPUTS.calculatorMode;
  }
  if (out.targetHomePrice == null || Number.isNaN(Number(out.targetHomePrice))) {
    out.targetHomePrice = DEFAULT_INPUTS.targetHomePrice;
  } else {
    out.targetHomePrice = Number(out.targetHomePrice);
  }
  const gross = out.annualIncome ?? DEFAULT_INPUTS.annualIncome;
  if (
    out.monthlySpendingExcludingHousing == null ||
    Number.isNaN(Number(out.monthlySpendingExcludingHousing))
  ) {
    out.monthlySpendingExcludingHousing = Math.round((gross / 12) * 0.25);
  } else {
    out.monthlySpendingExcludingHousing = Number(out.monthlySpendingExcludingHousing);
  }
  if (
    out.extraHomeownerSpendingMonthly == null ||
    Number.isNaN(Number(out.extraHomeownerSpendingMonthly))
  ) {
    out.extraHomeownerSpendingMonthly = DEFAULT_INPUTS.extraHomeownerSpendingMonthly;
  } else {
    out.extraHomeownerSpendingMonthly = Number(out.extraHomeownerSpendingMonthly);
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
