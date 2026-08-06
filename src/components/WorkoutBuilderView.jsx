import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS, generateUUID } from '../services/storage';
import ExerciseFormModal from './ExerciseFormModal';
import GlobalCatalogModal from './GlobalCatalogModal';

function stripAccents(str) {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Las rutinas antiguas guardaban por separado el tempo y las notas del
// entrenador. Ahora hay un único texto de instrucciones, que es lo que lee el
// cliente, así que al abrirlas se juntan en vez de perderse.
function migrarInstrucciones(ex) {
  if (ex.instructions !== undefined && ex.instructions !== null) return ex.instructions;
  return [ex.tempo ? `Tempo ${ex.tempo}` : '', ex.notes || '']
    .filter(Boolean)
    .join('. ');
}

function normalizarBloque(b) {
  return {
    id: b.id || generateUUID(),
    name: b.name || 'Bloque',
    order: b.order || 1,
    rounds: Number(b.rounds) || 1,
    exercises: (b.exercises || []).map((e, i) => ({
      id: e.id || generateUUID(),
      exerciseId: e.exerciseId,
      order: e.order || i + 1,
      plannedReps: e.plannedReps ?? '10',
      loadValue: e.loadValue ?? null,
      loadUnit: e.loadUnit || 'kg',
      rpe: e.rpe ?? null,
      rir: e.rir ?? null,
      restSeconds: e.restSeconds ?? 90,
      instructions: migrarInstrucciones(e)
    }))
  };
}

function bloqueVacio(orden) {
  return {
    id: generateUUID(),
    name: orden === 1 ? 'Calentamiento' : `Bloque ${orden}`,
    order: orden,
    rounds: 1,
    exercises: []
  };
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
  const [previewEx, setPreviewEx] = useState(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Ficha activa del constructor (Columna izquierda)
  const [workoutForm, setWorkoutForm] = useState({
    name: '',
    description: '',
    estimatedDurationMinutes: 45,
    blocks: []
  });

  const [activeBlockId, setActiveBlockId] = useState(''); // Bloque destino al pulsar "+"
  const [dropBlockId, setDropBlockId] = useState('');     // Bloque resaltado al arrastrar
  const [dropExId, setDropExId] = useState('');           // Ejercicio resaltado al arrastrar
  const [arrastre, setArrastre] = useState(null);         // Qué se está arrastrando
  const [formError, setFormError] = useState('');

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
      const blocks = Array.isArray(editingWorkout.blocks)
        ? editingWorkout.blocks.map(normalizarBloque)
        : [];
      setWorkoutForm({
        name: editingWorkout.name || '',
        description: editingWorkout.description || '',
        estimatedDurationMinutes: editingWorkout.estimatedDurationMinutes || 45,
        blocks
      });
      if (blocks.length > 0) setActiveBlockId(blocks[0].id);
    } else {
      const primero = bloqueVacio(1);
      setWorkoutForm({
        name: '',
        description: '',
        estimatedDurationMinutes: 45,
        blocks: [primero]
      });
      setActiveBlockId(primero.id);
    }
  }, [editingWorkout]);

  // --- CRUD Bloques ---
  const handleAddBlock = () => {
    const nuevo = bloqueVacio(workoutForm.blocks.length + 1);
    setWorkoutForm(prev => ({ ...prev, blocks: [...prev.blocks, nuevo] }));
    setActiveBlockId(nuevo.id);
  };

  const handleUpdateBlockField = (blockId, field, value) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === blockId ? { ...b, [field]: value } : b)
    }));
  };

  const handleDeleteBlock = (blockId) => {
    setWorkoutForm(prev => {
      const reordered = prev.blocks
        .filter(b => b.id !== blockId)
        .map((b, idx) => ({ ...b, order: idx + 1 }));
      return { ...prev, blocks: reordered };
    });
    if (activeBlockId === blockId) {
      setActiveBlockId(workoutForm.blocks.find(b => b.id !== blockId)?.id || '');
    }
  };

  const handleDuplicateBlock = (block) => {
    const copia = {
      ...JSON.parse(JSON.stringify(block)),
      id: generateUUID(),
      name: `${block.name} (copia)`,
      order: workoutForm.blocks.length + 1,
      exercises: block.exercises.map((ex, idx) => ({ ...ex, id: generateUUID(), order: idx + 1 }))
    };
    setWorkoutForm(prev => ({ ...prev, blocks: [...prev.blocks, copia] }));
  };

  const handleMoveBlock = (index, direction) => {
    const newBlocks = [...workoutForm.blocks];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;

    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    setWorkoutForm(prev => ({
      ...prev,
      blocks: newBlocks.map((b, idx) => ({ ...b, order: idx + 1 }))
    }));
  };

  // --- CRUD Ejercicios del bloque ---
  const anadirEjercicio = (exercise, blockId) => {
    const destino = blockId || activeBlockId;
    if (!destino) {
      setFormError('Añade un bloque antes de meter ejercicios.');
      return;
    }

    const block = workoutForm.blocks.find(b => b.id === destino);
    if (!block) return;

    const nuevo = {
      id: generateUUID(),
      exerciseId: exercise.id,
      order: block.exercises.length + 1,
      plannedReps: '10',
      loadValue: null,
      loadUnit: 'kg',
      rpe: null,
      rir: null,
      restSeconds: 90,
      instructions: ''
    };

    setFormError('');
    setActiveBlockId(destino);
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => (
        b.id === destino ? { ...b, exercises: [...b.exercises, nuevo] } : b
      ))
    }));
  };

  // --- Arrastrar y soltar ---
  // Tres gestos distintos comparten el mismo mecanismo, distinguidos por el
  // tipo de arrastre guardado en `arrastre`: traer un ejercicio de la
  // biblioteca, reordenar bloques y reordenar ejercicios dentro de un bloque.
  const handleDragStartLibrary = (e, exercise) => {
    setArrastre({ tipo: 'biblioteca', exerciseId: String(exercise.id) });
    e.dataTransfer.setData('text/plain', String(exercise.id));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragStartBlock = (e, blockId) => {
    setArrastre({ tipo: 'bloque', blockId });
    e.dataTransfer.setData('text/plain', blockId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragStartExercise = (e, blockId, exId) => {
    e.stopPropagation();
    setArrastre({ tipo: 'ejercicio', blockId, exId });
    e.dataTransfer.setData('text/plain', exId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setArrastre(null);
    setDropBlockId('');
    setDropExId('');
  };

  const handleDragOverBlock = (e, blockId) => {
    if (!arrastre) return;
    e.preventDefault();

    if (arrastre.tipo === 'bloque') {
      e.dataTransfer.dropEffect = 'move';
      if (arrastre.blockId !== blockId) reordenarBloques(arrastre.blockId, blockId);
      return;
    }
    // Un ejercicio solo se puede soltar en un bloque; la biblioteca, también.
    e.dataTransfer.dropEffect = arrastre.tipo === 'biblioteca' ? 'copy' : 'move';
    if (dropBlockId !== blockId) setDropBlockId(blockId);
  };

  const handleDropOnBlock = (e, blockId) => {
    e.preventDefault();
    e.stopPropagation();

    if (arrastre?.tipo === 'biblioteca') {
      const exercise = exercises.find(x => String(x.id) === String(arrastre.exerciseId));
      if (exercise) anadirEjercicio(exercise, blockId);
    } else if (arrastre?.tipo === 'ejercicio' && arrastre.blockId !== blockId) {
      // Soltar sobre otro bloque mueve el ejercicio al final de ese bloque.
      moverEjercicioAOtroBloque(arrastre.blockId, arrastre.exId, blockId);
    }
    handleDragEnd();
  };

  // Reordena en vivo mientras se arrastra, para ver dónde va a caer.
  const reordenarBloques = (origenId, destinoId) => {
    setWorkoutForm(prev => {
      const desde = prev.blocks.findIndex(b => b.id === origenId);
      const hasta = prev.blocks.findIndex(b => b.id === destinoId);
      if (desde < 0 || hasta < 0 || desde === hasta) return prev;

      const blocks = [...prev.blocks];
      const [movido] = blocks.splice(desde, 1);
      blocks.splice(hasta, 0, movido);
      return { ...prev, blocks: blocks.map((b, i) => ({ ...b, order: i + 1 })) };
    });
  };

  const reordenarEjercicios = (blockId, origenExId, destinoExId) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id !== blockId) return b;
        const desde = b.exercises.findIndex(e => e.id === origenExId);
        const hasta = b.exercises.findIndex(e => e.id === destinoExId);
        if (desde < 0 || hasta < 0 || desde === hasta) return b;

        const exercises = [...b.exercises];
        const [movido] = exercises.splice(desde, 1);
        exercises.splice(hasta, 0, movido);
        return { ...b, exercises: exercises.map((e, i) => ({ ...e, order: i + 1 })) };
      })
    }));
  };

  const moverEjercicioAOtroBloque = (origenBlockId, exId, destinoBlockId) => {
    setWorkoutForm(prev => {
      const origen = prev.blocks.find(b => b.id === origenBlockId);
      const movido = origen?.exercises.find(e => e.id === exId);
      if (!movido) return prev;

      return {
        ...prev,
        blocks: prev.blocks.map(b => {
          if (b.id === origenBlockId) {
            return { ...b, exercises: b.exercises.filter(e => e.id !== exId).map((e, i) => ({ ...e, order: i + 1 })) };
          }
          if (b.id === destinoBlockId) {
            return { ...b, exercises: [...b.exercises, { ...movido, order: b.exercises.length + 1 }] };
          }
          return b;
        })
      };
    });
  };

  const handleDragOverExercise = (e, blockId, exId) => {
    if (arrastre?.tipo !== 'ejercicio') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    if (arrastre.blockId === blockId && arrastre.exId !== exId) {
      reordenarEjercicios(blockId, arrastre.exId, exId);
    } else if (arrastre.blockId !== blockId && dropExId !== exId) {
      setDropExId(exId);
    }
  };

  const handleUpdateExerciseField = (blockId, exId, field, value) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => (
        b.id === blockId
          ? { ...b, exercises: b.exercises.map(e => e.id === exId ? { ...e, [field]: value } : e) }
          : b
      ))
    }));
  };

  const handleDeleteExerciseFromBlock = (blockId, exId) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id !== blockId) return b;
        const reordered = b.exercises
          .filter(e => e.id !== exId)
          .map((e, idx) => ({ ...e, order: idx + 1 }));
        return { ...b, exercises: reordered };
      })
    }));
  };

  const handleDuplicateExercise = (blockId, ex) => {
    const block = workoutForm.blocks.find(b => b.id === blockId);
    if (!block) return;

    const copia = { ...JSON.parse(JSON.stringify(ex)), id: generateUUID(), order: block.exercises.length + 1 };
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === blockId ? { ...b, exercises: [...b.exercises, copia] } : b)
    }));
  };

  const handleMoveExercise = (blockId, index, direction) => {
    setWorkoutForm(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id !== blockId) return b;
        const newExs = [...b.exercises];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newExs.length) return b;

        [newExs[index], newExs[targetIndex]] = [newExs[targetIndex], newExs[index]];
        return { ...b, exercises: newExs.map((e, idx) => ({ ...e, order: idx + 1 })) };
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

    for (const b of workoutForm.blocks) {
      if (b.exercises.length === 0) {
        setFormError(`El bloque "${b.name}" debe contener al menos un ejercicio.`);
        return;
      }
      if (Number(b.rounds) < 1) {
        setFormError(`El bloque "${b.name}" debe tener al menos una serie.`);
        return;
      }
      for (const ex of b.exercises) {
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
      setFormError(err.message || 'No se pudo guardar la rutina.');
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
      result = result.filter(ex => stripAccents(ex.name).includes(query));
    }

    return result;
  }, [exercises, selectedCatFilter, selectedSubcatFilter, search]);

  const totalEjercicios = workoutForm.blocks.reduce((n, b) => n + b.exercises.length, 0);

  return (
    <div className="wb__container">
      {/* Barra superior de acciones */}
      <div className="wb__top-bar">
        <button className="el__btn el__btn--ghost" onClick={onClose}>
          ✕ Salir del constructor
        </button>
        <span className="wb__top-summary">
          {workoutForm.blocks.length} bloque{workoutForm.blocks.length === 1 ? '' : 's'} · {totalEjercicios} ejercicio{totalEjercicios === 1 ? '' : 's'}
        </span>
        <button className="el__btn el__btn--primary" onClick={handleSaveWorkout}>
          Guardar Rutina
        </button>
      </div>

      <div className="wb__grid">

        {/* ══ COLUMNA IZQUIERDA: CABECERA Y BLOQUES ════════════ */}
        <div className="wb__col wb__col--left">

          {/* Cabecera compacta: lo importante son los bloques, no este formulario */}
          <div className="wb__meta">
            <div className="wb__meta-field wb__meta-field--name">
              <label className="wb__meta-label" htmlFor="wb-name">Nombre *</label>
              <input
                id="wb-name"
                type="text"
                className="wb__meta-input"
                placeholder="ej. Fuerza - Tren inferior"
                value={workoutForm.name}
                onChange={e => { setWorkoutForm(w => ({ ...w, name: e.target.value })); setFormError(''); }}
                required
              />
            </div>

            <div className="wb__meta-field wb__meta-field--duration">
              <label className="wb__meta-label" htmlFor="wb-duration">Min.</label>
              <input
                id="wb-duration"
                type="number"
                min="5"
                className="wb__meta-input"
                value={workoutForm.estimatedDurationMinutes}
                onChange={e => setWorkoutForm(w => ({ ...w, estimatedDurationMinutes: e.target.value }))}
              />
            </div>

            <div className="wb__meta-field wb__meta-field--goal">
              <label className="wb__meta-label" htmlFor="wb-goal">Objetivo</label>
              <input
                id="wb-goal"
                type="text"
                className="wb__meta-input"
                placeholder="Enfoque o indicaciones generales..."
                value={workoutForm.description}
                onChange={e => setWorkoutForm(w => ({ ...w, description: e.target.value }))}
              />
            </div>
          </div>

          {formError && <p className="wb__error">{formError}</p>}

          {/* ══ BLOQUES ══ */}
          <div className="wb__blocks-head">
            <h3 className="wb__section-title">Bloques</h3>
            <button type="button" className="el__btn el__btn--ghost wb__add-block-btn" onClick={handleAddBlock}>
              + Añadir bloque
            </button>
          </div>

          <div className="wb__blocks-container">
            {workoutForm.blocks.map((block, bIdx) => (
              <div
                key={block.id}
                className={
                  'wb__block-card' +
                  (activeBlockId === block.id ? ' wb__block-card--active' : '') +
                  (dropBlockId === block.id ? ' wb__block-card--drop' : '') +
                  (arrastre?.tipo === 'bloque' && arrastre.blockId === block.id ? ' wb__block-card--dragging' : '')
                }
                onClick={() => setActiveBlockId(block.id)}
                onDragOver={e => handleDragOverBlock(e, block.id)}
                onDragLeave={() => setDropBlockId('')}
                onDrop={e => handleDropOnBlock(e, block.id)}
              >
                {/* Cabecera del bloque: nombre y series */}
                <div className="wb__block-header">
                  {/* El asa es lo único arrastrable: así los campos de dentro
                      se siguen pudiendo seleccionar con el ratón. */}
                  <span
                    className="wb__drag-handle"
                    draggable
                    onDragStart={e => handleDragStartBlock(e, block.id)}
                    onDragEnd={handleDragEnd}
                    title="Arrastra para reordenar el bloque"
                    aria-label="Reordenar bloque"
                  >
                    ⠿
                  </span>
                  <span className="wb__block-order">#{block.order}</span>
                  <input
                    type="text"
                    className="wb__block-title-input"
                    value={block.name}
                    onChange={e => handleUpdateBlockField(block.id, 'name', e.target.value)}
                    placeholder="Nombre del bloque..."
                  />

                  <label className="wb__block-rounds">
                    <span>Series</span>
                    <input
                      type="number"
                      min="1"
                      value={block.rounds}
                      onChange={e => handleUpdateBlockField(block.id, 'rounds', Number(e.target.value) || 1)}
                    />
                  </label>

                  <div className="wb__block-header-actions">
                    <button type="button" className="wb__icon-btn" onClick={() => handleMoveBlock(bIdx, -1)} disabled={bIdx === 0} title="Subir bloque">▲</button>
                    <button type="button" className="wb__icon-btn" onClick={() => handleMoveBlock(bIdx, 1)} disabled={bIdx === workoutForm.blocks.length - 1} title="Bajar bloque">▼</button>
                    <button type="button" className="wb__icon-btn" onClick={() => handleDuplicateBlock(block)} title="Duplicar bloque">⧉</button>
                    <button type="button" className="wb__icon-btn wb__icon-btn--danger" onClick={() => handleDeleteBlock(block.id)} title="Eliminar bloque">✕</button>
                  </div>
                </div>

                {/* Ejercicios dentro del bloque */}
                <div className="wb__block-exercises-list">
                  {block.exercises.length === 0 ? (
                    <p className="wb__empty-hint">
                      Arrastra un ejercicio aquí, o pulsa el <strong>+</strong> de la biblioteca.
                    </p>
                  ) : (
                    block.exercises.map((ex, exIdx) => {
                      const original = exercises.find(e => e.id === ex.exerciseId);
                      if (!original) return null;

                      return (
                        <div
                          key={ex.id}
                          className={
                            'wb__exercise-row' +
                            (arrastre?.tipo === 'ejercicio' && arrastre.exId === ex.id ? ' wb__exercise-row--dragging' : '') +
                            (dropExId === ex.id ? ' wb__exercise-row--drop' : '')
                          }
                          onClick={e => e.stopPropagation()}
                          onDragOver={e => handleDragOverExercise(e, block.id, ex.id)}
                        >
                          <div className="wb__exercise-row-header">
                            <span
                              className="wb__drag-handle"
                              draggable
                              onDragStart={e => handleDragStartExercise(e, block.id, ex.id)}
                              onDragEnd={handleDragEnd}
                              title="Arrastra para reordenar el ejercicio"
                              aria-label="Reordenar ejercicio"
                            >
                              ⠿
                            </span>
                            <span className="wb__exercise-order">{ex.order}</span>
                            <strong className="wb__exercise-name">{original.name}</strong>

                            <div className="wb__block-header-actions">
                              <button type="button" className="wb__icon-btn" onClick={() => handleMoveExercise(block.id, exIdx, -1)} disabled={exIdx === 0} title="Subir">▲</button>
                              <button type="button" className="wb__icon-btn" onClick={() => handleMoveExercise(block.id, exIdx, 1)} disabled={exIdx === block.exercises.length - 1} title="Bajar">▼</button>
                              <button type="button" className="wb__icon-btn" onClick={() => handleDuplicateExercise(block.id, ex)} title="Duplicar">⧉</button>
                              <button type="button" className="wb__icon-btn wb__icon-btn--danger" onClick={() => handleDeleteExerciseFromBlock(block.id, ex.id)} title="Quitar">✕</button>
                            </div>
                          </div>

                          <div className="wb__exercise-fields">
                            <div className="wb__field">
                              <label className="wb__field-label">Repeticiones</label>
                              <input
                                type="text"
                                className="wb__field-input"
                                value={ex.plannedReps}
                                onChange={e => handleUpdateExerciseField(block.id, ex.id, 'plannedReps', e.target.value)}
                              />
                            </div>

                            <div className="wb__field">
                              <label className="wb__field-label">Carga</label>
                              <div className="wb__field-pair">
                                <input
                                  type="number"
                                  className="wb__field-input"
                                  placeholder="—"
                                  value={ex.loadValue ?? ''}
                                  onChange={e => handleUpdateExerciseField(block.id, ex.id, 'loadValue', e.target.value ? Number(e.target.value) : null)}
                                />
                                <input
                                  type="text"
                                  className="wb__field-input wb__field-input--unit"
                                  value={ex.loadUnit}
                                  onChange={e => handleUpdateExerciseField(block.id, ex.id, 'loadUnit', e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="wb__field">
                              <label className="wb__field-label">RPE / RIR</label>
                              <div className="wb__field-pair">
                                <input
                                  type="number"
                                  min="1"
                                  max="10"
                                  className="wb__field-input"
                                  placeholder="RPE"
                                  value={ex.rpe ?? ''}
                                  onChange={e => handleUpdateExerciseField(block.id, ex.id, 'rpe', e.target.value ? Number(e.target.value) : null)}
                                />
                                <input
                                  type="number"
                                  min="0"
                                  className="wb__field-input"
                                  placeholder="RIR"
                                  value={ex.rir ?? ''}
                                  onChange={e => handleUpdateExerciseField(block.id, ex.id, 'rir', e.target.value ? Number(e.target.value) : null)}
                                />
                              </div>
                            </div>

                            <div className="wb__field">
                              <label className="wb__field-label">Descanso (s)</label>
                              <input
                                type="number"
                                min="0"
                                className="wb__field-input"
                                value={ex.restSeconds}
                                onChange={e => handleUpdateExerciseField(block.id, ex.id, 'restSeconds', Number(e.target.value) || 0)}
                              />
                            </div>
                          </div>

                          {/* Lo que leerá el cliente al abrir el entrenamiento */}
                          <div className="wb__field wb__instructions">
                            <label className="wb__field-label">Instrucciones</label>
                            <textarea
                              className="wb__field-input wb__field-input--area"
                              rows="2"
                              placeholder="Lo que verá el cliente: técnica, tempo, sensaciones, avisos..."
                              value={ex.instructions}
                              onChange={e => handleUpdateExerciseField(block.id, ex.id, 'instructions', e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ COLUMNA DERECHA: BIBLIOTECA DE EJERCICIOS ═════════ */}
        <div className="wb__col wb__col--right">
          <div className="wb__library-head">
            <h2 className="wb__section-title">Biblioteca</h2>
            <div className="wb__library-head-actions">
              <button className="el__btn el__btn--ghost wb__small-btn" onClick={() => setShowCatalogModal(true)}>
                Catálogos
              </button>
              <button className="el__btn el__btn--primary wb__small-btn" onClick={() => setShowFormModal(true)}>
                + Crear
              </button>
            </div>
          </div>

          <div className="wb__library-filters">
            <input
              type="text"
              className="wb__field-input"
              placeholder="Buscar ejercicio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <div className="wb__field-pair">
              <select className="wb__field-input" value={selectedCatFilter} onChange={e => setSelectedCatFilter(e.target.value)}>
                <option value="Todas">Categoría: todas</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select className="wb__field-input" value={selectedSubcatFilter} onChange={e => setSelectedSubcatFilter(e.target.value)}>
                <option value="Todas">Subcat.: todas</option>
                {subcategories
                  .filter(s => selectedCatFilter === 'Todas' || String(s.categoryId) === String(selectedCatFilter))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
            </div>
          </div>

          <div className="wb__library-list">
            {filteredLibrary.length === 0 && (
              <p className="wb__empty-hint">No hay ejercicios que encajen con el filtro.</p>
            )}

            {filteredLibrary.map(ex => (
              <div
                key={ex.id}
                className="wb__library-item"
                draggable
                onDragStart={e => handleDragStartLibrary(e, ex)}
                onDragEnd={handleDragEnd}
                title="Arrástralo a un bloque o pulsa +"
              >
                <div className="wb__library-item-info">
                  <span className="wb__library-item-name">
                    {ex.name}
                    {ex.favorite && <span className="wb__library-item-fav">★</span>}
                  </span>
                  <span className="wb__library-item-cat">
                    {categories.find(c => c.id === ex.categoryId)?.name || 'Sin categoría'}
                  </span>
                </div>

                <div className="wb__library-item-actions">
                  <button type="button" className="wb__icon-btn" onClick={() => setPreviewEx(ex)} title="Ver ficha del ejercicio">i</button>
                  <button type="button" className="wb__add-btn" onClick={() => anadirEjercicio(ex)} title="Añadir al bloque activo">+</button>
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
            <div className="el__modal-body" style={{ padding: '0 24px 24px', fontSize: '0.8125rem', color: 'var(--gray-600)', lineHeight: '1.5' }}>
              {previewEx.image && (
                <img src={previewEx.image} alt={previewEx.name} className="wb__preview-img" />
              )}
              <p><strong>Descripción:</strong> {previewEx.description || 'Sin descripción.'}</p>
              {previewEx.technicalInstructions && <p style={{ marginTop: '8px' }}><strong>Instrucciones Técnicas:</strong> {previewEx.technicalInstructions}</p>}
              {previewEx.videoUrl && (
                <p style={{ marginTop: '8px' }}>
                  <a href={previewEx.videoUrl} target="_blank" rel="noopener noreferrer">Ver vídeo</a>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE FORMULARIO DE EJERCICIO ══════════════════ */}
      {showFormModal && (
        <ExerciseFormModal
          editingEx={null}
          onClose={() => setShowFormModal(false)}
          onSave={loadLibraryData}
        />
      )}

      {/* ══ MODAL DE CATÁLOGOS CONTEXTUAL ═════════════════════ */}
      {showCatalogModal && (
        <GlobalCatalogModal
          mode="contextual"
          contextKeys={[KEYS.EX_CATEGORIES, KEYS.EX_SUBCATEGORIES]}
          initialActiveKey={KEYS.EX_CATEGORIES}
          onClose={() => setShowCatalogModal(false)}
          onRefresh={loadLibraryData}
        />
      )}

    </div>
  );
}
