import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import { functionsService } from '../services/functionsService';
import './Auth.css';

export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token de invitación no válido o ausente.');
    }
  }, [token]);

  async function handleConsumeInvite() {
    if (!token || !currentUser) return;

    setLoading(true);
    setError('');
    try {
      await functionsService.call('consumeInvite', { token });
      setSuccess(true);
      setTimeout(() => {
        navigate('/'); // Redirigir al dashboard al aceptar
      }, 2000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al procesar la invitación');
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Invitación Inválida</h2>
          <div className="alert error">{error}</div>
          <Link to="/" className="btn secondary block">Ir al inicio</Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>¡Invitación Aceptada!</h2>
          <div className="alert success">Cuenta vinculada correctamente. Redirigiendo...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Has recibido una invitación</h2>
        <p>Para acceder a tu plan de entrenamiento, necesitas vincular esta invitación con una cuenta.</p>
        
        {currentUser ? (
          <div className="invite-actions">
            <p>Conectado como <strong>{currentUser.email}</strong></p>
            <button 
              className="btn primary block" 
              onClick={handleConsumeInvite}
              disabled={loading}
            >
              {loading ? 'Procesando...' : 'Aceptar Invitación'}
            </button>
            <button 
              className="btn secondary block"
              onClick={() => navigate('/')}
              style={{marginTop: '10px'}}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="invite-actions">
            <p>Inicia sesión o regístrate para aceptar la invitación.</p>
            <Link to="/login" className="btn primary block">Iniciar Sesión</Link>
            <Link to="/register" className="btn secondary block" style={{marginTop: '10px'}}>Crear Cuenta</Link>
          </div>
        )}
      </div>
    </div>
  );
}
