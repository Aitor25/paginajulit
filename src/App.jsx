import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import TabPlaceholder from './components/TabPlaceholder';
import ExerciseLibrary from './components/ExerciseLibrary';
import ClientManager from './components/ClientManager';
import WorkoutManager from './components/WorkoutManager';
import ClientPortal from './components/ClientPortal';
import CoachDashboard from './components/CoachDashboard';
import GlobalCalendar from './components/GlobalCalendar';
import UserManager from './components/UserManager';
import { sessionService } from './services/session';
import { storage } from './services/storage';
import './App.css';

/* ─── Tab content config ─────────────────────────────────── */
const TABS = {
  dashboard: { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  clients: { id: 'clients', icon: '👥', label: 'Clientes' },
  library: { id: 'library', icon: '📚', label: 'Librería de Ejercicios' },
  workouts: { id: 'workouts', icon: '🏋️', label: 'Entrenamientos' },
  schedule: { id: 'schedule', icon: '📅', label: 'Agenda' },
  users: { id: 'users', icon: '⚙️', label: 'Usuarios' },
};

import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthProvider';
import { ProtectedRoute, CoachRoute, ClientRoute } from './components/RoleRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import InvitePage from './pages/InvitePage';

/* ─── ClientPortalLayout ───────────────────────────────────────────────────*/
function ClientPortalLayout() {
  const { currentUser, logout } = useAuth();
  return (
    <div className="app">
      <div className="role-banner role-banner--client" style={{ '--role-color': 'var(--green)' }}>
        <div className="role-banner__left">
          <span className="role-banner__dot" />
          Vista activa: <strong>Portal Cliente</strong>
          <span style={{marginLeft: '20px', fontSize: '0.8rem', opacity: 0.8}}>
            Usuario: {currentUser?.email}
          </span>
        </div>
        <div className="role-banner__selector">
           <button onClick={logout} className="btn secondary" style={{padding: '4px 12px', fontSize: '0.8rem'}}>Cerrar Sesión</button>
        </div>
      </div>
      <main className="app__main">
        <ClientPortal />
      </main>
    </div>
  );
}

/* ─── CoachAppLayout ───────────────────────────────────────────────────*/
function CoachAppLayout() {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const currentTab = TABS[activeTab];

  return (
    <div className="app">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        role={userProfile?.role || 'coach'}
        onRoleChange={() => {}}
      />

      <div className="role-banner" style={{ '--role-color': userProfile?.role === 'owner' ? 'var(--gold)' : 'var(--accent)' }}>
        <div className="role-banner__left">
          <span className="role-banner__dot" />
          Vista activa: <strong>{userProfile?.role === 'owner' ? 'Owner' : 'Entrenador'}</strong>
          <span style={{marginLeft: '20px', fontSize: '0.8rem', opacity: 0.8}}>
            Usuario: {currentUser?.email}
          </span>
        </div>
        <div className="role-banner__selector">
           <button onClick={logout} className="btn secondary" style={{padding: '4px 12px', fontSize: '0.8rem'}}>Cerrar Sesión</button>
        </div>
      </div>

      <main className="app__main">
        {activeTab === 'dashboard' ? <CoachDashboard key="dashboard" /> :
         activeTab === 'library' ? <ExerciseLibrary key="library" /> :
         activeTab === 'clients' ? <ClientManager key="clients" /> :
         activeTab === 'workouts' ? <WorkoutManager key="workouts" /> :
         activeTab === 'schedule' ? <GlobalCalendar key="schedule" /> :
         activeTab === 'users' ? <UserManager key="users" /> :
         <TabPlaceholder id={currentTab.id} icon={currentTab.icon} label={currentTab.label} />
        }
      </main>
    </div>
  );
}

// Redirector root inteligente
function RootRedirector() {
  const { userProfile } = useAuth();
  const role = sessionService.getRole() || userProfile?.role;
  if (role === 'client') return <Navigate to="/client" replace />;
  return <Navigate to="/coach" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/invite" element={<InvitePage />} />
        
        {/* Rutas Privadas */}
        <Route path="/" element={<ProtectedRoute><RootRedirector /></ProtectedRoute>} />
        <Route path="/client/*" element={<ProtectedRoute><ClientRoute><ClientPortalLayout /></ClientRoute></ProtectedRoute>} />
        <Route path="/coach/*" element={<ProtectedRoute><CoachRoute><CoachAppLayout /></CoachRoute></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}
