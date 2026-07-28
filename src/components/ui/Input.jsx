import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const Input = forwardRef(({
  label,
  icon: Icon,
  type = 'text',
  className = '',
  id,
  error,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;
  const inputId = id || Math.random().toString(36).slice(2, 9);

  return (
    <div className="form-group">
      {label && <label className="form-label" htmlFor={inputId}>{label}</label>}
      <div className="input-wrapper">
        {Icon && (
          <div className="input-icon">
            <Icon size={18} />
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          className={`form-input ${Icon ? 'has-icon' : ''} ${className}`}
          style={{ paddingLeft: Icon ? '2.75rem' : '1rem' }}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="input-action"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && <span className="input-error-msg">{error}</span>}
    </div>
  );
});

Input.displayName = 'Input';
