import { useMemo } from 'react';
import Card from './Card.jsx';
import PaymentPieChart, { PIE_COLORS } from './PaymentPieChart.jsx';
import EquityLineChart from './EquityLineChart.jsx';
import DTIIndicator from './DTIIndicator.jsx';
import NetIncomeIndicator from './NetIncomeIndicator.jsx';
import TakeHomeBreakdown from './TakeHomeBreakdown.jsx';
import EmergencyFundCheck from './EmergencyFundCheck.jsx';
import AffordabilityExplorer from './AffordabilityExplorer.jsx';
import BuyerComfortCard from './BuyerComfortCard.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  monthlyPaymentBreakdown,
  amortizationSchedule,
  equityOverTime,
  estimateClosingCosts,
  comfortAnalysis,
} from '../lib/mortgage.js';
import { money } from '../lib/format.js';

export default function ResultsPanel() {
  const { inputs } = useInputs();

  const {
    homePrice,
    breakdown,
    closingCosts,
    monthlyHousing,
    equityData,
    netWorth,
    comfort,
    comfortablePrice,
  } = useMemo(() => {
    const maxMonthlyHousingPayment = maxMonthlyHousingFromIncome({
      annualIncome: inputs.annualIncome,
      monthlyDebts: inputs.monthlyDebts,
    });

    const homePrice = maxAffordableHomePrice({
      maxMonthlyHousingPayment,
      downPayment: inputs.downPayment,
      interestRate: inputs.interestRate,
      loanTermYears: inputs.loanTermYears,
      propertyTaxRatePct: inputs.propertyTaxRatePct,
      homeInsuranceAnnual: inputs.homeInsuranceAnnual,
      hoaMonthly: inputs.hoaMonthly,
      creditScore: inputs.creditScore,
    });

    const breakdown = monthlyPaymentBreakdown({
      ...inputs,
      homePrice,
    });

    const closingCosts = estimateClosingCosts(homePrice, inputs.closingCostsPct);

    const schedule = amortizationSchedule({
      loanAmount: Math.max(0, homePrice - inputs.downPayment),
      annualRatePct: inputs.interestRate,
      termYears: inputs.loanTermYears,
      extraMonthlyPrincipal: inputs.extraMonthlyPrincipal,
    });

    const equityData = equityOverTime({
      homePrice,
      downPayment: inputs.downPayment,
      schedule,
      annualAppreciationPct: inputs.annualHomeAppreciationPct,
    });

    // Net worth comes from its own dedicated slider now. Coerce just in case
    // someone has an old saved value lying around.
    const netWorth = Number(inputs.totalNetWorth) || inputs.currentSavings;

    const comfort = comfortAnalysis({
      annualIncome: inputs.annualIncome,
      netWorth,
      homePriceBeingChecked: homePrice,
      monthlyHousing: breakdown.total,
    });

    // The "comfortable target" we surface in the hero is the IDEAL tier
    // (3x income AND 30% of home in net worth). It's what financial advisors
    // actually recommend.
    const comfortablePrice = Math.max(0, comfort.idealMax);

    return {
      homePrice,
      breakdown,
      closingCosts,
      monthlyHousing: breakdown.total,
      equityData,
      netWorth,
      comfort,
      comfortablePrice,
    };
  }, [inputs]);

  return (
    <div>
      {/* Hero numbers — TWO prices, side by side: lender's max vs comfortable */}
      <Card>
        <div className="hero-prices">
          <div className="hero-price-block stretch">
            <div className="label">Lender's max (28/36 DTI)</div>
            <div className="price">{money(homePrice)}</div>
            <div className="sub">
              What banks will let you do — based on a {money(monthlyHousing)} monthly payment.
            </div>
          </div>

          <div className="hero-price-divider" aria-hidden="true" />

          <div className="hero-price-block comfort">
            <div className="label">Comfortable (30/30/3 + Net Worth)</div>
            <div
              className="price"
              style={{
                color:
                  comfortablePrice < homePrice ? 'var(--green)' : 'var(--brand)',
              }}
            >
              {money(comfortablePrice)}
            </div>
            <div className="sub">
              {comfortablePrice < homePrice
                ? `~${((comfortablePrice / Math.max(1, homePrice)) * 100).toFixed(0)}% of the lender's max — what financial advisors actually recommend.`
                : 'Your situation is comfortable even at the lender\'s max — nice.'}
            </div>
          </div>
        </div>

        <div className="stat-grid mt-16">
          <div className="stat">
            <div className="label">Loan amount</div>
            <div className="value">{money(homePrice - inputs.downPayment)}</div>
          </div>
          <div className="stat">
            <div className="label">Down payment</div>
            <div className="value">
              {money(inputs.downPayment)}
              <div className="text-tiny muted" style={{ fontWeight: 500 }}>
                {homePrice > 0
                  ? `${((inputs.downPayment / homePrice) * 100).toFixed(1)}% of price`
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

      {/* What-if price explorer */}
      <AffordabilityExplorer comfortableMax={homePrice} />

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
          </div>
        </div>
      </Card>

      {/* Buyer comfort rules — checks the lender's-max price against 30/30/3 */}
      <BuyerComfortCard
        annualIncome={inputs.annualIncome}
        netWorth={netWorth}
        homePriceBeingChecked={homePrice}
        monthlyHousing={breakdown.total}
      />

      {/* Health checks */}
      <Card title="Financial health">
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          <DTIIndicator
            annualIncome={inputs.annualIncome}
            monthlyDebts={inputs.monthlyDebts}
            monthlyHousing={breakdown.total}
          />
          <NetIncomeIndicator
            annualIncome={inputs.annualIncome}
            monthlyHousing={breakdown.total}
            monthlyDebts={inputs.monthlyDebts}
            stateAbbrev={inputs.stateAbbrev}
            filingStatus={inputs.filingStatus}
            overridePct={inputs.effectiveTaxRateOverride}
          />
          <EmergencyFundCheck
            currentSavings={inputs.currentSavings}
            downPayment={inputs.downPayment}
            closingCosts={inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0}
            monthlyHousing={breakdown.total}
            monthlyDebts={inputs.monthlyDebts}
            annualIncome={inputs.annualIncome}
          />
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
