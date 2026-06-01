import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import CalculatorPage from './pages/CalculatorPage.jsx';
import AmortizationPage from './pages/AmortizationPage.jsx';
import StressTestPage from './pages/StressTestPage.jsx';
import ScenariosPage from './pages/ScenariosPage.jsx';
import LoanComparePage from './pages/LoanComparePage.jsx';
import SavingsGoalPage from './pages/SavingsGoalPage.jsx';
import RentVsBuyPage from './pages/RentVsBuyPage.jsx';
import RefinancePage from './pages/RefinancePage.jsx';
import { InputsProvider } from './state/InputsContext.jsx';
import { useTheme } from './hooks/useTheme.js';
import InstallPrompt from './components/InstallPrompt.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import KeyboardDoneButton from './components/KeyboardDoneButton.jsx';

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

const NAV_ITEMS = [
  { to: '/', label: 'Calculator', end: true },
  { to: '/compare', label: 'Compare loans' },
  { to: '/amortization', label: 'Amortization' },
  { to: '/stress', label: 'Stress test' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/savings-goal', label: 'Savings goal' },
  { to: '/refinance', label: 'Refinance' },
  { to: '/rent-vs-buy', label: 'Rent vs buy' },
];

export default function App() {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === 'true') {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isSidebarCollapsed ? 'true' : 'false');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => {
    const isMobile = window.matchMedia('(max-width: 899px)').matches;
    if (isMobile) {
      setIsMobileSidebarOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => !prev);
  };

  return (
    <InputsProvider>
      <div className={`app ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileSidebarOpen ? 'sidebar-mobile-open' : ''}`}>
        <aside className="app-sidebar" aria-label="Main menu">
          <div className="sidebar-brand">
            <div className="logo" aria-label="Home Affordability Calculator">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <rect width="64" height="64" rx="12" fill="var(--brand)" />
                <path
                  d="M32 14 L52 30 V50 H40 V38 H24 V50 H12 V30 Z"
                  fill="white"
                />
              </svg>
              <span>Affordability</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Close menu"
          onClick={() => setIsMobileSidebarOpen(false)}
        />

        <div className="app-content">
          <header className="app-header">
            <div className="logo compact" aria-label="Home Affordability Calculator">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <rect width="64" height="64" rx="12" fill="var(--brand)" />
                <path
                  d="M32 14 L52 30 V50 H40 V38 H24 V50 H12 V30 Z"
                  fill="white"
                />
              </svg>
              <span>Affordability</span>
            </div>

            <div className="spacer" />

            <button
              className="menu-toggle"
              onClick={toggleSidebar}
              aria-label="Toggle menu"
              title="Toggle menu"
            >
              <span aria-hidden="true">{isMobileSidebarOpen ? '✕' : '☰'}</span>
            </button>

            <button
              className="icon-button"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </header>

          <main className="app-main">
            <Routes>
              <Route path="/" element={<CalculatorPage />} />
              <Route path="/compare" element={<LoanComparePage />} />
              <Route path="/amortization" element={<AmortizationPage />} />
              <Route path="/stress" element={<StressTestPage />} />
              <Route path="/scenarios" element={<ScenariosPage />} />
              <Route path="/savings-goal" element={<SavingsGoalPage />} />
              <Route path="/refinance" element={<RefinancePage />} />
              <Route path="/rent-vs-buy" element={<RentVsBuyPage />} />
            </Routes>
          </main>

          <InstallPrompt />
          <UpdatePrompt />
          <KeyboardDoneButton />
        </div>
      </div>
    </InputsProvider>
  );
}
