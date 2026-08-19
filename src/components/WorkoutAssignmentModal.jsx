import { useState, useEffect, useRef } from 'react';
import { storage, KEYS } from '../services/storage';
import { createFocusTrap } from '../utils/focusTrap';

export default function WorkoutAssignmentModal({
  workoutId, // Si viene, se asigna este entrenamiento específico
  workoutIds, // Si viene (selección múltiple), se asignan todos estos a la vez
  clientId, // Si viene, se fija el cliente
  initialDate, // YYYY-MM-DD
  onClose,
  onSave
}) {
  // Normaliza las dos formas de recibir entrenamientos fijos (uno solo o
  // varios de una selección múltiple) a una única lista de trabajo.
  const fixedWorkoutIds = workoutIds && workoutIds.length > 0
    ? workoutIds.map(String)
    : (workoutId ? [String(workoutId)] : null);
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);
  const [workouts, setWorkouts] = useState([]);

  const [targetType, setTargetType] = useState('client'); // 'client' | 'group'
  const [targetId, setTargetId] = useState('');
  const [selectedWorkoutId, setSelectedWorkoutId] = useState('');
  // Varias fechas: la misma rutina se puede asignar varios días de una vez.
  const [scheduledDates, setScheduledDates] = useState(['']);
  const [errorMsg, setErrorMsg] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    async function loadData() {
      const dbClients = await storage.getClients();
      const dbGroups = await storage.getEntities(KEYS.GROUPS);
      const dbWorkouts = await storage.getWorkouts();
      
      setClients(dbClients);
      setGroups(dbGroups);
      setWorkouts(dbWorkouts);

      if (clientId) {
        setTargetType('client');
        setTargetId(String(clientId));
      } else if (dbClients.length > 0) {
        setTargetId(String(dbClients[0].id));
      }

      if (!fixedWorkoutIds && dbWorkouts.length > 0) {
        setSelectedWorkoutId(String(dbWorkouts[0].id));
      }
    }
    loadData();

    // Inicializar la primera fecha
    setScheduledDates([initialDate || new Date().toISOString().split('T')[0]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, initialDate, workoutId, workoutIds]);

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

  const groupMemberCount = targetType === 'group' && targetId
    ? clients.filter(c => String(c.groupId) === String(targetId)).length
    : 0;

  const handleDateChange = (index, value) => {
    setScheduledDates(prev => prev.map((d, i) => (i === index ? value : d)));
  };

  const handleAddDate = () => {
    setScheduledDates(prev => [...prev, '']);
  };

  const handleRemoveDate = (index) => {
    setScheduledDates(prev => prev.filter((_, i) => i !== index));
  };

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
    const idsToAssign = fixedWorkoutIds || (selectedWorkoutId ? [String(selectedWorkoutId)] : []);
    if (idsToAssign.length === 0) {
      setErrorMsg('Debes seleccionar un entrenamiento para asignar.');
      return;
    }
    // Fechas válidas y sin duplicados, en el orden en que se introdujeron.
    const dates = [...new Set(scheduledDates.map(d => d.trim()).filter(Boolean))];
    if (dates.length === 0) {
      setErrorMsg('Debes seleccionar al menos una fecha.');
      return;
    }

    // Un grupo no es un destinatario válido para la asignación en sí: se
    // expande a una asignación individual por cada cliente del grupo. La
    // Cloud Function exige un clientId real en cada documento (un
    // workout_assignment con groupId y sin clientId no se puede guardar,
    // y tampoco lo vería el cliente en su agenda ni el calendario, que
    // filtran siempre por clientId).
    const targetClientIds = targetType === 'client'
      ? [String(targetId)]
      : clients.filter(c => String(c.groupId) === String(targetId)).map(c => String(c.id));

    if (targetClientIds.length === 0) {
      setErrorMsg('Este grupo no tiene deportistas asignados.');
      return;
    }

    // Se cruzan entrenamientos × destinatarios × fechas: una asignación
    // individual por cada combinación entrenamiento-cliente-día (lo normal es
    // un único entrenamiento, pero la selección múltiple permite asignar
    // varios de golpe). La hora de las 10:00 se añadía automáticamente
    // antes, pero el usuario pidió mantener scheduledAt como fecha local
    // YYYY-MM-DD, sin hora ficticia.
    const jobs = [];
    for (const wId of idsToAssign) {
      for (const cId of targetClientIds) {
        for (const date of dates) {
          jobs.push(storage.saveWorkoutAssignment({
            workoutId: String(wId),
            clientId: cId,
            scheduledAt: date,
            status: 'pending'
          }));
        }
      }
    }

    const results = await Promise.allSettled(jobs);

    const fallidas = results.filter(r => r.status === 'rejected');
    const guardadas = results.filter(r => r.status === 'fulfilled').map(r => r.value);

    if (fallidas.length === results.length) {
      setErrorMsg(fallidas[0].reason?.message || 'No se pudo guardar la asignación.');
      return;
    }

    if (onSave) onSave(guardadas);

    if (fallidas.length > 0) {
      setErrorMsg(
        `Se crearon ${guardadas.length} de ${results.length} asignaciones. ` +
        `Fallo en ${fallidas.length}: ${fallidas[0].reason?.message || 'error desconocido'}.`
      );
      return;
    }

    onClose();
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

          {/* Entrenamiento(s) a asignar */}
          {fixedWorkoutIds && fixedWorkoutIds.length > 1 ? (
            <div className="el__field">
              <label className="el__label">Entrenamientos seleccionados</label>
              <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                Se asignarán <strong>{fixedWorkoutIds.length}</strong> entrenamientos.
              </div>
            </div>
          ) : !fixedWorkoutIds && (
            <div className="el__field">
              <label className="el__label">Entrenamiento (Plantilla)</label>
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
                ? clients.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)
                : groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
              }
            </select>
            {targetType === 'group' && targetId && (
              <span className="wa__group-hint">
                {groupMemberCount} deportista{groupMemberCount === 1 ? '' : 's'} en este grupo
              </span>
            )}
          </div>

          {/* Fecha(s) Programada(s) */}
          <div className="el__field">
            <label className="el__label">
              {scheduledDates.length > 1 ? 'Días Programados' : 'Fecha Programada'}
            </label>
            <div className="wa__dates-list">
              {scheduledDates.map((date, i) => (
                <div key={i} className="wa__date-row">
                  <input
                    type="date"
                    className="el__input"
                    value={date}
                    onChange={e => handleDateChange(i, e.target.value)}
                    required
                  />
                  {scheduledDates.length > 1 && (
                    <button
                      type="button"
                      className="wa__date-remove"
                      onClick={() => handleRemoveDate(i)}
                      aria-label="Quitar esta fecha"
                      title="Quitar esta fecha"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="el__btn el__btn--ghost wa__add-date-btn" onClick={handleAddDate}>
              + Añadir otro día
            </button>
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
