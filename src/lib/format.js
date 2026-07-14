// Tiny helpers for formatting numbers as money, percents, etc.
// These get used everywhere in the UI, so we centralize them.

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (n) => (Number.isFinite(n) ? usd0.format(n) : '—');
export const moneyExact = (n) => (Number.isFinite(n) ? usd2.format(n) : '—');

export const percent = (n, digits = 2) =>
  Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—';

export const percentFromRatio = (ratio, digits = 1) =>
  Number.isFinite(ratio) ? `${(ratio * 100).toFixed(digits)}%` : '—';

/** Parse "$120,000", "120k", " 120000 " etc. */
export function parseMoneyInput(input) {
  if (typeof input !== 'string') return NaN;
  let s = input.trim().toLowerCase().replace(/[$,\s]/g, '');
  let multiplier = 1;
  if (s.endsWith('k')) {
    multiplier = 1_000;
    s = s.slice(0, -1);
  } else if (s.endsWith('m')) {
    multiplier = 1_000_000;
    s = s.slice(0, -1);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n * multiplier : NaN;
}

/**
 * Add thousands separators to a numeric string while the user is typing,
 * without touching what they meant: "1234567.89" -> "1,234,567.89",
 * "-6500" -> "-6,500", "6." stays "6." (mid-keystroke states survive).
 * Non-numeric characters (beyond one leading "-", one ".", and a trailing
 * k/m shorthand) are dropped.
 */
export function groupNumericString(raw) {
  if (typeof raw !== 'string') raw = String(raw ?? '');
  let s = raw.replace(/,/g, '');

  const sign = s.startsWith('-') ? '-' : '';
  if (sign) s = s.slice(1);

  // Preserve a trailing k/m so "120k" can be typed naturally (parsed on blur).
  const shorthand = /[km]$/i.test(s) ? s.slice(-1) : '';
  if (shorthand) s = s.slice(0, -1);

  // Keep digits and the first dot only.
  s = s.replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s =
      s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }

  const [intPart, fracPart] = firstDot === -1 ? [s] : s.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dot = firstDot === -1 ? '' : '.';
  return sign + grouped + dot + (fracPart ?? '') + shorthand;
}

/** "1.5 yrs" or "8 months" */
export const yearsHumanized = (years) => {
  if (!Number.isFinite(years)) return '—';
  if (years < 1) return `${Math.round(years * 12)} months`;
  if (years < 2) return `${years.toFixed(1)} yrs`;
  return `${Math.round(years)} yrs`;
};
