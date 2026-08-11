import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { formatDate } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthProvider';
import { ClientCalendarTab } from './ClientCalendarTab';
import './ClientPortal.css';

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

// Selector de nota tocando un número (RPE 1-10, RIR 0-5) en vez de un campo
// numérico diminuto: en el gimnasio, con el móvil, es más fácil tocar un
// botón grande que acertar en un input pequeño.
function RatingPicker({ value, onChange, min, max }) {
  const options = [];
  for (let n = min; n <= max; n++) options.push(n);
  return (
    <div className="cp__rating-picker">
      {options.map(n => (
        <button
          key={n}
          type="button"
          className={`cp__rating-btn ${value !== '' && Number(value) === n ? 'cp__rating-btn--active' : ''}`}
          onClick={() => onChange(String(n))}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// Una tarjeta grande por serie, en vez de una fila de una tabla de 10
// columnas: en el móvil, dentro del gimnasio, se necesita marcar "hecho" y
// meter reps/carga con el pulgar, no acertar en celdas diminutas. Tiempo,
// distancia, RPE y RIR de la serie quedan plegados por defecto (el toggle
// vive en la ficha del ejercicio, no aquí) porque no todas las sesiones los
// usan y sobrecargaban la vista principal.
function SetCard({ set: s, readOnly, expanded, onChange }) {
  const val = (v, unit = '') => (v !== null && v !== undefined && v !== '' ? `${v}${unit}` : '—');

  return (
    <div className={`cp__set-card ${s.completed ? 'cp__set-card--done' : ''}`}>
      <div className="cp__set-card-top">
        <label className="cp__set-check">
          <input
            type="checkbox"
            checked={s.completed}
            disabled={readOnly}
            onChange={e => onChange('completed', e.target.checked)}
          />
          <span>Serie {s.setNumber}</span>
        </label>
        <span className="cp__set-target">
          Objetivo: {s.repsPlanned || '—'} reps{s.loadPlanned !== null ? ` @ ${s.loadPlanned}${s.loadUnit}` : ''}
        </span>
      </div>

      <div className="cp__set-card-main">
        <div className="cp__set-field cp__set-field--big">
          <label>Reps</label>
          {readOnly ? (
            <strong>{val(s.repsLogged)}</strong>
          ) : (
            <input
              type="number"
              inputMode="numeric"
              className="cp__set-input cp__set-input--big"
              min="0"
              placeholder={s.repsPlanned || '0'}
              value={s.repsLogged !== null ? s.repsLogged : ''}
              onChange={e => onChange('repsLogged', e.target.value !== '' ? Number(e.target.value) : null)}
            />
          )}
        </div>
        <div className="cp__set-field cp__set-field--big">
          <label>Carga ({s.loadUnit})</label>
          {readOnly ? (
            <strong>{val(s.loadLogged)}</strong>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              className="cp__set-input cp__set-input--big"
              min="0"
              placeholder={s.loadPlanned !== null ? String(s.loadPlanned) : '0'}
              value={s.loadLogged !== null ? s.loadLogged : ''}
              onChange={e => onChange('loadLogged', e.target.value !== '' ? Number(e.target.value) : null)}
            />
          )}
        </div>
      </div>

      {(expanded || readOnly) && (
        <div className="cp__set-card-extra">
          <div className="cp__set-field">
            <label>Tiempo (s)</label>
            {readOnly ? <span>{val(s.timeLoggedSeconds)}</span> : (
              <input type="number" inputMode="numeric" className="cp__set-input" min="0" placeholder="opcional" value={s.timeLoggedSeconds !== null ? s.timeLoggedSeconds : ''} onChange={e => onChange('timeLoggedSeconds', e.target.value !== '' ? Number(e.target.value) : null)} />
            )}
          </div>
          <div className="cp__set-field">
            <label>Distancia (m)</label>
            {readOnly ? <span>{val(s.distanceLoggedMeters)}</span> : (
              <input type="number" inputMode="numeric" className="cp__set-input" min="0" placeholder="opcional" value={s.distanceLoggedMeters !== null ? s.distanceLoggedMeters : ''} onChange={e => onChange('distanceLoggedMeters', e.target.value !== '' ? Number(e.target.value) : null)} />
            )}
          </div>
          <div className="cp__set-field">
            <label>RPE</label>
            {readOnly ? <span>{val(s.rpeLogged)}</span> : (
              <input type="number" inputMode="numeric" className="cp__set-input" min="1" max="10" placeholder="1-10" value={s.rpeLogged !== null ? s.rpeLogged : ''} onChange={e => onChange('rpeLogged', e.target.value !== '' ? Number(e.target.value) : null)} />
            )}
          </div>
          <div className="cp__set-field">
            <label>RIR</label>
            {readOnly ? <span>{val(s.rirLogged)}</span> : (
              <input type="number" inputMode="numeric" className="cp__set-input" min="0" max="5" placeholder="0-5" value={s.rirLogged !== null ? s.rirLogged : ''} onChange={e => onChange('rirLogged', e.target.value !== '' ? Number(e.target.value) : null)} />
            )}
          </div>
          <div className="cp__set-field cp__set-field--full">
            <label>Notas</label>
            {readOnly ? <span>{s.notes || '—'}</span> : (
              <input type="text" className="cp__set-input" placeholder="dolor, sensaciones..." value={s.notes || ''} onChange={e => onChange('notes', e.target.value)} />
            )}
          </div>
        </div>
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
  // Un entrenamiento completado se abre en modo consulta: se ve lo que se
  // registró, no se puede volver a tocar por accidente. Antes reabría el
  // mismo formulario editable de siempre, sin distinguir "revisar" de
  // "registrar".
  const readOnly = assignment.status === 'completed';
  // Dos pantallas en vez de una sola con todo mezclado: mientras se entrena
  // solo se ve el entrenamiento (lo pidió el usuario expresamente: "que se
  // enseñe todo lo posible el entrenamiento"), y el RPE/RIR/comentarios solo
  // aparecen al pulsar "Finalizar", como paso final aparte.
  const [phase, setPhase] = useState('log'); // 'log' | 'feedback'
  // Qué ejercicios tienen desplegados sus campos secundarios (tiempo,
  // distancia, RPE, RIR, notas por serie). Por defecto plegado: la mayoría
  // de sesiones de fuerza solo necesitan reps y carga.
  const [expandedExercises, setExpandedExercises] = useState({});
  const [resultId, setResultId] = useState(null);
  const [startedAt, setStartedAt] = useState('');
  const [feedbackRpe, setFeedbackRpe] = useState('');
  const [feedbackRir, setFeedbackRir] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [loggedBlocks, setLoggedBlocks] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadOrCreateResult() {
      setErrorMsg('');
      try {
        await loadOrCreateResultInner();
      } catch (err) {
        // Antes, un fallo aquí (p. ej. de permisos) dejaba el modal abierto
        // pero con el cuerpo completamente vacío, sin ningún aviso: parecía
        // que el entrenamiento no existiera.
        console.error('Error cargando la sesión de entrenamiento:', err);
        setErrorMsg('No se ha podido cargar este entrenamiento. Inténtalo de nuevo.');
      }
    }

    async function loadOrCreateResultInner() {
      // Intentar cargar resultado existente
      const existing = await storage.getWorkoutResultByAssignmentId(assignment.id, assignment.clientId);

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
          // Un mismo ejercicio (mismo exerciseId) puede repetirse varias
          // veces dentro de un bloque -p. ej. 3 series de Front Squat como
          // entradas separadas-, así que exerciseId solo NO sirve para
          // identificar cuál es cuál: hace falta el id propio de esa entrada
          // dentro del bloque (e.id), con el índice como respaldo si faltase
          // en una rutina antigua.
          exercises: (b.exercises || []).map((e, eIdx) => ({
            id: e.id || `${b.id}-${eIdx}`,
            exerciseId: String(e.exerciseId),
            exerciseName: e.exerciseName || 'Ejercicio',
            // Las series son del bloque. Las rutinas antiguas las guardaban en
            // cada ejercicio (plannedSets), así que se respetan como respaldo.
            sets: Array.from({ length: Number(b.rounds) || Number(e.plannedSets) || 1 }, (_, setIdx) => ({
              setId: `${e.id || `${b.id}-${eIdx}`}-${setIdx + 1}`,
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

  // "exUid" identifica la entrada de ejercicio dentro del bloque (ex.id, con
  // el índice como respaldo) y no "exerciseId": si el mismo ejercicio aparece
  // repetido en el bloque, exerciseId por sí solo actualizaría las series de
  // las varias copias a la vez en vez de solo la que se está editando.
  const handleUpdateSet = (blockId, exUid, setId, field, value) => {
    setLoggedBlocks(prev => prev.map(b => {
      if (b.blockId !== blockId) return b;
      const updatedExs = b.exercises.map((e, eIdx) => {
        if ((e.id || `${blockId}-${eIdx}`) !== exUid) return e;
        return {
          ...e,
          sets: e.sets.map(s => (s.setId === setId ? { ...s, [field]: value } : s))
        };
      });
      return { ...b, exercises: updatedExs };
    }));
  };

  const toggleExpanded = (exUid) => {
    setExpandedExercises(prev => ({ ...prev, [exUid]: !prev[exUid] }));
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

  const showLog = readOnly || phase === 'log';

  return (
    <div className="cp__logger-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cp__logger-modal" onClick={e => e.stopPropagation()}>

        {/* Cabecera */}
        <div className="cp__logger-header">
          <div>
            <h2 className="el__modal-title">{assignment.plannedSnapshot?.name || 'Registrar Sesión'}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
              {readOnly ? `Realizado el ${formatDate(assignment.scheduledAt)}` : showLog ? 'Registrando entrenamiento' : '¿Cómo ha ido?'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {readOnly ? (
              <span className="cp__done-badge">✓ Completado</span>
            ) : showLog ? (
              <RestTimer />
            ) : null}
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

          {showLog ? (
            // PANTALLA 1: el entrenamiento en sí, sin nada más alrededor -
            // el cliente está en el gimnasio con el móvil y solo necesita
            // ver esto.
            loggedBlocks.map((b, bIdx) => {
              const snapBlock = assignment.plannedSnapshot?.blocks?.find(bl => bl.id === b.blockId);
              return (
                <div key={b.blockId} className="cp__logger-block-card">
                  <div className="cp__logger-block-title">
                    <span>Bloque {bIdx + 1}: {snapBlock?.name || 'Ejercicios'}</span>
                    <span>{snapBlock?.rounds || 1} serie{(snapBlock?.rounds || 1) === 1 ? '' : 's'}</span>
                  </div>

                  {b.exercises.map((ex, exIdx) => {
                    const exUid = ex.id || `${b.blockId}-${exIdx}`;
                    // Por posición, no por exerciseId: si el mismo ejercicio
                    // se repite en el bloque, buscar por exerciseId siempre
                    // encontraba la primera copia y le copiaba sus
                    // instrucciones a todas las demás.
                    const snapEx = snapBlock?.exercises?.[exIdx];
                    return (
                      <div key={exUid} className="cp__logger-exercise-box">
                        <div className="cp__exercise-box-header">
                          <h4 className="cp__logger-exercise-name">{ex.exerciseName}</h4>
                          {!readOnly && (
                            <button type="button" className="cp__set-more-toggle" onClick={() => toggleExpanded(exUid)}>
                              {expandedExercises[exUid] ? '▴ Menos datos' : '▾ Tiempo / RPE / RIR / notas'}
                            </button>
                          )}
                        </div>

                        {snapEx?.instructions && (
                          <p className="cp__logger-instructions">{snapEx.instructions}</p>
                        )}

                        <div className="cp__set-card-list">
                          {ex.sets.map(s => (
                            <SetCard
                              key={s.setId}
                              set={s}
                              readOnly={readOnly}
                              expanded={!!expandedExercises[exUid]}
                              onChange={(field, value) => handleUpdateSet(b.blockId, exUid, s.setId, field, value)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          ) : null}

          {/* En una sesión ya completada, el resumen de RPE/RIR/notas se
              muestra siempre debajo de las series, no como una pantalla
              aparte (aquí ya no hay nada más que hacer). */}
          {readOnly && (
            <div className="cp__done-summary">
              <div>
                <span className="cp__done-summary-label">Esfuerzo percibido (RPE)</span>
                <strong>{feedbackRpe || '—'}</strong>
              </div>
              <div>
                <span className="cp__done-summary-label">RIR promedio</span>
                <strong>{feedbackRir || '—'}</strong>
              </div>
              {feedbackNotes && (
                <div className="cp__done-summary-notes">
                  <span className="cp__done-summary-label">Comentarios</span>
                  <p>{feedbackNotes}</p>
                </div>
              )}
            </div>
          )}

          {!readOnly && !showLog && (
            // PANTALLA 2: solo se llega aquí al pulsar "Finalizar". Antes el
            // RPE/RIR/comentarios se veían todo el rato mezclados con las
            // series, sin distinguir "estoy entrenando" de "ya he acabado".
            <div className="cp__feedback-phase">
              <h3 className="cp__feedback-title">¿Cómo ha ido el entrenamiento?</h3>

              <div className="el__field">
                <label className="el__label">Esfuerzo percibido (RPE) *</label>
                <RatingPicker value={feedbackRpe} onChange={setFeedbackRpe} min={1} max={10} />
              </div>

              <div className="el__field">
                <label className="el__label">RIR promedio (repeticiones en reserva)</label>
                <RatingPicker value={feedbackRir} onChange={setFeedbackRir} min={0} max={5} />
              </div>

              <div className="el__field">
                <label className="el__label">Comentarios o dolores percibidos</label>
                <textarea
                  className="el__input el__input--textarea"
                  placeholder="Indica sensaciones, dolores articulares, fatiga general..."
                  rows="3"
                  value={feedbackNotes}
                  onChange={e => setFeedbackNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cp__logger-footer">
          {readOnly ? (
            <button type="button" className="el__btn el__btn--primary" style={{ width: '100%' }} onClick={onClose}>
              Cerrar
            </button>
          ) : showLog ? (
            <>
              <button type="button" className="el__btn el__btn--ghost" onClick={onClose}>
                Cancelar
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="el__btn el__btn--ghost" style={{ borderColor: '#fde047', color: '#854d0e' }} onClick={() => handleSaveResult('draft')}>
                  Guardar Progreso
                </button>
                <button type="button" className="el__btn el__btn--primary" onClick={() => setPhase('feedback')}>
                  Finalizar
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="el__btn el__btn--ghost" onClick={() => setPhase('log')}>
                ← Volver al entrenamiento
              </button>
              <button type="button" className="el__btn el__btn--primary" onClick={() => handleSaveResult('submitted')}>
                Guardar y finalizar
              </button>
            </>
          )}
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

          <div className="cp__grid-2">
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
  const { userProfile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('agenda');
  const [agendaViewMode, setAgendaViewMode] = useState('list'); // 'list' or 'calendar'
  const [client, setClient] = useState(null);

  // Agenda
  const [assignments, setAssignments] = useState([]);
  const [workoutResults, setWorkoutResults] = useState([]);
  const [activeFilter, setActiveFilter] = useState('pending'); // 'pending' | 'history'

  // Tests
  const [testDefs, setTestDefs] = useState([]);
  const [testResults, setTestResults] = useState([]);
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

    const dbResults = await storage.getWorkoutResults(cId);
    setWorkoutResults(dbResults);

    // Cargar Tests
    const dbTestDefs = await storage.getEntities(KEYS.TEST_DEFINITIONS);
    setTestDefs(dbTestDefs);

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

  // Filtrado de Agenda
  // IMPORTANTE: debe ir antes de cualquier return temprano. Estaba más
  // abajo y, al vincular la ficha, el componente pasaba de 0 a 1 hook
  // entre renders y React lanzaba "Rendered more hooks than expected".
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

  // Sin ficha deportiva vinculada el portal sigue siendo navegable: se muestra
  // un aviso y la agenda/calendario aparecen vacíos, en vez de una pantalla
  // sin salida.
  const sinFicha = userProfile?.status === 'pending_assignment' || !userProfile?.clientId;

  const handleRegisterTest = async (e) => {
    e.preventDefault();
    setTestError('');

    if (!client) {
      setTestError('Necesitas que tu entrenador te vincule una ficha deportiva antes de registrar tests.');
      return;
    }
    if (!selectedTestDefId) {
      setTestError('Debes seleccionar un test.');
      return;
    }
    if (!testValue.trim()) {
      setTestError('Debes ingresar el resultado de la medición.');
      return;
    }

    const def = testDefs.find(d => String(d.id) === String(selectedTestDefId));
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

  // Faltaba por definir: el modal de Sesión Libre recibía "onSave={handleSaveFreeSession}"
  // sin que esa función existiera en ningún sitio, así que abrir el modal
  // rompía el render entero (ReferenceError) y dejaba el portal en blanco.
  const handleSaveFreeSession = async (payload) => {
    await storage.saveWorkoutResult(payload);
    await loadClientData();
    setShowFreeSessionModal(false);
  };

  return (
    <div className="cp__container">

      {sinFicha && (
        <div className="cp__notice">
          <span className="cp__notice-icon" aria-hidden="true">⏳</span>
          <div>
            <strong className="cp__notice-title">Esperando asignación</strong>
            <p className="cp__notice-body">
              Tu entrenador todavía no te ha vinculado a una ficha deportiva. Puedes
              moverte por el portal, pero tu agenda y tu calendario estarán vacíos
              hasta que lo haga.
            </p>
          </div>
        </div>
      )}

      {/* Cabecera del Portal del Cliente: mismo criterio que el resto de la
          app (título pequeño y sencillo, sin cajas grandes de color) en vez
          de la antigua tarjeta morada a pantalla ancha. */}
      <div className="cp__header-row">
        <div>
          <h2 className="cp__header-title">
            {client ? `¡Hola, ${client.firstName}!` : '¡Hola!'}
          </h2>
          <p className="cp__header-subtitle">
            Tu espacio para revisar tus entrenamientos y tu ficha de salud.
          </p>
        </div>
        <button
          type="button"
          className="cp__logout-btn"
          onClick={logout}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Salir</span>
        </button>
      </div>


      {/* Tabs de Navegación Interna */}
      <div className="cp__tabs" role="tablist">
        <button
          className={`cp__tab-btn ${activeTab === 'agenda' ? 'cp__tab-btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'agenda'}
          onClick={() => setActiveTab('agenda')}
        >
          Mi Planificación
        </button>
        <button
          className={`cp__tab-btn ${activeTab === 'profile' ? 'cp__tab-btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
        >
          Mi Perfil
        </button>
        {/* Hasta que el entrenador no registre el primer test, esta pestaña
            no tiene nada que enseñar: mejor no mostrarla que enseñarla vacía. */}
        {testResults.length > 0 && (
          <button
            className={`cp__tab-btn ${activeTab === 'progress' ? 'cp__tab-btn--active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'progress'}
            onClick={() => setActiveTab('progress')}
          >
            Tests Físicos
          </button>
        )}
        <button
          className={`cp__tab-btn ${activeTab === 'records' ? 'cp__tab-btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'records'}
          onClick={() => setActiveTab('records')}
        >
          Mis Récords
        </button>
        <button
          className={`cp__tab-btn ${activeTab === 'metrics' ? 'cp__tab-btn--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'metrics'}
          onClick={() => setActiveTab('metrics')}
        >
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
              disabled={sinFicha}
              title={sinFicha ? 'Necesitas que tu entrenador te vincule una ficha deportiva' : undefined}
            >
              + Registrar Sesión Libre
            </button>
          </div>

          <div className="cp__agenda-list">
            {agendaViewMode === 'calendar' ? (
              <div className="cp__card">
                <ClientCalendarTab
                  clientId={userProfile?.clientId || null}
                  readOnly={true}
                  onReadOnlyEventClick={async (ev) => {
                    if (ev.type === 'workout' && userProfile?.clientId) {
                      const allWa = await storage.getWorkoutAssignments(userProfile.clientId);
                      const assignment = allWa.find(a => String(a.id) === String(ev.assignmentId));
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

      {/* PESTAÑA 2: MI PERFIL (ficha médica de solo lectura) */}
      {activeTab === 'profile' && (
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
                <div className="cp__grid-2" style={{ gap: '10px', borderTop: '1px solid var(--gray-200)', paddingTop: '10px' }}>
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
      )}

      {/* PESTAÑA 3: TESTS FÍSICOS */}
      {activeTab === 'progress' && (
        <div>
          {/* Registro de test (solo si el entrenador autoriza autoregistro
              para alguno) e historial de mediciones, antes de la evolución. */}
          <div style={{ marginBottom: '32px' }}>
            <h3 className="wb__section-title">Registro de Test Físico</h3>

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

              <div className="cp__grid-2-1">
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
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
          
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
      {showFreeSessionModal && client && (
        <FreeSessionModal
          clientId={client.id}
          onClose={() => setShowFreeSessionModal(false)}
          onSave={handleSaveFreeSession}
        />
      )}

    </div>
  );
}
