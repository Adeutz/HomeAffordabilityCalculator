import { useEffect, useMemo, useRef, useState } from 'react';
import Card from './Card.jsx';
import PaymentPieChart, { PIE_COLORS } from './PaymentPieChart.jsx';
import EquityLineChart from './EquityLineChart.jsx';
import DTIIndicator from './DTIIndicator.jsx';
import NetIncomeIndicator from './NetIncomeIndicator.jsx';
import TakeHomeBreakdown from './TakeHomeBreakdown.jsx';
import EmergencyFundCheck from './EmergencyFundCheck.jsx';
import AffordabilityExplorer from './AffordabilityExplorer.jsx';
import BuyerComfortCard from './BuyerComfortCard.jsx';
import MakeItWorkCard from './MakeItWorkCard.jsx';
import { useInputs } from '../state/InputsContext.jsx';
import {
  maxAffordableHomePrice,
  maxMonthlyHousingFromIncome,
  monthlyPaymentBreakdown,
  amortizationSchedule,
  equityOverTime,
  estimateClosingCosts,
  comfortAnalysis,
  downPaymentForTargetMonthly,
} from '../lib/mortgage.js';
import { estimateNet } from '../lib/taxes.js';
import { money } from '../lib/format.js';

export default function ResultsPanel() {
  const { inputs } = useInputs();
  const isTargetMode = inputs.calculatorMode === 'target';

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

  // Planned purchase price drives every figure on this column.
  // "Sticky" behavior: once the user manually drags the home price slider,
  // it stays put even if the lender max changes (e.g. because they adjusted
  // income). It only auto-sets to lender max on the very first render.
  const [scenarioPrice, setScenarioPrice] = useState(null);
  const userHasAdjusted = useRef(false);

  useEffect(() => {
    if (scenarioPrice == null) {
      setScenarioPrice(lenderMaxPrice);
    }
  }, [lenderMaxPrice]);

  const handleScenarioPriceChange = (price) => {
    userHasAdjusted.current = true;
    setScenarioPrice(price);
  };

  const purchasePrice = isTargetMode
    ? inputs.targetHomePrice
    : scenarioPrice ?? lenderMaxPrice;

  const { breakdown, closingCosts, monthlyHousing, equityData, extraDPForDTI, extraDPForNetIncome, extraSavingsForEmergencyFund } = useMemo(() => {
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

    // --- Health gap calculations ---
    // Shared base inputs for the binary-search solver
    const mortgageBase = {
      homePrice: purchasePrice,
      downPayment: inputs.downPayment,
      interestRate: inputs.interestRate,
      loanTermYears: inputs.loanTermYears,
      propertyTaxRatePct: inputs.propertyTaxRatePct,
      homeInsuranceAnnual: inputs.homeInsuranceAnnual,
      hoaMonthly: inputs.hoaMonthly,
      creditScore: inputs.creditScore,
    };

    const grossMonthly = inputs.annualIncome / 12;

    // DTI: healthy means total DTI ≤ 28% of gross income
    const maxHealthyHousingDTI = Math.max(0, grossMonthly * 0.28 - inputs.monthlyDebts);
    let extraDPForDTI = 0; // 0 = already healthy; null = impossible; positive = extra $ needed
    if (breakdown.total > maxHealthyHousingDTI) {
      if (maxHealthyHousingDTI <= 0) {
        extraDPForDTI = null; // debts alone exceed the 28% cap
      } else {
        const neededDP = downPaymentForTargetMonthly(mortgageBase, maxHealthyHousingDTI);
        extraDPForDTI = neededDP >= purchasePrice ? null : Math.max(0, neededDP - inputs.downPayment);
      }
    }

    // Net income: healthy means housing ≤ 30% of monthly net take-home
    const taxResult = estimateNet({
      grossAnnual: inputs.annualIncome,
      stateAbbrev: inputs.stateAbbrev,
      filingStatus: inputs.filingStatus,
      overridePct: inputs.effectiveTaxRateOverride === '' || inputs.effectiveTaxRateOverride == null
        ? null
        : Number(inputs.effectiveTaxRateOverride),
    });
    const monthlyNet = taxResult.net / 12;
    const maxHealthyHousingNet = monthlyNet * 0.30;
    let extraDPForNetIncome = 0;
    if (breakdown.total > maxHealthyHousingNet && maxHealthyHousingNet > 0) {
      const neededDP = downPaymentForTargetMonthly(mortgageBase, maxHealthyHousingNet);
      extraDPForNetIncome = neededDP >= purchasePrice ? null : Math.max(0, neededDP - inputs.downPayment);
    }

    // Emergency fund: healthy means ≥ 3 months of expenses remain after closing
    const ccForCheck = inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0;
    const remainingSavings = inputs.currentSavings - inputs.downPayment - ccForCheck;
    const livingExpenses = grossMonthly * 0.25;
    const totalMonthlyBurn = breakdown.total + inputs.monthlyDebts + livingExpenses;
    const extraSavingsForEmergencyFund = Math.max(0, totalMonthlyBurn * 3 - remainingSavings);

    return {
      breakdown,
      closingCosts,
      monthlyHousing: breakdown.total,
      equityData,
      extraDPForDTI,
      extraDPForNetIncome,
      extraSavingsForEmergencyFund,
    };
  }, [inputs, purchasePrice]);

  return (
    <div>
      {isTargetMode ? (
        <MakeItWorkCard inputs={inputs} targetHomePrice={purchasePrice} />
      ) : (
        <AffordabilityExplorer
          lenderMaxPrice={lenderMaxPrice}
          scenarioPrice={purchasePrice}
          onScenarioPriceChange={handleScenarioPriceChange}
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
          </div>
        </div>
      </Card>

      {/* Buyer comfort rules — checks the planned price against 30/30/3 */}
      <BuyerComfortCard
        annualIncome={inputs.annualIncome}
        netWorth={netWorth}
        homePriceBeingChecked={purchasePrice}
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
            extraDownPaymentNeeded={extraDPForDTI}
          />
          <NetIncomeIndicator
            annualIncome={inputs.annualIncome}
            monthlyHousing={breakdown.total}
            monthlyDebts={inputs.monthlyDebts}
            stateAbbrev={inputs.stateAbbrev}
            filingStatus={inputs.filingStatus}
            overridePct={inputs.effectiveTaxRateOverride}
            extraDownPaymentNeeded={extraDPForNetIncome}
          />
          <EmergencyFundCheck
            currentSavings={inputs.currentSavings}
            downPayment={inputs.downPayment}
            closingCosts={inputs.includeClosingCostsInSavingsCheck ? closingCosts : 0}
            monthlyHousing={breakdown.total}
            monthlyDebts={inputs.monthlyDebts}
            annualIncome={inputs.annualIncome}
            extraSavingsNeeded={extraSavingsForEmergencyFund}
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
