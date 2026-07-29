import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import GlobalCatalogModal from './GlobalCatalogModal';

function stripAccents(str) {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const DAY_NAMES = [
  'Día 1 (Lunes)',
  'Día 2 (Martes)',
  'Día 3 (Miércoles)',
  'Día 4 (Jueves)',
  'Día 5 (Viernes)',
  'Día 6 (Sábado)',
  'Día 7 (Domingo)'
];

export default function ProgramBuilderView({
  editingProgram = null,
  onClose,
  onSave
}) {
  // Ejercicios y Catálogos de la biblioteca
  const [workouts, setWorkouts] = useState([]);
  const [workoutTags, setWorkoutTags] = useState([]);

  // Estados de la biblioteca lateral (Filtros de rutinas)
  const [search, setSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('Todas');

  // Modales
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Formulario del Programa
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [status, setStatus] = useState('active');
  const [weeks, setWeeks] = useState([]);

  // Control SPA de navegación del constructor
  const [activeWeekIdx, setActiveWeekIdx] = useState(0); // Acordeón de semana abierta
  const [selectedDayTarget, setSelectedDayTarget] = useState({ weekIdx: 0, dayOffset: 0 }); // Día activo para insertar rutinas
  const [errorMsg, setErrorMsg] = useState('');

  // Cargar datos iniciales
  async function loadData() {
    const dbWorkouts = await storage.getWorkouts();
    const dbWTags = await storage.getEntities(KEYS.WORKOUT_TAGS);

    setWorkouts(dbWorkouts.filter(w => w.status === 'active'));
    setWorkoutTags(dbWTags);
  }

  useEffect(() => {
    loadData();

    if (editingProgram) {
      setName(editingProgram.name || '');
      setDescription(editingProgram.description || '');
      setDurationWeeks(editingProgram.durationWeeks || 1);
      setSelectedTagIds(Array.isArray(editingProgram.tagIds) ? editingProgram.tagIds : []);
      setStatus(editingProgram.status || 'active');

      // Mapear semanas y días estructurados desde el relacional completo
      const mappedWeeks = (editingProgram.weeks || []).map(w => {
        // Rellenar los 7 días (dayOffset 0-6)
        const days = Array.from({ length: 7 }, (_, i) => {
          const existingDay = (w.days || []).find(d => Number(d.dayOffset) === i);
          return existingDay ? {
            dayOffset: i,
            restDay: !!existingDay.restDay,
            workoutId: existingDay.workoutId,
            workoutVersion: existingDay.workoutVersion || 1,
            notes: existingDay.notes || ''
          } : {
            dayOffset: i,
            restDay: true,
            workoutId: null,
            workoutVersion: 1,
            notes: ''
          };
        });
        return {
          weekNumber: w.weekNumber,
          name: w.name || '',
          phase: w.phase || '',
          objectives: w.objectives || '',
          notes: w.notes || '',
          days
        };
      });
      setWeeks(mappedWeeks);
    } else {
      setName('');
      setDescription('');
      setDurationWeeks(4);
      setSelectedTagIds([]);
      setStatus('active');
      rebuildWeeks(4);
    }
  }, [editingProgram]);

  // Genera el listado de semanas y días vacíos según la duración
  const rebuildWeeks = (numWeeks) => {
    const nextWeeks = Array.from({ length: numWeeks }, (_, wIdx) => {
      const existing = weeks[wIdx];
      if (existing) return existing;

      // Crear semana por defecto con sus 7 días de descanso
      const days = Array.from({ length: 7 }, (_, dIdx) => ({
        dayOffset: dIdx,
        restDay: true,
        workoutId: null,
        workoutVersion: 1,
        notes: ''
      }));

      return {
        weekNumber: wIdx + 1,
        name: `Semana ${wIdx + 1}`,
        phase: '',
        objectives: '',
        notes: '',
        days
      };
    });
    setWeeks(nextWeeks.slice(0, numWeeks));
  };

  // Re-calcular si el entrenador cambia la duración del macrociclo
  const handleDurationChange = (val) => {
    const num = Math.max(1, Number(val) || 1);
    setDurationWeeks(num);
    rebuildWeeks(num);
  };

  const handleTagToggle = (tagId) => {
    setSelectedTagIds(prev => {
      if (prev.includes(tagId)) {
        return prev.filter(id => id !== tagId);
      } else {
        return [...prev, tagId];
      }
    });
  };

  // --- Operaciones en el Calendario de la Columna Izquierda ---
  const handleUpdateWeekField = (weekIdx, field, value) => {
    setWeeks(prev => prev.map((w, idx) => idx === weekIdx ? { ...w, [field]: value } : w));
  };

  const handleUpdateDayField = (weekIdx, dayOffset, field, value) => {
    setWeeks(prev => prev.map((w, wIdx) => {
      if (wIdx === weekIdx) {
        const updatedDays = w.days.map(d => {
          if (d.dayOffset === dayOffset) {
            let nextVal = { ...d, [field]: value };
            // Coherencia Descanso/Entrenamiento:
            if (field === 'restDay' && value === true) {
              nextVal.workoutId = null;
            } else if (field === 'restDay' && value === false) {
              nextVal.restDay = false;
            }
            return nextVal;
          }
          return d;
        });
        return { ...w, days: updatedDays };
      }
      return w;
    }));
  };

  const handleAddWorkoutToDay = (weekIdx, dayOffset, workoutId) => {
    setWeeks(prev => prev.map((w, wIdx) => {
      if (wIdx === weekIdx) {
        const updatedDays = w.days.map(d => {
          if (d.dayOffset === dayOffset) {
            return {
              ...d,
              restDay: false,
              workoutId: Number(workoutId),
              workoutVersion: 1
            };
          }
          return d;
        });
        return { ...w, days: updatedDays };
      }
      return w;
    }));
  };

  const handleClearDay = (weekIdx, dayOffset) => {
    setWeeks(prev => prev.map((w, wIdx) => {
      if (wIdx === weekIdx) {
        const updatedDays = w.days.map(d => {
          if (d.dayOffset === dayOffset) {
            return {
              ...d,
              restDay: true,
              workoutId: null,
              workoutVersion: 1
            };
          }
          return d;
        });
        return { ...w, days: updatedDays };
      }
      return w;
    }));
  };

  const handleDuplicateWeek = (srcWeekIdx) => {
    const targetStr = window.prompt(
      `Introduce el número de semana de destino (1 a ${durationWeeks}) para duplicar la estructura de la Semana ${srcWeekIdx + 1}:`
    );
    if (!targetStr) return;
    const targetIdx = Number(targetStr) - 1;

    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= durationWeeks) {
      alert("Número de semana de destino inválido.");
      return;
    }

    if (srcWeekIdx === targetIdx) {
      alert("No puedes duplicar una semana sobre sí misma.");
      return;
    }

    const srcWeek = weeks[srcWeekIdx];
    // Clonar días
    const clonedDays = srcWeek.days.map(d => ({ ...d }));

    setWeeks(prev => prev.map((w, idx) => {
      if (idx === targetIdx) {
        return {
          ...w,
          phase: srcWeek.phase,
          name: `${srcWeek.name} (Copia)`,
          objectives: srcWeek.objectives,
          notes: srcWeek.notes,
          days: clonedDays
        };
      }
      return w;
    }));
  };

  const handleDuplicateDay = (weekIdx, dayOffset) => {
    const targetStr = window.prompt(
      `¿A qué día deseas duplicar este entrenamiento? Introduce el número de día offset (1 a 7):`
    );
    if (!targetStr) return;
    const targetOffset = Number(targetStr) - 1;

    if (isNaN(targetOffset) || targetOffset < 0 || targetOffset > 6) {
      alert("Día de destino inválido.");
      return;
    }

    const srcDay = weeks[weekIdx].days.find(d => d.dayOffset === dayOffset);
    if (!srcDay) return;

    setWeeks(prev => prev.map((w, wIdx) => {
      if (wIdx === weekIdx) {
        const updatedDays = w.days.map(d => {
          if (d.dayOffset === targetOffset) {
            return {
              ...d,
              restDay: srcDay.restDay,
              workoutId: srcDay.workoutId,
              workoutVersion: srcDay.workoutVersion,
              notes: srcDay.notes
            };
          }
          return d;
        });
        return { ...w, days: updatedDays };
      }
      return w;
    }));
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

    // Filtrar los días del programa para enviar solo los días que tienen programación (para no guardar días de descanso vacíos innecesariamente)
    // Pero la validación de almacenamiento exige que la estructura sea completa y que no haya duplicidad
    const payload = {
      name: trimmedName,
      description: description.trim(),
      durationWeeks: Number(durationWeeks),
      tagIds: selectedTagIds.map(Number),
      status: status,
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

    // Si estamos editando y hay asignaciones activas, debemos decidir si propagar
    let propagate = false;
    if (editingProgram) {
      payload.id = editingProgram.id;
      payload.createdAt = editingProgram.createdAt;

      // Buscar si hay asignaciones en curso
      const allAssigns = await storage.getProgramAssignments();
      const hasActive = allAssigns.some(a => a.programId === editingProgram.id && a.status === 'active');
      if (hasActive) {
        // Es un cambio estructural si se cambiaron entrenamientos o días
        // Preguntar al entrenador
        propagate = window.confirm(
          "Este programa cuenta con asignaciones activas. ¿Deseas propagar los cambios estructurales a las sesiones futuras no completadas de los deportistas?"
        );
      }
    }

    try {
      const saved = await storage.saveProgram(payload);

      // Si propagamos cambios structurales, actualizamos el calendario del deportista
      if (editingProgram && propagate) {
        const allAssignments = await storage.getProgramAssignments();
        const activeAssignments = allAssignments.filter(a => a.programId === saved.id && a.status === 'active');
        
        const workoutAssigns = await storage.getEntities(KEYS.WORKOUT_ASSIGNMENTS);

        for (const assign of activeAssignments) {
          // Borrar entrenamientos pendientes
          let updatedAssigns = workoutAssigns.filter(wa => 
            !(wa.programAssignmentId === assign.id && wa.status === 'pending')
          );

          let assignIdCounter = updatedAssigns.reduce((max, a) => a.id > max ? a.id : max, 0);
          const start = new Date(assign.startDate);

          // Regenerar
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

          // TODO: Implementar guardado en lote de asignaciones modificadas en Firebase
          console.log("Se han recalculado", updatedAssigns.length, "asignaciones, pero la actualización masiva está pendiente de implementar en Firebase.");
          await storage.updateAssignmentProgress(assign.id);
        }
      }

      if (onSave) onSave(saved);
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // --- Biblioteca lateral de rutinas (Filtros) ---
  const filteredWorkouts = useMemo(() => {
    let result = workouts;
    if (selectedTagFilter !== 'Todas') {
      result = result.filter(w => w.tagIds?.includes(Number(selectedTagFilter)));
    }
    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(w => stripAccents(w.name).includes(query));
    }
    return result;
  }, [workouts, selectedTagFilter, search]);

  return (
    <div className="wb__container">
      
      {/* Barra superior */}
      <div className="wb__top-bar">
        <button className="el__btn el__btn--ghost" onClick={onClose}>
          ✕ Salir del editor
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="el__btn el__btn--primary" onClick={handleSave}>
            Guardar Programa
          </button>
        </div>
      </div>

      <div className="wb__grid">
        
        {/* ══ COLUMNA IZQUIERDA: CONFIGURADOR SEMANAL ════════════ */}
        <div className="wb__col wb__col--left">
          <form className="el__modal-form" onSubmit={e => e.preventDefault()}>
            <h2 className="wb__section-title">Estructura del Programa</h2>

            {errorMsg && (
              <div className="gc__alert" style={{ background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030', marginBottom: '16px' }}>
                <strong>Error de Integridad:</strong> {errorMsg}
              </div>
            )}

            {/* Cabecera y Parámetros */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <div className="el__field">
                <label className="el__label">Nombre del Programa *</label>
                <input
                  type="text"
                  className="el__input"
                  placeholder="ej. Macrociclo Fuerza e Hipertrofia 12 Semanas"
                  value={name}
                  onChange={e => { setName(e.target.value); setErrorMsg(''); }}
                  required
                />
              </div>
              <div className="el__field">
                <label className="el__label">Duración (Semanas)</label>
                <input
                  type="number"
                  min="1"
                  className="el__input"
                  value={durationWeeks}
                  onChange={e => handleDurationChange(e.target.value)}
                />
              </div>
            </div>

            <div className="el__field">
              <label className="el__label">Descripción / Objetivos del Macrociclo</label>
              <textarea
                className="el__input el__input--textarea"
                placeholder="Indica el enfoque fisiológico del programa, rango de volumen y pautas recomendadas..."
                rows="2"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="el__field">
                <label className="el__label">Estado</label>
                <select
                  className="el__input el__input--select"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="active">Activo (Disponible para asignar)</option>
                  <option value="draft">Borrador</option>
                  <option value="archived">Archivado</option>
                </select>
              </div>

              {/* Tags de rutina */}
              <div className="el__field">
                <label className="el__label">Etiquetas del Programa</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)' }}>
                  {workoutTags.map(wt => (
                    <label key={wt.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '2px 6px', background: selectedTagIds.includes(wt.id) ? 'var(--gray-200)' : 'var(--off-white)', borderRadius: '12px', border: '1px solid var(--gray-300)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        style={{ margin: 0 }}
                        checked={selectedTagIds.includes(wt.id)}
                        onChange={() => handleTagToggle(wt.id)}
                      />
                      {wt.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* ══ CRONOGRAMA DE SEMANAS (ACORDEONES) ══ */}
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--gray-200)', paddingTop: '16px' }}>
              <h3 className="wb__section-title">Calendario Semanal</h3>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                {weeks.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`el__btn ${activeWeekIdx === idx ? 'el__btn--primary' : 'el__btn--ghost'}`}
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => {
                      setActiveWeekIdx(idx);
                      setSelectedDayTarget({ weekIdx: idx, dayOffset: 0 });
                    }}
                  >
                    Semana {idx + 1}
                  </button>
                ))}
              </div>

              {weeks.map((week, wIdx) => {
                if (wIdx !== activeWeekIdx) return null;

                return (
                  <div key={wIdx} className="wb__block-card" style={{ cursor: 'default' }}>
                    <div className="wb__block-header">
                      <span className="wb__block-order">W{week.weekNumber}</span>
                      <input
                        type="text"
                        className="wb__block-title-input"
                        value={week.name}
                        onChange={e => handleUpdateWeekField(wIdx, 'name', e.target.value)}
                        placeholder="Nombre descriptivo de la semana..."
                      />
                      <div className="wb__block-header-actions">
                        <button type="button" className="el__card-admin-btn" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => handleDuplicateWeek(wIdx)}>
                          Duplicar Estructura Semana
                        </button>
                      </div>
                    </div>

                    {/* Campos de objetivos/notas de semana */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '14px', borderBottom: '1px solid var(--gray-100)', background: 'var(--off-white)' }}>
                      <div className="el__field" style={{ margin: 0 }}>
                        <label className="el__label" style={{ fontSize: '0.7rem' }}>Bloque / Fase macrociclo</label>
                        <input
                          type="text"
                          className="el__input"
                          style={{ height: '32px', fontSize: '0.75rem' }}
                          placeholder="ej. Preparación General"
                          value={week.phase}
                          onChange={e => handleUpdateWeekField(wIdx, 'phase', e.target.value)}
                        />
                      </div>
                      <div className="el__field" style={{ margin: 0 }}>
                        <label className="el__label" style={{ fontSize: '0.7rem' }}>Objetivos de la semana</label>
                        <input
                          type="text"
                          className="el__input"
                          style={{ height: '32px', fontSize: '0.75rem' }}
                          placeholder="Foco en carga excéntrica..."
                          value={week.objectives}
                          onChange={e => handleUpdateWeekField(wIdx, 'objectives', e.target.value)}
                        />
                      </div>
                      <div className="el__field" style={{ margin: 0 }}>
                        <label className="el__label" style={{ fontSize: '0.7rem' }}>Notas adicionales</label>
                        <input
                          type="text"
                          className="el__input"
                          style={{ height: '32px', fontSize: '0.75rem' }}
                          placeholder="Volumen medio-bajo..."
                          value={week.notes}
                          onChange={e => handleUpdateWeekField(wIdx, 'notes', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Días del programa */}
                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {week.days.map(day => {
                        const isTarget = selectedDayTarget.weekIdx === wIdx && selectedDayTarget.dayOffset === day.dayOffset;
                        const workoutObj = workouts.find(wo => wo.id === day.workoutId);

                        return (
                          <div
                            key={day.dayOffset}
                            className="wb__exercise-row"
                            style={{
                              borderColor: isTarget ? 'var(--accent)' : 'var(--gray-200)',
                              boxShadow: isTarget ? '0 0 0 2px rgba(99, 102, 241, 0.1)' : 'none',
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedDayTarget({ weekIdx: wIdx, dayOffset: day.dayOffset })}
                          >
                            <div className="wb__exercise-row-header" style={{ border: 'none', padding: 0 }}>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <span className="wb__exercise-order" style={{ background: isTarget ? 'var(--accent)' : 'rgba(99, 102, 241, 0.08)', color: isTarget ? 'var(--white)' : 'var(--accent)' }}>
                                  {DAY_NAMES[day.dayOffset]}
                                </span>
                                
                                {day.restDay ? (
                                  <span style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', fontStyle: 'italic' }}>
                                    💤 Día de Descanso
                                  </span>
                                ) : (
                                  <strong style={{ fontSize: '0.8125rem', color: 'var(--gray-800)' }}>
                                    🏋️ {workoutObj ? workoutObj.name : `Rutina ID #${day.workoutId}`}
                                  </strong>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', cursor: 'pointer', margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={!day.restDay}
                                    onChange={e => handleUpdateDayField(wIdx, day.dayOffset, 'restDay', !e.target.checked)}
                                  />
                                  Sesión activa
                                </label>

                                {!day.restDay && (
                                  <button type="button" className="el__card-admin-btn" style={{ padding: '2px 4px', fontSize: '0.65rem' }} onClick={() => handleDuplicateDay(wIdx, day.dayOffset)}>
                                    Clonar a día...
                                  </button>
                                )}

                                <button type="button" className="el__card-admin-btn el__card-admin-btn--delete" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => handleClearDay(wIdx, day.dayOffset)}>
                                  Borrar
                                </button>
                              </div>
                            </div>

                            {/* Campo de notas para este día */}
                            <div style={{ marginTop: '6px' }}>
                              <input
                                type="text"
                                className="el__input"
                                style={{ height: '26px', fontSize: '0.75rem', padding: '0 8px' }}
                                placeholder="Notas opcionales para este día (ej: sesión de running en ayunas)..."
                                value={day.notes}
                                onChange={e => handleUpdateDayField(wIdx, day.dayOffset, 'notes', e.target.value)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

          </form>
        </div>

        {/* ══ COLUMNA DERECHA: BIBLIOTECA DE RUTINAS ════════════ */}
        <div className="wb__col wb__col--right">
          <h2 className="wb__section-title" style={{ marginBottom: '8px' }}>Asociar Rutina</h2>
          
          <div style={{ padding: '10px', background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--gray-600)' }}>
            Día seleccionado:<br />
            <strong>Semana {selectedDayTarget.weekIdx + 1} - {DAY_NAMES[selectedDayTarget.dayOffset]}</strong>
          </div>

          <input
            type="text"
            className="el__search-input"
            style={{ height: '36px', marginTop: '6px' }}
            placeholder="Buscar plantilla de rutina..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select className="el__select" style={{ height: '32px', fontSize: '0.75rem' }} value={selectedTagFilter} onChange={e => setSelectedTagFilter(e.target.value)}>
            <option value="Todas">Etiqueta: Todas</option>
            {workoutTags.map(wt => (
              <option key={wt.id} value={wt.id}>{wt.name}</option>
            ))}
          </select>

          <div className="wb__library-list" style={{ marginTop: '8px' }}>
            {filteredWorkouts.map(w => (
              <div key={w.id} className="wb__library-item">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: '700' }}>{w.name}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>
                    {w.estimatedDurationMinutes} min · {w.blocks?.length || 0} bloques
                  </span>
                </div>
                <button
                  type="button"
                  className="el__btn el__btn--primary"
                  style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 'bold' }}
                  onClick={() => handleAddWorkoutToDay(selectedDayTarget.weekIdx, selectedDayTarget.dayOffset, w.id)}
                  title="Vincular esta rutina al día seleccionado"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
