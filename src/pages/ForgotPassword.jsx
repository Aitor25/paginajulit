import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import { Mail } from 'lucide-react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { resetPassword } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) {
      return setError('Por favor, ingresa tu email.');
    }
    
    try {
      setMessage('');
      setError('');
      setLoading(true);
      await resetPassword(email);
      setMessage('Se ha enviado un enlace a tu correo para restablecer la contraseña.');
    } catch (err) {
      console.error(err);
      setError('Error al restablecer la contraseña. Verifica el email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Recuperar Contraseña"
      subtitle="Te enviaremos un enlace para restablecerla"
      error={error}
      message={message}
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

        <Button 
          type="submit" 
          loading={loading}
        >
          Enviar enlace de recuperación
        </Button>
      </form>

      <div className="auth-links" style={{ marginTop: '1.5rem' }}>
        <Link to="/login" className="auth-link">
          Volver a iniciar sesión
        </Link>
      </div>
    </AuthLayout>
  );
}
