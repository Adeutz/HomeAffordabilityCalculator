import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import {
  adjustAllocationSplit,
  allocationBuckets,
  balancesAfterDraw,
  computeHouseFunding,
  defaultAllocationPcts,
  DEFAULT_DRAW_ORDER,
  DRAW_SOURCES,
  enable401kSplit,
  fundableBalanceTotal,
  liquidAfterClosing,
  normalizePcts,
  pctsToDollars,
  postPurchaseAllocation,
  POST_HOUSE_BUCKET,
  RETIREMENT_401K_BUCKET,
} from '../lib/assetAllocation.js';
import { emergencyFundCheck } from '../lib/mortgage.js';
import { money, percent } from '../lib/format.js';
import { useInputs } from '../state/InputsContext.jsx';

/**
 * Sandbox card: split net worth, fund a house purchase, see before/after mix.
 * Does not change global calculator inputs.
 */
export default function AssetAllocationCard({
  totalNetWorth: initialNetWorth,
  currentSavings,
  cashNeededAtClosing,
  downPayment,
  closingCosts,
  monthlyHousing,
  monthlyDebts,
  annualIncome,
}) {
  const [totalNetWorth, setTotalNetWorth] = useState(initialNetWorth);
  const [allocationPcts, setAllocationPcts] = useState(() =>
    defaultAllocationPcts(initialNetWorth, currentSavings),
  );
  const [houseFunding, setHouseFunding] = useState(cashNeededAtClosing);
  const [drawOrder, setDrawOrder] = useState(DEFAULT_DRAW_ORDER);
  const [include401k, setInclude401k] = useState(false);
  const { registerCalculatorExtras, recordUndoPoint } = useInputs();

  const buckets = useMemo(
    () => allocationBuckets(include401k),
    [include401k],
  );

  const balances = useMemo(
    () => pctsToDollars(totalNetWorth, allocationPcts, include401k),
    [totalNetWorth, allocationPcts, include401k],
  );

  const fundableTotal = useMemo(
    () => fundableBalanceTotal(balances),
    [balances],
  );

  const maxHouseFunding = Math.max(cashNeededAtClosing, fundableTotal);

  useEffect(() => {
    setHouseFunding((f) => Math.min(f, maxHouseFunding));
  }, [maxHouseFunding]);

  useEffect(() => {
    return registerCalculatorExtras('assetAllocation', {
      getExtras: () => ({
        totalNetWorth,
        allocationPcts,
        houseFunding,
        drawOrder,
        include401k,
      }),
      applyExtras: (data) => {
        if (data.totalNetWorth != null) setTotalNetWorth(data.totalNetWorth);
        if (data.allocationPcts) setAllocationPcts(data.allocationPcts);
        if (data.houseFunding != null) setHouseFunding(data.houseFunding);
        if (data.drawOrder) setDrawOrder(data.drawOrder);
        if (data.include401k != null) setInclude401k(data.include401k);
      },
    });
  }, [
    totalNetWorth,
    allocationPcts,
    houseFunding,
    drawOrder,
    include401k,
    registerCalculatorExtras,
  ]);

  const funding = useMemo(
    () =>
      computeHouseFunding({
        balances,
        houseTarget: houseFunding,
        drawOrder,
      }),
    [balances, houseFunding, drawOrder],
  );

  const afterBalances = useMemo(
    () => balancesAfterDraw(balances, funding.draws),
    [balances, funding.draws],
  );

  const postPurchase = useMemo(
    () =>
      postPurchaseAllocation({
        balancesAfter: afterBalances,
        houseEquity: funding.funded,
        totalNetWorth,
      }),
    [afterBalances, funding.funded, totalNetWorth],
  );

  const liquidRemaining = liquidAfterClosing(afterBalances);

  const emergency = useMemo(
    () =>
      emergencyFundCheck({
        currentSavings: liquidRemaining,
        downPayment: 0,
        closingCosts: 0,
        monthlyHousing,
        monthlyDebts,
        annualIncome,
      }),
    [liquidRemaining, monthlyHousing, monthlyDebts, annualIncome],
  );

  const beforeChart = useMemo(
    () =>
      buckets.map((b) => ({
        name: b.label,
        value: balances[b.key],
        color: b.color,
      })).filter((d) => d.value > 0),
    [buckets, balances],
  );

  const afterChart = useMemo(() => {
    const slices = [
      {
        name: POST_HOUSE_BUCKET.label,
        value: postPurchase.dollars.thisHouse,
        color: POST_HOUSE_BUCKET.color,
      },
      ...buckets
        .filter((b) => b.key !== 'savedForHouse')
        .map((b) => ({
          name: b.label,
          value: postPurchase.dollars[b.key],
          color: b.color,
        })),
      {
        name: 'Cash reserve (unused)',
        value: postPurchase.dollars.savedForHouse,
        color: '#6b7c93',
      },
    ];
    return slices.filter((d) => d.value > 0);
  }, [postPurchase, buckets]);

  const warnings = useMemo(() => {
    const list = [];
    if (funding.shortfall > 0) {
      const retirementNote =
        include401k && (balances.retirement401k ?? 0) > 0
          ? ` Your 401(k) (${money(balances.retirement401k)}) can't be used for the down payment.`
          : '';
      list.push({
        level: 'red',
        text: `You're short ${money(funding.shortfall)} — not enough across fundable buckets to cover ${money(houseFunding)}.${retirementNote}`,
      });
    }
    if (funding.draws.otherHouse > 0) {
      list.push({
        level: 'yellow',
        text: `Pulling ${money(funding.draws.otherHouse)} from other home equity usually means selling, a HELOC, or a bridge loan — slower and riskier than cash.`,
      });
    }
    if (funding.draws.otherInvestments > 0) {
      list.push({
        level: 'yellow',
        text: `Selling ${money(funding.draws.otherInvestments)} of other investments may trigger taxes or lock-in losses.`,
      });
    }
    if (emergency.level === 'red') {
      list.push({
        level: 'red',
        text: `Only ~${Math.max(0, emergency.monthsCovered).toFixed(1)} months of expenses left in liquid cash (${money(liquidRemaining)}). Aim for 3+ months.`,
      });
    } else if (emergency.level === 'yellow') {
      list.push({
        level: 'yellow',
        text: `Liquid cushion is tight: ~${emergency.monthsCovered.toFixed(1)} months of expenses (${money(liquidRemaining)} left).`,
      });
    }
    if (houseFunding < cashNeededAtClosing) {
      list.push({
        level: 'yellow',
        text: `You're funding less than closing needs (${money(cashNeededAtClosing)} down + closing). You'd still need ${money(cashNeededAtClosing - houseFunding)} from somewhere.`,
      });
    }
    return list;
  }, [
    funding,
    houseFunding,
    cashNeededAtClosing,
    emergency,
    liquidRemaining,
    include401k,
    balances.retirement401k,
  ]);

  const onAllocationChange = (key, pct) => {
    setAllocationPcts((cur) => adjustAllocationSplit(cur, key, pct, include401k));
  };

  const onToggle401k = (enabled) => {
    recordUndoPoint();
    setInclude401k(enabled);
    setAllocationPcts((cur) =>
      enabled ? enable401kSplit(cur) : normalizePcts(cur, false),
    );
  };

  const moveDrawPriority = (key, direction) => {
    recordUndoPoint();
    setDrawOrder((order) => {
      const idx = order.indexOf(key);
      if (idx < 0) return order;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= order.length) return order;
      const next = [...order];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  return (
    <Card title="Asset allocation (sandbox)">
      <p className="text-small muted mb-16">
        Split your net worth, choose how much goes into this house, and see what's
        left in brokerage and other buckets. This is a what-if — it does not change
        your main inputs above.
      </p>

      <Slider
        label="Total net worth"
        value={totalNetWorth}
        onChange={setTotalNetWorth}
        min={0}
        max={2_000_000}
        step={5_000}
        hint={
          include401k
            ? 'Includes 401(k) for the big picture — but 401(k) cannot fund the house here.'
            : 'Cash, brokerage, home equity, and other investments. Turn on 401(k) below to include retirement.'
        }
      />

      <label className="allocation-401k-toggle">
        <input
          type="checkbox"
          checked={include401k}
          onChange={(e) => onToggle401k(e.target.checked)}
        />
        <span>
          Include 401(k) in net worth{' '}
          <span className="text-tiny muted">(view only — can't pay for the house)</span>
        </span>
      </label>

      <div className="divider" />

      <div className="text-small muted mb-8">
        <strong>Before purchase</strong> — split 100% across buckets
      </div>

      {buckets.map((bucket) => (
        <div key={bucket.key} className="allocation-bucket-block">
          <BucketAmountLabel
            label={bucket.label}
            dollars={balances[bucket.key]}
            pct={allocationPcts[bucket.key]}
            color={bucket.color}
            locked={bucket.fundable === false}
          />
          <Slider
            label={`${bucket.label} share`}
            value={Math.round(allocationPcts[bucket.key])}
            onChange={(v) => onAllocationChange(bucket.key, v)}
            min={0}
            max={100}
            step={1}
            format="integer"
            noStretch
          />
        </div>
      ))}

      <BeforePurchaseSplit balances={balances} pcts={allocationPcts} buckets={buckets} />

      <div className="divider" />

      <Slider
        label="Put into this house (down + extra)"
        value={houseFunding}
        onChange={setHouseFunding}
        min={0}
        max={maxHouseFunding}
        step={1_000}
        hint={`Closing needs at least ${money(cashNeededAtClosing)} (${money(downPayment)} down + ${money(closingCosts)} closing).`}
      />

      <FundingSummary draws={funding.draws} funded={funding.funded} />

      <div className="divider" />

      <div className="text-small muted mb-8">
        <strong>If you need more than “saved for this house”</strong> — pull from
        these first (tap arrows to reorder)
      </div>

      <div className="draw-priority-list">
        {drawOrder.map((key, idx) => {
          const src = DRAW_SOURCES.find((s) => s.key === key);
          return (
            <div key={key} className="draw-priority-row">
              <span className="draw-priority-rank">{idx + 1}</span>
              <span className="draw-priority-label">
                {src?.label}
                <span className="draw-priority-balance text-tiny muted">
                  {money(balances[key] ?? 0)} ·{' '}
                  {percent(allocationPcts[key] ?? 0, 0)} available
                </span>
              </span>
              <span className="draw-priority-amount text-tiny">
                −{money(funding.draws[key] ?? 0)}
              </span>
              <div className="draw-priority-actions">
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => moveDrawPriority(key, 'up')}
                  disabled={idx === 0}
                  aria-label={`Move ${src?.label} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => moveDrawPriority(key, 'down')}
                  disabled={idx === drawOrder.length - 1}
                  aria-label={`Move ${src?.label} down`}
                >
                  ↓
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="divider" />

      <div className="allocation-charts">
        <AllocationChart
          title="Before"
          data={beforeChart}
          total={totalNetWorth}
        />
        <AllocationChart
          title="After closing"
          data={afterChart}
          total={postPurchase.total}
        />
      </div>

      <div className="stat-grid mt-16">
        <StatWithPct
          label="Liquid left after"
          dollars={liquidRemaining}
          pct={
            postPurchase.total > 0
              ? (liquidRemaining / postPurchase.total) * 100
              : 0
          }
        />
        <StatWithPct
          label="This house equity"
          dollars={postPurchase.dollars.thisHouse}
          pct={postPurchase.pcts.thisHouse}
        />
        <StatWithPct
          label="Brokerage left"
          dollars={postPurchase.dollars.brokerage}
          pct={postPurchase.pcts.brokerage}
        />
        <StatWithPct
          label="Other investments left"
          dollars={postPurchase.dollars.otherInvestments}
          pct={postPurchase.pcts.otherInvestments}
        />
        {include401k && (
          <StatWithPct
            label="401(k) (unchanged)"
            dollars={postPurchase.dollars.retirement401k}
            pct={postPurchase.pcts.retirement401k}
            note="Not used for house"
          />
        )}
      </div>

      <PostPurchaseSplit
        pcts={postPurchase.pcts}
        dollars={postPurchase.dollars}
        buckets={buckets}
      />

      {warnings.length > 0 && (
        <div className="allocation-warnings mt-16">
          {warnings.map((w, i) => (
            <div key={i} className={`allocation-warning ${w.level}`}>
              {w.text}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BucketAmountLabel({ label, dollars, pct, color, locked = false }) {
  return (
    <div className="allocation-bucket-header">
      <span className="allocation-bucket-name">
        <span className="swatch" style={{ background: color }} />
        {label}
        {locked && <span className="allocation-locked-badge">Can't fund house</span>}
      </span>
      <span className="allocation-bucket-values">
        <strong>{money(dollars)}</strong>
        <span className="muted"> · {percent(pct, 0)}</span>
      </span>
    </div>
  );
}

function BeforePurchaseSplit({ balances, pcts, buckets }) {
  return (
    <div className="allocation-split-summary mt-8">
      {buckets.map((b) => (
        <SplitRow
          key={b.key}
          label={b.label}
          color={b.color}
          dollars={balances[b.key]}
          pct={pcts[b.key]}
          locked={b.fundable === false}
        />
      ))}
    </div>
  );
}

function StatWithPct({ label, dollars, pct, note }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{money(dollars)}</div>
      <div className="text-tiny muted">
        {percent(pct ?? 0, 0)} of net worth
        {note ? ` · ${note}` : ''}
      </div>
    </div>
  );
}

function SplitRow({ label, color, dollars, pct, locked = false }) {
  return (
    <div className="allocation-split-row">
      <span className="swatch" style={{ background: color }} />
      <span className="allocation-split-label">
        {label}
        {locked && <span className="allocation-locked-inline"> · can't fund house</span>}
      </span>
      <span className="allocation-split-values">
        <strong>{money(dollars)}</strong>
        <span className="muted"> · {percent(pct ?? 0, 0)}</span>
      </span>
      <span className="allocation-split-bar-wrap">
        <span
          className="allocation-split-bar"
          style={{
            width: `${Math.min(100, pct ?? 0)}%`,
            background: color,
          }}
        />
      </span>
    </div>
  );
}

function FundingSummary({ draws, funded }) {
  const rows = allocationBuckets(false).filter(
    (b) => b.fundable !== false && draws[b.key] > 0,
  );
  if (rows.length === 0) {
    return (
      <div className="text-tiny muted mt-8">
        Drag “Put into this house” above {money(0)} to see funding sources.
      </div>
    );
  }
  return (
    <div className="funding-summary mt-8">
      <div className="text-tiny muted mb-4">
        Funding sources → <strong>{money(funded)}</strong> into the house
      </div>
      {rows.map((b) => (
        <div key={b.key} className="funding-summary-row">
          <span className="swatch" style={{ background: b.color }} />
          <span>{b.label}</span>
          <strong>
            {money(draws[b.key])}
            {funded > 0 && (
              <span className="muted" style={{ fontWeight: 500 }}>
                {' '}
                · {percent((draws[b.key] / funded) * 100, 0)} of funding
              </span>
            )}
          </strong>
        </div>
      ))}
    </div>
  );
}

function AllocationChart({ title, data, total }) {
  return (
    <div className="allocation-chart-block">
      <div className="text-small muted mb-4">{title}</div>
      {data.length === 0 ? (
        <div className="muted text-tiny">No amounts to show.</div>
      ) : (
        <>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="var(--bg-card)"
                  strokeWidth={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [money(value), name]}
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="allocation-legend">
            {data.map((d) => {
              const slicePct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <li key={d.name}>
                  <span className="swatch" style={{ background: d.color }} />
                  <span className="allocation-legend-label">{d.name}</span>
                  <span className="allocation-legend-value">
                    {money(d.value)}
                    <span className="muted"> · {percent(slicePct, 0)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function PostPurchaseSplit({ pcts, dollars, buckets }) {
  const rows = [
    { key: 'thisHouse', label: POST_HOUSE_BUCKET.label, color: POST_HOUSE_BUCKET.color },
    ...buckets.filter((b) => b.key !== 'savedForHouse'),
    { key: 'savedForHouse', label: 'Cash reserve (unused)', color: '#6b7c93' },
  ].filter((r) => (dollars[r.key] ?? 0) > 0);

  return (
    <div className="mt-16">
      <div className="text-small muted mb-8">
        <strong>After closing</strong> — dollars and % of net worth
      </div>
      <div className="allocation-split-summary">
        {rows.map((r) => (
          <SplitRow
            key={r.key}
            label={r.label}
            color={r.color}
            dollars={dollars[r.key]}
            pct={pcts[r.key]}
            locked={r.key === RETIREMENT_401K_BUCKET.key}
          />
        ))}
      </div>
    </div>
  );
}
