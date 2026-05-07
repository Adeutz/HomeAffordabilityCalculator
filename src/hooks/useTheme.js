import { useEffect, useState } from 'react';
import { load, save, KEYS } from '../lib/storage.js';

// Tiny hook that owns the theme. Persists to localStorage and applies
// data-theme on the <html> element so CSS variables flip.
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = load(KEYS.theme);
    if (saved === 'light' || saved === 'dark') return saved;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    save(KEYS.theme, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle, set: setTheme };
}
