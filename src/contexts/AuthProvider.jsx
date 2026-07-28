import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { firestoreService } from '../services/firestoreService';
import { sessionService } from '../services/session';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = authService.login;
  const register = authService.register;
  const logout = authService.logout;
  const resetPassword = authService.resetPassword;

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // 1. Recuperar perfil de Firestore
          const profile = await firestoreService.getDocument('users', user.uid);
          setUserProfile(profile || null);

          // 2. Recuperar membresías para determinar orgId y rol (simplificado a 1 org activa por ahora)
          const members = await firestoreService.getDocumentsByQuery('organization_members', [
            { field: 'userId', op: '==', value: user.uid },
            { field: 'status', op: '==', value: 'active' }
          ]);

          if (members.length > 0) {
            const org = members[0];
            sessionService.setSession(user, org.orgId, org.role);
          } else {
            sessionService.setSession(user, null, null);
          }

        } catch (error) {
          console.error("Error al obtener el perfil del usuario:", error);
          setUserProfile(null);
          sessionService.setSession(user, null, null);
        }
      } else {
        setUserProfile(null);
        sessionService.setSession(null, null, null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    login,
    register,
    logout,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

