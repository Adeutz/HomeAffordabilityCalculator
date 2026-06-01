import { useEffect, useMemo, useState } from 'react';
import Slider from './Slider.jsx';
import { estimateNet } from '../lib/taxes.js';
import { monthlyPaymentBreakdown, housingVsNetHealth } from '../lib/mortgage.js';
import {
  HEALTHY_NET_HOUSING_RATIO,
  minExtraGrossIncomeForHealthyNetHousing,
  minExtraDownPaymentForHealthyNetHousing,
} from '../lib/housingHealthyTargets.js';
import { money, percentFromRatio } from '../lib/format.js';

const COPY = {
  green: 'Plenty of breathing room in your monthly budget.',
  yellow: 'Doable but tight — close to "house poor" territory.',
  red: 'House poor zone — most of your take-home pay goes to housing.',
};

export default function NetIncomeIndicator({
  annualIncome,
  monthlyHousing,
  monthlyDebts,
  stateAbbrev,
  filingStatus,
  overridePct,
  scenarioInputs,
  purchasePrice,
  hideSandbox = false,
}) {
  const hasSandbox =
    !hideSandbox &&
    scenarioInputs != null &&
    Number.isFinite(purchasePrice) &&
    purchasePrice > 0;

  const normalizedOverride =
    overridePct === '' || overridePct == null ? null : Number(overridePct);

  const tax = estimateNet({
    grossAnnual: annualIncome,
    stateAbbrev,
    filingStatus,
    overridePct: normalizedOverride,
  });
  const monthlyNet = tax.net / 12;

  const housingRatio = monthlyNet > 0 ? monthlyHousing / monthlyNet : 0;
  const totalRatio =
    monthlyNet > 0 ? (monthlyHousing + monthlyDebts) / monthlyNet : 0;
  const level = housingVsNetHealth(monthlyNet, monthlyHousing);

  const MIN_LOAN_PAD = 1000;
  const maxSandboxExtraDown = useMemo(() => {
    if (!hasSandbox) return 0;
    return Math.max(
      0,
      purchasePrice - scenarioInputs.downPayment - MIN_LOAN_PAD,
    );
  }, [hasSandbox, purchasePrice, scenarioInputs]);

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
    [
      annualIncome,
      monthlyHousing,
      stateAbbrev,
      filingStatus,
      overridePct,
    ],
  );

  const downPathHint = useMemo(() => {
    if (!hasSandbox) return null;
    return minExtraDownPaymentForHealthyNetHousing({
      mortgageScenario: scenarioInputs,
      purchasePrice,
      baselineDownPayment: scenarioInputs.downPayment,
      baselineMonthlyNet: monthlyNet,
    });
  }, [
    hasSandbox,
    scenarioInputs,
    purchasePrice,
    monthlyNet,
  ]);

  const whatIfAdjustedDown = hasSandbox
    ? scenarioInputs.downPayment + clampedExtraDown
    : 0;

  const whatIfGrossAnnual = annualIncome + sandboxExtraAnnualIncome;

  const whatIfHousingMonthly = useMemo(() => {
    if (!hasSandbox) return null;
    const down = whatIfAdjustedDown;
    return monthlyPaymentBreakdown({
      ...scenarioInputs,
      homePrice: purchasePrice,
      downPayment: down,
    }).total;
  }, [hasSandbox, scenarioInputs, purchasePrice, whatIfAdjustedDown]);

  const whatIfTax = useMemo(
    () =>
      estimateNet({
        grossAnnual: annualIncome + sandboxExtraAnnualIncome,
        stateAbbrev,
        filingStatus,
        overridePct: normalizedOverride,
      }),
    [
      annualIncome,
      sandboxExtraAnnualIncome,
      stateAbbrev,
      filingStatus,
      normalizedOverride,
    ],
  );

  const whatIfMonthlyNet = whatIfTax.net / 12;
  const whatIfRatio =
    whatIfMonthlyNet > 0 && whatIfHousingMonthly != null
      ? whatIfHousingMonthly / whatIfMonthlyNet
      : 0;
  const whatIfLevel =
    whatIfHousingMonthly != null
      ? housingVsNetHealth(whatIfMonthlyNet, whatIfHousingMonthly)
      : 'yellow';

  const sandboxActive =
    sandboxExtraAnnualIncome > 0 || clampedExtraDown > 0;

  return (
    <div className="indicator-card">
      <div className="indicator-head">
        <div>
          <div className="text-small muted">Housing % of take-home pay</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {percentFromRatio(housingRatio, 1)}
          </div>
        </div>
        <span className={`pill ${level}`}>
          <span className="dot" />
          {level === 'green'
            ? 'Healthy'
            : level === 'yellow'
              ? 'Tight'
              : 'House poor'}
        </span>
      </div>

      <div className="indicator-bar">
        <div
          className="fill"
          style={{
            width: `${Math.min(100, housingRatio * 100)}%`,
            background: `var(--${level})`,
          }}
        />
      </div>

      <div className="indicator-explain">{COPY[level]}</div>

      <div
        className="text-tiny muted"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}
      >
        <span>
          <strong>Take-home:</strong> {money(monthlyNet)}/mo ({money(tax.net)}/yr)
        </span>
        <span>
          <strong>Effective tax:</strong> {tax.effectiveRatePct.toFixed(1)}%
          {tax.isOverride ? ' (your override)' : ' (estimated)'}
        </span>
        <span>
          <strong>Housing + debts:</strong> {percentFromRatio(totalRatio, 1)}{' '}
          of net
        </span>
      </div>

      <p className="text-tiny muted mt-16" style={{ lineHeight: 1.45 }}>
        <strong>Healthy band:</strong>{' '}
        {percentFromRatio(HEALTHY_NET_HOUSING_RATIO, 1)} or less of your
        take-home going only to housing. These are guesses from your sliders —
        still map to what you feel each month.
      </p>

      {hideSandbox && (
        <p className="text-tiny muted mt-12">
          <a href="#what-if-sandbox">Play with the what-if sandbox</a> above to
          try extra income or down payment without changing your main sliders.
        </p>
      )}

      {level === 'green' && hasSandbox && (
        <p className="text-tiny muted mt-12" style={{ lineHeight: 1.45 }}>
          You&apos;re already in the Healthy band here — the sandbox below is
          just for &quot;what if I earned more or put more down&quot; without
          touching the rest of the app.
        </p>
      )}

      {level !== 'green' && hasSandbox && (
        <div className="text-small mt-12" style={{ lineHeight: 1.5 }}>
          <div className="text-small muted" style={{ fontWeight: 600 }}>
            Rough “one lever at a time” paths (same house price &amp; loan terms)
          </div>
          {incomePathHint.reachable &&
          incomePathHint.extraGrossAnnual != null &&
          incomePathHint.extraGrossAnnual > 0 ? (
            <p className="mb-8 mt-8">
              <strong>Income only:</strong> about{' '}
              <strong>+{money(incomePathHint.extraGrossAnnual)}</strong> more
              gross per year (before tax) would pull housing down to about{' '}
              {percentFromRatio(HEALTHY_NET_HOUSING_RATIO, 1)} of take-home, if
              your payment stayed the same. That&apos;s roughly{' '}
              <strong>
                {money(annualIncome + incomePathHint.extraGrossAnnual)}/yr
              </strong>{' '}
              total gross (<strong>{money(annualIncome)}</strong> from your sliders
              + <strong>{money(incomePathHint.extraGrossAnnual)}</strong>).
            </p>
          ) : incomePathHint.reachable ? null : (
            <p className="mb-8 mt-8">
              <strong>Income only:</strong> with this tax model we couldn’t reach
              Healthy by income alone in the range we searched — check with a
              real advisor.
            </p>
          )}

          {downPathHint && !downPathHint.reachable ? (
            <p className="mb-0">
              <strong>Down payment only:</strong> bumping cash toward this price (
              up to ~{money(maxSandboxExtraDown)} more in our model) didn&apos;t get
              the payment small enough vs your take-home — try income, cheaper
              home, or a better rate too.
            </p>
          ) : null}

          {downPathHint &&
            downPathHint.reachable &&
            downPathHint.extraDownPayment != null &&
            downPathHint.extraDownPayment > 0 ? (
              <p className="mb-0">
                <strong>Down payment only:</strong> about{' '}
                <strong>+{money(downPathHint.extraDownPayment)}</strong> more
                toward your down at <strong>{money(purchasePrice)}</strong> would
                shrink the monthly payment enough to land near{' '}
                {percentFromRatio(HEALTHY_NET_HOUSING_RATIO, 1)} of{' '}
                <em>today’s</em> take-home. That&apos;s roughly{' '}
                <strong>
                  {money(scenarioInputs.downPayment + downPathHint.extraDownPayment)}
                </strong>{' '}
                total down (<strong>{money(scenarioInputs.downPayment)}</strong>{' '}
                from your sliders +{' '}
                <strong>{money(downPathHint.extraDownPayment)}</strong>).
              </p>
            ) : null}
        </div>
      )}

      {hasSandbox && (
        <>
          <div className="divider mt-16" />

          <div className="flex-between stack-sm-start mt-8 mb-8">
            <div>
              <div className="text-small" style={{ fontWeight: 600 }}>
                What-if sandbox
              </div>
              <div className="text-tiny muted">
                Sliders here do <strong>not</strong> change the rest of the
                calculator — mix extra income and extra down to see what it
                would take.
              </div>
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
                Reset sandbox
              </button>
            )}
          </div>

          <Slider
            label="Extra gross income (annual, what-if)"
            value={sandboxExtraAnnualIncome}
            onChange={setSandboxExtraAnnualIncome}
            min={0}
            max={750_000}
            step={2500}
            format="money"
            hint="Pretend a raise, bonus, or second job — taxes re-estimated off the higher gross."
          />

          <p className="text-tiny muted mt-8" style={{ lineHeight: 1.45 }}>
            <strong>Total gross income</strong> in this sandbox:{' '}
            <strong>{money(whatIfGrossAnnual)}</strong>/yr (
            {money(annualIncome)} from the main sliders
            {sandboxExtraAnnualIncome > 0
              ? ` + ${money(sandboxExtraAnnualIncome)} extra here`
              : ' — add extra above to raise it'}
            ).
          </p>

          {maxSandboxExtraDown > 500 ? (
            <Slider
              label="Extra down payment on this price (what-if)"
              value={clampedExtraDown}
              onChange={(v) =>
                setSandboxExtraDown(
                  Math.min(Math.max(0, v), maxSandboxExtraDown),
                )
              }
              min={0}
              max={Math.max(10_000, maxSandboxExtraDown)}
              step={2500}
              format="money"
              hint="Pretend you bring more cash to closing at the same listed price — smaller loan, often less PMI."
              noStretch
            />
          ) : (
            <p className="text-tiny muted">
              Extra-down sandbox needs wiggle room on this loan size — your
              down is already eating almost the whole price in this scenario.
            </p>
          )}

          {maxSandboxExtraDown > 500 && (
            <p className="text-tiny muted mt-8 mb-8" style={{ lineHeight: 1.45 }}>
              <strong>Total down payment</strong> in this sandbox:{' '}
              <strong>{money(whatIfAdjustedDown)}</strong> (
              {money(scenarioInputs.downPayment)} from the main sliders
              {clampedExtraDown > 0
                ? ` + ${money(clampedExtraDown)} extra here`
                : ' — add extra above to raise it'}
              ).
            </p>
          )}

          {whatIfHousingMonthly != null && (
            <div
              className="mt-16"
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-soft)',
              }}
            >
              <div className="text-small muted" style={{ fontWeight: 600 }}>
                After your what-if mix
              </div>
              <div className="text-tiny muted mt-4" style={{ lineHeight: 1.45 }}>
                <strong>Total gross income:</strong>{' '}
                <strong>{money(whatIfGrossAnnual)}</strong>/yr (
                {money(annualIncome)} base +{' '}
                {money(sandboxExtraAnnualIncome)} sandbox){' · '}
                <strong>Total down payment:</strong>{' '}
                <strong>{money(whatIfAdjustedDown)}</strong> (
                {money(scenarioInputs.downPayment)} base +{' '}
                {money(clampedExtraDown)} sandbox){' · '}
                Housing about <strong>{money(whatIfHousingMonthly)}/mo</strong>{' '}
                vs take-home about <strong>{money(whatIfMonthlyNet)}/mo</strong>{' '}
                →{' '}
                <strong>{percentFromRatio(whatIfRatio, 1)}</strong> of net to
                housing.
              </div>
              <div className="flex-between stack-sm-start mt-8">
                <span className={`pill ${whatIfLevel}`}>
                  <span className="dot" />
                  {whatIfLevel === 'green'
                    ? 'Healthy'
                    : whatIfLevel === 'yellow'
                      ? 'Still tight'
                      : 'Still heavy'}
                </span>
                {whatIfLevel === 'green' && (
                  <span className="text-tiny muted">
                    Nice — in this sandbox you crossed the Healthy line.
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
