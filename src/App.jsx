import { useEffect, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import CalculatorPage from './pages/CalculatorPage.jsx';
import AmortizationPage from './pages/AmortizationPage.jsx';
import StressTestPage from './pages/StressTestPage.jsx';
import ScenariosPage from './pages/ScenariosPage.jsx';
import LoanComparePage from './pages/LoanComparePage.jsx';
import SavingsGoalPage from './pages/SavingsGoalPage.jsx';
import RentVsBuyPage from './pages/RentVsBuyPage.jsx';
import { InputsProvider } from './state/InputsContext.jsx';
import { useTheme } from './hooks/useTheme.js';
import InstallPrompt from './components/InstallPrompt.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';

const NAV_MINIMIZED_KEY = 'header-nav-minimized';

export default function App() {
  const { theme, toggle } = useTheme();
  const [isNavMinimized, setIsNavMinimized] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(NAV_MINIMIZED_KEY);
    if (saved === 'true') {
      setIsNavMinimized(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(NAV_MINIMIZED_KEY, isNavMinimized ? 'true' : 'false');
  }, [isNavMinimized]);

  const handleNavLinkClick = () => {
    if (window.matchMedia('(max-width: 899px)').matches) {
      setIsNavMinimized(true);
    }
  };

  return (
    <InputsProvider>
      <div className="app">
        <header className="app-header">
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

          <button
            className="menu-toggle"
            onClick={() => setIsNavMinimized((prev) => !prev)}
            aria-expanded={!isNavMinimized}
            aria-controls="app-primary-nav"
            aria-label={isNavMinimized ? 'Show menu' : 'Hide menu'}
            title={isNavMinimized ? 'Show menu' : 'Hide menu'}
          >
            <span aria-hidden="true">{isNavMinimized ? '☰' : '✕'}</span>
          </button>

          <nav id="app-primary-nav" className={isNavMinimized ? 'is-minimized' : ''}>
            <NavLink to="/" end onClick={handleNavLinkClick}>Calculator</NavLink>
            <NavLink to="/compare" onClick={handleNavLinkClick}>Compare loans</NavLink>
            <NavLink to="/amortization" onClick={handleNavLinkClick}>Amortization</NavLink>
            <NavLink to="/stress" onClick={handleNavLinkClick}>Stress test</NavLink>
            <NavLink to="/scenarios" onClick={handleNavLinkClick}>Scenarios</NavLink>
            <NavLink to="/savings-goal" onClick={handleNavLinkClick}>Savings goal</NavLink>
            <NavLink to="/rent-vs-buy" onClick={handleNavLinkClick}>Rent vs buy</NavLink>
          </nav>

          <div className="spacer" />

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
            <Route path="/rent-vs-buy" element={<RentVsBuyPage />} />
          </Routes>
        </main>

        <InstallPrompt />
        <UpdatePrompt />
      </div>
    </InputsProvider>
  );
}
