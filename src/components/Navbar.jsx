import { useState, useEffect } from 'react';
import './Navbar.css';

const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard',              icon: '📊' },
  { id: 'clients',   label: 'Clientes',               icon: '👥' },
  { id: 'library',  label: 'Librería de Ejercicios', icon: '📚' },
  { id: 'workouts', label: 'Entrenamientos',          icon: '🏋️' },
  { id: 'schedule', label: 'Agenda',                  icon: '📅' },
];

export default function Navbar({ activeTab, onTabChange, role }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleTabs = [...NAV_TABS];
  if (role === 'owner') {
    visibleTabs.push({ id: 'users', label: 'Usuarios', icon: '⚙️' });
  }

  // Cerrar el menú móvil con Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const handleTabChange = (tabId) => {
    onTabChange(tabId);
    setMenuOpen(false);
  };

  return (
    <>
    <nav className="navbar" role="navigation" aria-label="Main navigation">

      {/* ── Logo (vuelve al Dashboard) ── */}
      <button
        type="button"
        className="navbar__brand"
        onClick={() => handleTabChange('dashboard')}
        aria-label="Ir al Dashboard"
      >
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
      </button>

      {/* ── Tabs (escritorio) ── */}
      <ul className="navbar__tabs" role="tablist">
        {visibleTabs.map((tab) => (
          <li key={tab.id} role="presentation">
            <button
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`navbar__tab ${activeTab === tab.id ? 'navbar__tab--active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="navbar__tab-icon" aria-hidden="true">{tab.icon}</span>
              <span className="navbar__tab-label">{tab.label}</span>
              {activeTab === tab.id && <span className="navbar__tab-indicator" />}
            </button>
          </li>
        ))}
      </ul>

      {/* ── Botón hamburguesa (móvil) ── */}
      <button
        type="button"
        className={`navbar__burger ${menuOpen ? 'navbar__burger--open' : ''}`}
        onClick={() => setMenuOpen(o => !o)}
        aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={menuOpen}
        aria-controls="navbar-mobile-menu"
      >
        <span className="navbar__burger-bar" />
        <span className="navbar__burger-bar" />
        <span className="navbar__burger-bar" />
      </button>
    </nav>

    {/* ── Menú desplegable (móvil) ──
        Va fuera del <nav> a propósito: el backdrop-filter de la navbar
        la convierte en bloque contenedor de sus hijos position:fixed,
        y el overlay se quedaba con altura 0. */}
    {menuOpen && (
      <>
        <div
          className="navbar__overlay"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
        <ul id="navbar-mobile-menu" className="navbar__mobile-menu">
          {visibleTabs.map((tab) => (
            <li key={tab.id}>
              <button
                className={`navbar__mobile-tab ${activeTab === tab.id ? 'navbar__mobile-tab--active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                <span className="navbar__tab-icon" aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    )}
    </>
  );
}
