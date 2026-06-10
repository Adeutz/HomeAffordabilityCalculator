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

/** "1.5 yrs" or "8 months" */
export const yearsHumanized = (years) => {
  if (!Number.isFinite(years)) return '—';
  if (years < 1) return `${Math.round(years * 12)} months`;
  if (years < 2) return `${years.toFixed(1)} yrs`;
  return `${Math.round(years)} yrs`;
};
