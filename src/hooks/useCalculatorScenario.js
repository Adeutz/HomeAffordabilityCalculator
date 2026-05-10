import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInputs } from '../state/InputsContext.jsx';
import { load, save, KEYS } from '../lib/storage.js';
import { estimateNet } from '../lib/taxes.js';
import {
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  monthlyPaymentBreakdown,
  amortizationSchedule,
  equityOverTime,
  estimateClosingCosts,
  comfortAnalysis,
  affordabilityComfort,
  dtiHealth,
  emergencyFundCheck,
  cashAfterClosingHealth,
  monthlyDiscretionaryBuffer,
  housingVsNetHealth,
} from '../lib/mortgage.js';

/**
 * Shared scenario math for the calculator column: synced planned price plus
 * derived payments, closing costs, and traffic-light summaries.
 */
export function useCalculatorScenario() {
  const { inputs } = useInputs();

  const { lenderMaxPrice, comfortablePrice, netWorth } = useMemo(() => {
    const maxMonthlyHousingPayment = maxMonthlyHousingFromIncome({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
    });

    const lenderMaxPrice = maxAffordableHomePrice({
      maxMonthlyHousingPayment,
      downPayment: inputs.downPayment,
      interestRate: inputs.interestRate,
      loanTermYears: inputs.loanTermYears,
      propertyTaxRatePct: inputs.propertyTaxRatePct,
      homeInsuranceAnnual: inputs.homeInsuranceAnnual,
      hoaMonthly: inputs.hoaMonthly,
      creditScore: inputs.creditScore,
    });

    const nw = Number(inputs.totalNetWorth) || inputs.currentSavings;
    const comfort = comfortAnalysis({
      annualIncome: inputs.annualIncome,
      netWorth: nw,
      homePriceBeingChecked: lenderMaxPrice,
      monthlyHousing: 0,
      downPayment: inputs.downPayment,
      propertyTaxRatePct: inputs.propertyTaxRatePct,
      homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    });

    const comfortablePrice = Math.max(0, comfort.idealMax);

    return { lenderMaxPrice, comfortablePrice, netWorth: nw };
  }, [inputs]);

  const lenderBreakdownMonthly = useMemo(() => {
    return monthlyPaymentBreakdown({
      ...inputs,
      homePrice: lenderMaxPrice,
    }).total;
  }, [inputs, lenderMaxPrice]);

  const lenderMaxLoanAmount = Math.max(0, lenderMaxPrice - inputs.downPayment);

  const [scenarioPrice, setScenarioPrice] = useState(null);
  const [lastSyncedLenderMax, setLastSyncedLenderMax] = useState(null);

  const [stickyPlannedPrice, setStickyPlannedPriceState] = useState(() =>
    !!load(KEYS.stickyPlannedPrice, false),
  );

  const setStickyPlannedPrice = useCallback((next) => {
    const bool =
      typeof next === 'function'
        ? next(stickyPlannedPrice)
        : Boolean(next);
    setStickyPlannedPriceState(bool);
    save(KEYS.stickyPlannedPrice, bool);
    // Turning lock off: behave like today's default — hug lender max again.
    if (!bool && lenderMaxPrice >= 0) {
      setScenarioPrice(lenderMaxPrice);
      setLastSyncedLenderMax(lenderMaxPrice);
    }
  }, [stickyPlannedPrice, lenderMaxPrice]);

  useEffect(() => {
    if (stickyPlannedPrice) return;
    if (
      lastSyncedLenderMax == null ||
      Math.abs(lenderMaxPrice - lastSyncedLenderMax) > 1
    ) {
      setScenarioPrice(lenderMaxPrice);
      setLastSyncedLenderMax(lenderMaxPrice);
    }
  }, [lenderMaxPrice, lastSyncedLenderMax, stickyPlannedPrice]);

  const purchasePrice = scenarioPrice ?? lenderMaxPrice;

  const { breakdown, closingCosts, monthlyHousing, equityData } = useMemo(() => {
    const breakdown = monthlyPaymentBreakdown({
      ...inputs,
      homePrice: purchasePrice,
    });

    const closingCosts = estimateClosingCosts(
      purchasePrice,
      inputs.closingCostsPct,
    );

    const schedule = amortizationSchedule({
      loanAmount: Math.max(0, purchasePrice - inputs.downPayment),
      annualRatePct: inputs.interestRate,
      termYears: inputs.loanTermYears,
      extraMonthlyPrincipal: inputs.extraMonthlyPrincipal,
    });

    const equityData = equityOverTime({
      homePrice: purchasePrice,
      downPayment: inputs.downPayment,
      schedule,
      annualAppreciationPct: inputs.annualHomeAppreciationPct,
    });

    return {
      breakdown,
      closingCosts,
      monthlyHousing: breakdown.total,
      equityData,
    };
  }, [inputs, purchasePrice]);

  const closingForSavingsChecks = inputs.includeClosingCostsInSavingsCheck
    ? closingCosts
    : 0;

  const healthLevels = useMemo(() => {
    const mh = breakdown.total;

    const paymentVsIncome = affordabilityComfort({
      monthlyHousing: mh,
      monthlyDebts: inputs.monthlyDebts,
      annualIncome: inputs.annualIncome,
    }).level;

    const buyerRules30303 = comfortAnalysis({
      annualIncome: inputs.annualIncome,
      netWorth,
      homePriceBeingChecked: purchasePrice,
      monthlyHousing: mh,
      downPayment: inputs.downPayment,
      propertyTaxRatePct: inputs.propertyTaxRatePct,
      homeInsuranceAnnual: inputs.homeInsuranceAnnual,
    }).overallLevel;

    const totalDti = dtiHealth({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
      monthlyHousing: mh,
    }).level;

    const tax = estimateNet({
      grossAnnual: inputs.annualIncome,
      stateAbbrev: inputs.stateAbbrev,
      filingStatus: inputs.filingStatus,
      overridePct:
        inputs.effectiveTaxRateOverride === '' ||
        inputs.effectiveTaxRateOverride == null
          ? null
          : Number(inputs.effectiveTaxRateOverride),
    });
    const monthlyNet = tax.net / 12;
    const housingVsTakeHome = housingVsNetHealth(monthlyNet, mh);

    const monthlyCashBuffer = monthlyDiscretionaryBuffer({
      monthlyNet,
      monthlyHousing: mh,
      monthlyDebts: inputs.monthlyDebts,
      annualIncome: inputs.annualIncome,
    }).level;

    const emergencyRunway = emergencyFundCheck({
      currentSavings: inputs.currentSavings,
      downPayment: inputs.downPayment,
      closingCosts: closingForSavingsChecks,
      monthlyHousing: mh,
      monthlyDebts: inputs.monthlyDebts,
      annualIncome: inputs.annualIncome,
    }).level;

    const cashAfterClosing = cashAfterClosingHealth({
      currentSavings: inputs.currentSavings,
      downPayment: inputs.downPayment,
      closingCosts: closingForSavingsChecks,
      annualIncome: inputs.annualIncome,
    }).level;

    return {
      paymentVsIncome,
      buyerRules30303,
      totalDti,
      housingVsTakeHome,
      monthlyCashBuffer,
      emergencyRunway,
      cashAfterClosing,
    };
  }, [
    breakdown.total,
    inputs,
    netWorth,
    purchasePrice,
    closingForSavingsChecks,
  ]);

  return {
    inputs,
    lenderMaxPrice,
    comfortablePrice,
    netWorth,
    lenderBreakdownMonthly,
    lenderMaxLoanAmount,
    purchasePrice,
    setScenarioPrice,
    stickyPlannedPrice,
    setStickyPlannedPrice,
    breakdown,
    closingCosts,
    monthlyHousing,
    equityData,
    healthLevels,
  };
}
