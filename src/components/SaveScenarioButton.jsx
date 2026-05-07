import { useState } from 'react';
import { useInputs } from '../state/InputsContext.jsx';
import { load, save, KEYS } from '../lib/storage.js';

export default function SaveScenarioButton() {
  const { inputs } = useInputs();
  const [saving, setSaving] = useState(false);

  const onClick = () => {
    const defaultName =
      inputs.city
        ? `${inputs.city} — ${inputs.loanTermYears}yr @ ${inputs.interestRate}%`
        : `${inputs.loanTermYears}yr @ ${inputs.interestRate}%`;
    const name = window.prompt('Name this scenario:', defaultName);
    if (!name) return;

    const existing = load(KEYS.scenarios, []);
    const scenario = {
      id: Date.now().toString(36),
      name,
      savedAt: new Date().toISOString(),
      inputs,
    };
    save(KEYS.scenarios, [scenario, ...existing]);
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
      {saving ? 'Saved!' : 'Save scenario'}
    </button>
  );
}
