import Navbar from './components/Navbar';
import ExerciseLibrary from './components/ExerciseLibrary';
import ClientManager from './components/ClientManager';
import WorkoutManager from './components/WorkoutManager';
import ClientPortal from './components/ClientPortal';
import GlobalCalendar from './components/GlobalCalendar';
import UserManager from './components/UserManager';
import { sessionService } from './services/session';
import './App.css';

import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
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

/* ─── CoachAppLayout ───────────────────────────────────────────────────
   Cada pestaña vive en su propia URL (/coach/clients, /coach/workouts...)
   en vez de en un estado local: antes cambiar de pestaña no dejaba rastro
   en el historial del navegador, así que el botón "atrás" se saltaba toda
   la app entera y sacaba directamente a lo que hubiera antes de entrar
   (Google, el login...). Con rutas de verdad, cada clic en una pestaña
   añade una entrada al historial y "atrás" va deshaciendo la navegación
   dentro de la app, como en cualquier web normal. */
function CoachAppLayout() {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // "/coach/workouts" -> "workouts"; "/coach" (sin sufijo) -> ''
  const activeTab = location.pathname.split('/')[2] || '';

  const handleTabChange = (tabId) => {
    navigate(`/coach/${tabId}`);
  };

  return (
    <div className="app">
      <Navbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        role={userProfile?.role || 'coach'}
        onLogout={logout}
      />

      <main className="app__main">
        <Routes>
          <Route index element={<Navigate to="clients" replace />} />
          <Route path="clients" element={<ClientManager key="clients" />} />
          <Route path="library" element={<ExerciseLibrary key="library" />} />
          <Route path="workouts" element={<WorkoutManager key="workouts" />} />
          <Route path="schedule" element={<GlobalCalendar key="schedule" />} />
          <Route path="users" element={<UserManager key="users" />} />
          <Route path="*" element={<Navigate to="clients" replace />} />
        </Routes>
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
