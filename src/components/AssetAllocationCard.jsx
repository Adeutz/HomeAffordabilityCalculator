import { useEffect, useMemo, useState } from 'react';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import EditableMoney from './EditableMoney.jsx';
import {
  computePayoffPlan,
  EXPECTED_MARKET_RETURN_PCT,
  idealMortgageBalances,
  monthlyExpenseBurn,
  PAYOFF_ACCOUNTS,
  payoffVsInvest,
} from '../lib/payoffPlan.js';
import { estimateNet } from '../lib/taxes.js';
import { money, percent } from '../lib/format.js';
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
  interestRate,
  loanTermYears,
  stateAbbrev,
  filingStatus,
  effectiveTaxRateOverride,
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
  const [loanOutstanding, setLoanOutstanding] = useState(loanAmount);
  const [sandboxIncome, setSandboxIncome] = useState(annualIncome);

  useEffect(() => {
    return registerCalculatorExtras('assetAllocation', {
      getExtras: () => ({
        balances,
        emergencyMonths,
        sinkingFunds,
        loanOutstanding,
        sandboxIncome,
      }),
      applyExtras: (data) => {
        if (data.balances) setBalances(data.balances);
        if (data.emergencyMonths != null) setEmergencyMonths(data.emergencyMonths);
        if (data.sinkingFunds != null) setSinkingFunds(data.sinkingFunds);
        if (data.loanOutstanding != null) setLoanOutstanding(data.loanOutstanding);
        if (data.sandboxIncome != null) setSandboxIncome(data.sandboxIncome);
      },
    });
  }, [
    balances,
    emergencyMonths,
    sinkingFunds,
    loanOutstanding,
    sandboxIncome,
    registerCalculatorExtras,
  ]);

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
        loanAmount: loanOutstanding,
        reserveTarget,
      }),
    [balances, cashNeededAtClosing, loanOutstanding, reserveTarget],
  );

  const canPayOff = plan.shortfall <= 0 && plan.reserveShortfall <= 0;

  const sandboxNetAnnual = useMemo(() => {
    const normalizedOverride =
      effectiveTaxRateOverride === '' || effectiveTaxRateOverride == null
        ? null
        : Number(effectiveTaxRateOverride);
    return estimateNet({
      grossAnnual: sandboxIncome,
      stateAbbrev,
      filingStatus,
      overridePct: normalizedOverride,
    }).net;
  }, [sandboxIncome, stateAbbrev, filingStatus, effectiveTaxRateOverride]);

  const idealBalances = useMemo(
    () =>
      idealMortgageBalances({
        grossAnnual: sandboxIncome,
        netAnnual: sandboxNetAnnual,
        annualRatePct: interestRate,
        termYears: loanTermYears,
      }),
    [sandboxIncome, sandboxNetAnnual, interestRate, loanTermYears],
  );

  const investCompare = useMemo(
    () =>
      payoffVsInvest({
        loanOutstanding,
        mortgageRatePct: interestRate,
      }),
    [loanOutstanding, interestRate],
  );

  const setBalance = (key, value) => {
    setBalances((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  };

  return (
    <Card title="Could you pay off this house?">
      <p className="text-small muted mb-16">
        Enter what you actually have in each account. We check whether you could
        cover the down payment + closing, wipe out the mortgage balance you set
        below, and still keep your emergency fund and sinking funds untouched. This is a what-if —
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

      {/* ---- Loan balance ---- */}
      <div className="text-small muted mb-8">
        <strong>Mortgage to pay off</strong>
      </div>

      <div className="allocation-money-row">
        <span className="allocation-money-label">
          Loan balance outstanding
          <span className="text-tiny muted" style={{ display: 'block', fontWeight: 400 }}>
            Already paying this loan? Lower it to what you still owe today.
          </span>
        </span>
        <EditableMoney
          value={loanOutstanding}
          onChange={(v) => setLoanOutstanding(Math.max(0, v))}
          onEditStart={recordUndoPoint}
          ariaLabel="Loan balance outstanding"
        />
      </div>

      <Slider
        label="Quick adjust loan balance"
        value={loanOutstanding}
        onChange={setLoanOutstanding}
        min={0}
        max={Math.max(loanAmount, loanOutstanding, 1)}
        step={1_000}
        hint={
          loanOutstanding !== loanAmount
            ? `Calculator shows ${money(loanAmount)} at purchase — you're using ${money(loanOutstanding)}.`
            : `Full loan at purchase from your inputs: ${money(loanAmount)}.`
        }
      />

      {/* ---- Ideal mortgage balance ---- */}
      <div className="text-small muted mb-8" style={{ marginTop: 16 }}>
        <strong>Ideal mortgage balance for your income</strong>
      </div>

      <div className="allocation-money-row">
        <span className="allocation-money-label">
          Income to base it on
          <span className="text-tiny muted" style={{ display: 'block', fontWeight: 400 }}>
            Gross per year — sandbox only, doesn't change your main inputs
          </span>
        </span>
        <EditableMoney
          value={sandboxIncome}
          onChange={(v) => setSandboxIncome(Math.max(0, v))}
          onEditStart={recordUndoPoint}
          ariaLabel="Income for ideal mortgage balance"
        />
      </div>

      <Slider
        label="Quick adjust income"
        value={sandboxIncome}
        onChange={setSandboxIncome}
        min={0}
        max={Math.max(500_000, sandboxIncome)}
        step={1_000}
        hint={`Take-home estimate: ${money(sandboxNetAnnual)}/yr (${money(sandboxNetAnnual / 12)}/mo).`}
      />

      <IdealBalanceRow
        label="28% rule (lender style)"
        detail={`P&I ≤ 28% of gross pay → ${money(idealBalances.rule28.monthlyPayment)}/mo over ${loanTermYears} yrs at ${percent(interestRate, 2)}`}
        idealBalance={idealBalances.rule28.balance}
        loanOutstanding={loanOutstanding}
      />
      <IdealBalanceRow
        label="Dave Ramsey (conservative)"
        detail={`Payment ≤ 25% of take-home pay on a 15-yr loan at ${percent(interestRate, 2)}`}
        idealBalance={idealBalances.ramsey.balance}
        loanOutstanding={loanOutstanding}
      />

      <div
        className={`allocation-warning ${investCompare.investWins ? 'yellow' : 'green'}`}
        style={{ marginTop: 8 }}
      >
        {investCompare.investWins
          ? `Net worth growth: your ${percent(interestRate, 2)} mortgage is below the ~${EXPECTED_MARKET_RETURN_PCT}% long-run market average. Mathematically, investing the leftover beats rushing the payoff by about ${money(investCompare.annualDollarEdge)}/yr on this balance — but the market return isn't guaranteed and the payoff is.`
          : `Net worth growth: your ${percent(interestRate, 2)} mortgage costs more than the ~${EXPECTED_MARKET_RETURN_PCT}% long-run market average. Paying it off is the better deal — a guaranteed ${percent(interestRate, 2)} return, worth about ${money(investCompare.annualDollarEdge)}/yr versus investing.`}
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
          <CostRow label="Pay off remaining mortgage" amount={loanOutstanding} />
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
        loanAmount={loanOutstanding}
      />
    </Card>
  );
}

function IdealBalanceRow({ label, detail, idealBalance, loanOutstanding }) {
  const over = loanOutstanding - idealBalance;
  const within = over <= 0;
  return (
    <div className="funding-summary" style={{ marginTop: 8 }}>
      <div className="flex-between" style={{ gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="text-small" style={{ fontWeight: 600 }}>
            {label}
          </div>
          <div className="text-tiny muted">{detail}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700 }}>{money(idealBalance)}</div>
          <span className={`pill ${within ? 'green' : 'yellow'}`}>
            <span className="dot" />
            {within ? 'Within target' : 'Over target'}
          </span>
        </div>
      </div>
      <div className="text-tiny muted" style={{ marginTop: 6 }}>
        {within
          ? `Your ${money(loanOutstanding)} balance is ${money(-over)} under this target — room to spare.`
          : `Pay down ~${money(over)} to bring your ${money(loanOutstanding)} balance to this target.`}
      </div>
    </div>
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
      text: `After protecting reserves, you're ${money(plan.shortfall)} short of covering closing + the ${money(loanAmount)} payoff.`,
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
