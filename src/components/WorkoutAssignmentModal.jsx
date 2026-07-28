import { useState, useEffect, useRef } from 'react';
import { storage, KEYS } from '../services/storage';
import { createFocusTrap } from '../utils/focusTrap';

export default function WorkoutAssignmentModal({
  workoutId, // Si viene, se asigna esta rutina específica
  clientId, // Si viene, se fija el cliente
  initialDate, // YYYY-MM-DD
  onClose,
  onSave
}) {
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);
  const [workouts, setWorkouts] = useState([]);

  const [targetType, setTargetType] = useState('client'); // 'client' | 'group'
  const [targetId, setTargetId] = useState('');
  const [selectedWorkoutId, setSelectedWorkoutId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    async function loadData() {
      const dbClients = await storage.getClients();
      const dbGroups = await storage.getEntities(KEYS.GROUPS);
      const dbWorkouts = await storage.getWorkouts();
      
      setClients(dbClients.filter(c => c.status !== 'archived'));
      setGroups(dbGroups);
      setWorkouts(dbWorkouts.filter(w => w.status === 'active'));

      if (clientId) {
        setTargetType('client');
        setTargetId(String(clientId));
      } else if (dbClients.length > 0) {
        setTargetId(String(dbClients[0].id));
      }

      if (workoutId) {
        setSelectedWorkoutId(String(workoutId));
      } else if (dbWorkouts.length > 0) {
        setSelectedWorkoutId(String(dbWorkouts[0].id));
      }
    }
    loadData();
    
    // Inicializar fecha
    if (initialDate) {
      setScheduledAt(initialDate);
    } else {
      const today = new Date().toISOString().split('T')[0];
      setScheduledAt(today);
    }
  }, [clientId, initialDate, workoutId]);

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

  const handleTargetTypeChange = (type) => {
    if (clientId) return; // Bloquear si el cliente vino preseleccionado
    setTargetType(type);
    setErrorMsg('');
    if (type === 'client' && clients.length > 0) {
      setTargetId(String(clients[0].id));
    } else if (type === 'group' && groups.length > 0) {
      setTargetId(String(groups[0].id));
    } else {
      setTargetId('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!targetId) {
      setErrorMsg('Debes seleccionar un destinatario válido.');
      return;
    }
    if (!selectedWorkoutId) {
      setErrorMsg('Debes seleccionar una rutina para asignar.');
      return;
    }
    if (!scheduledAt) {
      setErrorMsg('Debes seleccionar una fecha.');
      return;
    }

    const payload = {
      workoutId: Number(selectedWorkoutId),
      clientId: targetType === 'client' ? Number(targetId) : null,
      groupId: targetType === 'group' ? Number(targetId) : null,
      // La hora de las 10:00 se añadía automáticamente, pero el usuario pidió "Mantén scheduledAt como fecha local YYYY-MM-DD. No añadas automáticamente una hora ficticia de las 10:00."
      // Storage saveWorkoutAssignment hace el snapshot. Dependiendo de cómo lo maneje storage, enviaremos la fecha como está o como ISO.
      // Modificaremos saveWorkoutAssignment para aceptar YYYY-MM-DD o ISO y normalizarlo. Por ahora, pasamos la fecha que será YYYY-MM-DD
      scheduledAt: scheduledAt,
      status: 'pending'
    };

    try {
      const saved = await storage.saveWorkoutAssignment(payload);
      if (onSave) onSave(saved);
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="el__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wa-modal-title" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="el__modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="el__modal-header">
          <h2 id="wa-modal-title" className="el__modal-title">Programar Asignación</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="el__modal-form" noValidate>
          {errorMsg && (
            <div className="gc__alert" style={{ background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030' }}>
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {/* Rutina a asignar */}
          {!workoutId && (
            <div className="el__field">
              <label className="el__label">Rutina (Plantilla)</label>
              <select
                className="el__input"
                value={selectedWorkoutId}
                onChange={e => setSelectedWorkoutId(e.target.value)}
              >
                <option value="">-- Selecciona --</option>
                {workouts.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tipo de Destinatario */}
          {!clientId && (
            <div className="el__field">
              <label className="el__label">Asignar entrenamiento a</label>
              <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetType"
                    checked={targetType === 'client'}
                    onChange={() => handleTargetTypeChange('client')}
                  />
                  Un Cliente
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetType"
                    checked={targetType === 'group'}
                    onChange={() => handleTargetTypeChange('group')}
                  />
                  Un Grupo de Entrenamiento
                </label>
              </div>
            </div>
          )}

          {/* Destinatario Específico */}
          <div className="el__field">
            <label className="el__label">Selecciona el {targetType === 'client' ? 'Cliente' : 'Grupo'}</label>
            <select
              className="el__input"
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              disabled={!!clientId}
            >
              <option value="">-- Selecciona --</option>
              {targetType === 'client' 
                ? clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                : groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
              }
            </select>
          </div>

          {/* Fecha Programada */}
          <div className="el__field">
            <label className="el__label">Fecha Programada</label>
            <input
              type="date"
              className="el__input"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              required
            />
          </div>

          <div className="el__modal-actions">
            <button type="button" className="el__btn el__btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="el__btn el__btn--primary">
              Confirmar Asignación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
