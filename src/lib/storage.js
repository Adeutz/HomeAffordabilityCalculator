// Tiny localStorage wrapper. Centralizing it means we can swap to a real
// backend later without rewriting every component.

const PREFIX = 'hac:';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* localStorage might be disabled (private browsing on iOS, etc.) */
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* see save() */
  }
}

// Storage keys used by the app
export const KEYS = {
  inputs: 'inputs',
  scenarios: 'scenarios',
  theme: 'theme',
};
