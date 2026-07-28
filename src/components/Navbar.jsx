import { useState } from 'react';
import './Navbar.css';

const NAV_TABS = [
  { id: 'clients',   label: 'Clientes',              icon: '👥' },
  { id: 'library',  label: 'Librería de Ejercicios', icon: '📚' },
  { id: 'workouts', label: 'Entrenamientos',          icon: '🏋️' },
  { id: 'schedule', label: 'Agenda',                  icon: '📅' },
];

export default function Navbar({ activeTab, onTabChange }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">

      {/* ── Logo ── */}
      <div className="navbar__brand">
        <div className="navbar__logo-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
              fill="var(--accent)"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="navbar__brand-name">FitCoach<span className="navbar__brand-accent">Pro</span></span>
      </div>

      {/* ── Tabs ── */}
      <ul className="navbar__tabs" role="tablist">
        {NAV_TABS.map((tab) => (
          <li key={tab.id} role="presentation">
            <button
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`navbar__tab ${activeTab === tab.id ? 'navbar__tab--active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="navbar__tab-icon" aria-hidden="true">{tab.icon}</span>
              <span className="navbar__tab-label">{tab.label}</span>
              {activeTab === tab.id && <span className="navbar__tab-indicator" />}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
