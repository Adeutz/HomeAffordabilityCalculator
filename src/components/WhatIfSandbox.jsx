import { useEffect, useMemo, useState } from 'react';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import { estimateNet } from '../lib/taxes.js';
import { monthlyPaymentBreakdown, housingVsNetHealth } from '../lib/mortgage.js';
import {
  HEALTHY_NET_HOUSING_RATIO,
  minExtraGrossIncomeForHealthyNetHousing,
  minExtraDownPaymentForHealthyNetHousing,
} from '../lib/housingHealthyTargets.js';
import { money, percentFromRatio } from '../lib/format.js';

const MIN_LOAN_PAD = 1000;

/**
 * Interactive “what if I earned more / put more down?” sliders.
 * Does not change global calculator inputs — sandbox only.
 */
export default function WhatIfSandbox({
  annualIncome,
  monthlyHousing,
  stateAbbrev,
  filingStatus,
  overridePct,
  scenarioInputs,
  purchasePrice,
}) {
  const normalizedOverride =
    overridePct === '' || overridePct == null ? null : Number(overridePct);

  const tax = estimateNet({
    grossAnnual: annualIncome,
    stateAbbrev,
    filingStatus,
    overridePct: normalizedOverride,
  });
  const monthlyNet = tax.net / 12;
  const level = housingVsNetHealth(monthlyNet, monthlyHousing);

  const maxSandboxExtraDown = useMemo(
    () =>
      Math.max(
        0,
        purchasePrice - scenarioInputs.downPayment - MIN_LOAN_PAD,
      ),
    [purchasePrice, scenarioInputs.downPayment],
  );

  const [sandboxExtraAnnualIncome, setSandboxExtraAnnualIncome] = useState(0);
  const [sandboxExtraDown, setSandboxExtraDown] = useState(0);

  useEffect(() => {
    setSandboxExtraDown((d) => Math.min(d, maxSandboxExtraDown));
  }, [maxSandboxExtraDown]);

  const clampedExtraDown = Math.min(sandboxExtraDown, maxSandboxExtraDown);

  const incomePathHint = useMemo(
    () =>
      minExtraGrossIncomeForHealthyNetHousing({
        baselineGrossAnnual: annualIncome,
        monthlyHousingPayment: monthlyHousing,
        stateAbbrev,
        filingStatus,
        overridePct,
      }),
    [annualIncome, monthlyHousing, stateAbbrev, filingStatus, overridePct],
  );

  const downPathHint = useMemo(
    () =>
      minExtraDownPaymentForHealthyNetHousing({
        mortgageScenario: scenarioInputs,
        purchasePrice,
        baselineDownPayment: scenarioInputs.downPayment,
        baselineMonthlyNet: monthlyNet,
      }),
    [scenarioInputs, purchasePrice, monthlyNet],
  );

  const whatIfAdjustedDown = scenarioInputs.downPayment + clampedExtraDown;
  const whatIfGrossAnnual = annualIncome + sandboxExtraAnnualIncome;

  const whatIfHousingMonthly = useMemo(
    () =>
      monthlyPaymentBreakdown({
        ...scenarioInputs,
        homePrice: purchasePrice,
        downPayment: whatIfAdjustedDown,
      }).total,
    [scenarioInputs, purchasePrice, whatIfAdjustedDown],
  );

  const whatIfTax = useMemo(
    () =>
      estimateNet({
        grossAnnual: whatIfGrossAnnual,
        stateAbbrev,
        filingStatus,
        overridePct: normalizedOverride,
      }),
    [whatIfGrossAnnual, stateAbbrev, filingStatus, normalizedOverride],
  );

  const whatIfMonthlyNet = whatIfTax.net / 12;
  const whatIfRatio =
    whatIfMonthlyNet > 0 ? whatIfHousingMonthly / whatIfMonthlyNet : 0;
  const whatIfLevel = housingVsNetHealth(whatIfMonthlyNet, whatIfHousingMonthly);

  const sandboxActive =
    sandboxExtraAnnualIncome > 0 || clampedExtraDown > 0;

  return (
    <Card title="What-if sandbox" id="what-if-sandbox">
      <div className="flex-between stack-sm-start mb-12">
        <div className="text-small muted">
          Mix extra income and extra down payment to see what it would take at{' '}
          <strong>{money(purchasePrice)}</strong>. These sliders do{' '}
          <strong>not</strong> change your main inputs on the left.
        </div>
        {sandboxActive && (
          <button
            type="button"
            className="button ghost small"
            onClick={() => {
              setSandboxExtraAnnualIncome(0);
              setSandboxExtraDown(0);
            }}
          >
            Reset
          </button>
        )}
      </div>

      {level !== 'green' && (
        <div
          className="text-small mb-16"
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-soft)',
            border: '1px solid var(--border)',
            lineHeight: 1.5,
          }}
        >
          <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>
            Rough one-lever paths (same house &amp; loan terms)
          </div>
          {incomePathHint.reachable &&
          incomePathHint.extraGrossAnnual != null &&
          incomePathHint.extraGrossAnnual > 0 ? (
            <p className="mb-8 mt-0">
              <strong>Income only:</strong> about{' '}
              <strong>+{money(incomePathHint.extraGrossAnnual)}</strong>/yr gross
              → ~{percentFromRatio(HEALTHY_NET_HOUSING_RATIO, 1)} of take-home.
            </p>
          ) : !incomePathHint.reachable ? (
            <p className="mb-8 mt-0">
              <strong>Income only:</strong> couldn&apos;t reach Healthy by income
              alone in our search range.
            </p>
          ) : null}

          {downPathHint?.reachable &&
          downPathHint.extraDownPayment != null &&
          downPathHint.extraDownPayment > 0 ? (
            <p className="mb-0 mt-0">
              <strong>Down only:</strong> about{' '}
              <strong>+{money(downPathHint.extraDownPayment)}</strong> more down
              at this price.
            </p>
          ) : downPathHint && !downPathHint.reachable ? (
            <p className="mb-0 mt-0">
              <strong>Down only:</strong> even max extra down (
              {money(maxSandboxExtraDown)}) may not be enough — try income or a
              cheaper home.
            </p>
          ) : null}
        </div>
      )}

      <Slider
        label="Extra gross income (annual)"
        value={sandboxExtraAnnualIncome}
        onChange={setSandboxExtraAnnualIncome}
        min={0}
        max={750_000}
        step={2500}
        format="money"
        hint={`Total in sandbox: ${money(whatIfGrossAnnual)}/yr (${money(annualIncome)} base${sandboxExtraAnnualIncome > 0 ? ` + ${money(sandboxExtraAnnualIncome)}` : ''})`}
      />

      {maxSandboxExtraDown > 500 ? (
        <Slider
          label="Extra down payment on this price"
          value={clampedExtraDown}
          onChange={(v) =>
            setSandboxExtraDown(Math.min(Math.max(0, v), maxSandboxExtraDown))
          }
          min={0}
          max={Math.max(10_000, maxSandboxExtraDown)}
          step={2500}
          format="money"
          hint={`Total in sandbox: ${money(whatIfAdjustedDown)} (${money(scenarioInputs.downPayment)} base${clampedExtraDown > 0 ? ` + ${money(clampedExtraDown)}` : ''})`}
          noStretch
        />
      ) : (
        <p className="text-tiny muted">
          Down payment is already almost the full price — not much room to add
          more in this scenario.
        </p>
      )}

      <div
        className="mt-16"
        style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid var(--${whatIfLevel === 'green' ? 'green' : whatIfLevel === 'yellow' ? 'yellow' : 'red'})`,
          background:
            whatIfLevel === 'green'
              ? 'var(--green-soft)'
              : whatIfLevel === 'yellow'
                ? 'var(--yellow-soft)'
                : 'var(--red-soft)',
        }}
      >
        <div className="flex-between stack-sm-start">
          <div>
            <div className="text-small" style={{ fontWeight: 600 }}>
              After your what-if mix
            </div>
            <div className="text-tiny muted mt-4" style={{ lineHeight: 1.45 }}>
              Housing {money(whatIfHousingMonthly)}/mo vs take-home{' '}
              {money(whatIfMonthlyNet)}/mo →{' '}
              <strong>{percentFromRatio(whatIfRatio, 1)}</strong> of net
            </div>
          </div>
          <span className={`pill ${whatIfLevel}`}>
            <span className="dot" />
            {whatIfLevel === 'green'
              ? 'Healthy'
              : whatIfLevel === 'yellow'
                ? 'Still tight'
                : 'Still heavy'}
          </span>
        </div>
        {whatIfLevel === 'green' && sandboxActive && (
          <div className="text-small mt-8">
            Nice — this mix crosses the Healthy line for housing vs take-home.
          </div>
        )}
      </div>
    </Card>
  );
}
