import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS, generateUUID } from '../services/storage';
import ExerciseFormModal from './ExerciseFormModal';
import GlobalCatalogModal from './GlobalCatalogModal';

function stripAccents(str) {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function WorkoutBuilderView({
  editingWorkout = null,
  onClose,
  onSave
}) {
  // Ejercicios y Catálogos de la biblioteca
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  // Estados de la biblioteca (Filtros del lateral derecho)
  const [search, setSearch] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState('Todas');
  const [selectedSubcatFilter, setSelectedSubcatFilter] = useState('Todas');

  // Modales embebidos
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEx, setEditingEx] = useState(null);
  const [previewEx, setPreviewEx] = useState(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Ficha activa del constructor (Columna izquierda)
  const [workoutForm, setWorkoutForm] = useState({
    name: '',
    description: '',
    estimatedDurationMinutes: 45,
    blocks: []
  });

  const [activeBlockId, setActiveBlockId] = useState(''); // Bloque destino al hacer clic en "+" en biblioteca
  const [formError, setFormError] = useState('');

  const handleOpenCreate = () => {
    setEditingEx(null);
    setShowFormModal(true);
  };

  const handleOpenEdit = (e, ex) => {
    e.stopPropagation();
    setEditingEx(ex);
    setShowFormModal(true);
  };

  // Carga inicial de datos
  async function loadLibraryData() {
    const dbExs = await storage.getExercises();
    const dbCats = await storage.getEntities(KEYS.EX_CATEGORIES);
    const dbSubs = await storage.getEntities(KEYS.EX_SUBCATEGORIES);

    setExercises(dbExs);
    setCategories(dbCats);
    setSubcategories(dbSubs);
  }

  useEffect(() => {
    loadLibraryData();

    if (editingWorkout) {
      setWorkoutForm({
        name: editingWorkout.name || '',
        description: editingWorkout.description || '',
        estimatedDurationMinutes: editingWorkout.estimatedDurationMinutes || 45,
        blocks: Array.isArray(editingWorkout.blocks) ? JSON.parse(JSON.stringify(editingWorkout.blocks)) : []
      });
      if (editingWorkout.blocks?.length > 0) {
        setActiveBlockId(editingWorkout.blocks[0].id);
      }
    } else {
      // Iniciar con un bloque vacío por defecto
      const defaultBlockId = generateUUID();
      setWorkoutForm({
        name: '',
        description: '',
        estimatedDurationMinutes: 45,
        blocks: [
          {
            id: defaultBlockId,
            name: 'Calentamiento',
            type: 'individual',
            order: 1,
            rounds: 1,
            restBetweenRoundsSeconds: 60,
            exercises: []
          }
        ]
      });
      setActiveBlockId(defaultBlockId);
    }
  }, [editingWorkout]);

  // --- CRUD Bloques de Entrenamiento ---
  const handleAddBlock = (type = 'individual') => {
    const newId = generateUUID();
    const newOrder = workoutForm.blocks.length + 1;
    
    const names = {
      individual: 'Bloque de Fuerza',
      superset: 'Super-Serie',
      triset: 'Tri-Serie',
      circuit: 'Circuito'
    };

    const newBlock = {
      id: newId,
      name: names[type] || 'Nuevo Bloque',
      type: type,
      order: newOrder,
      rounds: 1,
      restBetweenRoundsSeconds: 60,
      exercises: []
    };

    setWorkoutForm(prev => ({
      ...prev,
      blocks: [...prev.blocks, newBlock]
    }));
    setActiveBlockId(newId);
  };

  const handleUpdateBlockField = (blockId, field, value) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === blockId ? { ...b, [field]: value } : b)
    }));
  };

  const handleDeleteBlock = (blockId) => {
    setWorkoutForm(prev => {
      const filtered = prev.blocks.filter(b => b.id !== blockId);
      // Reordenar
      const reordered = filtered.map((b, idx) => ({ ...b, order: idx + 1 }));
      return { ...prev, blocks: reordered };
    });
    if (activeBlockId === blockId) {
      setActiveBlockId(workoutForm.blocks[0]?.id || '');
    }
  };

  const handleDuplicateBlock = (block) => {
    const newBlockId = generateUUID();
    const duplicatedBlock = {
      ...JSON.parse(JSON.stringify(block)),
      id: newBlockId,
      order: workoutForm.blocks.length + 1,
      exercises: block.exercises.map((ex, idx) => ({
        ...ex,
        id: generateUUID(),
        order: idx + 1
      }))
    };

    setWorkoutForm(prev => ({
      ...prev,
      blocks: [...prev.blocks, duplicatedBlock]
    }));
  };

  const handleMoveBlock = (index, direction) => {
    const newBlocks = [...workoutForm.blocks];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;

    // Intercambiar
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;

    // Actualizar orden
    const updated = newBlocks.map((b, idx) => ({ ...b, order: idx + 1 }));
    setWorkoutForm(prev => ({ ...prev, blocks: updated }));
  };

  // --- CRUD Ejercicios del Constructor ---
  const handleAddExerciseToBlock = (exercise) => {
    if (!activeBlockId) {
      alert("Crea o selecciona un bloque en la columna izquierda primero.");
      return;
    }

    const block = workoutForm.blocks.find(b => b.id === activeBlockId);
    if (!block) return;

    // Detección de duplicado accidental
    const alreadyExists = block.exercises.some(e => e.exerciseId === exercise.id);
    if (alreadyExists) {
      if (!window.confirm(`El ejercicio "${exercise.name}" ya está en este bloque. ¿Deseas añadirlo de nuevo?`)) {
        return;
      }
    }

    const newEx = {
      id: generateUUID(),
      exerciseId: exercise.id,
      order: block.exercises.length + 1,
      plannedSets: 4,
      plannedReps: '10',
      loadValue: null,
      loadUnit: 'kg',
      rpe: null,
      rir: null,
      tempo: '',
      restSeconds: 90,
      notes: '',
      cardioParams: null
    };

    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === activeBlockId) {
          return { ...b, exercises: [...b.exercises, newEx] };
        }
        return b;
      })
    }));
  };

  const handleUpdateExerciseField = (blockId, exId, field, value) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === blockId) {
          return {
            ...b,
            exercises: b.exercises.map(e => e.id === exId ? { ...e, [field]: value } : e)
          };
        }
        return b;
      })
    }));
  };

  const handleUpdateCardioField = (blockId, exId, field, value) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === blockId) {
          return {
            ...b,
            exercises: b.exercises.map(e => {
              if (e.id === exId) {
                const params = e.cardioParams || {
                  durationSeconds: null,
                  distanceValue: null,
                  distanceUnit: 'km',
                  pace: null,
                  targetHeartRateMin: null,
                  targetHeartRateMax: null
                };
                return { ...e, cardioParams: { ...params, [field]: value } };
              }
              return e;
            })
          };
        }
        return b;
      })
    }));
  };

  const handleToggleCardioMode = (blockId, exId, enabled) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === blockId) {
          return {
            ...b,
            exercises: b.exercises.map(e => {
              if (e.id === exId) {
                return {
                  ...e,
                  cardioParams: enabled ? {
                    durationSeconds: null,
                    distanceValue: null,
                    distanceUnit: 'km',
                    pace: null,
                    targetHeartRateMin: null,
                    targetHeartRateMax: null
                  } : null
                };
              }
              return e;
            })
          };
        }
        return b;
      })
    }));
  };

  const handleDeleteExerciseFromBlock = (blockId, exId) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === blockId) {
          const filtered = b.exercises.filter(e => e.id !== exId);
          const reordered = filtered.map((e, idx) => ({ ...e, order: idx + 1 }));
          return { ...b, exercises: reordered };
        }
        return b;
      })
    }));
  };

  const handleDuplicateExercise = (blockId, ex) => {
    const block = workoutForm.blocks.find(b => b.id === blockId);
    if (!block) return;

    const duplicated = {
      ...JSON.parse(JSON.stringify(ex)),
      id: generateUUID(),
      order: block.exercises.length + 1
    };

    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === blockId) {
          return { ...b, exercises: [...b.exercises, duplicated] };
        }
        return b;
      })
    }));
  };

  const handleMoveExercise = (blockId, index, direction) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id === blockId) {
          const newExs = [...b.exercises];
          const targetIndex = index + direction;
          if (targetIndex < 0 || targetIndex >= newExs.length) return b;

          // Intercambiar
          const temp = newExs[index];
          newExs[index] = newExs[targetIndex];
          newExs[targetIndex] = temp;

          // Re-ordenar
          const updated = newExs.map((e, idx) => ({ ...e, order: idx + 1 }));
          return { ...b, exercises: updated };
        }
        return b;
      })
    }));
  };

  // --- Guardar Sesión ---
  async function handleSaveWorkout(e) {
    e.preventDefault();
    setFormError('');

    const trimmedName = workoutForm.name.trim();
    if (!trimmedName) {
      setFormError('El nombre de la rutina es obligatorio.');
      return;
    }

    if (workoutForm.blocks.length === 0) {
      setFormError('Debes añadir al menos un bloque a la sesión.');
      return;
    }

    // Validar bloques y ejercicios
    for (const b of workoutForm.blocks) {
      if (b.exercises.length === 0) {
        setFormError(`El bloque "${b.name}" debe contener al menos un ejercicio.`);
        return;
      }

      for (const ex of b.exercises) {
        if (ex.plannedSets < 0) {
          setFormError('El número de series planificadas no puede ser negativo.');
          return;
        }
        if (ex.rpe !== null && (ex.rpe < 1 || ex.rpe > 10)) {
          setFormError('El RPE debe estar comprendido entre 1 y 10.');
          return;
        }
        if (ex.rir !== null && ex.rir < 0) {
          setFormError('El RIR no puede ser un número negativo.');
          return;
        }
        if (ex.restSeconds < 0) {
          setFormError('El descanso entre series no puede ser negativo.');
          return;
        }

        if (ex.cardioParams) {
          const c = ex.cardioParams;
          if (c.durationSeconds !== null && c.durationSeconds < 0) {
            setFormError('La duración de cardio no puede ser negativa.');
            return;
          }
          if (c.distanceValue !== null && c.distanceValue < 0) {
            setFormError('La distancia de cardio no puede ser negativa.');
            return;
          }
          if (c.targetHeartRateMin !== null && c.targetHeartRateMax !== null) {
            if (Number(c.targetHeartRateMin) > Number(c.targetHeartRateMax)) {
              setFormError('La frecuencia cardíaca mínima no puede superar a la máxima.');
              return;
            }
          }
        }
      }
    }

    const payload = {
      name: trimmedName,
      description: workoutForm.description.trim(),
      estimatedDurationMinutes: Number(workoutForm.estimatedDurationMinutes) || 45,
      blocks: workoutForm.blocks
    };

    if (editingWorkout) {
      payload.id = editingWorkout.id;
      payload.createdAt = editingWorkout.createdAt;
    }

    try {
      const saved = await storage.saveWorkout(payload);
      if (onSave) onSave(saved);
      onClose();
    } catch (err) {
      alert(err.message);
    }
  }

  // --- Filtrado Biblioteca lateral derecha ---
  const filteredLibrary = useMemo(() => {
    let result = exercises;

    if (selectedCatFilter !== 'Todas') {
      result = result.filter(ex => String(ex.categoryId) === String(selectedCatFilter));
    }
    if (selectedSubcatFilter !== 'Todas') {
      result = result.filter(ex => String(ex.subcategoryId) === String(selectedSubcatFilter));
    }

    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(ex => {
        const nameMatch = stripAccents(ex.name).includes(query);
        const musclesMatch = Array.isArray(ex.musculos) && ex.musculos.some(m => stripAccents(m).includes(query));
        return nameMatch || musclesMatch;
      });
    }

    return result;
  }, [exercises, selectedCatFilter, selectedSubcatFilter, search]);

  return (
    <div className="wb__container">
      {/* Barra superior de acciones */}
      <div className="wb__top-bar">
        <button className="el__btn el__btn--ghost" onClick={onClose}>
          ✕ Salir del constructor
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="el__btn el__btn--primary" onClick={handleSaveWorkout}>
            Guardar Rutina
          </button>
        </div>
      </div>

      <div className="wb__grid">
        
        {/* ══ COLUMNA IZQUIERDA: FORMULARIO Y BLOQUES ════════════ */}
        <div className="wb__col wb__col--left">
          <form className="el__modal-form" onSubmit={e => e.preventDefault()}>
            <h2 className="wb__section-title">Parámetros de la Sesión</h2>
            
            {/* Título y Duración */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <div className="el__field">
                <label className="el__label">Nombre del Entrenamiento *</label>
                <input
                  type="text"
                  className="el__input"
                  placeholder="ej. Fuerza - Pliometría Tren Inferior"
                  value={workoutForm.name}
                  onChange={e => { setWorkoutForm(w => ({ ...w, name: e.target.value })); setFormError(''); }}
                  required
                />
              </div>
              <div className="el__field">
                <label className="el__label">Duración Est. (min)</label>
                <input
                  type="number"
                  min="5"
                  className="el__input"
                  value={workoutForm.estimatedDurationMinutes}
                  onChange={e => setWorkoutForm(w => ({ ...w, estimatedDurationMinutes: e.target.value }))}
                />
              </div>
            </div>

            {formError && <p className="el__field-error" style={{ marginBottom: '12px' }}>{formError}</p>}

            {/* Descripción */}
            <div className="el__field">
              <label className="el__label">Objetivo y Descripción de la Sesión</label>
              <textarea
                className="el__input el__input--textarea"
                placeholder="Anota el enfoque táctico, fatiga previa buscada o indicaciones generales de la rutina..."
                rows="2"
                value={workoutForm.description}
                onChange={e => setWorkoutForm(w => ({ ...w, description: e.target.value }))}
              />
            </div>

            {/* ══ CONSTRUCTOR DE BLOQUES SECUENCIALES ══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', borderTop: '1px solid var(--gray-200)', paddingTop: '16px' }}>
              <h3 className="wb__section-title" style={{ margin: 0 }}>Estructura de Bloques</h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="el__btn el__btn--ghost" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => handleAddBlock('individual')}>
                  + Fuerza
                </button>
                <button type="button" className="el__btn el__btn--ghost" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => handleAddBlock('superset')}>
                  + Super-Serie
                </button>
                <button type="button" className="el__btn el__btn--ghost" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => handleAddBlock('circuit')}>
                  + Circuito
                </button>
              </div>
            </div>

            <div className="wb__blocks-container">
              {workoutForm.blocks.map((block, bIdx) => (
                <div
                  key={block.id}
                  className={`wb__block-card ${activeBlockId === block.id ? 'wb__block-card--active' : ''}`}
                  onClick={() => setActiveBlockId(block.id)}
                >
                  {/* Cabecera del bloque */}
                  <div className="wb__block-header">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                      <span className="wb__block-order">#{block.order}</span>
                      <input
                        type="text"
                        className="wb__block-title-input"
                        value={block.name}
                        onChange={e => handleUpdateBlockField(block.id, 'name', e.target.value)}
                        placeholder="Nombre del Bloque..."
                      />
                    </div>

                    <div className="wb__block-header-actions">
                      <button type="button" className="el__card-admin-btn" style={{ padding: '2px 6px' }} onClick={() => handleMoveBlock(bIdx, -1)} disabled={bIdx === 0} title="Subir bloque">▲</button>
                      <button type="button" className="el__card-admin-btn" style={{ padding: '2px 6px' }} onClick={() => handleMoveBlock(bIdx, 1)} disabled={bIdx === workoutForm.blocks.length - 1} title="Bajar bloque">▼</button>
                      <button type="button" className="el__card-admin-btn" style={{ padding: '2px 6px' }} onClick={() => handleDuplicateBlock(block)} title="Duplicar bloque">Clonar</button>
                      <button type="button" className="el__card-admin-btn el__card-admin-btn--delete" style={{ padding: '2px 6px' }} onClick={() => handleDeleteBlock(block.id)} title="Eliminar bloque">✕</button>
                    </div>
                  </div>

                  {/* Variables globales de bloque */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '12px 14px', background: 'var(--off-white)', borderBottom: '1px solid var(--gray-100)' }}>
                    <div className="el__field" style={{ margin: 0 }}>
                      <label className="el__label" style={{ fontSize: '0.7rem' }}>Tipo de Bloque</label>
                      <select
                        className="el__input el__input--select"
                        style={{ height: '32px', fontSize: '0.75rem' }}
                        value={block.type}
                        onChange={e => handleUpdateBlockField(block.id, 'type', e.target.value)}
                      >
                        <option value="individual">Fuerza Individual</option>
                        <option value="superset">Super-Serie (A1-A2)</option>
                        <option value="triset">Tri-Serie (A1-A2-A3)</option>
                        <option value="circuit">Circuito (A1-A2-A3...)</option>
                      </select>
                    </div>

                    <div className="el__field" style={{ margin: 0 }}>
                      <label className="el__label" style={{ fontSize: '0.7rem' }}>Series / Rondas</label>
                      <input
                        type="number"
                        min="1"
                        className="el__input"
                        style={{ height: '32px', fontSize: '0.75rem' }}
                        value={block.rounds}
                        onChange={e => handleUpdateBlockField(block.id, 'rounds', Number(e.target.value) || 1)}
                      />
                    </div>

                    <div className="el__field" style={{ margin: 0 }}>
                      <label className="el__label" style={{ fontSize: '0.7rem' }}>Descanso ronda (s)</label>
                      <input
                        type="number"
                        min="0"
                        className="el__input"
                        style={{ height: '32px', fontSize: '0.75rem' }}
                        value={block.restBetweenRoundsSeconds}
                        onChange={e => handleUpdateBlockField(block.id, 'restBetweenRoundsSeconds', Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  {/* Ejercicios dentro del bloque */}
                  <div className="wb__block-exercises-list">
                    {block.exercises.length === 0 ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
                        Haz clic en el botón "+" en la biblioteca de la derecha para añadir ejercicios.
                      </p>
                    ) : (
                      block.exercises.map((ex, exIdx) => {
                        const original = exercises.find(e => e.id === ex.exerciseId);
                        if (!original) return null;

                        return (
                          <div key={ex.id} className="wb__exercise-row" onClick={e => e.stopPropagation()}>
                            <div className="wb__exercise-row-header">
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span className="wb__exercise-order">{block.type === 'individual' ? `${ex.order}` : `A${ex.order}`}</span>
                                <strong style={{ fontSize: '0.8125rem' }}>{original.name}</strong>
                              </div>

                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button type="button" className="el__card-admin-btn" style={{ padding: '0px 4px', fontSize: '0.65rem' }} onClick={() => handleMoveExercise(block.id, exIdx, -1)} disabled={exIdx === 0}>▲</button>
                                <button type="button" className="el__card-admin-btn" style={{ padding: '0px 4px', fontSize: '0.65rem' }} onClick={() => handleMoveExercise(block.id, exIdx, 1)} disabled={exIdx === block.exercises.length - 1}>▼</button>
                                <button type="button" className="el__card-admin-btn" style={{ padding: '0px 4px', fontSize: '0.65rem' }} onClick={() => handleDuplicateExercise(block.id, ex)}>Clonar</button>
                                <button type="button" className="el__card-admin-btn el__card-admin-btn--delete" style={{ padding: '0px 4px', fontSize: '0.65rem' }} onClick={() => handleDeleteExerciseFromBlock(block.id, ex.id)}>✕</button>
                              </div>
                            </div>

                            {/* Variables Fuerza */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginTop: '8px' }}>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.6rem' }}>Series</label>
                                <input
                                  type="number"
                                  min="0"
                                  className="el__input"
                                  style={{ height: '28px', padding: '2px 6px', fontSize: '0.75rem' }}
                                  value={ex.plannedSets}
                                  onChange={e => handleUpdateExerciseField(block.id, ex.id, 'plannedSets', Number(e.target.value) || 0)}
                                />
                              </div>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.6rem' }}>Repeticiones</label>
                                <input
                                  type="text"
                                  className="el__input"
                                  style={{ height: '28px', padding: '2px 6px', fontSize: '0.75rem' }}
                                  value={ex.plannedReps}
                                  onChange={e => handleUpdateExerciseField(block.id, ex.id, 'plannedReps', e.target.value)}
                                />
                              </div>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.6rem' }}>Carga / Unidad</label>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  <input
                                    type="number"
                                    className="el__input"
                                    style={{ height: '28px', padding: '2px 4px', fontSize: '0.75rem', flex: 1 }}
                                    value={ex.loadValue || ''}
                                    placeholder="N/A"
                                    onChange={e => handleUpdateExerciseField(block.id, ex.id, 'loadValue', e.target.value ? Number(e.target.value) : null)}
                                  />
                                  <input
                                    type="text"
                                    className="el__input"
                                    style={{ height: '28px', padding: '2px 4px', fontSize: '0.75rem', width: '28px' }}
                                    value={ex.loadUnit}
                                    onChange={e => handleUpdateExerciseField(block.id, ex.id, 'loadUnit', e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.6rem' }}>RPE (1-10) / RIR</label>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    className="el__input"
                                    style={{ height: '28px', padding: '2px 4px', fontSize: '0.75rem', flex: 1 }}
                                    placeholder="RPE"
                                    value={ex.rpe || ''}
                                    onChange={e => handleUpdateExerciseField(block.id, ex.id, 'rpe', e.target.value ? Number(e.target.value) : null)}
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    className="el__input"
                                    style={{ height: '28px', padding: '2px 4px', fontSize: '0.75rem', flex: 1 }}
                                    placeholder="RIR"
                                    value={ex.rir || ''}
                                    onChange={e => handleUpdateExerciseField(block.id, ex.id, 'rir', e.target.value ? Number(e.target.value) : null)}
                                  />
                                </div>
                              </div>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.6rem' }}>Descanso (s)</label>
                                <input
                                  type="number"
                                  min="0"
                                  className="el__input"
                                  style={{ height: '28px', padding: '2px 6px', fontSize: '0.75rem' }}
                                  value={ex.restSeconds}
                                  onChange={e => handleUpdateExerciseField(block.id, ex.id, 'restSeconds', Number(e.target.value) || 0)}
                                />
                              </div>
                            </div>

                            {/* Fila extra: Tempo, Notas y Switch Cardio */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '6px', marginTop: '6px' }}>
                              <input
                                type="text"
                                className="el__input"
                                style={{ height: '28px', fontSize: '0.75rem' }}
                                placeholder="Tempo (ej. 3-0-1-0)..."
                                value={ex.tempo}
                                onChange={e => handleUpdateExerciseField(block.id, ex.id, 'tempo', e.target.value)}
                              />
                              <input
                                type="text"
                                className="el__input"
                                style={{ height: '28px', fontSize: '0.75rem' }}
                                placeholder="Notas específicas..."
                                value={ex.notes}
                                onChange={e => handleUpdateExerciseField(block.id, ex.id, 'notes', e.target.value)}
                              />
                              <button
                                type="button"
                                className={`el__btn ${ex.cardioParams ? 'el__btn--fav-active' : 'el__btn--ghost'}`}
                                style={{ height: '28px', padding: 0, fontSize: '0.7rem' }}
                                onClick={() => handleToggleCardioMode(block.id, ex.id, !ex.cardioParams)}
                              >
                                {ex.cardioParams ? '✔ Cardio Activo' : '+ Cardio'}
                              </button>
                            </div>

                            {/* Variables estructuradas de Cardio */}
                            {ex.cardioParams && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '6px', padding: '6px 8px', background: '#f1f5f9', borderRadius: 'var(--radius-sm)' }}>
                                <div className="el__field" style={{ margin: 0 }}>
                                  <label className="el__label" style={{ fontSize: '0.55rem' }}>Duración (s)</label>
                                  <input
                                    type="number"
                                    className="el__input"
                                    style={{ height: '24px', fontSize: '0.7rem' }}
                                    value={ex.cardioParams.durationSeconds || ''}
                                    onChange={e => handleUpdateCardioField(block.id, ex.id, 'durationSeconds', e.target.value ? Number(e.target.value) : null)}
                                  />
                                </div>
                                <div className="el__field" style={{ margin: 0 }}>
                                  <label className="el__label" style={{ fontSize: '0.55rem' }}>Distancia / Unidad</label>
                                  <div style={{ display: 'flex', gap: '2px' }}>
                                    <input
                                      type="number"
                                      className="el__input"
                                      style={{ height: '24px', fontSize: '0.7rem', flex: 1 }}
                                      value={ex.cardioParams.distanceValue || ''}
                                      onChange={e => handleUpdateCardioField(block.id, ex.id, 'distanceValue', e.target.value ? Number(e.target.value) : null)}
                                    />
                                    <select
                                      className="el__input el__input--select"
                                      style={{ height: '24px', fontSize: '0.7rem', padding: '0 2px', width: '38px' }}
                                      value={ex.cardioParams.distanceUnit || 'km'}
                                      onChange={e => handleUpdateCardioField(block.id, ex.id, 'distanceUnit', e.target.value)}
                                    >
                                      <option value="km">km</option>
                                      <option value="m">m</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="el__field" style={{ margin: 0 }}>
                                  <label className="el__label" style={{ fontSize: '0.55rem' }}>Ritmo</label>
                                  <input
                                    type="text"
                                    className="el__input"
                                    style={{ height: '24px', fontSize: '0.7rem' }}
                                    placeholder="ej. 4:30 min/km"
                                    value={ex.cardioParams.pace || ''}
                                    onChange={e => handleUpdateCardioField(block.id, ex.id, 'pace', e.target.value)}
                                  />
                                </div>
                                <div className="el__field" style={{ margin: 0 }}>
                                  <label className="el__label" style={{ fontSize: '0.55rem' }}>FC Rango (Min-Max)</label>
                                  <div style={{ display: 'flex', gap: '2px' }}>
                                    <input
                                      type="number"
                                      className="el__input"
                                      style={{ height: '24px', fontSize: '0.7rem', flex: 1 }}
                                      placeholder="Min"
                                      value={ex.cardioParams.targetHeartRateMin || ''}
                                      onChange={e => handleUpdateCardioField(block.id, ex.id, 'targetHeartRateMin', e.target.value ? Number(e.target.value) : null)}
                                    />
                                    <input
                                      type="number"
                                      className="el__input"
                                      style={{ height: '24px', fontSize: '0.7rem', flex: 1 }}
                                      placeholder="Max"
                                      value={ex.cardioParams.targetHeartRateMax || ''}
                                      onChange={e => handleUpdateCardioField(block.id, ex.id, 'targetHeartRateMax', e.target.value ? Number(e.target.value) : null)}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </form>
        </div>

        {/* ══ COLUMNA DERECHA: BIBLIOTECA DE EJERCICIOS ═════════ */}
        <div className="wb__col wb__col--right">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 className="wb__section-title" style={{ margin: 0 }}>Biblioteca de Ejercicios</h2>
            
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="el__btn el__btn--ghost" style={{ padding: '6px 8px', fontSize: '0.75rem' }} onClick={() => setShowCatalogModal(true)}>
                Catálogos
              </button>
              <button className="el__btn el__btn--primary" style={{ padding: '6px 8px', fontSize: '0.75rem' }} onClick={handleOpenCreate}>
                + Crear Ejercicio
              </button>
            </div>
          </div>

          {/* Filtros rápidos de biblioteca */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              className="el__search-input"
              style={{ height: '36px' }}
              placeholder="Buscar ejercicio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select className="el__select" style={{ height: '32px', fontSize: '0.75rem' }} value={selectedCatFilter} onChange={e => setSelectedCatFilter(e.target.value)}>
                <option value="Todas">Categoría: Todas</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select className="el__select" style={{ height: '32px', fontSize: '0.75rem' }} value={selectedSubcatFilter} onChange={e => setSelectedSubcatFilter(e.target.value)}>
                <option value="Todas">Subcategoría: Todas</option>
                {subcategories
                  .filter(s => selectedCatFilter === 'Todas' || String(s.categoryId) === String(selectedCatFilter))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
            </div>
          </div>

          {/* Listado de tarjetas de ejercicios en catálogo lateral */}
          <div className="wb__library-list">
            {filteredLibrary.map(ex => (
              <div key={ex.id} className="wb__library-item">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: '700' }}>{ex.name}</span>
                    {ex.favorite && <span style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>★</span>}
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>
                    {categories.find(c => c.id === ex.categoryId)?.name || 'Sin categoría'}
                  </span>
                </div>

                <div className="wb__library-item-actions">
                  <button type="button" className="el__cat-action-btn el__cat-action-btn--cancel" style={{ width: '24px', height: '24px', borderWidth: '1px' }} onClick={() => setPreviewEx(ex)} title="Ver detalles y protocolo">i</button>
                  <button type="button" className="el__card-admin-btn" style={{ padding: '2px 4px', fontSize: '0.65rem' }} onClick={(e) => handleOpenEdit(e, ex)} title="Editar ejercicio">✎</button>
                  <button type="button" className="el__btn el__btn--primary" style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 'bold' }} onClick={() => handleAddExerciseToBlock(ex)} title="Añadir a bloque en curso">+</button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ══ MODAL DE FICHA PREVIEW EJERCICIO ══════════════════ */}
      {previewEx && (
        <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={() => setPreviewEx(null)}>
          <div className="el__modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="el__modal-header">
              <h2 className="el__modal-title">{previewEx.name}</h2>
              <button className="el__modal-close" onClick={() => setPreviewEx(null)}>✕</button>
            </div>
            <div style={{ padding: '0 24px 24px', fontSize: '0.8125rem', color: 'var(--gray-600)', lineHeight: '1.5' }}>
              <p><strong>Descripción:</strong> {previewEx.description || 'Sin descripción.'}</p>
              {previewEx.technicalInstructions && <p style={{ marginTop: '8px' }}><strong>Instrucciones Técnicas:</strong> {previewEx.technicalInstructions}</p>}
              {previewEx.musculos?.length > 0 && <p style={{ marginTop: '8px' }}><strong>Músculos Implicados:</strong> {previewEx.musculos.join(', ')}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE FORMULARIO DE EJERCICIO ══════════════════ */}
      {showFormModal && (
        <ExerciseFormModal
          editingEx={editingEx}
          onClose={() => {
            setShowFormModal(false);
            setEditingEx(null);
          }}
          onSave={loadLibraryData}
        />
      )}

      {/* ══ MODAL DE CATÁLOGOS CONTEXTUAL ═════════════════════ */}
      {showCatalogModal && (
        <GlobalCatalogModal
          mode="contextual"
          contextKeys={[KEYS.EX_CATEGORIES, KEYS.EX_SUBCATEGORIES, KEYS.EX_TYPES]}
          initialActiveKey={KEYS.EX_CATEGORIES}
          onClose={() => setShowCatalogModal(false)}
          onRefresh={loadLibraryData}
        />
      )}

    </div>
  );
}
