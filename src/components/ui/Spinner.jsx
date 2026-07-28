import { Loader2 } from 'lucide-react';

export function Spinner({ className = '', size = 24, color = 'currentColor' }) {
  return (
    <Loader2 
      className={`spinner ${className}`} 
      size={size} 
      color={color} 
    />
  );
}
