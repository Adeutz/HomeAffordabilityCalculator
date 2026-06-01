import { useMemo } from 'react';
import Card from './Card.jsx';
import PaymentPieChart, { PIE_COLORS } from './PaymentPieChart.jsx';
import EquityLineChart from './EquityLineChart.jsx';
import DTIIndicator from './DTIIndicator.jsx';
import NetIncomeIndicator from './NetIncomeIndicator.jsx';
import TakeHomeBreakdown from './TakeHomeBreakdown.jsx';
import EmergencyFundCheck from './EmergencyFundCheck.jsx';
import CashAfterClosingIndicator from './CashAfterClosingIndicator.jsx';
import MonthlyBufferIndicator from './MonthlyBufferIndicator.jsx';
import AffordabilityExplorer from './AffordabilityExplorer.jsx';
import BuyerComfortCard from './BuyerComfortCard.jsx';
import MakeItWorkCard from './MakeItWorkCard.jsx';
import TaxBenefitCard from './TaxBenefitCard.jsx';
import { money } from '../lib/format.js';
import { estimateMortgageTaxBenefit } from '../lib/taxes.js';

/** `scenario` from `useCalculatorScenario()` — keeps results and top lights aligned. */
export default function ResultsPanel({ scenario }) {
  const {
    inputs,
    isTargetMode,
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
    equityData,
  } = scenario;

  const loanAmount = Math.max(0, purchasePrice - inputs.downPayment);

  const taxBenefit = useMemo(
    () =>
      estimateMortgageTaxBenefit({
        grossAnnual: inputs.annualIncome,
        filingStatus: inputs.filingStatus,
        stateAbbrev: inputs.stateAbbrev,
        loanAmount,
        annualRatePct: inputs.interestRate,
        termYears: inputs.loanTermYears,
        homePrice: purchasePrice,
        propertyTaxRatePct: inputs.propertyTaxRatePct,
      }),
    [inputs, purchasePrice, loanAmount],
  );

  const effectiveMonthlyAfterTax = breakdown.total - taxBenefit.monthlyBenefit;

  return (
    <div>
      {isTargetMode ? (
        <MakeItWorkCard inputs={inputs} targetHomePrice={purchasePrice} />
      ) : (
        <AffordabilityExplorer
          lenderMaxPrice={lenderMaxPrice}
          scenarioPrice={purchasePrice}
          onScenarioPriceChange={setScenarioPrice}
          stickyPlannedPrice={stickyPlannedPrice}
          onStickyPlannedPriceChange={setStickyPlannedPrice}
        />
      )}

      {/* Hero numbers — TWO prices, side by side: lender's max vs comfortable */}
      {!isTargetMode && (
      <Card>
        <div className="hero-prices">
          <div className="hero-price-block stretch">
            <div className="label">Lender's max home price (28/36 DTI)</div>
            <div className="price">{money(lenderMaxPrice)}</div>
            <div className="sub">
              Highest purchase price lenders often use with these rules — the
              sticker price on the whole house, not your loan balance. Here your
              loan would be about {money(lenderMaxLoanAmount)} (that price minus your
              down payment), which works out to about {money(lenderBreakdownMonthly)}{' '}
              a month altogether (your mortgage payment, property taxes, homeowner's
              insurance{inputs.hoaMonthly > 0 ? ', and HOA' : ''}).
            </div>
          </div>

          <div className="hero-price-divider" aria-hidden="true" />

          <div className="hero-price-block comfort">
            <div className="label">Comfortable (30/30/3 + Net Worth)</div>
            <div
              className="price"
              style={{
                color:
                  comfortablePrice < lenderMaxPrice ? 'var(--green)' : 'var(--brand)',
              }}
            >
              {money(comfortablePrice)}
            </div>
            <div className="sub">
              {comfortablePrice < lenderMaxPrice
                ? `~${((comfortablePrice / Math.max(1, lenderMaxPrice)) * 100).toFixed(0)}% of the lender's max home price — what financial advisors actually recommend.`
                : 'Your situation is comfortable even at the lender\'s max home price — nice.'}
            </div>
          </div>
        </div>

        <div className="text-small muted mt-16 mb-12">
          Below uses your planned home price{' '}
          <strong>{money(purchasePrice)}</strong>.{' '}
          {purchasePrice !== lenderMaxPrice
            ? 'Move the slider above to change it.'
            : '(same as lender max home price above — slide to try a cheaper or costlier house).'}
        </div>

        <div className="stat-grid mt-16">
          <div className="stat">
            <div className="label">Loan amount</div>
            <div className="value">{money(purchasePrice - inputs.downPayment)}</div>
          </div>
          <div className="stat">
            <div className="label">Down payment</div>
            <div className="value">
              {money(inputs.downPayment)}
              <div className="text-tiny muted" style={{ fontWeight: 500 }}>
                {purchasePrice > 0
                  ? `${((inputs.downPayment / purchasePrice) * 100).toFixed(1)}% of price`
                  : ''}
              </div>
            </div>
          </div>
          <div className="stat">
            <div className="label">Closing costs (est.)</div>
            <div className="value">{money(closingCosts)}</div>
          </div>
          <div className="stat">
            <div className="label">Cash needed at closing</div>
            <div className="value">{money(inputs.downPayment + closingCosts)}</div>
          </div>
        </div>
      </Card>
      )}

      {isTargetMode && (
        <Card>
          <div className="text-small muted mb-12">
            Comparing your target of <strong>{money(purchasePrice)}</strong> to
            what lenders typically allow at your income:{' '}
            <strong>{money(lenderMaxPrice)}</strong>
            {purchasePrice > lenderMaxPrice
              ? ` — you're ${money(purchasePrice - lenderMaxPrice)} over the usual max.`
              : purchasePrice < lenderMaxPrice
                ? ` — you're ${money(lenderMaxPrice - purchasePrice)} under the usual max.`
                : ' — right at the usual max.'}
          </div>
          <div className="stat-grid">
            <div className="stat">
              <div className="label">Loan amount</div>
              <div className="value">{money(purchasePrice - inputs.downPayment)}</div>
            </div>
            <div className="stat">
              <div className="label">Down payment</div>
              <div className="value">
                {money(inputs.downPayment)}
                <div className="text-tiny muted" style={{ fontWeight: 500 }}>
                  {purchasePrice > 0
                    ? `${((inputs.downPayment / purchasePrice) * 100).toFixed(1)}% of price`
                    : ''}
                </div>
              </div>
            </div>
            <div className="stat">
              <div className="label">Closing costs (est.)</div>
              <div className="value">{money(closingCosts)}</div>
            </div>
            <div className="stat">
              <div className="label">Cash needed at closing</div>
              <div className="value">{money(inputs.downPayment + closingCosts)}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Monthly breakdown */}
      <Card title="Monthly payment breakdown">
        <div className="grid grid-two">
          <PaymentPieChart breakdown={breakdown} />
          <div>
            <BreakdownRow color={PIE_COLORS['Principal & Interest']} label="Principal & Interest" amount={breakdown.principalAndInterest} />
            <BreakdownRow color={PIE_COLORS['Property Tax']} label="Property tax" amount={breakdown.propertyTax} />
            <BreakdownRow color={PIE_COLORS['Home Insurance']} label="Home insurance" amount={breakdown.homeInsurance} />
            <BreakdownRow color={PIE_COLORS['HOA']} label="HOA" amount={breakdown.hoa} />
            <BreakdownRow color={PIE_COLORS['PMI']} label="PMI" amount={breakdown.pmi} />
            <div className="breakdown-row total">
              <span className="left">Total monthly</span>
              <span className="right">{money(breakdown.total)}</span>
            </div>
            {taxBenefit.monthlyBenefit > 0 && (
              <>
                <div className="breakdown-row">
                  <span className="left text-small muted">
                    Est. tax benefit
                  </span>
                  <span className="right" style={{ color: 'var(--green)' }}>
                    −{money(taxBenefit.monthlyBenefit)}
                  </span>
                </div>
                <div className="breakdown-row total">
                  <span className="left">Effective monthly (after tax)</span>
                  <span className="right">{money(effectiveMonthlyAfterTax)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <TaxBenefitCard
        inputs={inputs}
        purchasePrice={purchasePrice}
        loanAmount={loanAmount}
      />

      {/* Buyer comfort rules — 30/30/3 (+ NW); third rule uses loan + annual tax & insurance */}
      <BuyerComfortCard
        solverInputs={inputs}
        annualIncome={inputs.annualIncome}
        netWorth={netWorth}
        homePriceBeingChecked={purchasePrice}
        monthlyHousing={breakdown.total}
        downPayment={inputs.downPayment}
        propertyTaxRatePct={inputs.propertyTaxRatePct}
        homeInsuranceAnnual={inputs.homeInsuranceAnnual}
      />

      {/* Health checks */}
      <Card title="Financial health" id="financial-health">
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          <div id="health-detail-total-dti">
            <DTIIndicator
              annualIncome={inputs.annualIncome}
              monthlyDebts={inputs.monthlyDebts}
              monthlyHousing={breakdown.total}
            />
          </div>
          <div id="health-detail-net-housing">
            <NetIncomeIndicator
              annualIncome={inputs.annualIncome}
              monthlyHousing={breakdown.total}
              monthlyDebts={inputs.monthlyDebts}
              stateAbbrev={inputs.stateAbbrev}
              filingStatus={inputs.filingStatus}
              overridePct={inputs.effectiveTaxRateOverride}
              scenarioInputs={inputs}
              purchasePrice={purchasePrice}
            />
          </div>
          <div id="health-detail-monthly-buffer">
            <MonthlyBufferIndicator
              annualIncome={inputs.annualIncome}
              monthlyHousing={breakdown.total}
              monthlyDebts={inputs.monthlyDebts}
              stateAbbrev={inputs.stateAbbrev}
              filingStatus={inputs.filingStatus}
              overridePct={inputs.effectiveTaxRateOverride}
            />
          </div>
          <div id="health-detail-emergency">
            <EmergencyFundCheck
              currentSavings={inputs.currentSavings}
              downPayment={inputs.downPayment}
              closingCosts={inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0}
              monthlyHousing={breakdown.total}
              monthlyDebts={inputs.monthlyDebts}
              annualIncome={inputs.annualIncome}
            />
          </div>
          <div id="health-detail-cash-after-closing">
            <CashAfterClosingIndicator
              currentSavings={inputs.currentSavings}
              downPayment={inputs.downPayment}
              closingCosts={inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0}
              annualIncome={inputs.annualIncome}
            />
          </div>
        </div>
      </Card>

      <Card title="Take-home pay breakdown">
        <TakeHomeBreakdown
          annualIncome={inputs.annualIncome}
          stateAbbrev={inputs.stateAbbrev}
          filingStatus={inputs.filingStatus}
          overridePct={inputs.effectiveTaxRateOverride}
          monthlyHousing={breakdown.total}
          monthlyDebts={inputs.monthlyDebts}
        />
      </Card>

      {/* Equity over time */}
      <Card title={`Equity over ${inputs.loanTermYears} years`}>
        <EquityLineChart data={equityData} />
        <div className="text-tiny muted mt-8">
          Assumes {inputs.annualHomeAppreciationPct}% annual home appreciation.
          Your real numbers will vary.
        </div>
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
