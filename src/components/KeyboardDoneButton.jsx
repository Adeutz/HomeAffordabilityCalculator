import { useEffect, useState } from 'react';

function isEditableField(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return type !== 'range' && type !== 'button' && type !== 'submit' && type !== 'reset';
}

export default function KeyboardDoneButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isMobileLike = window.matchMedia('(pointer: coarse)').matches;
    if (!isMobileLike) return undefined;

    const updateVisibility = () => {
      const active = document.activeElement;
      setVisible(isEditableField(active));
    };

    const onFocusIn = () => updateVisibility();
    const onFocusOut = () => {
      // Wait one tick because focus may move from one field to another.
      requestAnimationFrame(updateVisibility);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    updateVisibility();

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="keyboard-done-button"
      onClick={() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }}
      aria-label="Done editing"
    >
      Done
    </button>
  );
}
