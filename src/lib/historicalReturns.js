// Real historical market returns, used to generate realistic random futures.
//
// WHY THIS FILE EXISTS
// --------------------
// Every projection in this app used to assume the market returns the exact
// same percentage every year (7%, 7%, 7%, ... for 30 years). Real markets
// don't do that — they do +26%, -37%, +31%, -18%. That lumpiness is the whole
// reason "should I pay off my mortgage?" is a hard question, so we need real
// data to sample from.
//
// We could instead draw random numbers from a bell curve, and monteCarlo.js
// can do that too. But bell curves badly understate how often extreme years
// happen. A normal distribution says 1931 (-43.8%) should occur roughly never.
// It occurred. Sampling from actual history gets those tails for free, because
// they're literally in the data.
//
// PROVENANCE  (verified 2026-08-05 — please re-check before trusting)
// -------------------------------------------------------------------
// Source:  Aswath Damodaran, NYU Stern — "Historical Returns on Stocks, Bonds
//          and Bills: 1928–Current"
//          https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html
// Column:  S&P 500 annual TOTAL return (price change + dividends reinvested).
// Cross-checked 1928–2024 against westmountfundamentals.com, which reproduces
// the same series — all 97 overlapping values matched exactly. The 2025 value
// came from Damodaran only.
//
// CAVEATS WORTH KNOWING
// ---------------------
// 1. The S&P 500 didn't exist before 1957. Pre-1957 figures are reconstructed
//    from the S&P 90 and other indices, and different vendors disagree — e.g.
//    some sources put 1954 at +45% rather than +52.6%, and 1931 at -47% rather
//    than -43.8%. Post-1957 figures agree across vendors to within a few
//    hundredths of a percent (vendors differ slightly on dividend timing).
// 2. These are NOMINAL returns — inflation is not removed. Handle inflation
//    separately (the app already has an inflation input).
// 3. These are pre-tax and pre-fee. A real investor in an index fund would
//    earn slightly less.
// 4. Past returns are not a forecast. This is a way to explore plausible
//    futures, not to predict one.
//
// TODO (future): add a matching year-by-year US CPI inflation series so we can
// bootstrap returns and inflation *together*, preserving their correlation
// (high-inflation years tend to be bad market years). Deliberately left out
// for now rather than guessed at.

/** S&P 500 annual total return (%), 1928 through 2025. */
export const SP500_ANNUAL_RETURNS = [
  { year: 1928, returnPct: 43.81 },
  { year: 1929, returnPct: -8.30 },
  { year: 1930, returnPct: -25.12 },
  { year: 1931, returnPct: -43.84 },
  { year: 1932, returnPct: -8.64 },
  { year: 1933, returnPct: 49.98 },
  { year: 1934, returnPct: -1.19 },
  { year: 1935, returnPct: 46.74 },
  { year: 1936, returnPct: 31.94 },
  { year: 1937, returnPct: -35.34 },
  { year: 1938, returnPct: 29.28 },
  { year: 1939, returnPct: -1.10 },
  { year: 1940, returnPct: -10.67 },
  { year: 1941, returnPct: -12.77 },
  { year: 1942, returnPct: 19.17 },
  { year: 1943, returnPct: 25.06 },
  { year: 1944, returnPct: 19.03 },
  { year: 1945, returnPct: 35.82 },
  { year: 1946, returnPct: -8.43 },
  { year: 1947, returnPct: 5.20 },
  { year: 1948, returnPct: 5.70 },
  { year: 1949, returnPct: 18.30 },
  { year: 1950, returnPct: 30.81 },
  { year: 1951, returnPct: 23.68 },
  { year: 1952, returnPct: 18.15 },
  { year: 1953, returnPct: -1.21 },
  { year: 1954, returnPct: 52.56 },
  { year: 1955, returnPct: 32.60 },
  { year: 1956, returnPct: 7.44 },
  { year: 1957, returnPct: -10.46 },
  { year: 1958, returnPct: 43.72 },
  { year: 1959, returnPct: 12.06 },
  { year: 1960, returnPct: 0.34 },
  { year: 1961, returnPct: 26.64 },
  { year: 1962, returnPct: -8.81 },
  { year: 1963, returnPct: 22.61 },
  { year: 1964, returnPct: 16.42 },
  { year: 1965, returnPct: 12.40 },
  { year: 1966, returnPct: -9.97 },
  { year: 1967, returnPct: 23.80 },
  { year: 1968, returnPct: 10.81 },
  { year: 1969, returnPct: -8.24 },
  { year: 1970, returnPct: 3.56 },
  { year: 1971, returnPct: 14.22 },
  { year: 1972, returnPct: 18.76 },
  { year: 1973, returnPct: -14.31 },
  { year: 1974, returnPct: -25.90 },
  { year: 1975, returnPct: 37.00 },
  { year: 1976, returnPct: 23.83 },
  { year: 1977, returnPct: -6.98 },
  { year: 1978, returnPct: 6.51 },
  { year: 1979, returnPct: 18.52 },
  { year: 1980, returnPct: 31.74 },
  { year: 1981, returnPct: -4.70 },
  { year: 1982, returnPct: 20.42 },
  { year: 1983, returnPct: 22.34 },
  { year: 1984, returnPct: 6.15 },
  { year: 1985, returnPct: 31.24 },
  { year: 1986, returnPct: 18.49 },
  { year: 1987, returnPct: 5.81 },
  { year: 1988, returnPct: 16.54 },
  { year: 1989, returnPct: 31.48 },
  { year: 1990, returnPct: -3.06 },
  { year: 1991, returnPct: 30.23 },
  { year: 1992, returnPct: 7.49 },
  { year: 1993, returnPct: 9.97 },
  { year: 1994, returnPct: 1.33 },
  { year: 1995, returnPct: 37.20 },
  { year: 1996, returnPct: 22.68 },
  { year: 1997, returnPct: 33.10 },
  { year: 1998, returnPct: 28.34 },
  { year: 1999, returnPct: 20.89 },
  { year: 2000, returnPct: -9.03 },
  { year: 2001, returnPct: -11.85 },
  { year: 2002, returnPct: -21.97 },
  { year: 2003, returnPct: 28.36 },
  { year: 2004, returnPct: 10.74 },
  { year: 2005, returnPct: 4.83 },
  { year: 2006, returnPct: 15.61 },
  { year: 2007, returnPct: 5.48 },
  { year: 2008, returnPct: -36.55 },
  { year: 2009, returnPct: 25.94 },
  { year: 2010, returnPct: 14.82 },
  { year: 2011, returnPct: 2.10 },
  { year: 2012, returnPct: 15.89 },
  { year: 2013, returnPct: 32.15 },
  { year: 2014, returnPct: 13.52 },
  { year: 2015, returnPct: 1.38 },
  { year: 2016, returnPct: 11.77 },
  { year: 2017, returnPct: 21.61 },
  { year: 2018, returnPct: -4.23 },
  { year: 2019, returnPct: 31.21 },
  { year: 2020, returnPct: 18.02 },
  { year: 2021, returnPct: 28.47 },
  { year: 2022, returnPct: -18.04 },
  { year: 2023, returnPct: 26.06 },
  { year: 2024, returnPct: 24.88 },
  { year: 2025, returnPct: 17.78 },
];

/** Just the return values, for fast sampling. */
export const SP500_RETURN_VALUES = SP500_ANNUAL_RETURNS.map((r) => r.returnPct);

/**
 * Summary stats for the table — shown in the UI so you can see what you're
 * sampling from, and used as sensible defaults for the bell-curve mode.
 *
 * The two averages differ, and the difference matters:
 *   - ARITHMETIC mean is the simple average of the yearly numbers. It's what
 *     you'd use for a single random year.
 *   - GEOMETRIC mean (CAGR) is the constant rate that produces the same
 *     ending balance over the whole period. It is ALWAYS lower, because
 *     losses hurt more than equal-sized gains help (lose 50%, then gain 50%,
 *     and you're at 75% — not back to even).
 *
 * The geometric number is the one to compare against a mortgage rate. Quoting
 * the arithmetic average makes investing look better than it really is — a
 * mistake a lot of calculators make.
 */
export function returnStats(values = SP500_RETURN_VALUES) {
  const n = values.length;
  const arithmeticMeanPct = values.reduce((s, v) => s + v, 0) / n;

  // Geometric: multiply all the growth factors, then take the nth root.
  const growth = values.reduce((p, v) => p * (1 + v / 100), 1);
  const geometricMeanPct = (Math.pow(growth, 1 / n) - 1) * 100;

  const variance =
    values.reduce((s, v) => s + (v - arithmeticMeanPct) ** 2, 0) / (n - 1);
  const stdDevPct = Math.sqrt(variance);

  const negativeYears = values.filter((v) => v < 0).length;

  return {
    count: n,
    firstYear: SP500_ANNUAL_RETURNS[0].year,
    lastYear: SP500_ANNUAL_RETURNS[n - 1].year,
    arithmeticMeanPct,
    geometricMeanPct,
    stdDevPct,
    minPct: Math.min(...values),
    maxPct: Math.max(...values),
    negativeYears,
    negativeYearPct: (negativeYears / n) * 100,
  };
}
