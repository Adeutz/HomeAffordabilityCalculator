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
    <div className="header-undo-redo">
      <button
        type="button"
        className="icon-button"
        onClick={undo}
        disabled={!canUndo}
        title="Undo last change"
        aria-label="Undo"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 10h11a5 5 0 0 1 0 10H9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 6L3 10l4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={redo}
        disabled={!canRedo}
        title="Redo"
        aria-label="Redo"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 10H10a5 5 0 0 0 0 10h5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
