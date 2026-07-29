import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { sessionService } from '../services/session';
import { db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Spinner } from '../components/ui/Spinner';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authState, setAuthState] = useState('loading'); // 'loading', 'pending-profile', 'ready', 'error'

  const login = authService.login;
  const loginWithGoogle = authService.loginWithGoogle;
  const register = authService.register;
  const logout = authService.logout;
  const resetPassword = authService.resetPassword;

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = authService.onAuthStateChanged((user) => {
      setCurrentUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        setAuthState('pending-profile');
        
        unsubscribeProfile = onSnapshot(
          doc(db, 'users', user.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const profile = docSnap.data();
              setUserProfile(profile);
              sessionService.setSession(user, profile.organizationId, profile.role);
              setAuthState('ready');
            } else {
              // Wait for authService.register to create it
              setUserProfile(null);
              sessionService.setSession(user, null, null);
              setAuthState('pending-profile');
            }
          },
          (error) => {
            console.error("Error subscribing to user profile:", error);
            setAuthState('error');
          }
        );
      } else {
        setUserProfile(null);
        sessionService.setSession(null, null, null);
        setAuthState('ready');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const value = {
    currentUser,
    userProfile,
    login,
    loginWithGoogle,
    register,
    logout,
    resetPassword
  };

  if (authState === 'loading' || authState === 'pending-profile') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#09090b', color: '#fff' }}>
        <Spinner size={32} />
        <span style={{ marginLeft: '12px' }}>Cargando sesión...</span>
      </div>
    );
  }

  if (authState === 'error') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#09090b', color: '#fca5a5' }}>
        <p>Error al cargar el perfil del usuario. Por favor, recarga la página o cierra sesión.</p>
        <button onClick={logout} style={{ marginLeft: '12px', padding: '8px', cursor: 'pointer' }}>Cerrar Sesión</button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
