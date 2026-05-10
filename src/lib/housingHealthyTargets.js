import { estimateNet } from './taxes.js';
import { monthlyPaymentBreakdown } from './mortgage.js';

/** Healthy band for “housing vs take-home” (matches housingVsNetHealth). */
export const HEALTHY_NET_HOUSING_RATIO = 0.3;

function normalizeOverride(overridePct) {
  if (overridePct === '' || overridePct == null) return null;
  const n = Number(overridePct);
  return Number.isFinite(n) ? n : null;
}

function annualNetAt(grossAnnual, stateAbbrev, filingStatus, overridePct) {
  return estimateNet({
    grossAnnual,
    stateAbbrev,
    filingStatus,
    overridePct: normalizeOverride(overridePct),
  }).net;
}

/**
 * Rough minimum extra gross annual income (holding housing payment flat) so that
 * monthlyHousingPayment / (net/12) <= capRatio.
 */
export function minExtraGrossIncomeForHealthyNetHousing({
  baselineGrossAnnual,
  monthlyHousingPayment,
  stateAbbrev,
  filingStatus,
  overridePct,
  capRatio = HEALTHY_NET_HOUSING_RATIO,
}) {
  if (monthlyHousingPayment <= 0)
    return { extraGrossAnnual: 0, reachable: true };
  if (!Number.isFinite(baselineGrossAnnual) || baselineGrossAnnual <= 0)
    return { extraGrossAnnual: null, reachable: false };

  const minAnnualNetNeeded = (monthlyHousingPayment * 12) / capRatio;
  if (
    annualNetAt(
      baselineGrossAnnual,
      stateAbbrev,
      filingStatus,
      overridePct,
    ) >= minAnnualNetNeeded
  ) {
    return { extraGrossAnnual: 0, reachable: true };
  }

  const STEP = 2500;
  const CEILING = 5_000_000;
  for (let delta = STEP; delta <= CEILING; delta += STEP) {
    if (
      annualNetAt(
        baselineGrossAnnual + delta,
        stateAbbrev,
        filingStatus,
        overridePct,
      ) >= minAnnualNetNeeded
    ) {
      return { extraGrossAnnual: delta, reachable: true };
    }
  }

  return { extraGrossAnnual: null, reachable: false };
}

/**
 * Minimum extra dollars toward down payment at the same price so that new
 * monthly housing (PITI+HOA+PMI…) <= baselineMonthlyNet * capRatio.
 */
export function minExtraDownPaymentForHealthyNetHousing({
  mortgageScenario,
  purchasePrice,
  baselineDownPayment,
  baselineMonthlyNet,
  capRatio = HEALTHY_NET_HOUSING_RATIO,
}) {
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0 || !mortgageScenario)
    return { extraDownPayment: null, reachable: false };
  if (baselineMonthlyNet <= 0)
    return { extraDownPayment: null, reachable: false };

  const ceilingHousing = baselineMonthlyNet * capRatio;

  const currentTotal = monthlyPaymentBreakdown({
    ...mortgageScenario,
    homePrice: purchasePrice,
    downPayment: baselineDownPayment,
  }).total;

  if (currentTotal <= ceilingHousing)
    return { extraDownPayment: 0, reachable: true };

  const MIN_LOAN = 1000;
  const maxExtra = Math.max(
    0,
    purchasePrice - baselineDownPayment - MIN_LOAN,
  );
  const STEP = 2500;

  for (let d = STEP; d <= maxExtra; d += STEP) {
    const total = monthlyPaymentBreakdown({
      ...mortgageScenario,
      homePrice: purchasePrice,
      downPayment: baselineDownPayment + d,
    }).total;
    if (total <= ceilingHousing) return { extraDownPayment: d, reachable: true };
  }

  const lastTry = monthlyPaymentBreakdown({
    ...mortgageScenario,
    homePrice: purchasePrice,
    downPayment: baselineDownPayment + maxExtra,
  }).total;

  if (lastTry <= ceilingHousing) {
    return { extraDownPayment: maxExtra, reachable: true };
  }

  return { extraDownPayment: null, reachable: false };
}
