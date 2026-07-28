import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function AuthLayout({ children, title, subtitle, error, message }) {
  return (
    <div className="auth-wrapper">
      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-header">
          <motion.h1 
            className="auth-title"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            {title}
          </motion.h1>
          {subtitle && (
            <motion.p 
              className="auth-subtitle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              {subtitle}
            </motion.p>
          )}
        </div>

        {error && (
          <motion.div 
            className="alert alert-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </motion.div>
        )}

        {message && (
          <motion.div 
            className="alert alert-success"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <CheckCircle2 size={18} />
            <span>{message}</span>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}
