// Sandbox math for splitting net worth and funding a home purchase.

export const FUNDABLE_ALLOCATION_BUCKETS = [
  { key: 'savedForHouse', label: 'Saved for this house', color: '#006aff', fundable: true },
  { key: 'brokerage', label: 'Brokerage', color: '#00a663', fundable: true },
  { key: 'otherHouse', label: 'Other house (equity)', color: '#d49b00', fundable: true },
  { key: 'otherInvestments', label: 'Other investments', color: '#a155f5', fundable: true },
];

export const RETIREMENT_401K_BUCKET = {
  key: 'retirement401k',
  label: '401(k)',
  color: '#d6443c',
  fundable: false,
};

/** Buckets shown when 401(k) is included in the net worth split. */
export function allocationBuckets(include401k) {
  return include401k
    ? [...FUNDABLE_ALLOCATION_BUCKETS, RETIREMENT_401K_BUCKET]
    : FUNDABLE_ALLOCATION_BUCKETS;
}

/** @deprecated Use allocationBuckets(include401k) — kept for imports that need all fundable. */
export const ALLOCATION_BUCKETS = FUNDABLE_ALLOCATION_BUCKETS;

export const NON_FUNDABLE_BUCKET_KEYS = [RETIREMENT_401K_BUCKET.key];

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

function activeBucketKeys(include401k) {
  return allocationBuckets(include401k).map((b) => b.key);
}

function fixPctSum(next, keys, locked = new Set()) {
  const sum = keys.reduce((s, k) => s + (next[k] ?? 0), 0);
  const drift = 100 - sum;
  if (Math.abs(drift) < 0.01) return next;
  const adjustable = keys.filter((k) => !locked.has(k));
  if (adjustable.length === 0) return next;
  const last = adjustable[adjustable.length - 1];
  return { ...next, [last]: Math.max(0, (next[last] ?? 0) + drift) };
}

/**
 * Linked split with optional locks. Locked buckets keep their % when other
 * buckets move. The bucket being edited always accepts the new value.
 */
export function adjustAllocationSplit(
  currentPcts,
  changedKey,
  newValue,
  include401k = false,
  lockedKeys = [],
) {
  const keys = activeBucketKeys(include401k);
  const locked = new Set(
    lockedKeys.filter((k) => keys.includes(k) && k !== changedKey),
  );

  const clamped = Math.max(0, newValue);
  const lockedSum = [...locked].reduce((s, k) => s + (currentPcts[k] ?? 0), 0);
  const maxForChanged = Math.max(0, 100 - lockedSum);
  const finalChanged = Math.min(clamped, maxForChanged);
  const room = 100 - lockedSum - finalChanged;

  const unlockedOthers = keys.filter(
    (k) => k !== changedKey && !locked.has(k),
  );

  const next = Object.fromEntries(keys.map((k) => [k, currentPcts[k] ?? 0]));
  locked.forEach((k) => {
    next[k] = currentPcts[k] ?? 0;
  });
  next[changedKey] = finalChanged;

  if (unlockedOthers.length === 0) {
    return fixPctSum(next, keys, locked);
  }

  const unlockedOtherSum = unlockedOthers.reduce(
    (s, k) => s + (currentPcts[k] ?? 0),
    0,
  );

  if (unlockedOtherSum <= 0) {
    const even = room / unlockedOthers.length;
    unlockedOthers.forEach((k) => {
      next[k] = Math.max(0, even);
    });
  } else {
    unlockedOthers.forEach((k) => {
      next[k] = ((currentPcts[k] ?? 0) / unlockedOtherSum) * room;
    });
  }

  return fixPctSum(next, keys, locked);
}

/** Set one bucket by dollar amount; others rebalance to keep the total net worth. */
export function adjustAllocationSplitFromDollars(
  totalNetWorth,
  currentPcts,
  changedKey,
  newDollars,
  include401k = false,
  lockedKeys = [],
) {
  const clamped = Math.max(0, Math.round(newDollars));
  if (totalNetWorth <= 0) {
    const keys = activeBucketKeys(include401k);
    const pcts = Object.fromEntries(
      keys.map((k) => [k, k === changedKey && clamped > 0 ? 100 : 0]),
    );
    return {
      totalNetWorth: clamped,
      allocationPcts: normalizePcts(pcts, include401k),
    };
  }
  const pct = Math.min(100, (clamped / totalNetWorth) * 100);
  return {
    totalNetWorth,
    allocationPcts: adjustAllocationSplit(
      currentPcts,
      changedKey,
      pct,
      include401k,
      lockedKeys,
    ),
  };
}

export function normalizePcts(pcts, include401k = false) {
  const keys = activeBucketKeys(include401k);
  const sum = keys.reduce((s, k) => s + (pcts[k] ?? 0), 0);
  if (sum <= 0) {
    const even = 100 / keys.length;
    return Object.fromEntries(keys.map((k) => [k, even]));
  }
  const out = { retirement401k: 0 };
  keys.forEach((k) => {
    out[k] = ((pcts[k] ?? 0) / sum) * 100;
  });
  return out;
}

export function pctsToDollars(totalNetWorth, pcts, include401k = false) {
  const keys = activeBucketKeys(include401k);
  const out = { retirement401k: 0 };
  keys.forEach((k) => {
    out[k] = (totalNetWorth * (pcts[k] ?? 0)) / 100;
  });
  return out;
}

/** Sum of balances that can fund the house (excludes 401(k), etc.). */
export function fundableBalanceTotal(balances) {
  return Object.entries(balances).reduce(
    (sum, [key, value]) =>
      NON_FUNDABLE_BUCKET_KEYS.includes(key) ? sum : sum + (value ?? 0),
    0,
  );
}

/**
 * Pull cash for the house: saved-for-house first, then sources in priority order.
 * `drawOrder` is an array of keys (brokerage, otherInvestments, otherHouse).
 */
export function computeHouseFunding({ balances, houseTarget, drawOrder }) {
  let remaining = Math.max(0, houseTarget);
  const draws = Object.fromEntries(
    Object.keys(balances).map((k) => [k, 0]),
  );

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
  Object.keys(balances).forEach((k) => {
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
    retirement401k: balancesAfter.retirement401k ?? 0,
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

export function defaultAllocationPcts(totalNetWorth, currentSavings, include401k = false) {
  const savedPct = totalNetWorth > 0
    ? Math.min(40, Math.max(5, (currentSavings / totalNetWorth) * 100))
    : 25;
  const retirement401kPct = include401k ? 15 : 0;
  const brokeragePct = include401k ? 25 : 30;
  const otherHousePct = include401k ? 18 : 20;
  const otherInvestmentsPct =
    100 - savedPct - brokeragePct - otherHousePct - retirement401kPct;
  return normalizePcts(
    {
      savedForHouse: savedPct,
      brokerage: brokeragePct,
      otherHouse: otherHousePct,
      otherInvestments: Math.max(0, otherInvestmentsPct),
      retirement401k: retirement401kPct,
    },
    include401k,
  );
}

/** Rebalance when toggling 401(k) on — gives it a slice from other buckets. */
export function enable401kSplit(currentPcts, retirement401kPct = 15) {
  const fundableSum = FUNDABLE_ALLOCATION_BUCKETS.reduce(
    (s, b) => s + (currentPcts[b.key] ?? 0),
    0,
  );
  const scale = (100 - retirement401kPct) / Math.max(fundableSum, 1);
  const next = { retirement401k: retirement401kPct };
  FUNDABLE_ALLOCATION_BUCKETS.forEach((b) => {
    next[b.key] = (currentPcts[b.key] ?? 0) * scale;
  });
  return normalizePcts(next, true);
}

export function countUnlockedBuckets(bucketKeys, lockedKeys) {
  return bucketKeys.filter((k) => !lockedKeys.includes(k)).length;
}

export const DEFAULT_DRAW_ORDER = ['brokerage', 'otherInvestments', 'otherHouse'];
