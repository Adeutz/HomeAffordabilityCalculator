# Payoff modeling upgrade — what we're building and why

**Status:** Items 1–2 built and verified ✅ — Items 3–6 pending
**Written:** August 5, 2026 · last updated August 5, 2026
**Scope:** the "should I pay off the mortgage?" side of the app — `payoffProjection.js`, `payoffPlan.js`, `futureScenarios.js`, and the pages that render them.

This doc is your reference while the work happens. Each section says **what** changes, **why it matters** (in plain English), **which files** are touched, and **how to tell it worked**. Skip to [Build order](#build-order) for the checklist.

---

## Table of contents

- [The one-paragraph summary](#the-one-paragraph-summary)
- [Background: why the current model feels binary](#background-why-the-current-model-feels-binary)
- [Item 1 — Monte Carlo engine](#item-1--monte-carlo-engine)
- [Item 2 — Fan chart + win probability](#item-2--fan-chart--win-probability)
- [Item 3 — Allocation sweep (the "slowly pay down" answer)](#item-3--allocation-sweep-the-slowly-pay-down-answer)
- [Item 4 — Fix the three modeling holes](#item-4--fix-the-three-modeling-holes)
- [Item 5 — Risk/return frontier](#item-5--riskreturn-frontier)
- [Item 6 — Tornado chart](#item-6--tornado-chart)
- [Build order](#build-order)
- [File map](#file-map)
- [Glossary](#glossary)

---

## The one-paragraph summary

Right now every projection in the app assumes the stock market returns exactly the same percentage every single year for 30 years. That assumption quietly pre-decides the answer: if your assumed return is above your mortgage rate, investing always wins, by a lot, with no uncertainty shown. Real markets are lumpy, and the lumpiness is *the entire reason this decision is hard*. We're replacing the single smooth projection with thousands of randomized ones, then rebuilding the charts to show a range of outcomes and a win probability instead of one fake-precise dollar figure. Along the way we fix three things the model currently gets wrong, and we add a dial that sweeps the whole middle ground between "pay it all off" and "pay off none of it."

---

## Background: why the current model feels binary

### The math that's happening today

In [`src/lib/payoffProjection.js`](src/lib/payoffProjection.js), the core loop is one line:

```js
invest = invest * (1 + rI) + contribution;
```

`rI` is a constant — your annual return divided by 12. It never changes. So the simulation multiplies by the exact same number 360 times in a row.

### Why that's a problem

Compound growth at a fixed rate is a *smooth exponential curve*. It has no bad years. It never dips. Under that assumption:

- If your return assumption (7%) is higher than your mortgage rate (say 6.5%), **keeping the mortgage wins by a mile, guaranteed.**
- If it's lower, **paying off wins, guaranteed.**

There is no uncertainty anywhere in the output, so the tool can only ever tell you which side of a line you're on. The sensitivity table at [`payoffProjection.js:294`](src/lib/payoffProjection.js#L294) doesn't help — it re-runs the same smooth loop at 4%, 5%, 6%, 7%, 8%, 10%, which just draws the line more precisely.

### What real markets look like

Sample of actual S&P 500 calendar-year total returns:

```
2008: -37%
2009: +26%
2018:  -4%
2019: +31%
2022: -18%
2023: +26%
```

Those years *average out* to something near the long-run number. But **the order they arrive in changes your ending balance dramatically** — this is called *sequence of returns risk*. A crash in year 2, when you have a big balance and 28 years to recover, is survivable. The same crash in year 28 is not.

A constant-return model is structurally blind to this. It's not that the model is imprecise — it's that it's answering a different, easier question than the one you're asking.

### The honest answer we want instead

Not this:

> Keeping the mortgage wins by $412,000.

But this:

> Keeping the mortgage wins in **71%** of simulated futures. Median advantage: **$310k**. But in the worst 10% of futures you finish **$180k behind**, and in the worst 2% you'd have been forced to sell investments during a crash. Paying off finishes within a **$40k band** in essentially every future.

Same inputs. Vastly more useful. That's what Items 1 and 2 build.

---

## Item 1 — Monte Carlo engine

**New file:** `src/lib/monteCarlo.js`
**Dependencies added:** none (important — this stays offline-friendly)

### What it does

Instead of running one smooth 30-year path, run **5,000 randomized paths** and collect the distribution of outcomes.

### Two ways to generate randomness (we'll build both)

**A. Historical bootstrap (default, and the better one).**
Embed a table of real annual total returns, roughly 1928–present (~97 values). Each simulated year, draw one year at random from that table with replacement.

Why this is better than a bell curve: real market returns have **fat tails** — extreme years happen far more often than a normal distribution predicts. 1931 (about −43%) and 1954 (about +52%) are events a bell curve says should basically never occur. Bootstrapping from real history gets those for free, because they're literally in the data.

> ⚠️ **Data accuracy note:** the return table must be sourced and spot-checked, not typed from memory. The NYU Stern / Damodaran "Historical Returns on Stocks, Bonds and Bills" dataset is the standard free source. We'll add the table with a comment naming the source and the date pulled, and the numbers should be verified before trusting output.

**B. Normal distribution (a toggle, for experimenting).**
Draw from a bell curve with a mean and standard deviation you set. Uses the Box–Muller transform, which is ~6 lines of math that turns two uniform random numbers into a normally distributed one. Useful for asking "what if the future is calmer/wilder than the past?"

**Seeded randomness.** We use our own small pseudo-random generator (mulberry32, ~5 lines) rather than `Math.random()`, so a given set of inputs always produces the same 5,000 paths. Without this, the numbers would flicker every time React re-renders and the app would feel broken.

### Rough API shape

```js
export function simulateMonteCarlo({
  // ...everything simulatePath() already takes...
  runs = 5000,
  mode = 'bootstrap',       // 'bootstrap' | 'normal'
  meanReturnPct,            // used in 'normal' mode
  stdDevPct = 15,           // used in 'normal' mode
  seed = 12345,
}) {
  return {
    percentiles: { p5, p10, p25, p50, p75, p90, p95 },  // arrays, one entry per year
    finals: Float64Array,     // 5,000 ending net worths, sorted
    winRate: 0.71,            // fraction of runs where this path beat the comparison
    worstCase, medianCase, bestCase,
  };
}
```

### Sequence risk matters *more* here than in a normal retirement calculator

In this specific comparison, the mortgage payment is a **fixed obligation** that doesn't care what the market did. In the "keep the mortgage and invest" path, a crash means your investments shrink *while the mortgage bill stays exactly the same*. In the "paid it off" path, there's no bill at all. That asymmetry is invisible in a constant-return model and it's a genuine, quantifiable risk. The Monte Carlo makes it show up.

### Performance

5,000 runs × 360 months = 1.8M iterations of simple arithmetic. That's roughly 30–80ms in a modern browser — fast enough to run inside a `useMemo` on every input change. If it turns out sluggish on your phone, the fallbacks are: drop to 2,000 runs while a slider is being dragged, or move it into a Web Worker.

### How to tell it worked

Set the standard deviation to 0 (or use a bootstrap table where every year is identical). Every simulated path should then land on exactly the number the current deterministic engine produces. If they match, the plumbing is correct.

---

### ✅ BUILT — what actually shipped, and two things we learned

Files: [`src/lib/historicalReturns.js`](src/lib/historicalReturns.js), [`src/lib/monteCarlo.js`](src/lib/monteCarlo.js), [`scripts/verify-monte-carlo.mjs`](scripts/verify-monte-carlo.mjs)

Run the checks any time with:

```bash
node scripts/verify-monte-carlo.mjs
```

**46/46 checks pass.** The equivalence test matches the old engine to 9.31e-10 — floating-point dust, i.e. exact. 5,000 runs × 2 strategies × 30 years takes ~195ms, so it's fine to run inside a `useMemo`.

Data was cross-checked: Damodaran (NYU Stern) against westmountfundamentals.com. All 97 overlapping years (1928–2024) matched exactly. 2025 was single-sourced from Damodaran at 17.78%, and independently sanity-checked against RBC (17.9%) and dqydj (17.44%) — vendor differences in dividend timing.

#### Discovery 1 — bootstrapping raw history would have silently doubled the numbers

The S&P 500's actual long-run **geometric** return since 1928 is **10.02%/yr**. This app's default assumption is **7%**. If we'd bootstrapped raw history, the headline would have jumped from ~$2.36M to ~$4.81M — a 2× change that looks like a bug and quietly overrules the user's own, more conservative assumption.

Fix: `recenterReturns()`. Every year is a growth factor (a −10% year is 0.90). Multiply every factor by the same constant and the geometric mean scales by exactly that constant while the spread in log-space is untouched. So we keep history's volatility, fat tails, and sequencing — everything a bell curve gets wrong — but slide the center to whatever return you actually believe in. Verified: recentering to 7% hits 7.0000000000%, volatility moves only 19.40% → 18.87%, and the worst year stays brutal at −45.4%.

`recenterToPct` defaults to `null` (raw history). The UI should pass the user's expected-return input.

> **Also worth knowing:** the arithmetic mean (11.86%) is much higher than the geometric mean (10.02%). The geometric one is what to compare against a mortgage rate. Quoting the arithmetic average makes investing look better than it is — a mistake many calculators make. `returnStats()` returns both.

#### Discovery 2 — the existing engine has a small compounding quirk

[`payoffProjection.js:27`](src/lib/payoffProjection.js#L27) converts an annual rate to monthly with `annual / 12`. Compounding that twelve times gives **7.23%**, not 7% — it overshoots slightly, every year, for 30 years.

It's worse for negative years: `-43.84% / 12`, compounded monthly, comes out to only **−36.02%**. Since bootstrapping feeds in real annual returns including brutal ones, this convention would have quietly softened every crash.

`monteCarlo.js` defaults to `'effective'` (the true 12th root, so twelve months compound to exactly the stated annual rate) and keeps `'nominal'` available purely so the equivalence test can reproduce the old engine bit-for-bit. **Added to the Item 4 fix list below.**

#### Bonus: block bootstrap

`blockYears` copies N *consecutive* historical years at a time instead of drawing each year independently. Independent draws throw away the fact that markets cluster — crashes are followed by recoveries, booms by hangovers. `blockYears: 5` preserves some of that real texture. Default is 1; the UI should probably use 5.

#### What it does to the headline

Test scenario — $400k pool, $350k loan at 6.5%, 30-year horizon, after tax, today's dollars:

| | Old engine | New engine (5,000 futures, recentered to 7%) |
|---|---|---|
| Pay off | $2,334,690 | p10 $1,250,811 · **median $2,469,341** · p90 $5,232,706 |
| Keep & invest | $2,356,798 | p10 $1,071,237 · **median $2,444,835** · p90 $6,042,660 |
| Verdict | "keep & invest wins by **$22,108**" | **50.4% coin flip**; keep & invest is **$386,025 behind** in its worst 10% |

The old $22,108 edge was noise dressed up as a conclusion. That's the entire justification for this work.

---

## Item 2 — Fan chart + win probability

**Files:** new `src/components/FanChart.jsx`; rewrite the headline section of [`src/pages/PayoffVsInvestPage.jsx`](src/pages/PayoffVsInvestPage.jsx#L376)

### What it does

Replaces the two big single-number results with:

1. **A fan chart** — the median outcome as a solid line, with shaded bands showing the 25th–75th percentile (the "typical" range) and 5th–95th percentile (the "wide" range), widening as they go out in time. Both strategies overlaid.
2. **A win-probability stat** — "Keeping the mortgage ends ahead in 71% of futures."
3. **A downside stat** — "In the worst 10% of futures, keeping the mortgage leaves you $180k behind."

### Why it matters

A single number implies certainty the model doesn't have. The fan chart makes the uncertainty visible and — critically — makes it **visually obvious that the two strategies have different amounts of uncertainty**. The payoff path is a narrow ribbon. The invest path is a wide cone. That difference *is* the decision, and no table can communicate it as fast as a picture.

### Implementation notes

Recharts is already a dependency. A fan chart is a `ComposedChart` with stacked `Area` bands plus a `Line` for the median. The standard trick for a band is to plot a transparent base area up to the lower bound, then a colored area of `upper - lower` stacked on top of it.

Keep the existing dark/light theming — bands use the existing green/blue with low opacity so overlapping regions stay readable in both themes.

### What gets removed

The "Crossover point" stat at [`PayoffVsInvestPage.jsx:430`](src/pages/PayoffVsInvestPage.jsx#L430) becomes meaningless once outcomes are a distribution (different runs cross at different times, and many never cross). It gets replaced by the win-probability stat.

---

### ✅ BUILT

Files: [`src/components/FanChart.jsx`](src/components/FanChart.jsx), rewired [`src/pages/PayoffVsInvestPage.jsx`](src/pages/PayoffVsInvestPage.jsx), fan/stat styles added to [`src/styles/global.css`](src/styles/global.css)

**What the page shows now**

- Headline is two **medians** with their 10th–90th percentile range underneath, instead of two fake-precise numbers.
- A **win-probability bar** splitting 100% between the two strategies — the single most useful number on the page.
- Four outcome tiles: typical edge, keeping's bad case, spread width vs. the other strategy, and the do-nothing cash floor.
- A **fan chart** — median line plus an 80%-of-futures cone per strategy. The cones start at a single point (today is known) and widen as uncertainty compounds.
- The **verdict** is now probability-aware. A 51% edge and a 95% edge are different decisions; the old version called both "wins". Anything between 45–55% is explicitly reported as a coin flip rather than dressed up as a recommendation.
- The year-by-year table became the fan chart's **table view** — worst 10% / median / best 10% per strategy, so no value is hover-gated.
- Removed the crossover stat, as planned.

**A "how the futures are simulated" card** exposes the machinery rather than hiding it: replay-real-history vs. bell-curve, the recentering toggle (with a warning when it's off), run count, and block length.

**Sections still running the old single-path math are now labelled as such** — the sensitivity table and the extra-payment comparison both carry a notice. Mixing two different epistemics on one page without saying so would be worse than either alone. The extra-payment section gets replaced by Item 3.

#### Things caught by actually looking at the rendered page

The palette validator only checks color, so three problems only turned up in a screenshot:

1. **Literal `—` escapes rendering as visible text.** Unicode escapes are interpreted inside JS string literals but *not* in JSX text or attribute strings, so `—` was showing as `—` in eight places. Worth remembering when editing this codebase.
2. **31 x-axis ticks colliding** into an unreadable smear on a 30-year horizon. Now thinned to ~8 with first and last preserved.
3. **The wider cone painting over the narrower one.** Whichever series rendered second won, hiding the exact contrast the chart exists to show. Bands are now sorted widest-first so the narrow cone always sits on top.

Plus one color problem: red was doing double duty as both the "do nothing" series color and a "bad case" status color, in adjacent tiles. The gap tiles now use plain ink with a colored swatch on the caption for identity, leaving red with one meaning.

#### Viewing it yourself

There's no browser driver installed, but Playwright's browser binaries are cached. This renders the page to a PNG with no new dependencies:

```bash
npx vite --port 5177 --strictPort          # in one terminal
# then, with the path to the cached headless shell:
"$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1155/chrome-win/headless_shell.exe" \
  --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1400,4200 --virtual-time-budget=20000 \
  --screenshot=shot.png "http://localhost:5177/#/payoff-vs-invest"
```

Add `--blink-settings=preferredColorScheme=0` for dark mode (the app falls back to the OS preference when no theme is saved). Use a fresh `--user-data-dir` between runs or localStorage persists.

---

## Item 3 — Allocation sweep (the "slowly pay down" answer)

**New:** `buildAllocationSweep()` in `src/lib/payoffProjection.js`; new `src/components/AllocationSweepChart.jsx`

### The gap this fills

Today the page contains two *separate* comparisons that don't talk to each other:

- Lump sum: pay it **all** off vs pay **none** of it off ([`PayoffVsInvestPage.jsx:376`](src/pages/PayoffVsInvestPage.jsx#L376))
- Monthly: send an extra $500/mo vs invest that same $500/mo ([`PayoffVsInvestPage.jsx:591`](src/pages/PayoffVsInvestPage.jsx#L591))

Neither one shows you the **middle**. "What if I pay off 40% of it?" is unanswerable in the current UI, and it's exactly the question you asked.

### What it does

Sweep an allocation dial across the full range — 0%, 10%, 20% … 100% of your pool toward the mortgage, with the remainder invested — run the Monte Carlo at each stop, and plot the results as a curve.

X-axis: percent of pool put toward the mortgage.
Y-axis: outcome (median net worth, plus a 10th-percentile line for the downside).

### Why it matters

Sweeps often reveal a **knee** — a point where you've captured most of the safety benefit for a fraction of the cost. For example, paying down enough to eliminate PMI (see Item 4) can produce a sharp step in the curve, and paying past that point buys much less. You cannot see a knee by testing two endpoints; you have to sweep.

It also directly answers "pay it off vs. don't vs. slowly pay it down" as **one continuous picture** instead of three disconnected cards.

### Second version of the same idea

Do the same sweep on the *monthly surplus* rather than a lump sum: "of my $2,000/mo of spare cash, what fraction should go to extra principal?" Same chart, different input. This is the version that applies if you don't have a big pile of money sitting around.

---

## Item 4 — Fix the three modeling holes

These are real errors in the current output, not just missing features. Each one currently pushes the answer in a specific direction.

### Hole 1 — Paying off is tax-free in the model, but not in real life

**Where:** [`payoffProjection.js:197-203`](src/lib/payoffProjection.js#L197-L203)

The payoff path does this:

```js
const payoff = simulatePath({
  startInvest: Math.max(0, pool - loanBalance),   // whatever survives
  startMortgage: Math.max(0, loanBalance - pool),
  ...
});
```

and inside `simulatePath`, cost basis is initialized as `basis = startInvest` ([line 63](src/lib/payoffProjection.js#L63)).

**What that means:** liquidating your brokerage account to kill the mortgage costs **zero tax** in the simulation. If your $500k pool contains $200k of unrealized gains, selling it triggers a real capital-gains bill of roughly $30k (at 15%) — money that vanishes before it ever reaches the mortgage. The model never charges it.

**Direction of the error:** makes paying off look better than it is. Worse, the size of the error scales with how appreciated your holdings are, so it's largest for exactly the people most likely to be considering this.

**Fix:** add a "cost basis of your pool" input (default it to the pool value so nothing changes for people who don't know theirs), carry the real basis into `simulatePath`, and charge capital gains on the amount liquidated for the payoff at t=0.

### Hole 2 — PMI is invisible

**Where:** nowhere in the payoff engines. `monthlyPMI()` exists at [`mortgage.js:52`](src/lib/mortgage.js#L52) but neither [`payoffProjection.js`](src/lib/payoffProjection.js) nor [`futureScenarios.js`](src/lib/futureScenarios.js) references it.

**Why it's a big deal:** PMI (private mortgage insurance) is a fee you pay when you owe more than 80% of the home's value. It buys *you* nothing — it insures the lender. It disappears the moment you cross below 80% loan-to-value.

That makes a paydown *up to the 80% line* extraordinarily valuable. If paying an extra $15k kills a $180/mo PMI premium, that's $2,160/year on $15k — an effective return around 14%, **guaranteed, risk-free**. No stock market assumption beats that with certainty. And every dollar paid *past* that line reverts to earning only the mortgage rate.

**Direction of the error:** the model currently can't see the single strongest argument for *partial* paydown — which is the exact strategy you're asking about.

**Fix:** track LTV month-by-month in the simulation loop, add PMI to the monthly cost while LTV > 80%, and drop it when the balance crosses. This will make a visible step appear in the Item 3 sweep chart.

### Hole 3 — The mortgage interest deduction never reaches the comparison

**Where:** [`payoffPlan.js:79-92`](src/lib/payoffPlan.js#L79-L92)

```js
const investWins = expectedReturnPct > mortgageRatePct;
```

That's comparing a **pre-tax** market return against a **pre-tax** mortgage rate — but [`taxes.js`](src/lib/taxes.js) already contains `estimateMortgageTaxBenefit()` with proper SALT-cap logic, and it's never consulted here.

**Why it matters:** if you itemize deductions, the government effectively pays part of your mortgage interest. A 6.5% mortgage at a 24% marginal rate has an *effective* cost closer to 4.9%, which moves the break-even point substantially.

**The twist:** since the 2017 standard-deduction increase and the $10k SALT cap, **most people don't itemize** and get no benefit at all. So the fix isn't just "apply the deduction" — it's to run the check and state the answer explicitly on the page, either:

> Your itemized deductions don't beat the standard deduction, so your mortgage interest isn't saving you any tax. Effective rate = sticker rate = 6.50%.

or

> You itemize, so your effective mortgage rate is 4.94%, not 6.50%. That's the number investing has to beat.

Either message is genuinely useful, and right now the page says neither.

### Smaller items to fix while we're in there

| Issue | Where | Impact |
|---|---|---|
| Property tax, insurance, HOA never inflate | [`futureScenarios.js:123`](src/lib/futureScenarios.js#L123) | 30 years of frozen insurance premiums is very wrong; understates future costs in every path |
| 401(k) taxed at capital-gains rate | [`payoffProjection.js:157`](src/lib/payoffProjection.js#L157) | Should be ordinary income tax on withdrawal; the README already admits this |
| `crossoverYear` uses pre-tax net worth while the headline uses after-tax | [`payoffProjection.js:275`](src/lib/payoffProjection.js#L275) | Minor inconsistency; moot once Item 2 removes the crossover stat |
| Partial paydown + recast is unreachable | [`futureScenarios.js:240`](src/lib/futureScenarios.js#L240) | `buildStrategies` only recasts with the *whole* pool. Half the pool + recast lowers your required payment permanently *and* keeps money invested — often the actual best answer |
| Monthly rate uses `annual / 12` | [`payoffProjection.js:27`](src/lib/payoffProjection.js#L27) | Overshoots: 7% compounds to 7.23%/yr. Found while building Item 1 — see [Discovery 2](#discovery-2--the-existing-engine-has-a-small-compounding-quirk). `monteCarlo.js` already does this correctly; `payoffProjection.js` should be switched to match, which will nudge all existing numbers down slightly |

---

## Item 5 — Risk/return frontier

**New:** `src/components/FrontierChart.jsx`

### What it does

A scatter plot where each dot is one strategy (or one stop on the Item 3 allocation sweep):

- **X-axis:** downside — the 10th-percentile outcome ("how bad does bad get?")
- **Y-axis:** median outcome ("how good is typical?")

### Why it matters

This is borrowed from portfolio theory, and it makes **dominated strategies** obvious at a glance. If strategy A sits above *and* to the right of strategy B, then A is better on both typical outcome and worst case — B should never be chosen, and you can stop thinking about it.

Everything that survives that test lies on the **frontier**, and choosing among those is a genuine values question about how much upside you'll trade for how much safety. Nobody can answer that for you, but the chart shows you the exact exchange rate you're being offered — e.g. "each additional $50k of worst-case protection costs you $80k of median outcome."

That reframing is much healthier than "which one wins," because it stops pretending there's an objectively correct answer when there isn't.

---

## Item 6 — Tornado chart

**New:** `buildTornado()` in `src/lib/monteCarlo.js`; `src/components/TornadoChart.jsx`

### What it does

Take each assumption one at a time, wiggle it to a low and a high value while holding everything else fixed, and measure how much the final answer moves. Plot the results as horizontal bars sorted longest-to-shortest — which makes a funnel/tornado shape, hence the name.

Assumptions to test: market return, mortgage rate, inflation, home appreciation, capital gains rate, horizon length, starting pool size.

### Why it matters

**It tells you which inputs deserve your attention and which are noise.** Predicted outcome, based on the structure of the model:

- **Market return** — massive. Dominates everything.
- **Horizon length** — large. More years = more compounding = investing looks better.
- **Mortgage rate** — large, and it's the one number you actually *know* with certainty.
- **Inflation** — moderate, and mostly a display artifact of the today's-dollars toggle.
- **Home appreciation** — **near zero.** This one's important to surface, because it's counterintuitive.

### Why home appreciation doesn't matter here (and why showing that is valuable)

You own the same house in every scenario. It appreciates identically in all of them. Whether it grows at 2% or 6% changes your net worth a lot — but it changes it *by the same amount in every path*, so it cancels out completely in the comparison.

People agonize over this input. The tornado chart proves in one glance that it's irrelevant to *this particular decision*, which frees you to stop worrying about it. That's the kind of thing a good model should tell you.

---

## Build order

Each step is independently useful and testable. Nothing later breaks anything earlier.

- [x] **1. `src/lib/monteCarlo.js`** — seeded RNG, Box–Muller, historical return table (source-verified), `runMonteCarlo()`, percentile extraction, plus `recenterReturns()` and block bootstrap. Pure logic, no UI.
  - *Verified:* `node scripts/verify-monte-carlo.mjs` — 46/46 pass, equivalence exact to 9.31e-10, 5,000 runs in ~195ms.
- [x] **2. `src/components/FanChart.jsx`** + rewire the headline on `PayoffVsInvestPage.jsx` — percentile bands, win probability, downside stat. Removed the crossover stat.
  - *Verified:* renders in light and dark, bands widen over time, payoff cone measurably narrower than the invest cone, build clean.
- [ ] **3. Allocation sweep** — `buildAllocationSweep()` + `AllocationSweepChart.jsx`, lump-sum version first, monthly-surplus version second.
  - *Verify:* the 0% and 100% ends of the sweep match the existing two-strategy headline numbers.
- [ ] **4. The three holes** — pool cost basis, PMI tracking, effective mortgage rate after deduction. Then the smaller fixes table.
  - *Verify:* a PMI step appears in the sweep chart; setting cost basis = pool value leaves all numbers unchanged.
- [ ] **5. `FrontierChart.jsx`** — risk/return scatter over the sweep results.
- [ ] **6. `buildTornado()` + `TornadoChart.jsx`** — one-at-a-time sensitivity bars.

**Order rationale:** 1 is the foundation everything else consumes. 2 makes 1 visible so you can sanity-check it before building on it. 3 is the thing you specifically asked for and needs 1. 4 is deliberately *after* 3 so that the PMI fix has a chart to show up in — it'll be immediately obvious whether it's working. 5 and 6 are analysis layers on top of data that already exists by then, so they're mostly presentation.

**Offline safety:** no new npm packages at any step. Recharts (already installed) covers every chart. The historical return table is plain numbers in a `.js` file.

---

## File map

### New files

| File | Purpose |
|---|---|
| `src/lib/monteCarlo.js` ✅ | Seeded RNG, return generators, `recenterReturns()`, `runMonteCarlo()`; `buildTornado()` comes with Item 6 |
| `src/lib/historicalReturns.js` ✅ | Source-verified annual return table + provenance comment + `returnStats()` |
| `scripts/verify-monte-carlo.mjs` ✅ | Runnable regression suite — the equivalence proof lives here |
| `src/components/FanChart.jsx` ✅ | Percentile bands over time, with table-view twin on the page |
| `src/components/AllocationSweepChart.jsx` | Outcome vs. % of pool toward mortgage |
| `src/components/FrontierChart.jsx` | Downside vs. median scatter |
| `src/components/TornadoChart.jsx` | Sorted sensitivity bars |

### Modified files

| File | Change |
|---|---|
| [`src/lib/payoffProjection.js`](src/lib/payoffProjection.js) | Cost basis carried through; PMI in the monthly loop; `buildAllocationSweep()`; 401(k) taxed as ordinary income |
| [`src/lib/payoffPlan.js`](src/lib/payoffPlan.js) | `payoffVsInvest()` uses effective (post-deduction) mortgage rate |
| [`src/lib/futureScenarios.js`](src/lib/futureScenarios.js) | Inflate tax/insurance/HOA; allow partial-pool recast in `buildStrategies()` |
| [`src/pages/PayoffVsInvestPage.jsx`](src/pages/PayoffVsInvestPage.jsx) | New headline, fan chart, sweep, frontier, tornado; new inputs (cost basis, volatility, run count) |
| [`src/lib/taxes.js`](src/lib/taxes.js) | Export an `effectiveMortgageRate()` helper |

### Untouched

`mortgage.js` amortization/recast/refinance math, all the affordability pages, PWA config, theming.

---

## Glossary

**Monte Carlo simulation** — running the same model thousands of times with random inputs to get a *range* of outcomes instead of one. Named after the casino, because it's driven by chance.

**Bootstrap** — generating random scenarios by drawing real historical observations at random, rather than from a mathematical formula. Keeps the weird real-world behavior that formulas smooth away.

**Sequence of returns risk** — the fact that the *order* of good and bad years changes your result, even when the average is identical. A crash early is very different from a crash late.

**Block bootstrap** — drawing several *consecutive* historical years at a time rather than one at a time, so the sampled future keeps some of history's clustering (crashes followed by recoveries).

**Recentering** — sliding a historical return series up or down so its long-run average matches your own assumption, while keeping its volatility and shape. Lets you use real market texture without adopting real market optimism.

**Arithmetic vs. geometric mean** — the arithmetic mean is the plain average of yearly returns; the geometric mean (CAGR) is the constant rate that produces the same ending balance. Geometric is always lower, because losses hurt more than equal gains help (lose 50%, gain 50%, you're at 75%). **Geometric is the one to compare against a mortgage rate.**

**Fat tails** — extreme events happening more often than a normal bell curve predicts. Markets have them; textbook statistics often assume they don't.

**Percentile (p10, p50, p90)** — p10 means 10% of simulated outcomes were worse than this. p50 is the median. p90 means only 10% did better.

**LTV (loan-to-value)** — what you owe divided by what the house is worth. Crossing below 80% is the threshold that kills PMI.

**PMI (private mortgage insurance)** — a monthly fee charged when LTV is above 80%. It protects the lender, not you, and stops when you cross the line.

**Cost basis** — what you originally paid for an investment. You owe capital gains tax on the *difference* between the sale price and the basis, not on the whole sale.

**SALT cap** — the $10,000 limit on deducting state and local taxes (including property tax). A major reason most households no longer itemize.

**Effective mortgage rate** — your sticker rate reduced by whatever tax deduction you actually receive. Only lower than the sticker rate if you itemize.

**Dominated strategy** — an option that's worse than another on *every* dimension you care about. Safe to eliminate without any judgment call.

**Frontier** — the set of options that aren't dominated. Choosing among them is a values question, not a math question.

---

*Not financial advice. This is a model — every number it produces depends on assumptions you chose. The point of these changes is to make those assumptions, and their consequences, visible instead of hidden.*
