import { useState } from 'react';
import { useInputs } from '../state/InputsContext.jsx';
import { load, save, KEYS } from '../lib/storage.js';

export default function SaveScenarioButton() {
  const { inputs, activeScenarioId, setActiveScenarioId } = useInputs();
  const [saving, setSaving] = useState(false);
  const hasActiveSavedScenario = !!(
    activeScenarioId &&
    load(KEYS.scenarios, []).some((s) => s.id === activeScenarioId)
  );

  const onClick = () => {
    const existing = load(KEYS.scenarios, []);
    const activeScenario = activeScenarioId
      ? existing.find((s) => s.id === activeScenarioId)
      : null;

    const defaultName =
      activeScenario?.name ??
      (inputs.city
        ? `${inputs.city} — ${inputs.loanTermYears}yr @ ${inputs.interestRate}%`
        : `${inputs.loanTermYears}yr @ ${inputs.interestRate}%`);
    const name = window.prompt('Name this scenario:', defaultName);
    if (!name) return;

    const scenario = {
      id: activeScenario?.id ?? Date.now().toString(36),
      name,
      savedAt: new Date().toISOString(),
      inputs,
    };
    const withoutCurrent = existing.filter((s) => s.id !== scenario.id);
    save(KEYS.scenarios, [scenario, ...withoutCurrent]);
    setActiveScenarioId(scenario.id);
    setSaving(true);
    setTimeout(() => setSaving(false), 1500);
  };

  return (
    <button className="button secondary small" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      {saving ? 'Saved!' : hasActiveSavedScenario ? 'Update scenario' : 'Save scenario'}
    </button>
  );
}
