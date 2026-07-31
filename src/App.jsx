import { useState } from 'react';
import Navbar from './components/Navbar';
import TabPlaceholder from './components/TabPlaceholder';
import ExerciseLibrary from './components/ExerciseLibrary';
import ClientManager from './components/ClientManager';
import WorkoutManager from './components/WorkoutManager';
import ClientPortal from './components/ClientPortal';
import GlobalCalendar from './components/GlobalCalendar';
import UserManager from './components/UserManager';
import { sessionService } from './services/session';
import './App.css';

/* ─── Tab content config ─────────────────────────────────── */
const TABS = {
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
  return (
    <div className="app app--client">
      <main className="app__main">
        <ClientPortal />
      </main>
    </div>
  );
}

/* ─── CoachAppLayout ───────────────────────────────────────────────────*/
function CoachAppLayout() {
  const { userProfile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('clients');

  const currentTab = TABS[activeTab];

  return (
    <div className="app">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        role={userProfile?.role || 'coach'}
        onLogout={logout}
      />

      <main className="app__main">
        {activeTab === 'library' ? <ExerciseLibrary key="library" /> :
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
