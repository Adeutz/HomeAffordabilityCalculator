// Left → right: survive closing → runway → lender ratios → planned-price fit → monthly cash reality → advisor rules.
const CHIPS = [
  {
    key: 'cashAfterClosing',
    short: 'Cash after closing',
    hint: 'Dollars left right after down payment plus closing costs.',
    targetId: 'health-detail-cash-after-closing',
  },
  {
    key: 'emergencyRunway',
    short: 'E-fund months',
    hint: 'How many months of expenses savings cover after closing.',
    targetId: 'health-detail-emergency',
  },
  {
    key: 'totalDti',
    short: 'Total DTI',
    hint: 'All debts + housing vs gross income (28% vs 43% bands).',
    targetId: 'health-detail-total-dti',
  },
  {
    key: 'paymentVsIncome',
    short: 'Payment · income',
    hint: 'Comfort level at your planned price (28 / 36 style housing + total DTI).',
    targetId: 'health-detail-payment-vs-income',
  },
  {
    key: 'monthlyCashBuffer',
    short: 'Cash left / mo',
    hint: 'Leftover after mortgage, debts, and your spending sliders — see the card below payment breakdown.',
    targetId: 'health-detail-monthly-buffer',
  },
  {
    key: 'housingVsTakeHome',
    short: 'Housing vs take-home',
    hint: '% of estimated after-tax income going to the mortgage.',
    targetId: 'health-detail-net-housing',
  },
  {
    key: 'buyerRules30303',
    short: '30 / 30 / 3 rule',
    hint: 'Wealth-focused rules vs your planned price.',
    targetId: 'health-detail-buyer-rules',
  },
];

/** HashRouter owns the `#` URL — real hash links wipe the route. Scroll in JS instead. */
function scrollToHealthDetail(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;

  el.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'start',
  });
}

function levelAriaWord(level) {
  if (level === 'green') return 'Green — OK';
  if (level === 'yellow') return 'Yellow — caution';
  return 'Red — needs attention';
}

/**
 * Tiny green / yellow / red summary row — each pill scrolls to its explainer.
 */
export default function CalculatorHealthLights({ healthLevels }) {
  return (
    <section
      className="health-lights-strip"
      aria-label="Quick affordability signals"
    >
      <div className="health-lights-row">
        {CHIPS.map(({ key, short, hint, targetId }) => {
          const level = healthLevels[key] || 'yellow';
          const ariaLevel = levelAriaWord(level);
          return (
            <button
              key={key}
              type="button"
              className={`health-chip health-chip--${level}`}
              title={`${hint} — jump to explanation`}
              aria-label={`${short}. ${ariaLevel}. ${hint}. Scroll to full details.`}
              onClick={() => scrollToHealthDetail(targetId)}
            >
              <span className="health-chip-dot" aria-hidden />
              <span>{short}</span>
            </button>
          );
        })}
      </div>
      <p className="health-lights-legend text-tiny muted">
        <strong>Green</strong> OK · <strong>Yellow</strong> meh · <strong>Red</strong>{' '}
        slow down · tap a pill to scroll to why.
      </p>
    </section>
  );
}
