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

/** "1.5 yrs" or "8 months" */
export const yearsHumanized = (years) => {
  if (!Number.isFinite(years)) return '—';
  if (years < 1) return `${Math.round(years * 12)} months`;
  if (years < 2) return `${years.toFixed(1)} yrs`;
  return `${Math.round(years)} yrs`;
};
