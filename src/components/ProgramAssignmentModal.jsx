import { useState, useEffect } from 'react';
import { storage, KEYS } from '../services/storage';

export default function ProgramAssignmentModal({
  programId,
  durationWeeks,
  onClose,
  onSave
}) {
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);

  // Destinatarios
  const [assignmentType, setAssignmentType] = useState('single'); // 'single' | 'multiple' | 'group'
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  
  const [startDate, setStartDate] = useState('');
  
  // Control de conflictos/solapamientos
  const [conflicts, setConflicts] = useState([]);
  const [overlapResolution, setOverlapResolution] = useState('pause'); // 'pause' | 'overlap'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadData() {
      const dbClients = await storage.getClients();
      const dbGroups = await storage.getEntities(KEYS.GROUPS);

      const activeClients = dbClients.filter(c => c.status === 'active');
      setClients(activeClients);
      setGroups(dbGroups);

      if (activeClients.length > 0) {
        setSelectedClientId(String(activeClients[0].id));
      }
      if (dbGroups.length > 0) {
        setSelectedGroupId(String(dbGroups[0].id));
      }
    }
    loadData();

    // Fecha actual por defecto
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
  }, []);

  const handleCheckboxToggle = (clientId) => {
    setSelectedClientIds(prev => {
      if (prev.includes(clientId)) {
        return prev.filter(id => id !== clientId);
      } else {
        return [...prev, clientId];
      }
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setConflicts([]);

    if (!startDate) {
      setErrorMsg('Debes seleccionar una fecha de inicio.');
      return;
    }

    // Resolver lista definitiva de IDs de clientes destinatarios
    let targetClientIds = [];
    if (assignmentType === 'single') {
      if (!selectedClientId) {
        setErrorMsg('Selecciona un cliente.');
        return;
      }
      targetClientIds = [String(selectedClientId)];
    } else if (assignmentType === 'multiple') {
      if (selectedClientIds.length === 0) {
        setErrorMsg('Selecciona al menos un cliente de la lista.');
        return;
      }
      targetClientIds = selectedClientIds.map(String);
    } else if (assignmentType === 'group') {
      if (!selectedGroupId) {
        setErrorMsg('Selecciona un grupo.');
        return;
      }
      // Obtener clientes del grupo
      const groupClients = clients.filter(c => String(c.groupId) === String(selectedGroupId));
      if (groupClients.length === 0) {
        setErrorMsg('El grupo seleccionado no tiene deportistas activos.');
        return;
      }
      targetClientIds = groupClients.map(c => String(c.id));
    }

    // 1. CHEQUEAR SOLAPAMIENTOS EN CLIENTE
    const allAssignments = await storage.getProgramAssignments();
    const activeConflicts = [];

    targetClientIds.forEach(cId => {
      const active = allAssignments.find(pa => String(pa.clientId) === cId && pa.status === 'active');
      if (active) {
        const clientObj = clients.find(cl => String(cl.id) === cId);
        activeConflicts.push({
          clientId: cId,
          clientName: clientObj ? `${clientObj.firstName} ${clientObj.lastName}` : `Cliente #${cId}`,
          existingAssignment: active
        });
      }
    });

    // Si hay conflictos y no hemos resuelto aún qué hacer
    if (activeConflicts.length > 0 && conflicts.length === 0) {
      setConflicts(activeConflicts);
      return;
    }

    try {
      // 2. APLICAR RESOLUCIÓN Y PERSISTIR
      for (const cId of targetClientIds) {
        const conflict = conflicts.find(co => String(co.clientId) === cId);
        
        if (conflict && overlapResolution === 'pause') {
          // Pausar el programa anterior: cambiar estado a 'completed' y fijar endDate el día anterior a startDate
          const oldAssign = conflict.existingAssignment;
          const prevDay = new Date(startDate);
          prevDay.setDate(prevDay.getDate() - 1);

          await storage.saveProgramAssignment({
            ...oldAssign,
            status: 'completed',
            endDate: prevDay.toISOString().split('T')[0],
            forceOverlap: true
          });
        }

        // Crear la nueva asignación individual
        await storage.saveProgramAssignment({
          programId: String(programId),
          clientId: cId,
          groupId: assignmentType === 'group' ? String(selectedGroupId) : null,
          startDate: startDate,
          status: 'active',
          progressPercentage: 0,
          forceOverlap: true // Ya controlamos el solapamiento en el modal
        });
      }

      if (onSave) onSave();
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="el__modal" style={{ maxWidth: '460px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="el__modal-header">
          <h2 className="el__modal-title">Asignar Programa</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>

        <form onSubmit={handleSave} className="el__modal-form" noValidate>
          {errorMsg && (
            <div className="gc__alert" style={{ background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030' }}>
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {conflicts.length > 0 ? (
            /* INTERFAZ DE RESOLUCIÓN DE SOLAPAMIENTOS */
            <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="gc__alert" style={{ background: '#fffbeb', borderColor: '#fef3c7', color: '#b45309' }}>
                <strong>⚠️ Conflicto de Solapamiento Detectado:</strong>
                <p style={{ marginTop: '6px' }}>Los siguientes deportistas ya tienen un plan de entrenamiento activo:</p>
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  {conflicts.map(co => (
                    <li key={co.clientId}>{co.clientName}</li>
                  ))}
                </ul>
              </div>

              <div className="el__field">
                <label className="el__label">Selecciona cómo resolver el conflicto</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="conflictRes"
                      value="pause"
                      checked={overlapResolution === 'pause'}
                      onChange={() => setOverlapResolution('pause')}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <strong>Finalizar plan anterior y comenzar este (Recomendado)</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                        El programa viejo se marcará como completado y sus sesiones pendientes serán removidas.
                      </span>
                    </div>
                  </label>
                  
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="conflictRes"
                      value="overlap"
                      checked={overlapResolution === 'overlap'}
                      onChange={() => setOverlapResolution('overlap')}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <strong>Solapar (Permitir planes concurrentes)</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                        Ambos programas estarán activos simultáneamente en sus calendarios.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="el__btn el__btn--ghost" style={{ flex: 1 }} onClick={() => setConflicts([])}>
                  Atrás
                </button>
                <button type="submit" className="el__btn el__btn--primary" style={{ flex: 1 }}>
                  Confirmar Asignación
                </button>
              </div>
            </div>
          ) : (
            /* CONFIGURACIÓN DE ASIGNACIÓN NORMAL */
            <>
              {/* Tipo de Destinatario */}
              <div className="el__field">
                <label className="el__label">Modo de Asignación Masiva</label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className={`el__btn ${assignmentType === 'single' ? 'el__btn--primary' : 'el__btn--ghost'}`}
                    style={{ flex: 1, padding: '6px 0', fontSize: '0.75rem' }}
                    onClick={() => setAssignmentType('single')}
                  >
                    Un Atleta
                  </button>
                  <button
                    type="button"
                    className={`el__btn ${assignmentType === 'multiple' ? 'el__btn--primary' : 'el__btn--ghost'}`}
                    style={{ flex: 1, padding: '6px 0', fontSize: '0.75rem' }}
                    onClick={() => setAssignmentType('multiple')}
                  >
                    Varios
                  </button>
                  <button
                    type="button"
                    className={`el__btn ${assignmentType === 'group' ? 'el__btn--primary' : 'el__btn--ghost'}`}
                    style={{ flex: 1, padding: '6px 0', fontSize: '0.75rem' }}
                    onClick={() => setAssignmentType('group')}
                  >
                    Un Grupo
                  </button>
                </div>
              </div>

              {/* Controles Dinámicos */}
              {assignmentType === 'single' && (
                <div className="el__field">
                  <label className="el__label">Selecciona el Deportista</label>
                  <select
                    className="el__input el__input--select"
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </div>
              )}

              {assignmentType === 'multiple' && (
                <div className="el__field">
                  <label className="el__label">Selecciona los Deportistas activos ({selectedClientIds.length})</label>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {clients.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(String(c.id))}
                          onChange={() => handleCheckboxToggle(String(c.id))}
                        />
                        {c.firstName} {c.lastName}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {assignmentType === 'group' && (
                <div className="el__field">
                  <label className="el__label">Selecciona el Grupo Deportivo</label>
                  <select
                    className="el__input el__input--select"
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: '4px', display: 'block' }}>
                    * Se generará un calendario de entrenamiento individual para cada miembro del grupo.
                  </span>
                </div>
              )}

              {/* Fecha de Inicio */}
              <div className="el__field">
                <label className="el__label">Fecha de Inicio del Programa *</label>
                <input
                  type="date"
                  className="el__input"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="el__modal-actions">
                <button type="button" className="el__btn el__btn--ghost" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="el__btn el__btn--primary">
                  Asignar Programa
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
