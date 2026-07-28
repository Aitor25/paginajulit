import React, { useState, useEffect, useRef } from 'react';
import { createFocusTrap } from '../utils/focusTrap';

export const RescheduleModal = ({ event, onClose, onSave }) => {
  const [newDate, setNewDate] = useState(event?.date || '');
  const [error, setError] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (modalRef.current) {
      const trigger = document.activeElement;
      const cleanup = createFocusTrap(modalRef.current, trigger);
      return cleanup;
    }
  }, []);

  if (!event) return null;

  const isReschedulable = 
    event.type === 'workout' && 
    !['completed', 'in_progress', 'cancelled'].includes(event.status);

  const handleSave = async () => {
    if (!newDate) {
      setError("Selecciona una fecha válida.");
      return;
    }
    
    // Si no ha cambiado la fecha, cerramos sin hacer nada
    if (newDate === event.date) {
      onClose();
      return;
    }

    try {
      await onSave(event.assignmentId, newDate);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="el__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rm-modal-title" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="el__modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="el__modal-header">
          <h2 id="rm-modal-title" className="el__modal-title">Reprogramar Evento</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>
        
        <div className="el__modal-body" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '20px', fontSize: '0.9rem', color: 'var(--gray-600)' }}>
          <p><strong>Título:</strong> {event.title}</p>
          <p><strong>Cliente:</strong> {event.clientName}</p>
          <p><strong>Tipo:</strong> {event.type === 'free_session' ? 'Sesión Libre' : event.type === 'program_start' ? 'Inicio Programa' : event.type === 'program_end' ? 'Fin Programa' : 'Entrenamiento'}</p>
          {event.type === 'workout' && <p><strong>Estado:</strong> {event.status}</p>}
        </div>

        {isReschedulable ? (
          <div>
            <h3>Reprogramar</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '10px' }}>
              Selecciona una nueva fecha. Si la sesión estaba "missed" y la mueves a hoy o al futuro, volverá a estar "pending".
            </p>
            <div className="el__field">
              <label className="el__label">Nueva Fecha</label>
              <input 
                type="date" 
                value={newDate} 
                onChange={(e) => { setNewDate(e.target.value); setError(null); }} 
                className="el__input"
              />
            </div>
            
            {error && <div className="gc__alert" style={{ background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030', marginTop: '10px' }}>{error}</div>}
            
            <div className="el__modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="el__btn el__btn--ghost" onClick={onClose}>Cancelar</button>
              <button className="el__btn el__btn--primary" onClick={handleSave}>Guardar</button>
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: '20px' }}>
            Este evento no admite reprogramación.
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
