import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';

export default function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();

  if (!currentUser) {
    // Si no está logueado, lo mandamos a login
    return <Navigate to="/login" replace />;
  }

  return children;
}
