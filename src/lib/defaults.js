// Default values for a fresh calculator session. Tweak these if you want
// the app to start in a different "spot."

export const DEFAULT_INPUTS = {
  // Income / debts
  annualIncome: 90_000,
  monthlyDebts: 400,
  currentSavings: 60_000,

  // Loan structure
  downPayment: 40_000,
  interestRate: 6.75,
  loanTermYears: 30,
  creditScore: 740,

  // Carrying costs
  propertyTaxRatePct: 1.1,
  homeInsuranceAnnual: 1_600,
  hoaMonthly: 0,
  closingCostsPct: 3,
  includeClosingCostsInSavingsCheck: true,

  // Lifestyle / extras
  extraMonthlyPrincipal: 0,
  annualHomeAppreciationPct: 3,

  // Optional location data
  zip: '',
  city: '',
  state: '',
  stateAbbrev: '',

  // Tax / take-home pay assumptions
  filingStatus: 'single', // 'single' | 'mfj'
  effectiveTaxRateOverride: '', // empty = auto-estimate; otherwise %

  // Real net worth (cash + investments + retirement + home equity, minus debts).
  // Used in the 30/30/3 buyer-comfort rule. Defaults to the same as
  // currentSavings; the user is expected to bump it up if they have retirement
  // accounts, home equity, etc.
  totalNetWorth: 60_000,
};

// What we feed the affordability binary search:
// max housing payment per month = 28% of gross income (configurable later).
export const DEFAULT_HOUSING_RATIO = 0.28;
export const DEFAULT_TOTAL_DEBT_RATIO = 0.36;
