import { useEffect } from 'react';
import { useInputs } from '../state/InputsContext.jsx';

export default function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useInputs();

  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <>
      <button
        type="button"
        className="button ghost small"
        onClick={undo}
        disabled={!canUndo}
        title="Undo last change (Ctrl+Z)"
        aria-label="Undo"
      >
        ↶ Undo
      </button>
      <button
        type="button"
        className="button ghost small"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
      >
        ↷ Redo
      </button>
    </>
  );
}
