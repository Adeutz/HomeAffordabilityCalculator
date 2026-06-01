import { useMemo } from 'react';
import Card from './Card.jsx';
import { makeItWorkAnalysis } from '../lib/mortgage.js';
import { money } from '../lib/format.js';

const ACTION_COPY = {
  cashShortfall: (a) => ({
    title: `Save ${money(a.amount)} more for closing`,
    detail: `You need ${money(a.cashNeeded)} at closing (down payment + estimated closing costs) but only have ${money(a.currentSavings)} in liquid savings.`,
  }),
  downPayment: (a) =>
    a.reason === 'netIncome'
      ? {
          title: `Add ~${money(a.amount)} to your down payment`,
          detail:
            'This would bring your housing payment down to 30% or less of your take-home pay.',
        }
      : {
          title: `Add ~${money(a.amount)} to your down payment`,
          detail:
            'This would bring your housing payment within the 28% DTI rule lenders like to see.',
        },
  debtPayoff: (a) => ({
    title: `Pay off ~${money(a.amount)}/mo in other debts`,
    detail:
      'Car loans, credit cards, student loans — reducing these frees room in your debt-to-income ratio.',
  }),
  income: (a) => ({
    title: `Earn ~${money(a.amount)} more per year`,
    detail: `You'd need about ${money(a.targetIncome)}/yr gross income for lenders to typically approve this price.`,
  }),
  emergencyFund: (a) => ({
    title: `Save ~${money(a.amount)} more before buying`,
    detail:
      'Keep a 3-month emergency fund after closing. Adding more down payment makes this worse — you need more total savings.',
  }),
  tooExpensive: (a) => ({
    title: 'This price is above what lenders will approve',
    detail: `At your current income, lenders would typically cap you around ${money(a.lenderMaxAtCurrentIncome)}. You may need a cheaper home, much more down, or higher income.`,
  }),
};

export default function MakeItWorkCard({ inputs, targetHomePrice }) {
  const analysis = useMemo(
    () => makeItWorkAnalysis(inputs, targetHomePrice),
    [inputs, targetHomePrice],
  );

  const headPill = analysis.allClear
    ? 'Ready to go'
    : analysis.actions.some((a) => a.level === 'red')
      ? 'Needs work'
      : 'Close — a few tweaks';

  const headLevel = analysis.allClear
    ? 'green'
    : analysis.actions.some((a) => a.level === 'red')
      ? 'red'
      : 'yellow';

  return (
    <Card title="What you need to make it work">
      <div className="flex-between stack-sm-start mb-16">
        <div>
          <div className="text-small muted">House you're looking at</div>
          <div className="explorer-price" style={{ marginTop: 4 }}>
            {money(targetHomePrice)}
          </div>
          <div className="text-tiny muted">
            {money(analysis.monthlyHousing)}/mo estimated ·{' '}
            {analysis.lenderApproves
              ? 'Lenders would likely approve'
              : 'Above typical lender limits'}
          </div>
        </div>
        <span className={`pill ${headLevel}`}>
          <span className="dot" />
          {headPill}
        </span>
      </div>

      {analysis.allClear ? (
        <div className="make-it-work-success">
          <strong>You're in good shape for this price.</strong> Your numbers
          pass lender rules, take-home comfort, and emergency-fund checks with
          your current inputs. Still double-check with a real lender before
          making an offer.
        </div>
      ) : (
        <ol className="make-it-work-list">
          {analysis.actions.map((action) => {
            const copy = ACTION_COPY[action.kind]?.(action);
            if (!copy) return null;
            return (
              <li key={action.id} className={`make-it-work-item ${action.level}`}>
                <span className="make-it-work-num" aria-hidden="true">
                  {action.level === 'red' ? '!' : '→'}
                </span>
                <div>
                  <div className="make-it-work-title">{copy.title}</div>
                  <div className="text-small muted">{copy.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="text-tiny muted mt-16">
        Tip: drag the sliders on the left to try changes — the list above
        updates live. You can mix options (e.g. save more <em>and</em> pay off
        a car loan).
      </div>
    </Card>
  );
}
