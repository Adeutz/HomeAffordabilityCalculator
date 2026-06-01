// Toggle between "how much can I afford?" and "I picked a house — make it work."

export default function CalculatorModeSwitch({ mode, onChange }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Calculator mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'afford'}
        className={`mode-switch-btn ${mode === 'afford' ? 'active' : ''}`}
        onClick={() => onChange('afford')}
      >
        How much can I afford?
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'target'}
        className={`mode-switch-btn ${mode === 'target' ? 'active' : ''}`}
        onClick={() => onChange('target')}
      >
        I have a house in mind
      </button>
    </div>
  );
}
