// Look up a US ZIP code to figure out the state, and use that to suggest
// reasonable defaults for property tax and home insurance.
//
// Uses zippopotam.us (a free, no-key public API). Service worker caches
// successful responses, so once you've looked up a ZIP it works offline.
//
// Tax rates: 2023-ish state averages from public county/state data, rounded.
// Insurance: rough US average ~$1,600/yr but varies a LOT by state because
// of hurricane/wildfire/tornado risk.

export async function lookupZip(zip) {
  if (!/^\d{5}$/.test(zip)) throw new Error('ZIP must be 5 digits');
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) throw new Error('ZIP not found');
  const data = await res.json();
  const place = data.places?.[0];
  if (!place) throw new Error('No place data for that ZIP');
  return {
    city: place['place name'],
    state: place['state'],
    stateAbbrev: place['state abbreviation'],
  };
}

// Rough effective property tax rate by state, % of home value per year.
// (Effective rate, not nominal — accounts for typical assessed-value haircuts.)
const STATE_TAX_RATES = {
  AL: 0.41, AK: 1.19, AZ: 0.62, AR: 0.62, CA: 0.75,
  CO: 0.51, CT: 2.14, DE: 0.57, FL: 0.91, GA: 0.92,
  HI: 0.28, ID: 0.69, IL: 2.27, IN: 0.85, IA: 1.57,
  KS: 1.41, KY: 0.86, LA: 0.55, ME: 1.36, MD: 1.09,
  MA: 1.23, MI: 1.54, MN: 1.12, MS: 0.81, MO: 0.97,
  MT: 0.84, NE: 1.73, NV: 0.6, NH: 2.18, NJ: 2.49,
  NM: 0.8, NY: 1.72, NC: 0.84, ND: 0.98, OH: 1.62,
  OK: 0.9, OR: 0.97, PA: 1.58, RI: 1.63, SC: 0.57,
  SD: 1.31, TN: 0.71, TX: 1.8, UT: 0.63, VT: 1.9,
  VA: 0.82, WA: 0.98, WV: 0.58, WI: 1.85, WY: 0.61,
  DC: 0.56,
};

// Rough average annual home insurance premiums by state (USD).
const STATE_INSURANCE = {
  AL: 1900, AK: 1100, AZ: 1500, AR: 2200, CA: 1300,
  CO: 2000, CT: 1500, DE: 950, FL: 4200, GA: 1800,
  HI: 1100, ID: 900, IL: 1450, IN: 1300, IA: 1450,
  KS: 2400, KY: 1700, LA: 3700, ME: 1100, MD: 1300,
  MA: 1700, MI: 1300, MN: 1900, MS: 2400, MO: 1900,
  MT: 1700, NE: 2700, NV: 950, NH: 1100, NJ: 1300,
  NM: 1500, NY: 1500, NC: 1300, ND: 1700, OH: 1300,
  OK: 3500, OR: 950, PA: 1100, RI: 1500, SC: 1700,
  SD: 1900, TN: 1700, TX: 2700, UT: 850, VT: 950,
  VA: 1300, WA: 1100, WV: 1100, WI: 1100, WY: 1300,
  DC: 1300,
};

export function defaultsForState(stateAbbrev) {
  return {
    propertyTaxRatePct: STATE_TAX_RATES[stateAbbrev] ?? 1.1,
    homeInsuranceAnnual: STATE_INSURANCE[stateAbbrev] ?? 1600,
  };
}
