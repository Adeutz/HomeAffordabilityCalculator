# 🏠 Home Affordability Calculator (PWA)

A Progressive Web App that helps you figure out how much house you can actually afford. Inspired by Zillow's slider calculator — but better, because it also has stress tests, scenario comparison, an amortization schedule, dark mode, offline support, and more.

You can install it on your phone or laptop like a real app, and it works without internet after the first load.

## What's inside

### Pages

| Page | What it does |
|------|--------------|
| **Calculator** | The main Zillow-style sliders. Drag them to see your max home price, monthly payment breakdown (with a pie chart), DTI traffic light, emergency fund check, and equity-over-time chart. |
| **Compare loans** | 15 vs 20 vs 30-year side-by-side. Same home, same rate — see how the term changes everything. |
| **Amortization** | Where every dollar of every payment actually goes. Includes a chart of principal vs interest over time, and an "extra principal payment" knob that shows how much faster you'd pay off the loan. |
| **Stress test** | What if rates go up 1%? What if rates drop 1%? What if you lost income for 3 or 6 months — could your savings cover the mortgage? |
| **Scenarios** | Save any scenario with a name. Come back later and load it. Great for "20% down vs 10% down" or "high cost of living vs low cost of living". |
| **Savings goal** | When can you actually afford to buy? Project your down payment savings over time, with compound interest. |
| **Rent vs buy** | Long-term break-even analysis. When does buying actually beat renting? |

### PWA features

- **Installable** — your browser will offer "Install this app" once you've used it for a moment
- **Offline-capable** — full app works without internet after first load
- **Auto-update** — when you publish a new version, users see a "Reload to update" banner
- **Share by link** — every scenario can be turned into a URL that recreates the exact inputs

### Inputs (basic + advanced)

- Annual gross income
- Down payment
- Monthly debts (cars, cards, student loans)
- Interest rate
- Current savings
- Loan term (15 / 20 / 30 years)
- Property tax rate
- Home insurance
- HOA fees
- Credit score (suggests an interest rate)
- ZIP code (auto-fills typical property tax & insurance for that state)
- Closing costs (% of home price)
- Extra monthly principal payment

## Quick start

Make sure you have Node.js 18+ installed. Then:

```bash
npm install
npm run dev
```

Open the URL it prints (something like `http://localhost:5173/`).

### Building for production

```bash
npm run build
npm run preview
```

`npm run build` regenerates the PNG icons from the SVG, then bundles everything into `dist/`.

## Deploying to GitHub Pages

1. Create a new GitHub repo named **HomeAffordabilityCalculator** (or whatever you want — but if you change the name, update `REPO_NAME` in `vite.config.js`).
2. Push this folder to that repo.
3. Run:
   ```bash
   npm run deploy
   ```
   That builds the app and pushes the `dist/` folder to a `gh-pages` branch.
4. In your repo settings on GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `gh-pages`/(root)**.
5. Wait ~30 seconds, then visit `https://YOUR_USERNAME.github.io/HomeAffordabilityCalculator/`.

> ⚠️ **Heads up:** GitHub Pages serves the app under a sub-path (`/HomeAffordabilityCalculator/`), which is why we set `base` in `vite.config.js`. We use `HashRouter` instead of `BrowserRouter` so the routing works with that setup (URLs look like `/#/scenarios` instead of `/scenarios`).

## Project structure

```
HomeAffordabilityCalculator/
├── public/                # Static files served as-is
│   ├── favicon.svg        # Tab icon (vector)
│   ├── icons/             # PWA icons (auto-generated from favicon.svg)
│   └── apple-touch-icon.png
├── scripts/
│   └── generate-icons.js  # Renders the favicon SVG into PNGs at the required sizes
├── src/
│   ├── components/        # Reusable UI pieces (Slider, Card, charts, etc.)
│   ├── pages/             # One file per app page
│   ├── lib/               # Pure logic (mortgage math, formatting, ZIP lookup, share links)
│   ├── hooks/             # React hooks (useTheme)
│   ├── state/             # Global state (InputsContext)
│   ├── styles/global.css  # Theme tokens (light + dark) and shared styles
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js         # Vite + PWA config
└── package.json
```

If you're new to all this, the file you'll spend the most time playing with is `src/pages/CalculatorPage.jsx`. From there you can chase imports to learn how each piece fits.

## How the math works (quick tour)

All the mortgage math lives in `src/lib/mortgage.js`. The key functions:

- `monthlyPI(loan, rate, years)` — standard fixed-rate mortgage payment formula
- `monthlyPaymentBreakdown(...)` — splits a monthly payment into Principal & Interest, taxes, insurance, HOA, and PMI
- `maxAffordableHomePrice(...)` — binary-searches for the most expensive home that fits a target monthly payment (this is what makes the sliders feel magical)
- `maxMonthlyHousingFromIncome(...)` — applies the classic "28/36 rule" lenders use
- `dtiHealth(...)` — green/yellow/red traffic light for debt-to-income
- `amortizationSchedule(...)` — builds the month-by-month payment table, with optional extra principal
- `equityOverTime(...)` — projects how your equity grows year by year
- `stressTest(...)` — what-if simulations
- `rentVsBuy(...)` — long-term cost projection for renting vs buying

These are pure functions (they just take numbers in and return numbers out), so you can play with them in a Node REPL or import them anywhere.

## Customizing the look

All colors live as CSS variables at the top of `src/styles/global.css`. There's a light theme and a dark theme (the `<html data-theme="dark">` selector swaps them). Want a different blue? Change `--brand` in one place and watch every component update.

## Tech stack

- **React 18** with **react-router-dom** (HashRouter for GitHub Pages compatibility)
- **Vite** for blazing-fast dev + build
- **vite-plugin-pwa** for the service worker / manifest / install prompt
- **Recharts** for charts
- **html2canvas + jspdf** for PDF export (lazy-loaded so they don't slow down first paint)
- **localStorage** for everything user-saved (no backend = free hosting forever)

## License

MIT — do whatever you want with this. Have fun!
