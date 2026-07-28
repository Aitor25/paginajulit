import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";
import { sessionService } from "../services/session";

export function ProtectedRoute({ children }) {
  const { currentUser, userProfile } = useAuth();
  
  // Wait for userProfile to load before redirecting to avoid flickering
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  if (currentUser && !userProfile) {
    return <div className="app-loader"><div className="spinner"></div></div>;
  }
  
  return children;
}

export function CoachRoute({ children }) {
  const { userProfile } = useAuth();
  const role = sessionService.getRole() || userProfile?.role;
  
  if (role !== "owner" && role !== "coach") {
    // If not coach/owner, send to client portal (or fallback)
    return <Navigate to="/" replace />; // AppLayout handles routing inside "/"
  }
  return children;
}

export function ClientRoute({ children }) {
  const { userProfile } = useAuth();
  const role = sessionService.getRole() || userProfile?.role;
  
  if (role !== "client") {
    return <Navigate to="/" replace />;
  }
  return children;
}

