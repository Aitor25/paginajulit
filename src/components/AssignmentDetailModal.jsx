import React, { useEffect, useRef } from 'react';
import { createFocusTrap } from '../utils/focusTrap';

export default function AssignmentDetailModal({
  event,
  onClose,
  onRescheduleClick,
  readOnly = false
}) {
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

  const isWorkout = event.type === 'workout';
  const isReprogrammable = isWorkout && !['completed', 'in_progress', 'cancelled'].includes(event.status);

  return (
    <div className="el__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ad-modal-title" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="el__modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="el__modal-header">
          <h2 id="ad-modal-title" className="el__modal-title">Detalles del Evento</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>

        <div className="el__modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
              Título
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', marginTop: '4px' }}>
              {event.title}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
                Fecha
              </span>
              <div style={{ marginTop: '4px' }}>
                {event.date}
              </div>
            </div>
            
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
                Estado
              </span>
              <div style={{ marginTop: '4px', textTransform: 'capitalize' }}>
                <span className={`cm__card-status-badge cm__card-status-badge--${event.status === 'completed' ? 'active' : event.status === 'missed' ? 'archived' : 'pending'}`}>
                  {event.status}
                </span>
              </div>
            </div>
          </div>

          {event.clientName && (
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
                Cliente / Asignado a
              </span>
              <div style={{ marginTop: '4px' }}>
                {event.clientName}
              </div>
            </div>
          )}

          {event.type === 'free_session' && (
            <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
              Esta es una sesión libre iniciada por el cliente. No es reprogramable.
            </div>
          )}
          
          {event.type === 'program_start' && (
            <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
              Hito de inicio de programa.
            </div>
          )}

          {event.type === 'program_end' && (
            <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
              Hito de fin de programa.
            </div>
          )}
        </div>

        <div className="el__modal-footer" style={{ padding: '16px 20px', borderTop: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="el__btn el__btn--ghost" onClick={onClose}>
            Cerrar
          </button>
          {!readOnly && isReprogrammable && (
            <button 
              className="el__btn el__btn--primary" 
              onClick={() => {
                onClose();
                if (onRescheduleClick) onRescheduleClick(event);
              }}
            >
              Reprogramar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
