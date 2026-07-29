import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { formatDate } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthProvider';

// Rest Timer Component
function RestTimer() {
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds(s => s - 1);
      }, 1000);
    } else if (seconds === 0) {
      setIsActive(false);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const startTimer = (secs) => {
    setSeconds(secs);
    setIsActive(true);
  };

  const resetTimer = () => {
    setSeconds(0);
    setIsActive(false);
  };

  return (
    <div className="cp__timer-badge" onClick={() => startTimer(60)} title="Haz clic para iniciar cuenta atrás de 60s">
      ⏱️ {isActive ? `${seconds}s` : 'Iniciar Descanso (60s)'}
      {isActive && (
        <button
          onClick={(e) => { e.stopPropagation(); resetTimer(); }}
          style={{ background: 'none', border: 'none', color: '#c53030', marginLeft: '4px', cursor: 'pointer', padding: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Workout Execution Logger Modal
function WorkoutLoggerModal({
  assignment,
  onClose,
  onSave
}) {
  const [resultId, setResultId] = useState(null);
  const [startedAt, setStartedAt] = useState('');
  const [feedbackRpe, setFeedbackRpe] = useState('');
  const [feedbackRir, setFeedbackRir] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [loggedBlocks, setLoggedBlocks] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadOrCreateResult() {
      // Intentar cargar resultado existente
      const existing = await storage.getWorkoutResultByAssignmentId(assignment.id);
      
      if (existing) {
        setResultId(existing.id);
        setStartedAt(existing.startedAt || new Date().toISOString());
        setFeedbackRpe(existing.feedbackRpe !== null ? String(existing.feedbackRpe) : '');
        setFeedbackRir(existing.feedbackRir !== null ? String(existing.feedbackRir) : '');
        setFeedbackNotes(existing.feedbackNotes || '');
        setLoggedBlocks(existing.loggedBlocks || []);
      } else {
        // Inicializar nuevo resultado desde plannedSnapshot de la asignación
        setStartedAt(new Date().toISOString());
        setFeedbackRpe('');
        setFeedbackRir('');
        setFeedbackNotes('');

        const snapBlocks = assignment.plannedSnapshot?.blocks || [];
        const initialBlocks = snapBlocks.map(b => ({
          blockId: b.id,
          exercises: (b.exercises || []).map(e => ({
            exerciseId: Number(e.exerciseId),
            exerciseName: e.exerciseName || 'Ejercicio',
            sets: Array.from({ length: Number(e.plannedSets) || 1 }, (_, setIdx) => ({
              setId: `${b.id}-${e.exerciseId}-${setIdx + 1}`,
              setNumber: setIdx + 1,
              completed: false,
              repsPlanned: e.plannedReps || '',
              repsLogged: null,
              loadPlanned: e.loadValue !== null ? Number(e.loadValue) : null,
              loadLogged: null,
              loadUnit: e.loadUnit || 'kg',
              timeLoggedSeconds: null,
              distanceLoggedMeters: null,
              rpeLogged: null,
              rirLogged: null,
              notes: ''
            }))
          }))
        }));
        setLoggedBlocks(initialBlocks);
      }
    }
    if (assignment) {
      loadOrCreateResult();
    }
  }, [assignment]);

  const handleUpdateSet = (blockId, exerciseId, setId, field, value) => {
    setLoggedBlocks(prev => prev.map(b => {
      if (b.blockId === blockId) {
        const updatedExs = b.exercises.map(e => {
          if (e.exerciseId === exerciseId) {
            return {
              ...e,
              sets: e.sets.map(s => (s.setId === setId ? { ...s, [field]: value } : s))
            };
          }
          return e;
        });
        return { ...b, exercises: updatedExs };
      }
      return b;
    }));
  };

  const handleSaveResult = async (statusType) => {
    setErrorMsg('');

    // Validar RPE general solo al finalizar
    if (statusType === 'submitted') {
      const rpeNum = Number(feedbackRpe);
      if (!feedbackRpe || isNaN(rpeNum) || rpeNum < 1 || rpeNum > 10) {
        setErrorMsg('Debes calificar tu esfuerzo general del entrenamiento (RPE del 1 al 10) antes de finalizar.');
        return;
      }
    }

    // Calcular duración si se finaliza
    let duration = null;
    if (statusType === 'submitted' && startedAt) {
      const diffMs = new Date() - new Date(startedAt);
      duration = Math.max(1, Math.round(diffMs / 1000 / 60)); // mínimo 1 minuto
    }

    const payload = {
      workoutAssignmentId: assignment.id,
      clientId: assignment.clientId,
      startedAt: startedAt,
      performedAt: statusType === 'submitted' ? new Date().toISOString() : null,
      durationMinutes: duration,
      status: statusType,
      feedbackRpe: feedbackRpe ? Number(feedbackRpe) : null,
      feedbackRir: feedbackRir ? Number(feedbackRir) : null,
      feedbackNotes: feedbackNotes.trim(),
      loggedBlocks: loggedBlocks
    };

    if (resultId) {
      payload.id = resultId;
    }

    try {
      await storage.saveWorkoutResult(payload);
      if (onSave) onSave();
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="cp__logger-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cp__logger-modal" onClick={e => e.stopPropagation()}>
        
        {/* Cabecera */}
        <div className="cp__logger-header">
          <div>
            <h2 className="el__modal-title">{assignment.plannedSnapshot?.name || 'Registrar Sesión'}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
              Asignado el {formatDate(assignment.scheduledAt)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <RestTimer />
            <button className="el__modal-close" onClick={onClose} style={{ position: 'static' }}>✕</button>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="cp__logger-body">
          {errorMsg && (
            <div className="gc__alert" style={{ background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030' }}>
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {loggedBlocks.map((b, bIdx) => {
            const snapBlock = assignment.plannedSnapshot?.blocks?.find(bl => bl.id === b.blockId);
            return (
              <div key={b.blockId} className="cp__logger-block-card">
                <div className="cp__logger-block-title">
                  <span>Bloque {bIdx + 1}: {snapBlock?.name || 'Ejercicios'}</span>
                  <span>{snapBlock?.rounds} Rondas · Descanso: {snapBlock?.restBetweenRoundsSeconds}s</span>
                </div>

                {b.exercises.map(ex => (
                  <div key={ex.exerciseId} className="cp__logger-exercise-box">
                    <h4 className="cp__logger-exercise-name">{ex.exerciseName}</h4>
                    
                    <div style={{ overflowX: 'auto' }}>
                      <table className="cp__logger-sets-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}>Hecho</th>
                            <th style={{ width: '50px' }}>Serie</th>
                            <th>Objetivo</th>
                            <th>Reps reales</th>
                            <th>Carga real</th>
                            <th>Tiempo (s)</th>
                            <th>Distancia (m)</th>
                            <th>RPE</th>
                            <th>RIR</th>
                            <th>Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ex.sets.map(s => (
                            <tr key={s.setId} style={{ background: s.completed ? '#f0fdf4' : 'transparent' }}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={s.completed}
                                  onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'completed', e.target.checked)}
                                />
                              </td>
                              <td><strong>#{s.setNumber}</strong></td>
                              <td style={{ color: 'var(--gray-500)', fontSize: '0.7rem' }}>
                                {s.repsPlanned} reps @ {s.loadPlanned ? `${s.loadPlanned}${s.loadUnit}` : 'RPE'}
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="cp__logger-input"
                                  min="0"
                                  placeholder={s.repsPlanned || '0'}
                                  value={s.repsLogged !== null ? s.repsLogged : ''}
                                  onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'repsLogged', e.target.value !== '' ? Number(e.target.value) : null)}
                                />
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                                  <input
                                    type="number"
                                    className="cp__logger-input"
                                    min="0"
                                    placeholder={s.loadPlanned !== null ? String(s.loadPlanned) : '0'}
                                    value={s.loadLogged !== null ? s.loadLogged : ''}
                                    onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'loadLogged', e.target.value !== '' ? Number(e.target.value) : null)}
                                  />
                                  <span>{s.loadUnit}</span>
                                </div>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="cp__logger-input"
                                  min="0"
                                  placeholder="opcional"
                                  value={s.timeLoggedSeconds !== null ? s.timeLoggedSeconds : ''}
                                  onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'timeLoggedSeconds', e.target.value !== '' ? Number(e.target.value) : null)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="cp__logger-input"
                                  min="0"
                                  placeholder="opcional"
                                  value={s.distanceLoggedMeters !== null ? s.distanceLoggedMeters : ''}
                                  onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'distanceLoggedMeters', e.target.value !== '' ? Number(e.target.value) : null)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="cp__logger-input"
                                  min="1"
                                  max="10"
                                  placeholder="1-10"
                                  value={s.rpeLogged !== null ? s.rpeLogged : ''}
                                  onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'rpeLogged', e.target.value !== '' ? Number(e.target.value) : null)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="cp__logger-input"
                                  min="0"
                                  max="5"
                                  placeholder="0-5"
                                  value={s.rirLogged !== null ? s.rirLogged : ''}
                                  onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'rirLogged', e.target.value !== '' ? Number(e.target.value) : null)}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="cp__logger-input"
                                  style={{ width: '90px', textAlign: 'left' }}
                                  placeholder="dolor, sensaciones..."
                                  value={s.notes || ''}
                                  onChange={e => handleUpdateSet(b.blockId, ex.exerciseId, s.setId, 'notes', e.target.value)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Feedback general de la sesión */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px', borderTop: '1px solid var(--gray-200)', paddingTop: '16px' }}>
            <div className="el__field">
              <label className="el__label">Esfuerzo percibido general (RPE 1-10) *</label>
              <input
                type="number"
                min="1"
                max="10"
                className="el__input"
                placeholder="1 (muy suave) a 10 (máximo esfuerzo)"
                value={feedbackRpe}
                onChange={e => setFeedbackRpe(e.target.value)}
                required
              />
            </div>
            <div className="el__field">
              <label className="el__label">RIR promedio general (0-5 RIR)</label>
              <input
                type="number"
                min="0"
                max="5"
                className="el__input"
                placeholder="Repeticiones en reserva al fallo"
                value={feedbackRir}
                onChange={e => setFeedbackRir(e.target.value)}
              />
            </div>
          </div>

          <div className="el__field">
            <label className="el__label">Comentarios o dolores percibidos</label>
            <textarea
              className="el__input el__input--textarea"
              placeholder="Indica sensaciones, dolores articulares, fatiga general..."
              rows="2"
              value={feedbackNotes}
              onChange={e => setFeedbackNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="cp__logger-footer">
          <button type="button" className="el__btn el__btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="el__btn el__btn--ghost" style={{ borderColor: '#fde047', color: '#854d0e' }} onClick={() => handleSaveResult('draft')}>
              Guardar Progreso (Borrador)
            </button>
            <button type="button" className="el__btn el__btn--primary" onClick={() => handleSaveResult('submitted')}>
              Finalizar Entrenamiento
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// Free Session Modal
function FreeSessionModal({ clientId, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [activityType, setActivityType] = useState('otro');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [rpe, setRpe] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const FREE_SESSION_ACTIVITY_TYPES = [
    { id: 'fuerza', label: 'Fuerza / Musculación' },
    { id: 'cardio', label: 'Cardio / Aeróbico' },
    { id: 'movilidad', label: 'Movilidad / Flexibilidad' },
    { id: 'deporte', label: 'Deporte específico' },
    { id: 'otro', label: 'Otra actividad' }
  ];

  const handleSave = async () => {
    if (!title.trim()) {
      setErrorMsg("El título es obligatorio.");
      return;
    }

    const payload = {
      clientId,
      workoutAssignmentId: null, // Sin asignación
      status: 'submitted',
      freeSessionTitle: title.trim(),
      freeSessionActivityType: activityType,
      durationMinutes: duration ? Number(duration) : null,
      distanceLoggedMeters: distance ? Number(distance) : null,
      feedbackRpe: rpe ? Number(rpe) : null
    };

    try {
      await onSave(payload);
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  return (
    <div className="cp__logger-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cp__logger-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        
        <div className="cp__logger-header">
          <h3>Registrar Sesión Libre</h3>
          <button className="cp__logger-close-btn" onClick={onClose} title="Cerrar modal">✕</button>
        </div>

        <div className="cp__logger-body">
          {errorMsg && <div className="el__error-msg" style={{marginBottom: '16px'}}>{errorMsg}</div>}
          
          <div className="el__form-group">
            <label className="el__label">Título de la Sesión *</label>
            <input 
              type="text" 
              className="el__input" 
              placeholder="Ej: Salida en bicicleta" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              autoFocus 
            />
          </div>

          <div className="el__form-group">
            <label className="el__label">Tipo de Actividad</label>
            <select 
              className="el__select" 
              value={activityType} 
              onChange={e => setActivityType(e.target.value)}
            >
              {FREE_SESSION_ACTIVITY_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="el__form-group">
              <label className="el__label">Duración (minutos)</label>
              <input 
                type="number" 
                className="el__input" 
                placeholder="Opcional" 
                min="0" 
                value={duration} 
                onChange={e => setDuration(e.target.value)} 
              />
            </div>
            <div className="el__form-group">
              <label className="el__label">Distancia (metros)</label>
              <input 
                type="number" 
                className="el__input" 
                placeholder="Opcional" 
                min="0" 
                value={distance} 
                onChange={e => setDistance(e.target.value)} 
              />
            </div>
          </div>

          <div className="el__form-group">
            <label className="el__label">RPE (1-10)</label>
            <input 
              type="number" 
              className="el__input" 
              placeholder="Opcional" 
              min="1" 
              max="10" 
              value={rpe} 
              onChange={e => setRpe(e.target.value)} 
            />
            <span className="el__helper-text">Percepción subjetiva de esfuerzo.</span>
          </div>

        </div>

        <div className="cp__logger-footer">
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', width: '100%' }}>
            <button type="button" className="el__btn el__btn--ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="el__btn el__btn--primary" onClick={handleSave}>Guardar Sesión</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// Client Portal Main View Component
export default function ClientPortal() {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('agenda');
  const [agendaViewMode, setAgendaViewMode] = useState('list'); // 'list' or 'calendar'
  const [client, setClient] = useState(null);

  // Agenda
  const [assignments, setAssignments] = useState([]);
  const [programAssignments, setProgramAssignments] = useState([]);
  const [workoutResults, setWorkoutResults] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeFilter, setActiveFilter] = useState('pending'); // 'pending' | 'history'

  // Tests
  const [testDefs, setTestDefs] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [testCategories, setTestCategories] = useState([]);
  const [clientPRs, setClientPRs] = useState([]);
  
  // Registrar Test
  const [selectedTestDefId, setSelectedTestDefId] = useState('');
  const [testValue, setTestValue] = useState('');
  const [testAttempt, setTestAttempt] = useState('1');
  const [testObs, setTestObs] = useState('');
  const [testError, setTestError] = useState('');

  // Ficha Médica
  const [anamnesis, setAnamnesis] = useState(null);

  // Sesión y Ejercicio Activo
  const [activeAssignment, setActiveAssignment] = useState(null);
  
  // Sesión Libre
  const [showFreeSessionModal, setShowFreeSessionModal] = useState(false);

  async function loadClientData() {
    const cId = userProfile?.clientId;
    if (!cId) {
      setClient(null);
      return;
    }

    const dbClients = await storage.getClients();
    const currentClient = dbClients.find(c => c.id === cId);
    setClient(currentClient || null);

    // Cargar planificaciones y resultados
    const dbAssigns = await storage.getWorkoutAssignments(cId);
    // Ordenar cronológicamente
    dbAssigns.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    setAssignments(dbAssigns);

    const dbPAs = await storage.getProgramAssignments(cId);
    setProgramAssignments(dbPAs);

    const dbResults = await storage.getWorkoutResults(cId);
    setWorkoutResults(dbResults);

    const dbProgs = await storage.getPrograms();
    setPrograms(dbProgs);

    // Cargar Tests
    const dbTestDefs = await storage.getEntities(KEYS.TEST_DEFINITIONS);
    setTestDefs(dbTestDefs);

    const dbTestCats = await storage.getEntities(KEYS.TEST_CATEGORIES);
    setTestCategories(dbTestCats);

    const dbTestResults = await storage.getTestResults(cId);
    dbTestResults.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
    setTestResults(dbTestResults);

    // Cargar PRs del cliente
    try {
      const prs = await storage.getClientPersonalRecords(cId);
      setClientPRs(prs);
    } catch (err) {
      console.error("Error cargando PRs", err);
      setClientPRs([]);
    }

    // Cargar Anamnesis (método correcto: getAnamnesisByClientId)
    const clientAnamnesis = await storage.getAnamnesisByClientId(cId);
    setAnamnesis(clientAnamnesis || null);

    if (dbTestDefs.length > 0) {
      // Filtrar sólo los tests que permiten entrada de cliente
      const allowed = dbTestDefs.filter(d => d.allowClientEntry);
      if (allowed.length > 0) {
      setSelectedTestDefId(String(allowed[0].id));
      }
    }
  }

  useEffect(() => {
    if (userProfile?.clientId) {
      loadClientData();
    }
  }, [userProfile?.clientId]);

  // Pantalla de Espera para Clientes sin asignar
  if (userProfile?.status === 'pending_assignment' || !userProfile?.clientId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '60vh', color: '#fff', textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem', animation: 'spin 2s linear infinite' }}>⏳</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: '600', marginBottom: '1rem', color: '#f4f4f5' }}>Esperando asignación</h2>
        <p style={{ color: '#a1a1aa', maxWidth: '400px', lineHeight: '1.6' }}>
          Tu entrenador todavía no te ha vinculado a una ficha deportiva. Cuando lo haga, esta pantalla se actualizará automáticamente y podrás acceder a tus entrenamientos.
        </p>
      </div>
    );
  }

  const handleLogout = () => {
    sessionService.clearSession();
  };

  const handleRegisterTest = async (e) => {
    e.preventDefault();
    setTestError('');

    if (!selectedTestDefId) {
      setTestError('Debes seleccionar un test.');
      return;
    }
    if (!testValue.trim()) {
      setTestError('Debes ingresar el resultado de la medición.');
      return;
    }

    const def = testDefs.find(d => d.id === Number(selectedTestDefId));
    if (!def) return;

    // Estructurar el valor según el tipo
    const payload = {
      clientId: client.id,
      testDefinitionId: def.id,
      performedAt: new Date().toISOString(),
      attemptNumber: testAttempt ? Number(testAttempt) : null,
      observations: testObs.trim(),
      unit: def.defaultUnit || ''
    };

    if (def.valueType === 'number' || def.valueType === 'time') {
      const val = Number(testValue);
      if (isNaN(val)) {
        setTestError('El valor ingresado debe ser numérico.');
        return;
      }
      payload.numericValue = val;
    } else if (def.valueType === 'boolean') {
      payload.booleanValue = testValue === 'true';
    } else {
      payload.textValue = testValue;
    }

    try {
      await storage.saveTestResult(payload);
      setTestValue('');
      setTestObs('');
      await loadClientData();
    } catch (err) {
      setTestError(err.message);
    }
  };

  // Filtrado de Agenda
  const agendaItems = useMemo(() => {
    let items = [];
    if (activeFilter === 'pending') {
      items = assignments.filter(a => a.status === 'pending' || a.status === 'in_progress');
    } else {
      const pastAssignments = assignments.filter(a => a.status === 'completed' || a.status === 'cancelled' || a.status === 'missed');
      const freeSessions = workoutResults.filter(r => r.workoutAssignmentId === null || r.workoutAssignmentId === undefined).map(r => ({
        ...r,
        isFreeSession: true,
        scheduledAt: r.createdAt // Usar createdAt como scheduledAt para ordenar
      }));
      items = [...pastAssignments, ...freeSessions];
    }
    // Ordenar descendente para historial, ascendente para pendientes
    items.sort((a, b) => {
      const dA = new Date(a.scheduledAt);
      const dB = new Date(b.scheduledAt);
      return activeFilter === 'pending' ? dA - dB : dB - dA;
    });
    return items;
  }, [assignments, workoutResults, activeFilter]);

  if (!client) {
    return (
      <div className="el__placeholder">
        <p>⚠️ No hay ningún deportista simulado activo en este momento.</p>
        <span style={{ fontSize: '0.8125rem' }}>
          Selecciona un atleta en el panel superior de simulación de cabecera.
        </span>
      </div>
    );
  }

  return (
    <div className="cp__container">
      
      {/* Cabecera del Portal del Cliente */}
      <div className="cp__header-card">
        <h2 className="cp__header-title">¡Hola, {client.firstName}!</h2>
        <p className="cp__header-subtitle">
          Aquí tienes tu espacio personal para revisar tus entrenamientos programados y tu ficha de salud.
        </p>

        {programAssignments.map(pa => {
          if (pa.status !== 'active') return null;
          const progName = programs.find(p => p.id === pa.programId)?.name || 'Programa activo';
          return (
            <div key={pa.id} style={{ marginTop: '16px', background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)', padding: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold' }}>
                <span>Plan en Curso: {progName}</span>
                <span>{pa.progressPercentage}% completado</span>
              </div>
              <div className="pm__progress-bar-wrap" style={{ background: 'rgba(255,255,255,0.2)', height: '6px', marginTop: '6px' }}>
                <div className="pm__progress-bar-fill" style={{ width: `${pa.progressPercentage}%`, background: '#fbbf24' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs de Navegación Interna */}
      <div className="cp__tabs" role="tablist">
        <button
          className={`cp__tab-btn ${activeTab === 'agenda' ? 'cp__tab-btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'agenda'}
          onClick={() => setActiveTab('agenda')}
        >
          Mi Planificación (Agenda)
        </button>
        <button className={`cp__nav-btn ${activeTab === 'profile' ? 'cp__nav-btn--active' : ''}`} onClick={() => setActiveTab('profile')}>
          Mi Perfil
        </button>
        <button className={`cp__nav-btn ${activeTab === 'progress' ? 'cp__nav-btn--active' : ''}`} onClick={() => setActiveTab('progress')}>
          Tests Físicos
        </button>
        <button className={`cp__nav-btn ${activeTab === 'records' ? 'cp__nav-btn--active' : ''}`} onClick={() => setActiveTab('records')}>
          Mis Récords
        </button>
        <button className={`cp__nav-btn ${activeTab === 'metrics' ? 'cp__nav-btn--active' : ''}`} onClick={() => setActiveTab('metrics')}>
          Métricas
        </button>
      </div>

      {/* PESTAÑA 1: AGENDA */}
      {activeTab === 'agenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--gray-100)', padding: '4px', borderRadius: '6px' }}>
                <button
                  className={`el__btn ${agendaViewMode === 'list' ? 'el__btn--primary' : 'el__btn--ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  onClick={() => setAgendaViewMode('list')}
                >
                  Lista
                </button>
                <button
                  className={`el__btn ${agendaViewMode === 'calendar' ? 'el__btn--primary' : 'el__btn--ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  onClick={() => setAgendaViewMode('calendar')}
                >
                  Calendario
                </button>
              </div>

              {agendaViewMode === 'list' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`el__btn ${activeFilter === 'pending' ? 'el__btn--primary' : 'el__btn--ghost'}`}
                    style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                    onClick={() => setActiveFilter('pending')}
                  >
                    Pendientes
                  </button>
                  <button
                    className={`el__btn ${activeFilter === 'history' ? 'el__btn--primary' : 'el__btn--ghost'}`}
                    style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                    onClick={() => setActiveFilter('history')}
                  >
                    Completadas / Pasadas
                  </button>
                </div>
              )}
            </div>
            
            <button 
              className="el__btn el__btn--secondary" 
              style={{ fontSize: '0.75rem', padding: '6px 12px' }}
              onClick={() => setShowFreeSessionModal(true)}
            >
              + Registrar Sesión Libre
            </button>
          </div>

          <div className="cp__agenda-list">
            {agendaViewMode === 'calendar' ? (
              <div className="cp__card">
                <ClientCalendarTab 
                  clientId={sessionService.getActiveClientId()} 
                  readOnly={true} 
                  onReadOnlyEventClick={async (ev) => {
                    if (ev.type === 'workout') {
                      const allWa = await storage.getWorkoutAssignments(sessionService.getActiveClientId());
                      const assignment = allWa.find(a => a.id === ev.assignmentId);
                      if (assignment) setActiveAssignment(assignment);
                    }
                  }}
                />
              </div>
            ) : agendaItems.length === 0 ? (
              <div className="cp__empty-state">
                {activeFilter === 'pending' ? (
                  <>
                    <span className="cp__empty-state-icon">🏖️</span>
                    <h3 className="cp__empty-state-title">¡Todo al día!</h3>
                    <p className="cp__empty-state-body">
                      No tienes sesiones pendientes en este momento.<br />
                      Cuando tu entrenador te planifique nuevos entrenamientos aparecerán aquí.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="cp__empty-state-icon">📋</span>
                    <h3 className="cp__empty-state-title">Sin historial todavía</h3>
                    <p className="cp__empty-state-body">
                      Cuando completes tus primeras sesiones, aquí podrás revisar
                      cada entrenamiento realizado y tus métricas de rendimiento.
                    </p>
                  </>
                )}
              </div>
            ) : (
              agendaItems.map(a => {
                if (a.isFreeSession) {
                  return (
                    <div key={`free-${a.id}`} className="cp__agenda-card cp__agenda-card--completed">
                      <div className="cp__agenda-info">
                        <span className="cp__agenda-name">🌟 {a.freeSessionTitle || 'Sesión Libre'}</span>
                        <span className="cp__agenda-meta">
                          📅 Realizado: {formatDate(a.createdAt)} · {a.durationMinutes ? `${a.durationMinutes} min` : 'Sin duración'}
                        </span>
                        <span className="cp__agenda-meta" style={{ marginTop: '4px', display: 'block', fontStyle: 'italic' }}>
                          Actividad: {a.freeSessionActivityType} {a.distanceLoggedMeters ? ` | ${a.distanceLoggedMeters} m` : ''} {a.feedbackRpe ? ` | RPE: ${a.feedbackRpe}` : ''}
                        </span>
                        {a.coachFeedback && (
                          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f0fdf4', borderLeft: '4px solid #22c55e', borderRadius: '4px', fontSize: '0.8125rem' }}>
                            <strong style={{ color: '#166534', display: 'block', marginBottom: '2px' }}>🗣️ Feedback del Entrenador:</strong>
                            <p style={{ margin: 0, color: '#14532d' }}>{a.coachFeedback}</p>
                          </div>
                        )}
                      </div>
                      <div>
                        {/* Sesión libre solo lectura o se podría revisar ejecución, por ahora no tiene modal de ejecución */}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sesión Libre</span>
                      </div>
                    </div>
                  );
                }

                const res = workoutResults.find(r => r.workoutAssignmentId === a.id);
                
                return (
                  <div
                    key={a.id}
                    className={`cp__agenda-card cp__agenda-card--${a.status}`}
                  >
                    <div className="cp__agenda-info">
                      <span className="cp__agenda-name">{a.plannedSnapshot?.name || 'Sesión de Rutina'}</span>
                      <span className="cp__agenda-meta">
                        📅 Programado: {formatDate(a.scheduledAt)} · {a.plannedSnapshot?.estimatedDurationMinutes || 60} minutos
                      </span>
                      {res && res.status === 'draft' && (
                        <span style={{ fontSize: '0.7rem', color: '#a16207', fontWeight: 'bold', display: 'block', marginTop: '4px' }}>
                          ⚠️ Tienes progreso guardado en borrador.
                        </span>
                      )}
                      {res && res.coachFeedback && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f0fdf4', borderLeft: '4px solid #22c55e', borderRadius: '4px', fontSize: '0.8125rem' }}>
                          <strong style={{ color: '#166534', display: 'block', marginBottom: '2px' }}>🗣️ Feedback del Entrenador:</strong>
                          <p style={{ margin: 0, color: '#14532d' }}>{res.coachFeedback}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      {a.status === 'completed' ? (
                        <button
                          className="el__btn el__btn--ghost"
                          style={{ height: '32px', fontSize: '0.75rem', padding: '0 12px' }}
                          onClick={() => setActiveAssignment(a)}
                        >
                          Revisar Ejecución
                        </button>
                      ) : (
                        <button
                          className="el__btn el__btn--primary"
                          style={{ height: '32px', fontSize: '0.75rem', padding: '0 12px' }}
                          onClick={() => setActiveAssignment(a)}
                        >
                          {a.status === 'in_progress' ? 'Retomar Rutina' : 'Iniciar'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 2: HISTORIAL Y FICHA */}
      {activeTab === 'history' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          
          {/* FICHA MÉDICA ANAMNESIS (SOLO LECTURA) */}
          <div>
            <h3 className="wb__section-title">🔒 Mi Ficha Médica y de Salud</h3>
            
            {anamnesis ? (
              <div style={{ background: 'var(--off-white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.8125rem' }}>
                <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  🔒 Ficha de salud de acceso protegido. Modificaciones reservadas al entrenador.
                </div>
                <div>
                  <strong>Lesiones anteriores:</strong>
                  <p style={{ margin: '2px 0 0 0', color: 'var(--gray-600)' }}>{anamnesis.previousInjuries || 'Ninguna registrada.'}</p>
                </div>
                <div>
                  <strong>Lesiones actuales:</strong>
                  <p style={{ margin: '2px 0 0 0', color: 'var(--gray-600)' }}>{anamnesis.currentInjuries || 'Ninguna registrada.'}</p>
                </div>
                <div>
                  <strong>Cirugías / Operaciones:</strong>
                  <p style={{ margin: '2px 0 0 0', color: 'var(--gray-600)' }}>{anamnesis.surgeries || 'Ninguna registrada.'}</p>
                </div>
                <div>
                  <strong>Medicamentos activos:</strong>
                  <p style={{ margin: '2px 0 0 0', color: 'var(--gray-600)' }}>{anamnesis.medications || 'Ninguno registrado.'}</p>
                </div>
                <div>
                  <strong>Notas médicas auxiliares:</strong>
                  <p style={{ margin: '2px 0 0 0', color: 'var(--gray-600)' }}>{anamnesis.healthNotes || 'Sin comentarios.'}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', borderTop: '1px solid var(--gray-200)', paddingTop: '10px' }}>
                  <div>
                    <strong>Objetivos a corto plazo:</strong>
                    <p style={{ margin: '2px 0 0 0', color: 'var(--gray-600)' }}>{anamnesis.shortTermGoals || 'Sin definir.'}</p>
                  </div>
                  <div>
                    <strong>Objetivos a largo plazo:</strong>
                    <p style={{ margin: '2px 0 0 0', color: 'var(--gray-600)' }}>{anamnesis.longTermGoals || 'Sin definir.'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', background: 'var(--off-white)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                No se ha creado una anamnesis para ti en el sistema.
              </p>
            )}
          </div>

          {/* HISTORIAL Y REGISTRO DE TESTS */}
          <div>
            <h3 className="wb__section-title">Registro de Test Físico</h3>

            {/* Formulario de registro (sólo si hay tests con allowClientEntry) */}
            <form onSubmit={handleRegisterTest} style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '16px', marginBottom: '20px' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', margin: '0 0 10px 0' }}>
                Introduce mediciones de pruebas físicas autorizadas por tu entrenador.
              </p>

              {testError && (
                <div className="gc__alert" style={{ background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030', padding: '6px 12px', fontSize: '0.75rem', marginBottom: '8px' }}>
                  <strong>Error:</strong> {testError}
                </div>
              )}

              <div className="el__field">
                <label className="el__label" style={{ fontSize: '0.7rem' }}>Selecciona el Test *</label>
                <select
                  className="el__input el__input--select"
                  style={{ height: '32px', fontSize: '0.75rem' }}
                  value={selectedTestDefId}
                  onChange={e => setSelectedTestDefId(e.target.value)}
                >
                  {testDefs.filter(d => d.allowClientEntry).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                  {testDefs.filter(d => d.allowClientEntry).length === 0 && (
                    <option value="">No hay tests autorizados para autoregistro</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                <div className="el__field">
                  <label className="el__label" style={{ fontSize: '0.7rem' }}>Valor de la Medida *</label>
                  <input
                    type="text"
                    className="el__input"
                    style={{ height: '32px', fontSize: '0.75rem' }}
                    placeholder="Resultado obtenido..."
                    value={testValue}
                    onChange={e => setTestValue(e.target.value)}
                    disabled={testDefs.filter(d => d.allowClientEntry).length === 0}
                  />
                </div>
                <div className="el__field">
                  <label className="el__label" style={{ fontSize: '0.7rem' }}>Intento</label>
                  <input
                    type="number"
                    min="1"
                    className="el__input"
                    style={{ height: '32px', fontSize: '0.75rem' }}
                    value={testAttempt}
                    onChange={e => setTestAttempt(e.target.value)}
                    disabled={testDefs.filter(d => d.allowClientEntry).length === 0}
                  />
                </div>
              </div>

              <div className="el__field">
                <label className="el__label" style={{ fontSize: '0.7rem' }}>Observaciones</label>
                <input
                  type="text"
                  className="el__input"
                  style={{ height: '32px', fontSize: '0.75rem' }}
                  placeholder="Viento a favor, cansado..."
                  value={testObs}
                  onChange={e => setTestObs(e.target.value)}
                  disabled={testDefs.filter(d => d.allowClientEntry).length === 0}
                />
              </div>

              <button
                type="submit"
                className="el__btn el__btn--primary"
                style={{ width: '100%', height: '32px', padding: 0, fontSize: '0.75rem' }}
                disabled={testDefs.filter(d => d.allowClientEntry).length === 0}
              >
                Guardar Medición
              </button>
            </form>

            {/* Listado de Mediciones realizadas */}
            <h4 style={{ fontSize: '0.8125rem', fontWeight: '800', marginBottom: '8px', color: 'var(--gray-800)' }}>
              Historial de Tests
            </h4>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', background: 'var(--white)' }}>
              {testResults.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', padding: '12px', textAlign: 'center' }}>
                  No tienes mediciones registradas.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {testResults.map(r => {
                    const def = testDefs.find(d => d.id === r.testDefinitionId);
                    
                    let renderedVal = '';
                    if (r.numericValue !== null) renderedVal = `${r.numericValue}${r.unit || ''}`;
                    else if (r.booleanValue !== null) renderedVal = r.booleanValue ? 'APTO' : 'NO APTO';
                    else renderedVal = r.textValue || '';

                    return (
                      <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--gray-100)', fontSize: '0.75rem' }}>
                        <div>
                          <strong>{def ? def.name : 'Test'}</strong>
                          {r.attemptNumber && <span style={{ color: 'var(--gray-400)', marginLeft: '6px' }}>Intento {r.attemptNumber}</span>}
                          {r.observations && <div style={{ color: 'var(--gray-400)', fontSize: '0.65rem', marginTop: '2px' }}>{r.observations}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{renderedVal}</div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>{formatDate(r.performedAt)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: TESTS FÍSICOS */}
      {activeTab === 'progress' && (
        <div>
          <h3 className="wb__section-title">📈 Evolución de Tests Físicos</h3>
          
          {testDefs.length === 0 ? (
            <div className="el__placeholder">
              <p>Tu entrenador aún no ha definido tests físicos.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
              {testDefs.map(def => {
                const results = testResults.filter(r => r.testDefinitionId === def.id).sort((a, b) => new Date(a.performedAt || a.createdAt) - new Date(b.performedAt || b.createdAt));
                if (results.length === 0) return null; // No mostrar tests vacíos en esta vista
                
                // Preparar datos de evolución (similar a getTestEvolution)
                const evolution = results.map((r, i) => {
                  let val = r.numericValue ?? r.textValue ?? r.booleanValue;
                  let variance = null;
                  if (i > 0 && typeof val === 'number') {
                    const prev = results[i-1];
                    if (typeof prev.numericValue === 'number' && (r.unit || '') === (prev.unit || '')) {
                      variance = val - prev.numericValue;
                    }
                  }
                  return {
                    id: r.id,
                    date: r.performedAt || r.createdAt,
                    val,
                    unit: r.unit || def.defaultUnit || '',
                    variance
                  };
                }).reverse(); // Más recientes primero

                return (
                  <div key={def.id} className="el__card" style={{ padding: '16px' }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 'bold' }}>{def.name}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {evolution.map(evo => (
                        <div key={evo.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{formatDate(evo.date)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{evo.val} {evo.unit}</span>
                            {evo.variance !== null && (
                              <span style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold',
                                color: evo.variance > 0 ? '#16a34a' : evo.variance < 0 ? '#dc2626' : 'var(--text-secondary)'
                              }}>
                                {evo.variance > 0 ? `+${evo.variance}` : evo.variance} {evo.unit}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {testDefs.filter(d => testResults.some(r => r.testDefinitionId === d.id)).length === 0 && (
                <div className="el__placeholder" style={{ gridColumn: '1 / -1' }}>
                  <p>Aún no tienes resultados registrados en ningún test físico.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA NUEVA: MIS RÉCORDS */}
      {activeTab === 'records' && (
        <div>
          <h3 className="wb__section-title">🏆 Mis Récords Personales (PRs)</h3>
          
          {clientPRs.length === 0 ? (
            <div className="el__placeholder">
              <p>Aún no tienes récords personales registrados en tus entrenamientos.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
              {clientPRs.map(pr => (
                <div key={pr.exerciseId} className="el__card" style={{ padding: '20px', borderLeft: '4px solid var(--accent)' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '1.125rem', fontWeight: 'bold' }}>{pr.exerciseName}</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {pr.analyticalType === 'strength' && (
                      <>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Carga Máxima</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gray-800)' }}>
                            {pr.records.maxLoad.value > 0 ? `${pr.records.maxLoad.value.toFixed(1)} kg` : '-'}
                          </div>
                          {pr.records.maxLoad.value > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>{formatDate(pr.records.maxLoad.date)}</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>1RM Estimado</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gray-800)' }}>
                            {pr.records.max1RM.value > 0 ? `${pr.records.max1RM.value.toFixed(1)} kg` : '-'}
                          </div>
                          {pr.records.max1RM.value > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>{formatDate(pr.records.max1RM.date)}</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Volumen Máximo</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gray-800)' }}>
                            {pr.records.maxVolume.value > 0 ? `${pr.records.maxVolume.value.toFixed(1)} kg` : '-'}
                          </div>
                          {pr.records.maxVolume.value > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>{formatDate(pr.records.maxVolume.date)}</div>}
                        </div>
                      </>
                    )}
                    
                    {pr.analyticalType === 'distance' && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Distancia Máxima</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gray-800)' }}>
                          {pr.records.maxDistance.value > 0 ? `${pr.records.maxDistance.value.toFixed(1)} m` : '-'}
                        </div>
                        {pr.records.maxDistance.value > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>{formatDate(pr.records.maxDistance.date)}</div>}
                      </div>
                    )}
                    
                    {pr.analyticalType === 'duration' && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Volumen Máximo</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gray-800)' }}>
                          {pr.records.maxVolume.value > 0 ? `${pr.records.maxVolume.value.toFixed(1)} s` : '-'}
                        </div>
                        {pr.records.maxVolume.value > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>{formatDate(pr.records.maxVolume.date)}</div>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 4: MÉTRICAS */}
      {activeTab === 'metrics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          
          {/* Métricas de Carga y RPE */}
          <div>
            <h3 className="wb__section-title">Evolución de Intensidad (RPE de Sesión)</h3>
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '16px', background: 'var(--white)' }}>
              {workoutResults.filter(r => r.status === 'submitted').length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', textAlign: 'center' }}>
                  Completa tu primer entrenamiento para generar métricas de intensidad.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {workoutResults.filter(r => r.status === 'submitted').slice(-5).map(r => {
                    const assignObj = assignments.find(a => a.id === r.workoutAssignmentId);
                    const name = assignObj?.plannedSnapshot?.name || 'Entrenamiento';
                    const rpeVal = Number(r.feedbackRpe) || 0;

                    return (
                      <div key={r.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '2px' }}>
                          <span>{name} ({formatDate(r.performedAt)})</span>
                          <strong>RPE {rpeVal}/10</strong>
                        </div>
                        <div className="pm__progress-bar-wrap" style={{ height: '6px', margin: 0 }}>
                          <div
                            className="pm__progress-bar-fill"
                            style={{
                              width: `${rpeVal * 10}%`,
                              background: rpeVal >= 8 ? '#dc2626' : rpeVal >= 6 ? '#ea580c' : '#16a34a'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Comparativas de test */}
          <div>
            <h3 className="wb__section-title">Evolución de Tests Físicos</h3>
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '16px', background: 'var(--white)', maxHeight: '320px', overflowY: 'auto' }}>
              {testResults.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', textAlign: 'center' }}>
                  Registra marcas en tu ficha para ver tu evolución.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {testDefs.map(def => {
                    const resList = testResults.filter(r => r.testDefinitionId === def.id);
                    if (resList.length === 0) return null;

                    return (
                      <div key={def.id} style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: '10px' }}>
                        <h4 style={{ fontSize: '0.8125rem', fontWeight: 'bold', margin: '0 0 6px 0', color: 'var(--gray-700)' }}>
                          {def.name}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {resList.slice(0, 3).map(r => {
                            let renderedVal = '';
                            if (r.numericValue !== null) renderedVal = `${r.numericValue}${r.unit || ''}`;
                            else if (r.booleanValue !== null) renderedVal = r.booleanValue ? 'APTO' : 'NO APTO';
                            else renderedVal = r.textValue || '';

                            return (
                              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--gray-500)' }}>
                                <span>{formatDate(r.performedAt)} {r.attemptNumber ? `(Intento ${r.attemptNumber})` : ''}</span>
                                <strong style={{ color: 'var(--accent)' }}>{renderedVal}</strong>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* MODAL LOGGER DE ENTRENAMIENTO */}
      {activeAssignment && (
        <WorkoutLoggerModal
          assignment={activeAssignment}
          onClose={() => setActiveAssignment(null)}
          onSave={loadClientData}
        />
      )}

      {/* MODAL SESIÓN LIBRE */}
      {showFreeSessionModal && (
        <FreeSessionModal 
          clientId={client.id}
          onClose={() => setShowFreeSessionModal(false)}
          onSave={handleSaveFreeSession}
        />
      )}

    </div>
  );
}
