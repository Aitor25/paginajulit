import { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import './WorkoutPreviewModal.css';

// Objetivo de la serie con el mismo criterio que el PDF: si son reps
// numéricas se añade "reps", si el coach escribió otra cosa (rango, "AMRAP",
// segundos...) se muestra tal cual.
function formatObjetivo(ex) {
  const reps = (ex.plannedReps ?? '').toString().trim();
  const repsPart = /^\d+$/.test(reps) ? `${reps} reps` : (reps || '—');
  const hasLoad = ex.loadValue !== null && ex.loadValue !== undefined && ex.loadValue !== '';
  return hasLoad ? `${repsPart} @ ${ex.loadValue} ${ex.loadUnit || ''}`.trim() : repsPart;
}

function formatDescanso(ex) {
  return ex.restSeconds ? `${ex.restSeconds} s` : '—';
}

/* Fila de ejercicio numerada y desplegable: cerrada solo enseña el nombre
   (como la lista de referencia), y al pulsar la flecha despliega objetivo,
   descanso y las notas del entrenador — así la vista previa cabe en pantalla
   sin desplazarse aunque el entrenamiento tenga muchos ejercicios. */
function PreviewExerciseRow({ ex, n, name, expanded, onToggle }) {
  const hasNotes = !!(ex.instructions && ex.instructions.trim());

  return (
    <div className="wpv__exercise">
      <button type="button" className="wpv__exercise-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="wpv__exercise-num">{n}</span>
        <span className="wpv__exercise-name">{name}</span>
        <span className={`wpv__chevron ${expanded ? 'wpv__chevron--open' : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className="wpv__exercise-body">
          <div className="wpv__exercise-stats">
            <div>
              <span className="wpv__stat-label">Objetivo</span>
              <span className="wpv__stat-value">{formatObjetivo(ex)}</span>
            </div>
            <div>
              <span className="wpv__stat-label">Descanso</span>
              <span className="wpv__stat-value">{formatDescanso(ex)}</span>
            </div>
          </div>
          {hasNotes ? (
            <p className="wpv__exercise-notes">{ex.instructions.trim()}</p>
          ) : (
            <p className="wpv__exercise-notes wpv__exercise-notes--empty">Sin notas del entrenador.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkoutPreviewModal({ workout, onClose, onEdit, onDuplicate, onAssign }) {
  const [exercisesById, setExercisesById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function loadNames() {
      try {
        const exs = await storage.getExercises();
        if (cancelled) return;
        setExercisesById(new Map(exs.map(e => [String(e.id), e.name])));
      } catch (err) {
        console.error('No se pudieron cargar los nombres de ejercicios para la vista previa:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadNames();
    return () => { cancelled = true; };
  }, []);

  const toggleExercise = (exId) => {
    setExpanded(prev => ({ ...prev, [exId]: !prev[exId] }));
  };

  const blocks = workout.blocks || [];
  const totalExercises = blocks.reduce((n, b) => n + (b.exercises?.length || 0), 0);

  return (
    <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="el__modal wpv__modal" onClick={e => e.stopPropagation()}>
        <div className="el__modal-header">
          <h2 className="el__modal-title">{workout.name}</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar vista previa">✕</button>
        </div>

        <div className="el__modal-body wpv__body">
          {workout.description && (
            <p className="wpv__description">{workout.description}</p>
          )}

          <div className="wpv__meta-row">
            <span className="wpv__meta-pill">⏱ {workout.estimatedDurationMinutes || 60} minutos</span>
            <span className="wpv__meta-pill">{blocks.length} bloque{blocks.length === 1 ? '' : 's'} · {totalExercises} ejercicio{totalExercises === 1 ? '' : 's'}</span>
          </div>

          {loading ? (
            <p className="wpv__loading">Cargando ejercicios…</p>
          ) : blocks.length === 0 ? (
            <p className="wpv__loading">Este entrenamiento todavía no tiene bloques.</p>
          ) : (
            blocks.map((block, bi) => {
              const rounds = Number(block.rounds) || 1;
              return (
                <div key={block.id || bi} className="wpv__block">
                  <div className="wpv__block-head">
                    <span>{block.name || 'Ejercicios'}</span>
                    <span className="wpv__block-rounds">{rounds} serie{rounds === 1 ? '' : 's'}</span>
                  </div>
                  {(block.exercises || []).map((ex, ei) => {
                    const exUid = ex.id || `${block.id}-${ei}`;
                    const name = exercisesById.get(String(ex.exerciseId)) || 'Ejercicio';
                    return (
                      <PreviewExerciseRow
                        key={exUid}
                        ex={ex}
                        n={ei + 1}
                        name={name}
                        expanded={!!expanded[exUid]}
                        onToggle={() => toggleExercise(exUid)}
                      />
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="el__modal-actions">
          <button type="button" className="el__btn el__btn--ghost" onClick={onDuplicate}>
            📋 Duplicar
          </button>
          <button type="button" className="el__btn el__btn--ghost" onClick={onEdit}>
            ✎ Editar
          </button>
          {onAssign && (
            <button type="button" className="el__btn el__btn--primary" onClick={onAssign}>
              Asignar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
