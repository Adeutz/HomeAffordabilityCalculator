import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from './Card.jsx';
import Slider from './Slider.jsx';
import {
  adjustAllocationSplit,
  ALLOCATION_BUCKETS,
  balancesAfterDraw,
  computeHouseFunding,
  defaultAllocationPcts,
  DEFAULT_DRAW_ORDER,
  DRAW_SOURCES,
  liquidAfterClosing,
  pctsToDollars,
  postPurchaseAllocation,
  POST_HOUSE_BUCKET,
} from '../lib/assetAllocation.js';
import { emergencyFundCheck } from '../lib/mortgage.js';
import { money, percent } from '../lib/format.js';

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

  const balances = useMemo(
    () => pctsToDollars(totalNetWorth, allocationPcts),
    [totalNetWorth, allocationPcts],
  );

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
      ALLOCATION_BUCKETS.map((b) => ({
        name: b.label,
        value: balances[b.key],
        color: b.color,
      })).filter((d) => d.value > 0),
    [balances],
  );

  const afterChart = useMemo(() => {
    const slices = [
      {
        name: POST_HOUSE_BUCKET.label,
        value: postPurchase.dollars.thisHouse,
        color: POST_HOUSE_BUCKET.color,
      },
      ...ALLOCATION_BUCKETS.filter((b) => b.key !== 'savedForHouse').map((b) => ({
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
  }, [postPurchase]);

  const warnings = useMemo(() => {
    const list = [];
    if (funding.shortfall > 0) {
      list.push({
        level: 'red',
        text: `You're short ${money(funding.shortfall)} — not enough across these buckets to fund ${money(houseFunding)}.`,
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
  ]);

  const onAllocationChange = (key, pct) => {
    setAllocationPcts((cur) => adjustAllocationSplit(cur, key, pct));
  };

  const moveDrawPriority = (key, direction) => {
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

  const maxHouseFunding = Math.max(cashNeededAtClosing, totalNetWorth);

  return (
    <Card title="Asset allocation (sandbox)">
      <p className="text-small muted mb-16">
        Split your net worth, choose how much goes into this house, and see what's
        left in brokerage and other buckets. This is a what-if — it does not change
        your main inputs above. Retirement accounts are not included.
      </p>

      <Slider
        label="Total net worth (excl. retirement)"
        value={totalNetWorth}
        onChange={setTotalNetWorth}
        min={0}
        max={2_000_000}
        step={5_000}
        trackUndo={false}
        hint="Cash, brokerage, home equity, and other investments — not 401(k)s or IRAs."
      />

      <div className="divider" />

      <div className="text-small muted mb-8">
        <strong>Before purchase</strong> — split 100% across buckets
      </div>

      {ALLOCATION_BUCKETS.map((bucket) => (
        <Slider
          key={bucket.key}
          label={`${bucket.label} (${percent(allocationPcts[bucket.key], 0)})`}
          value={Math.round(allocationPcts[bucket.key])}
          onChange={(v) => onAllocationChange(bucket.key, v)}
          min={0}
          max={100}
          step={1}
          format="integer"
          trackUndo={false}
          noStretch
          hint={`${money(balances[bucket.key])} today`}
        />
      ))}

      <div className="divider" />

      <Slider
        label="Put into this house (down + extra)"
        value={houseFunding}
        onChange={setHouseFunding}
        min={0}
        max={maxHouseFunding}
        step={1_000}
        trackUndo={false}
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
              <span className="draw-priority-label">{src?.label}</span>
              <span className="draw-priority-amount muted text-tiny">
                {money(funding.draws[key] ?? 0)} drawn
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
        <AllocationChart title="Before" data={beforeChart} />
        <AllocationChart title="After closing" data={afterChart} />
      </div>

      <div className="stat-grid mt-16">
        <div className="stat">
          <div className="label">Liquid left after</div>
          <div className="value">{money(liquidRemaining)}</div>
        </div>
        <div className="stat">
          <div className="label">This house equity</div>
          <div className="value">{money(postPurchase.dollars.thisHouse)}</div>
        </div>
        <div className="stat">
          <div className="label">Brokerage left</div>
          <div className="value">{money(postPurchase.dollars.brokerage)}</div>
        </div>
        <div className="stat">
          <div className="label">Other investments left</div>
          <div className="value">{money(postPurchase.dollars.otherInvestments)}</div>
        </div>
      </div>

      <PostPurchaseSplit pcts={postPurchase.pcts} dollars={postPurchase.dollars} />

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

function FundingSummary({ draws, funded }) {
  const rows = ALLOCATION_BUCKETS.filter((b) => draws[b.key] > 0);
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
          <strong>{money(draws[b.key])}</strong>
        </div>
      ))}
    </div>
  );
}

function AllocationChart({ title, data }) {
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
            {data.map((d) => (
              <li key={d.name}>
                <span className="swatch" style={{ background: d.color }} />
                <span className="allocation-legend-label">{d.name}</span>
                <span className="allocation-legend-value">{money(d.value)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PostPurchaseSplit({ pcts, dollars }) {
  const rows = [
    { key: 'thisHouse', label: POST_HOUSE_BUCKET.label, color: POST_HOUSE_BUCKET.color },
    ...ALLOCATION_BUCKETS.filter((b) => b.key !== 'savedForHouse'),
    { key: 'savedForHouse', label: 'Cash reserve (unused)', color: '#6b7c93' },
  ].filter((r) => (dollars[r.key] ?? 0) > 0);

  return (
    <div className="mt-16">
      <div className="text-small muted mb-8">
        <strong>After closing</strong> — % of net worth
      </div>
      {rows.map((r) => (
        <div key={r.key} className="allocation-split-row">
          <span className="swatch" style={{ background: r.color }} />
          <span className="allocation-split-label">{r.label}</span>
          <span className="allocation-split-pct">{percent(pcts[r.key] ?? 0, 0)}</span>
          <span className="allocation-split-bar-wrap">
            <span
              className="allocation-split-bar"
              style={{
                width: `${Math.min(100, pcts[r.key] ?? 0)}%`,
                background: r.color,
              }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
