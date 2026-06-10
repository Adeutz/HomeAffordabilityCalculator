// Sandbox math for splitting net worth and funding a home purchase.

export const ALLOCATION_BUCKETS = [
  { key: 'savedForHouse', label: 'Saved for this house', color: '#006aff' },
  { key: 'brokerage', label: 'Brokerage', color: '#00a663' },
  { key: 'otherHouse', label: 'Other house (equity)', color: '#d49b00' },
  { key: 'otherInvestments', label: 'Other investments', color: '#a155f5' },
];

export const POST_HOUSE_BUCKET = {
  key: 'thisHouse',
  label: 'This house (equity)',
  color: '#006aff',
};

export const DRAW_SOURCES = [
  { key: 'brokerage', label: 'Brokerage' },
  { key: 'otherInvestments', label: 'Other investments' },
  { key: 'otherHouse', label: 'Other house (equity)' },
];

const BUCKET_KEYS = ALLOCATION_BUCKETS.map((b) => b.key);

/** Linked split: one bucket changes, others scale to keep 100%. */
export function adjustAllocationSplit(currentPcts, changedKey, newValue) {
  const next = { ...currentPcts };
  const clamped = Math.max(0, Math.min(100, newValue));
  next[changedKey] = clamped;

  const others = BUCKET_KEYS.filter((k) => k !== changedKey);
  const otherSum = others.reduce((s, k) => s + (currentPcts[k] ?? 0), 0);
  const room = 100 - clamped;

  if (otherSum <= 0) {
    const even = room / others.length;
    others.forEach((k) => {
      next[k] = even;
    });
  } else {
    others.forEach((k) => {
      next[k] = ((currentPcts[k] ?? 0) / otherSum) * room;
    });
  }

  return normalizePcts(next);
}

export function normalizePcts(pcts) {
  const sum = BUCKET_KEYS.reduce((s, k) => s + (pcts[k] ?? 0), 0);
  if (sum <= 0) {
    const even = 100 / BUCKET_KEYS.length;
    return Object.fromEntries(BUCKET_KEYS.map((k) => [k, even]));
  }
  const out = {};
  BUCKET_KEYS.forEach((k) => {
    out[k] = ((pcts[k] ?? 0) / sum) * 100;
  });
  return out;
}

export function pctsToDollars(totalNetWorth, pcts) {
  const out = {};
  BUCKET_KEYS.forEach((k) => {
    out[k] = (totalNetWorth * (pcts[k] ?? 0)) / 100;
  });
  return out;
}

/**
 * Pull cash for the house: saved-for-house first, then sources in priority order.
 * `drawOrder` is an array of keys (brokerage, otherInvestments, otherHouse).
 */
export function computeHouseFunding({ balances, houseTarget, drawOrder }) {
  let remaining = Math.max(0, houseTarget);
  const draws = Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]));

  const fromSaved = Math.min(balances.savedForHouse ?? 0, remaining);
  draws.savedForHouse = fromSaved;
  remaining -= fromSaved;

  for (const key of drawOrder) {
    if (remaining <= 0) break;
    const available = balances[key] ?? 0;
    const take = Math.min(available, remaining);
    draws[key] = take;
    remaining -= take;
  }

  return {
    draws,
    shortfall: remaining,
    funded: houseTarget - remaining,
  };
}

export function balancesAfterDraw(balances, draws) {
  const out = {};
  BUCKET_KEYS.forEach((k) => {
    out[k] = Math.max(0, (balances[k] ?? 0) - (draws[k] ?? 0));
  });
  return out;
}

/** Post-close portfolio: house equity + what's left in other buckets. */
export function postPurchaseAllocation({
  balancesAfter,
  houseEquity,
  totalNetWorth,
}) {
  const post = {
    thisHouse: houseEquity,
    brokerage: balancesAfter.brokerage ?? 0,
    otherHouse: balancesAfter.otherHouse ?? 0,
    otherInvestments: balancesAfter.otherInvestments ?? 0,
    savedForHouse: balancesAfter.savedForHouse ?? 0,
  };
  const total = Object.values(post).reduce((s, v) => s + v, 0);
  const pcts = {};
  Object.entries(post).forEach(([k, v]) => {
    pcts[k] = total > 0 ? (v / total) * 100 : 0;
  });
  return { dollars: post, pcts, total: total || totalNetWorth };
}

/** Liquid cash left after closing (saved + brokerage remainders). */
export function liquidAfterClosing(balancesAfter) {
  return (balancesAfter.savedForHouse ?? 0) + (balancesAfter.brokerage ?? 0);
}

export function defaultAllocationPcts(totalNetWorth, currentSavings) {
  const savedPct = totalNetWorth > 0
    ? Math.min(40, Math.max(5, (currentSavings / totalNetWorth) * 100))
    : 25;
  const brokeragePct = 30;
  const otherHousePct = 20;
  const otherInvestmentsPct = 100 - savedPct - brokeragePct - otherHousePct;
  return normalizePcts({
    savedForHouse: savedPct,
    brokerage: brokeragePct,
    otherHouse: otherHousePct,
    otherInvestments: Math.max(0, otherInvestmentsPct),
  });
}

export const DEFAULT_DRAW_ORDER = ['brokerage', 'otherInvestments', 'otherHouse'];
