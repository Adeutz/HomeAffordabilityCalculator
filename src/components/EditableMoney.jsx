import { useRef, useState } from 'react';
import { money, parseMoneyInput } from '../lib/format.js';

/**
 * Tap-to-type money field. Supports plain numbers, commas, and 120k / 1.5m shorthands.
 */
export default function EditableMoney({
  value,
  onChange,
  onEditStart,
  min = 0,
  max,
  ariaLabel,
  className = '',
}) {
  const inputRef = useRef(null);
  const undoStartedRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const beginUndo = () => {
    if (undoStartedRef.current) return;
    undoStartedRef.current = true;
    onEditStart?.();
  };

  const startEditing = () => {
    beginUndo();
    setDraft(String(Math.round(value ?? 0)));
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commit = () => {
    const parsed = parseMoneyInput(draft);
    undoStartedRef.current = false;
    if (Number.isFinite(parsed)) {
      let next = Math.max(min, Math.round(parsed));
      if (max != null) next = Math.min(max, next);
      onChange(next);
    }
    setEditing(false);
  };

  const cancel = () => {
    undoStartedRef.current = false;
    setEditing(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <span className={`editable-money editable-money-edit ${className}`.trim()}>
        <span className="affix" aria-hidden="true">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label={ariaLabel ?? 'Enter dollar amount'}
          size={Math.max(6, draft.length + 1)}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`editable-money ${className}`.trim()}
      onClick={startEditing}
      aria-label={`${ariaLabel ?? 'Amount'}: ${money(value)}. Tap to type.`}
      title="Tap to type an exact amount"
    >
      {money(value)}
    </button>
  );
}
