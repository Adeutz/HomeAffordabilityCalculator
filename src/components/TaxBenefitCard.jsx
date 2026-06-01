import { useMemo } from 'react';
import Card from './Card.jsx';
import { estimateMortgageTaxBenefit } from '../lib/taxes.js';
import { money } from '../lib/format.js';

export default function TaxBenefitCard({
  inputs,
  purchasePrice,
  loanAmount,
}) {
  const tax = useMemo(
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

  if (loanAmount <= 0) return null;

  return (
    <Card title="Estimated tax benefit (rough)">
      <div className="flex-between stack-sm-start mb-16">
        <div className="text-small muted">
          First-year estimate of federal + state savings from deducting
          mortgage interest and property tax (with the $10k SALT cap), compared
          to taking the standard deduction.
        </div>
        <span className={`pill ${tax.itemizes ? 'green' : 'yellow'}`}>
          <span className="dot" />
          {tax.itemizes ? 'Itemizing helps' : 'Standard deduction wins'}
        </span>
      </div>

      <div className="stat-grid mb-16">
        <div className="stat">
          <div className="label">Est. annual tax savings</div>
          <div className="value" style={{ color: 'var(--green)' }}>
            {money(tax.annualBenefit)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Est. monthly benefit</div>
          <div className="value">{money(tax.monthlyBenefit)}</div>
        </div>
        <div className="stat">
          <div className="label">Year-one interest</div>
          <div className="value">{money(tax.yearOneInterest)}</div>
        </div>
        <div className="stat">
          <div className="label">Property tax (annual)</div>
          <div className="value">{money(tax.annualPropertyTax)}</div>
        </div>
      </div>

      <div className="text-small muted">
        {tax.itemizes ? (
          <>
            Your itemized deductions (~{money(tax.itemizedDeductions)}/yr) beat
            the standard deduction ({money(tax.standardDeduction)}). Federal
            savings ~{money(tax.federalBenefit)}/yr
            {tax.stateBenefit > 0
              ? `, state ~${money(tax.stateBenefit)}/yr`
              : ''}
            .
          </>
        ) : (
          <>
            With these numbers, the standard deduction (
            {money(tax.standardDeduction)}) is larger than itemizing mortgage
            interest + property tax — so buying may not lower your tax bill much
            (yet). This can change as you pay more interest early in the loan.
          </>
        )}
      </div>

      <div className="text-tiny muted mt-12">
        Not tax advice. Real savings depend on other deductions, credits, AMT,
        and your actual tax situation. Talk to a CPA before counting on this.
      </div>
    </Card>
  );
}
