import { useEffect, useMemo, useState } from 'react';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import EditableMoney from './EditableMoney.jsx';
import {
  computePayoffPlan,
  monthlyExpenseBurn,
  PAYOFF_ACCOUNTS,
} from '../lib/payoffPlan.js';
import { money } from '../lib/format.js';
import { useInputs } from '../state/InputsContext.jsx';

/**
 * "Could I pay off this house?" sandbox.
 * Type real account balances, set reserves (emergency + sinking funds), and
 * see what's left if you cleared the mortgage. Does not change main inputs.
 */
export default function AssetAllocationCard({
  currentSavings,
  cashNeededAtClosing,
  downPayment,
  closingCosts,
  loanAmount,
  monthlyHousing,
  monthlyDebts,
  annualIncome,
}) {
  const { registerCalculatorExtras, recordUndoPoint } = useInputs();

  const [balances, setBalances] = useState(() => ({
    cash: currentSavings,
    brokerage: 0,
    otherInvestments: 0,
    otherHouseEquity: 0,
    retirement401k: 0,
  }));
  const [emergencyMonths, setEmergencyMonths] = useState(3);
  const [sinkingFunds, setSinkingFunds] = useState(0);

  useEffect(() => {
    return registerCalculatorExtras('assetAllocation', {
      getExtras: () => ({ balances, emergencyMonths, sinkingFunds }),
      applyExtras: (data) => {
        if (data.balances) setBalances(data.balances);
        if (data.emergencyMonths != null) setEmergencyMonths(data.emergencyMonths);
        if (data.sinkingFunds != null) setSinkingFunds(data.sinkingFunds);
      },
    });
  }, [balances, emergencyMonths, sinkingFunds, registerCalculatorExtras]);

  const monthlyBurn = useMemo(
    () => monthlyExpenseBurn({ annualIncome, monthlyHousing, monthlyDebts }),
    [annualIncome, monthlyHousing, monthlyDebts],
  );

  const emergencyTarget = monthlyBurn * emergencyMonths;
  const reserveTarget = emergencyTarget + sinkingFunds;

  const plan = useMemo(
    () =>
      computePayoffPlan({
        balances,
        cashNeededAtClosing,
        loanAmount,
        reserveTarget,
      }),
    [balances, cashNeededAtClosing, loanAmount, reserveTarget],
  );

  const canPayOff = plan.shortfall <= 0 && plan.reserveShortfall <= 0;

  const setBalance = (key, value) => {
    setBalances((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  };

  return (
    <Card title="Could you pay off this house?">
      <p className="text-small muted mb-16">
        Enter what you actually have in each account. We check whether you could
        cover the down payment + closing, wipe out the whole mortgage, and still
        keep your emergency fund and sinking funds untouched. This is a what-if —
        it does not change your main inputs above.
      </p>

      {/* ---- Account balances ---- */}
      <div className="text-small muted mb-8">
        <strong>Your accounts</strong> — tap a number to type it
      </div>

      {PAYOFF_ACCOUNTS.map((acct) => (
        <div key={acct.key} className="allocation-money-row">
          <span className="allocation-money-label">
            <span className="swatch" style={{ background: acct.color }} />{' '}
            {acct.label}
            {acct.excluded && (
              <span className="allocation-locked-badge">Not counted</span>
            )}
          </span>
          <EditableMoney
            value={balances[acct.key]}
            onChange={(v) => setBalance(acct.key, v)}
            onEditStart={recordUndoPoint}
            ariaLabel={`${acct.label} balance`}
          />
        </div>
      ))}

      <div className="text-tiny muted mb-12">
        401(k) is shown for the big picture but never used for the house or
        reserves. Other-house equity can help pay off the loan (by selling or
        borrowing against it) but does not count toward reserves.
      </div>

      <div className="divider" />

      {/* ---- Reserves ---- */}
      <div className="text-small muted mb-8">
        <strong>Reserves to keep untouched</strong>
      </div>

      <Slider
        label="Emergency fund (months of expenses)"
        value={emergencyMonths}
        onChange={setEmergencyMonths}
        min={0}
        max={12}
        step={0.5}
        format="integer"
        noStretch
        hint={`${money(monthlyBurn)}/mo burn (housing + debts + ~25% of income for living costs) → ${money(emergencyTarget)} target`}
      />

      <div className="allocation-money-row">
        <span className="allocation-money-label">
          Sinking funds
          <span className="text-tiny muted" style={{ display: 'block', fontWeight: 400 }}>
            Car repairs, vacations, new roof — money already spoken for
          </span>
        </span>
        <EditableMoney
          value={sinkingFunds}
          onChange={(v) => setSinkingFunds(Math.max(0, v))}
          onEditStart={recordUndoPoint}
          ariaLabel="Sinking funds amount"
        />
      </div>

      <div className="allocation-money-row" style={{ marginTop: 4 }}>
        <span className="allocation-money-label muted">Total reserves</span>
        <strong>{money(reserveTarget)}</strong>
      </div>

      <div className="divider" />

      {/* ---- The verdict ---- */}
      <div className="payoff-verdict">
        <div className="flex-between stack-sm-start mb-12">
          <div>
            <div className="text-small muted">
              Left over after closing + full payoff + reserves
            </div>
            <div
              className="explorer-price"
              style={{
                marginTop: 4,
                color: plan.leftoverFree >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {money(plan.leftoverFree)}
            </div>
          </div>
          <span className={`pill ${canPayOff ? 'green' : 'red'}`}>
            <span className="dot" />
            {canPayOff ? 'Payoff works' : 'Not enough'}
          </span>
        </div>

        <div className="funding-summary">
          <CostRow label={`Down payment (${money(downPayment)}) + closing (${money(closingCosts)})`} amount={cashNeededAtClosing} />
          <CostRow label="Pay off remaining mortgage" amount={loanAmount} />
          <CostRow label={`Reserves kept aside (${emergencyMonths} mo + sinking)`} amount={reserveTarget} />
          <div className="funding-summary-row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span><strong>Total needed</strong></span>
            <strong style={{ marginLeft: 'auto' }}>{money(plan.need + reserveTarget)}</strong>
          </div>
          <div className="funding-summary-row">
            <span>Your fundable money (excl. 401(k))</span>
            <strong style={{ marginLeft: 'auto' }}>{money(plan.totalFundable)}</strong>
          </div>
        </div>
      </div>

      {/* ---- Where the leftover sits ---- */}
      <div className="mt-16">
        <div className="text-small muted mb-8">
          <strong>After paying everything</strong> — what's left in each account
          (reserves still live inside these balances)
        </div>
        {PAYOFF_ACCOUNTS.map((acct) => (
          <RemainingRow
            key={acct.key}
            label={acct.label}
            color={acct.color}
            amount={plan.remaining[acct.key] ?? 0}
            total={plan.totalFundable}
            excluded={acct.excluded}
          />
        ))}
      </div>

      {/* ---- Warnings ---- */}
      <PayoffWarnings
        plan={plan}
        reserveTarget={reserveTarget}
        emergencyMonths={emergencyMonths}
        loanAmount={loanAmount}
      />
    </Card>
  );
}

function CostRow({ label, amount }) {
  return (
    <div className="funding-summary-row">
      <span>{label}</span>
      <strong style={{ marginLeft: 'auto' }}>−{money(amount)}</strong>
    </div>
  );
}

function RemainingRow({ label, color, amount, total, excluded = false }) {
  const pct = total > 0 ? Math.min(100, (amount / total) * 100) : 0;
  return (
    <div className="allocation-split-row">
      <span className="swatch" style={{ background: color }} />
      <span className="allocation-split-label">
        {label}
        {excluded && (
          <span className="allocation-locked-inline"> · untouched</span>
        )}
      </span>
      <span className="allocation-split-values">
        <strong>{money(amount)}</strong>
      </span>
      <span className="allocation-split-bar-wrap">
        <span
          className="allocation-split-bar"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
    </div>
  );
}

function PayoffWarnings({ plan, reserveTarget, emergencyMonths, loanAmount }) {
  const warnings = [];

  if (plan.reserveShortfall > 0) {
    warnings.push({
      level: 'red',
      text: `Your liquid accounts can't even cover the ${money(reserveTarget)} reserve target — you're ${money(plan.reserveShortfall)} short before any house spending.`,
    });
  }
  if (plan.shortfall > 0) {
    warnings.push({
      level: 'red',
      text: `After protecting reserves, you're ${money(plan.shortfall)} short of covering closing + the full ${money(loanAmount)} payoff.`,
    });
  }
  if (plan.shortfall <= 0 && plan.reserveShortfall <= 0 && plan.spent.otherHouseEquity > 0) {
    warnings.push({
      level: 'yellow',
      text: `The plan leans on ${money(plan.spent.otherHouseEquity)} of other-house equity. Getting at that money means selling or borrowing against that home — slow and not guaranteed.`,
    });
  }
  if (plan.shortfall <= 0 && plan.reserveShortfall <= 0 && (plan.spent.brokerage > 0 || plan.spent.otherInvestments > 0)) {
    warnings.push({
      level: 'yellow',
      text: `Selling ${money((plan.spent.brokerage ?? 0) + (plan.spent.otherInvestments ?? 0))} of investments may trigger capital gains taxes — the real leftover could be smaller.`,
    });
  }
  if (emergencyMonths < 3) {
    warnings.push({
      level: 'yellow',
      text: 'Your emergency fund target is under 3 months of expenses — most advisors suggest 3–6 months, especially as a homeowner.',
    });
  }

  if (warnings.length === 0) return null;
  return (
    <div className="allocation-warnings mt-16">
      {warnings.map((w, i) => (
        <div key={i} className={`allocation-warning ${w.level}`}>
          {w.text}
        </div>
      ))}
    </div>
  );
}
