import { useState, useEffect } from 'react';
import './Navbar.css';

const NAV_TABS = [
  { id: 'clients',  label: 'Clientes',               icon: '👥' },
  { id: 'library',  label: 'Librería de Ejercicios', icon: '📚' },
  { id: 'workouts', label: 'Entrenamientos',          icon: '🏋️' },
  { id: 'schedule', label: 'Agenda',                  icon: '📅' },
];

export default function Navbar({ activeTab, onTabChange, role, onLogout }) {
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

      {/* ── Logo (vuelve a la primera pestaña) ── */}
      <button
        type="button"
        className="navbar__brand"
        onClick={() => handleTabChange(visibleTabs[0]?.id)}
        aria-label="Ir al inicio"
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

      {/* ── Cerrar sesión (siempre visible, icono compacto) ── */}
      <button
        type="button"
        className="navbar__logout-btn"
        onClick={onLogout}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>

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
          <li className="navbar__mobile-divider" role="presentation" />
          <li>
            <button
              className="navbar__mobile-tab navbar__mobile-tab--logout"
              onClick={() => { setMenuOpen(false); onLogout(); }}
            >
              <span className="navbar__tab-icon" aria-hidden="true">🚪</span>
              <span>Cerrar sesión</span>
            </button>
          </li>
        </ul>
      </>
    )}
    </>
  );
}
