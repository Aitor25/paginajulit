import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';

function stripAccents(str) {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function diaVacio(dayOffset) {
  return { dayOffset, restDay: true, workoutId: null, workoutVersion: 1, notes: '' };
}

function semanaVacia(numero) {
  return {
    weekNumber: numero,
    name: `Semana ${numero}`,
    phase: '',
    objectives: '',
    notes: '',
    days: Array.from({ length: 7 }, (_, i) => diaVacio(i))
  };
}

export default function ProgramBuilderView({
  editingProgram = null,
  onClose,
  onSave
}) {
  const [workouts, setWorkouts] = useState([]);
  const [search, setSearch] = useState('');

  // Formulario del Programa
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState([]);

  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Arrastrar un entrenamiento desde la biblioteca hasta un día
  const [dropDayOffset, setDropDayOffset] = useState(null);
  // Selector de día que abre el botón "+" de cada rutina de la biblioteca
  const [dayPickerFor, setDayPickerFor] = useState(null);

  async function loadData() {
    setWorkouts(await storage.getWorkouts());
  }

  useEffect(() => {
    loadData();

    if (editingProgram) {
      setName(editingProgram.name || '');
      setDescription(editingProgram.description || '');

      const mappedWeeks = (editingProgram.weeks || []).map(w => {
        const days = Array.from({ length: 7 }, (_, i) => {
          const existing = (w.days || []).find(d => Number(d.dayOffset) === i);
          return existing ? {
            dayOffset: i,
            restDay: !!existing.restDay,
            workoutId: existing.workoutId,
            workoutVersion: existing.workoutVersion || 1,
            notes: existing.notes || ''
          } : diaVacio(i);
        });
        return {
          weekNumber: w.weekNumber,
          name: w.name || `Semana ${w.weekNumber}`,
          phase: w.phase || '',
          objectives: w.objectives || '',
          notes: w.notes || '',
          days
        };
      });
      setWeeks(mappedWeeks.length > 0 ? mappedWeeks : [semanaVacia(1)]);
      setActiveWeekIdx(0);
    } else {
      setName('');
      setDescription('');
      setWeeks([semanaVacia(1)]);
      setActiveWeekIdx(0);
    }
  }, [editingProgram]);

  // --- Sumar / restar semanas ---
  const handleAddWeek = () => {
    setWeeks(prev => {
      const next = [...prev, semanaVacia(prev.length + 1)];
      setActiveWeekIdx(next.length - 1);
      return next;
    });
  };

  const handleRemoveWeek = (idx) => {
    setWeeks(prev => {
      if (prev.length <= 1) return prev;
      const next = prev
        .filter((_, i) => i !== idx)
        .map((w, i) => ({ ...w, weekNumber: i + 1, name: w.name === `Semana ${w.weekNumber}` ? `Semana ${i + 1}` : w.name }));
      return next;
    });
    setActiveWeekIdx(idx0 => Math.max(0, Math.min(idx0, idx - 1)));
  };

  // --- Campos de semana y día ---
  const handleUpdateWeekField = (weekIdx, field, value) => {
    setWeeks(prev => prev.map((w, idx) => idx === weekIdx ? { ...w, [field]: value } : w));
  };

  const handleUpdateDayField = (weekIdx, dayOffset, field, value) => {
    setWeeks(prev => prev.map((w, wIdx) => {
      if (wIdx !== weekIdx) return w;
      return { ...w, days: w.days.map(d => d.dayOffset === dayOffset ? { ...d, [field]: value } : d) };
    }));
  };

  const handleAddWorkoutToDay = (weekIdx, dayOffset, workoutId) => {
    setWeeks(prev => prev.map((w, wIdx) => {
      if (wIdx !== weekIdx) return w;
      return {
        ...w,
        days: w.days.map(d => d.dayOffset === dayOffset
          ? { ...d, restDay: false, workoutId: String(workoutId), workoutVersion: 1 }
          : d)
      };
    }));
  };

  const handleClearDay = (weekIdx, dayOffset) => {
    setWeeks(prev => prev.map((w, wIdx) => {
      if (wIdx !== weekIdx) return w;
      return { ...w, days: w.days.map(d => d.dayOffset === dayOffset ? diaVacio(dayOffset) : d) };
    }));
  };

  const handleDuplicateWeek = (srcWeekIdx) => {
    const targetStr = window.prompt(
      `Introduce el número de semana de destino (1 a ${weeks.length}) para duplicar la estructura de la Semana ${srcWeekIdx + 1}:`
    );
    if (!targetStr) return;
    const targetIdx = Number(targetStr) - 1;

    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= weeks.length) {
      alert("Número de semana de destino inválido.");
      return;
    }
    if (srcWeekIdx === targetIdx) {
      alert("No puedes duplicar una semana sobre sí misma.");
      return;
    }

    const srcWeek = weeks[srcWeekIdx];
    const clonedDays = srcWeek.days.map(d => ({ ...d }));
    setWeeks(prev => prev.map((w, idx) => idx === targetIdx
      ? { ...w, phase: srcWeek.phase, objectives: srcWeek.objectives, notes: srcWeek.notes, days: clonedDays }
      : w));
  };

  // --- Arrastrar rutina desde la biblioteca hasta un día ---
  const handleDragStartLibrary = (e, workout) => {
    e.dataTransfer.setData('text/plain', String(workout.id));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOverDay = (e, dayOffset) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dropDayOffset !== dayOffset) setDropDayOffset(dayOffset);
  };

  const handleDropOnDay = (e, dayOffset) => {
    e.preventDefault();
    setDropDayOffset(null);
    const workoutId = e.dataTransfer.getData('text/plain');
    if (workoutId) handleAddWorkoutToDay(activeWeekIdx, dayOffset, workoutId);
  };

  // --- Botón "+" de la biblioteca: elegir a qué día de la semana va ---
  const handlePickDay = (dayOffset) => {
    if (dayPickerFor === null) return;
    handleAddWorkoutToDay(activeWeekIdx, dayOffset, dayPickerFor);
    setDayPickerFor(null);
  };

  // --- Guardar el Programa ---
  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg("El nombre del programa es obligatorio.");
      return;
    }

    const payload = {
      name: trimmedName,
      description: description.trim(),
      durationWeeks: weeks.length,
      weeks: weeks.map(w => ({
        weekNumber: w.weekNumber,
        name: w.name,
        phase: w.phase,
        objectives: w.objectives,
        notes: w.notes,
        days: w.days.map(d => ({
          dayOffset: d.dayOffset,
          restDay: d.restDay,
          workoutId: d.workoutId,
          workoutVersion: d.workoutVersion,
          notes: d.notes
        }))
      }))
    };

    let propagate = false;
    if (editingProgram) {
      payload.id = editingProgram.id;
      payload.createdAt = editingProgram.createdAt;

      const allAssigns = await storage.getProgramAssignments();
      const hasActive = allAssigns.some(a => a.programId === editingProgram.id && a.status === 'active');
      if (hasActive) {
        propagate = window.confirm(
          "Este programa cuenta con asignaciones activas. ¿Deseas propagar los cambios estructurales a las sesiones futuras no completadas de los deportistas?"
        );
      }
    }

    try {
      const saved = await storage.saveProgram(payload);

      if (editingProgram && propagate) {
        const allAssignments = await storage.getProgramAssignments();
        const activeAssignments = allAssignments.filter(a => a.programId === saved.id && a.status === 'active');
        const workoutAssigns = await storage.getEntities(KEYS.WORKOUT_ASSIGNMENTS);

        for (const assign of activeAssignments) {
          let updatedAssigns = workoutAssigns.filter(wa =>
            !(wa.programAssignmentId === assign.id && wa.status === 'pending')
          );
          let assignIdCounter = updatedAssigns.reduce((max, a) => a.id > max ? a.id : max, 0);
          const start = new Date(assign.startDate);

          payload.weeks.forEach(week => {
            week.days.forEach(day => {
              if (!day.restDay && day.workoutId) {
                assignIdCounter++;
                const sessionDate = new Date(start);
                sessionDate.setDate(start.getDate() + (week.weekNumber - 1) * 7 + day.dayOffset);
                updatedAssigns.push({
                  id: assignIdCounter,
                  workoutId: day.workoutId,
                  workoutVersion: day.workoutVersion || 1,
                  clientId: assign.clientId,
                  groupId: assign.groupId || null,
                  scheduledAt: sessionDate.toISOString(),
                  status: 'pending',
                  programAssignmentId: assign.id,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                });
              }
            });
          });

          await storage.updateAssignmentProgress(assign.id);
        }
      }

      if (onSave) onSave(saved);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo guardar el programa.');
    }
  };

  const filteredWorkouts = useMemo(() => {
    let result = workouts;
    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(w => stripAccents(w.name).includes(query));
    }
    return result;
  }, [workouts, search]);

  const activeWeek = weeks[activeWeekIdx];
  const totalSesiones = weeks.reduce((n, w) => n + w.days.filter(d => !d.restDay && d.workoutId).length, 0);

  return (
    <div className="wb__container">
      <div className="wb__top-bar">
        <button className="el__btn el__btn--ghost" onClick={onClose}>
          ✕ Salir del editor
        </button>
        <span className="wb__top-summary">
          {weeks.length} semana{weeks.length === 1 ? '' : 's'} · {totalSesiones} sesión{totalSesiones === 1 ? '' : 'es'}
        </span>
        <button className="el__btn el__btn--primary" onClick={handleSave}>
          Guardar Programa
        </button>
      </div>

      <div className="wb__grid">

        {/* ══ COLUMNA IZQUIERDA: CABECERA Y CALENDARIO SEMANAL ══ */}
        <div className="wb__col wb__col--left">

          {/* Cabecera compacta: lo importante es ver el macrociclo, no este formulario */}
          <div className="wb__meta wb__meta--program">
            <div className="wb__meta-field wb__meta-field--name">
              <label className="wb__meta-label" htmlFor="pb-name">Nombre *</label>
              <input
                id="pb-name"
                type="text"
                className="wb__meta-input"
                placeholder="ej. Macrociclo Fuerza 12 Semanas"
                value={name}
                onChange={e => { setName(e.target.value); setErrorMsg(''); }}
                required
              />
            </div>

            <div className="wb__meta-field wb__meta-field--weeks">
              <label className="wb__meta-label">Semanas</label>
              <div className="wb__stepper">
                <button type="button" className="wb__stepper-btn" onClick={() => handleRemoveWeek(weeks.length - 1)} disabled={weeks.length <= 1} title="Quitar la última semana">−</button>
                <span className="wb__stepper-value">{weeks.length}</span>
                <button type="button" className="wb__stepper-btn" onClick={handleAddWeek} title="Añadir una semana">+</button>
              </div>
            </div>

            <div className="wb__meta-field wb__meta-field--goal">
              <label className="wb__meta-label" htmlFor="pb-goal">Objetivo</label>
              <input
                id="pb-goal"
                type="text"
                className="wb__meta-input"
                placeholder="Enfoque fisiológico, volumen, pautas..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </div>

          {errorMsg && <p className="wb__error">{errorMsg}</p>}

          {/* ══ PESTAÑAS DE SEMANA ══ */}
          <div className="wb__week-tabs">
            {weeks.map((w, idx) => (
              <button
                key={idx}
                type="button"
                className={`wb__week-tab ${activeWeekIdx === idx ? 'wb__week-tab--active' : ''}`}
                onClick={() => setActiveWeekIdx(idx)}
              >
                S{idx + 1}
                {w.days.some(d => !d.restDay && d.workoutId) && <span className="wb__week-tab-dot" />}
              </button>
            ))}
          </div>

          {/* ══ SEMANA ACTIVA ══ */}
          {activeWeek && (
            <div className="wb__block-card wb__block-card--active">
              <div className="wb__block-header">
                <span className="wb__block-order">S{activeWeek.weekNumber}</span>
                <input
                  type="text"
                  className="wb__block-title-input"
                  value={activeWeek.name}
                  onChange={e => handleUpdateWeekField(activeWeekIdx, 'name', e.target.value)}
                  placeholder="Nombre de la semana..."
                />
                <div className="wb__block-header-actions">
                  <button type="button" className="wb__icon-btn" onClick={() => handleDuplicateWeek(activeWeekIdx)} title="Duplicar esta estructura en otra semana">⧉</button>
                  <button type="button" className="wb__icon-btn wb__icon-btn--danger" onClick={() => handleRemoveWeek(activeWeekIdx)} disabled={weeks.length <= 1} title="Eliminar esta semana">✕</button>
                </div>
              </div>

              <div className="wb__week-fields">
                <input
                  type="text"
                  className="wb__field-input"
                  placeholder="Fase (ej. Preparación general)"
                  value={activeWeek.phase}
                  onChange={e => handleUpdateWeekField(activeWeekIdx, 'phase', e.target.value)}
                />
                <input
                  type="text"
                  className="wb__field-input"
                  placeholder="Objetivo de la semana"
                  value={activeWeek.objectives}
                  onChange={e => handleUpdateWeekField(activeWeekIdx, 'objectives', e.target.value)}
                />
                <input
                  type="text"
                  className="wb__field-input"
                  placeholder="Notas"
                  value={activeWeek.notes}
                  onChange={e => handleUpdateWeekField(activeWeekIdx, 'notes', e.target.value)}
                />
              </div>

              <div className="wb__block-exercises-list">
                {activeWeek.days.map(day => {
                  const workoutObj = workouts.find(wo => wo.id === day.workoutId);
                  return (
                    <div
                      key={day.dayOffset}
                      className={'wb__day-row' + (dropDayOffset === day.dayOffset ? ' wb__day-row--drop' : '')}
                      onDragOver={e => handleDragOverDay(e, day.dayOffset)}
                      onDragLeave={() => setDropDayOffset(null)}
                      onDrop={e => handleDropOnDay(e, day.dayOffset)}
                    >
                      <span className="wb__day-name">{DAY_SHORT[day.dayOffset]}</span>

                      {day.restDay ? (
                        <span className="wb__day-rest">Descanso · arrastra un entrenamiento o pulsa + en la biblioteca</span>
                      ) : (
                        <span className="wb__day-workout">🏋️ {workoutObj ? workoutObj.name : `Entrenamiento no encontrado`}</span>
                      )}

                      <input
                        type="text"
                        className="wb__day-notes"
                        placeholder="Notas del día..."
                        value={day.notes}
                        onChange={e => handleUpdateDayField(activeWeekIdx, day.dayOffset, 'notes', e.target.value)}
                      />

                      {!day.restDay && (
                        <button type="button" className="wb__icon-btn wb__icon-btn--danger" onClick={() => handleClearDay(activeWeekIdx, day.dayOffset)} title="Quitar entrenamiento de este día">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ══ COLUMNA DERECHA: BIBLIOTECA DE ENTRENAMIENTOS ═════════ */}
        <div className="wb__col wb__col--right">
          <h2 className="wb__section-title">Entrenamientos</h2>

          <input
            type="text"
            className="wb__field-input"
            placeholder="Buscar entrenamiento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="wb__library-list">
            {filteredWorkouts.length === 0 && (
              <p className="wb__empty-hint">No hay entrenamientos que encajen con la búsqueda.</p>
            )}

            {filteredWorkouts.map(w => (
              <div
                key={w.id}
                className="wb__library-item"
                draggable
                onDragStart={e => handleDragStartLibrary(e, w)}
                title="Arrástrala a un día de la semana activa, o pulsa +"
              >
                <div className="wb__library-item-info">
                  <span className="wb__library-item-name">{w.name}</span>
                  <span className="wb__library-item-cat">
                    {w.estimatedDurationMinutes} min · {w.blocks?.length || 0} bloques
                  </span>
                </div>

                <div className="wb__library-item-actions" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="wb__add-btn"
                    onClick={() => setDayPickerFor(dayPickerFor === w.id ? null : w.id)}
                    title="Elegir día de la semana activa"
                  >
                    +
                  </button>

                  {dayPickerFor === w.id && (
                    <div className="wb__day-picker" onMouseLeave={() => setDayPickerFor(null)}>
                      <span className="wb__day-picker-title">Semana {activeWeekIdx + 1} — elige el día</span>
                      {DAY_NAMES.map((label, i) => {
                        const ocupado = !activeWeek?.days[i]?.restDay;
                        return (
                          <button
                            key={i}
                            type="button"
                            className="wb__day-picker-option"
                            onClick={() => handlePickDay(i)}
                          >
                            {label}
                            {ocupado && <span className="wb__day-picker-flag">ocupa día</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
