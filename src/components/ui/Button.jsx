import { forwardRef } from 'react';
import { Spinner } from './Spinner';

export const Button = forwardRef(({ 
  children, 
  className = '', 
  variant = 'primary', 
  loading = false, 
  disabled, 
  icon: Icon,
  type = 'button',
  ...props 
}, ref) => {
  // Clases propias de las páginas de auth: .btn-primary genérico vive en
  // index.css y lo usan los calendarios, no debe colisionar con este.
  const baseClass = variant === 'google' ? 'auth-btn auth-btn--google' : 'auth-btn auth-btn--primary';
  const finalDisabled = loading || disabled;

  return (
    <button
      ref={ref}
      type={type}
      disabled={finalDisabled}
      className={`${baseClass} ${className}`}
      {...props}
    >
      {loading ? (
        <Spinner size={18} />
      ) : Icon ? (
        <Icon size={18} />
      ) : null}
      {children}
    </button>
  );
});

Button.displayName = 'Button';
