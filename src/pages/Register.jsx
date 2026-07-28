import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import { Mail, Lock } from 'lucide-react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import './Auth.css';

// Google Icon SVG Component
const GoogleIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      return setError('Las contraseñas no coinciden.');
    }
    
    if (password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }

    try {
      setError('');
      setLoading(true);
      await register(email, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Error al crear la cuenta: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      setError('');
      setGoogleLoading(true);
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Error al iniciar sesión con Google.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Crear una cuenta"
      subtitle="Únete a nosotros para empezar"
      error={error}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <Input
          label="Email"
          type="email"
          icon={Mail}
          placeholder="tu@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        
        <Input
          label="Contraseña"
          type="password"
          icon={Lock}
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        
        <Input
          label="Confirmar Contraseña"
          type="password"
          icon={Lock}
          placeholder="••••••••"
          value={passwordConfirm}
          onChange={e => setPasswordConfirm(e.target.value)}
          required
        />

        <Button 
          type="submit" 
          loading={loading}
          disabled={googleLoading}
        >
          Registrarse
        </Button>
      </form>

      <div className="auth-divider">o regístrate con</div>

      <Button
        variant="google"
        icon={!googleLoading ? GoogleIcon : null}
        loading={googleLoading}
        disabled={loading}
        onClick={handleGoogleLogin}
      >
        Google
      </Button>

      <div className="auth-links">
        ¿Ya tienes una cuenta?
        <Link to="/login" className="auth-link">
          Iniciar sesión
        </Link>
      </div>
    </AuthLayout>
  );
}
