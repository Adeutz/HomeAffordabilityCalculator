import { useMemo } from 'react';
import Card from './Card.jsx';
import PaymentPieChart, { PIE_COLORS } from './PaymentPieChart.jsx';
import DTIIndicator from './DTIIndicator.jsx';
import NetIncomeIndicator from './NetIncomeIndicator.jsx';
import TakeHomeBreakdown from './TakeHomeBreakdown.jsx';
import EmergencyFundCheck from './EmergencyFundCheck.jsx';
import CashAfterClosingIndicator from './CashAfterClosingIndicator.jsx';
import MonthlyLeftoverCard from './MonthlyLeftoverCard.jsx';
import TaxBenefitCard from './TaxBenefitCard.jsx';
import { money } from '../lib/format.js';
import { estimateMortgageTaxBenefit } from '../lib/taxes.js';

// The "after you recast" mirror of the main results. Same cards the user
// already knows, but fed the lower post-recast monthly payment so they can see
// how their budget, health, and tax picture change.
//
// A recast lowers only the Principal & Interest portion (re-amortized over the
// remaining term at the same rate). Taxes, insurance, and HOA stay the same.
// PMI is dropped automatically if the paid-down balance is now <= 80% of the
// home's price (the usual point where PMI comes off).
export default function RecastScenarioCards({
  inputs,
  purchasePrice,
  closingCosts,
  currentBreakdown,
  recastInfo,
}) {
  const { newPI, balanceAtRecast, remainingMonths, recastYear } = recastInfo;
  const remainingTermYears = remainingMonths / 12;

  // Smart PMI: drop it once you owe <= 80% of the home's value.
  const ltv = purchasePrice > 0 ? balanceAtRecast / purchasePrice : 0;
  const pmiDropped = ltv <= 0.8 && currentBreakdown.pmi > 0;
  const recastPmi = ltv <= 0.8 ? 0 : currentBreakdown.pmi;

  const recastBreakdown = useMemo(
    () => ({
      principalAndInterest: newPI,
      propertyTax: currentBreakdown.propertyTax,
      homeInsurance: currentBreakdown.homeInsurance,
      hoa: currentBreakdown.hoa,
      pmi: recastPmi,
      total:
        newPI +
        currentBreakdown.propertyTax +
        currentBreakdown.homeInsurance +
        currentBreakdown.hoa +
        recastPmi,
    }),
    [newPI, currentBreakdown, recastPmi],
  );

  // Tax benefit re-estimated off the smaller loan and shorter remaining term.
  const recastTaxBenefit = useMemo(
    () =>
      estimateMortgageTaxBenefit({
        grossAnnual: inputs.annualIncome,
        filingStatus: inputs.filingStatus,
        stateAbbrev: inputs.stateAbbrev,
        loanAmount: balanceAtRecast,
        annualRatePct: inputs.interestRate,
        termYears: remainingTermYears,
        homePrice: purchasePrice,
        propertyTaxRatePct: inputs.propertyTaxRatePct,
      }),
    [inputs, balanceAtRecast, remainingTermYears, purchasePrice],
  );

  const effectiveMonthlyAfterTax =
    recastBreakdown.total - recastTaxBenefit.monthlyBenefit;

  const monthlyDrop = currentBreakdown.total - recastBreakdown.total;

  return (
    <div>
      <div
        className="mt-16 mb-8"
        style={{
          borderTop: '2px solid var(--brand)',
          paddingTop: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>After you recast (year {recastYear})</h2>
        <div className="text-small muted mt-4" style={{ lineHeight: 1.5 }}>
          These cards use your <strong>new lower payment</strong> of{' '}
          <strong>{money(recastBreakdown.total)}/mo</strong> — down{' '}
          <strong>{money(monthlyDrop)}/mo</strong> from{' '}
          {money(currentBreakdown.total)}.
          {pmiDropped
            ? ' PMI has dropped off since you now owe 80% or less of the home’s value.'
            : ''}{' '}
          The spending sliders below are shared with the card higher up.
        </div>
      </div>

      {/* Monthly payment breakdown (recast) */}
      <Card title="Monthly payment breakdown — after recast">
        <div className="grid grid-two">
          <PaymentPieChart breakdown={recastBreakdown} />
          <div>
            <BreakdownRow
              color={PIE_COLORS['Principal & Interest']}
              label="Principal & Interest"
              amount={recastBreakdown.principalAndInterest}
            />
            <BreakdownRow
              color={PIE_COLORS['Property Tax']}
              label="Property tax"
              amount={recastBreakdown.propertyTax}
            />
            <BreakdownRow
              color={PIE_COLORS['Home Insurance']}
              label="Home insurance"
              amount={recastBreakdown.homeInsurance}
            />
            <BreakdownRow
              color={PIE_COLORS['HOA']}
              label="HOA"
              amount={recastBreakdown.hoa}
            />
            <BreakdownRow
              color={PIE_COLORS['PMI']}
              label="PMI"
              amount={recastBreakdown.pmi}
            />
            <div className="breakdown-row total">
              <span className="left">Total monthly</span>
              <span className="right">{money(recastBreakdown.total)}</span>
            </div>
            {recastTaxBenefit.monthlyBenefit > 0 && (
              <>
                <div className="breakdown-row">
                  <span className="left text-small muted">
                    Est. tax benefit
                  </span>
                  <span className="right" style={{ color: 'var(--green)' }}>
                    −{money(recastTaxBenefit.monthlyBenefit)}
                  </span>
                </div>
                <div className="breakdown-row total">
                  <span className="left">Effective monthly (after tax)</span>
                  <span className="right">
                    {money(effectiveMonthlyAfterTax)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="text-tiny muted mt-8">
          Recast loan balance {money(balanceAtRecast)} over the remaining{' '}
          {Math.round(remainingTermYears)} years at {inputs.interestRate}%.
        </div>
      </Card>

      <MonthlyLeftoverCard
        monthlyHousing={recastBreakdown.total}
        id="recast-detail-monthly-buffer"
      />

      <TaxBenefitCard
        inputs={{ ...inputs, loanTermYears: remainingTermYears }}
        purchasePrice={purchasePrice}
        loanAmount={balanceAtRecast}
      />

      <Card title="Financial health — after recast">
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          <DTIIndicator
            annualIncome={inputs.annualIncome}
            monthlyDebts={inputs.monthlyDebts}
            monthlyHousing={recastBreakdown.total}
          />
          <NetIncomeIndicator
            annualIncome={inputs.annualIncome}
            monthlyHousing={recastBreakdown.total}
            monthlyDebts={inputs.monthlyDebts}
            stateAbbrev={inputs.stateAbbrev}
            filingStatus={inputs.filingStatus}
            overridePct={inputs.effectiveTaxRateOverride}
            hideSandbox
          />
          <EmergencyFundCheck
            currentSavings={inputs.currentSavings}
            downPayment={inputs.downPayment}
            closingCosts={
              inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0
            }
            monthlyHousing={recastBreakdown.total}
            monthlyDebts={inputs.monthlyDebts}
            annualIncome={inputs.annualIncome}
          />
          <CashAfterClosingIndicator
            currentSavings={inputs.currentSavings}
            downPayment={inputs.downPayment}
            closingCosts={
              inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0
            }
            annualIncome={inputs.annualIncome}
          />
        </div>
      </Card>

      <Card title="Take-home pay breakdown — after recast">
        <TakeHomeBreakdown
          annualIncome={inputs.annualIncome}
          stateAbbrev={inputs.stateAbbrev}
          filingStatus={inputs.filingStatus}
          overridePct={inputs.effectiveTaxRateOverride}
          monthlyHousing={recastBreakdown.total}
          monthlyDebts={inputs.monthlyDebts}
        />
      </Card>
    </div>
  );
}

function BreakdownRow({ color, label, amount }) {
  if (!amount) return null;
  return (
    <div className="breakdown-row">
      <span className="left">
        <span className="swatch" style={{ background: color }} />
        {label}
      </span>
      <span className="right">{money(amount)}</span>
    </div>
  );
}
