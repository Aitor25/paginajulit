import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import TabPlaceholder from './components/TabPlaceholder';
import ExerciseLibrary from './components/ExerciseLibrary';
import ClientManager from './components/ClientManager';
import WorkoutManager from './components/WorkoutManager';
import ClientPortal from './components/ClientPortal';
import CoachDashboard from './components/CoachDashboard';
import GlobalCalendar from './components/GlobalCalendar';
import { sessionService } from './services/session';
import { storage } from './services/storage';
import './App.css';

/* ─── Tab content config ─────────────────────────────────── */
const TABS = {
  dashboard: {
    id: 'dashboard',
    icon: '📊',
    label: 'Dashboard',
    description: 'Vista global del cumplimiento y actividad reciente de tus deportistas.',
  },
  clients: {
    id: 'clients',
    icon: '👥',
    label: 'Clientes',
    description: 'Gestiona tu cartera de clientes, revisa su progreso y personaliza sus planes de entrenamiento.',
  },
  library: {
    id: 'library',
    icon: '📚',
    label: 'Librería de Ejercicios',
    description: 'Explora y organiza una base de datos completa de ejercicios con instrucciones en vídeo y categorías.',
  },
  workouts: {
    id: 'workouts',
    icon: '🏋️',
    label: 'Entrenamientos',
    description: 'Diseña y asigna rutinas de entrenamiento personalizadas con bloques de ejercicios y progresiones.',
  },
  schedule: {
    id: 'schedule',
    icon: '📅',
    label: 'Agenda',
    description: 'Organiza sesiones, gestiona tu disponibilidad y envía recordatorios automáticos a tus clientes.',
  },
};

/* ─── Role config ───────────────────────────────────────────*/
const ROLE_META = {
  coach:  { label: 'Entrenador',  color: 'var(--accent)' },
  client: { label: 'Cliente',     color: 'var(--green)'  },
};

import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import InvitePage from './pages/InvitePage';

/* ─── AppLayout ───────────────────────────────────────────────────*/
function AppLayout() {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [role, setRole]           = useState(sessionService.getRole());
  const [simulatedClients, setSimulatedClients] = useState([]);
  const [simulatedClientId, setSimulatedClientId] = useState('');

  const currentTab = TABS[activeTab];
  const roleMeta   = ROLE_META[role];

  // Cargar lista de clientes para simulación local
  useEffect(() => {
    async function loadSimData() {
      const dbClients = await storage.getClients();
      // Filtrar clientes activos
      const activeClients = dbClients.filter(c => c.status === 'active');
      setSimulatedClients(activeClients);
      
      const currentActive = sessionService.getActiveClientId();
      if (currentActive && activeClients.some(c => c.id === currentActive)) {
        setSimulatedClientId(String(currentActive));
      } else if (activeClients.length > 0) {
        sessionService.setActiveClientId(activeClients[0].id);
        setSimulatedClientId(String(activeClients[0].id));
      }
    }
    loadSimData();
  }, [role]);

  const handleSimulatedClientChange = (e) => {
    const val = Number(e.target.value);
    setSimulatedClientId(e.target.value);
    sessionService.setActiveClientId(val);
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    sessionService.setRole(newRole);
  };

  return (
    <div className="app">
      {/* ── Navigation ── */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        role={role}
        onRoleChange={handleRoleChange}
      />

      {/* ── Role banner ── */}
      <div
        className={`role-banner${role === 'client' ? ' role-banner--client' : ''}`}
        style={{ '--role-color': roleMeta.color }}
      >
        <div className="role-banner__left">
          <span className="role-banner__dot" />
          Vista activa: <strong>{roleMeta.label}</strong>
          {role === 'client' && (
            <span className="role-banner__dev-badge">
              ⚠️ Simulación Local de Desarrollo
            </span>
          )}
          <span style={{marginLeft: '20px', fontSize: '0.8rem', opacity: 0.8}}>
            Usuario: {currentUser?.email}
          </span>
        </div>

        {role === 'client' ? (
          <div className="role-banner__selector">
            <span>Simular deportista activo:</span>
            <select
              value={simulatedClientId}
              onChange={handleSimulatedClientChange}
              className="role-banner__select"
            >
              {simulatedClients.map(c => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
              {simulatedClients.length === 0 && (
                <option value="">No hay deportistas activos</option>
              )}
            </select>
          </div>
        ) : (
          <div className="role-banner__selector">
             <button onClick={logout} className="btn secondary" style={{padding: '4px 12px', fontSize: '0.8rem'}}>Cerrar Sesión</button>
          </div>
        )}
      </div>


      {/* ── Page content ── */}
      <main className="app__main">
        {role === 'client' ? (
          <ClientPortal key="client-portal" />
        ) : activeTab === 'dashboard' ? (
          <CoachDashboard key="dashboard" />
        ) : activeTab === 'library' ? (
          <ExerciseLibrary key="library" />
        ) : activeTab === 'clients' ? (
          <ClientManager key="clients" />
        ) : activeTab === 'workouts' ? (
          <WorkoutManager key="workouts" />
        ) : activeTab === 'schedule' ? (
          <GlobalCalendar key="schedule" />
        ) : (
          <TabPlaceholder
            key={activeTab}          /* re-mount triggers fade-up on every switch */
            id={currentTab.id}
            icon={currentTab.icon}
            label={currentTab.label}
            description={currentTab.description}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}
