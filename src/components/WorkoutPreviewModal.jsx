import { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { getYouTubeThumbnail } from '../utils/youtubeHelpers';
import './WorkoutPreviewModal.css';
import { overlayCloseProps } from '../utils/overlayClose';

// Objetivo de la serie con el mismo criterio que el PDF: si son reps
// numéricas se añade "reps", si el coach escribió otra cosa (rango, "AMRAP",
// segundos...) se muestra tal cual.
function formatObjetivo(ex) {
  const reps = (ex.plannedReps ?? '').toString().trim();
  const repsPart = /^\d+$/.test(reps) ? `${reps} reps` : (reps || '—');
  const hasLoad = ex.loadValue !== null && ex.loadValue !== undefined && ex.loadValue !== '';
  return hasLoad ? `${repsPart} @ ${ex.loadValue} kg` : repsPart;
}

function formatDescanso(ex) {
  return ex.restSeconds ? `${ex.restSeconds} s` : '—';
}

// Miniatura del ejercicio: su imagen, o la del vídeo de YouTube si no tiene.
function PreviewThumb({ exercise }) {
  const [imgError, setImgError] = useState(false);
  const src = imgError ? null : (exercise?.image || getYouTubeThumbnail(exercise?.videoUrl));

  if (!src) {
    return <span className="wpv__thumb wpv__thumb--empty" aria-hidden="true">🏋</span>;
  }
  return (
    <img
      src={src}
      alt=""
      className="wpv__thumb"
      loading="lazy"
      onError={() => setImgError(true)}
    />
  );
}

/* Fila de ejercicio compacta: de un vistazo se ven número, imagen, nombre,
   objetivo y descanso, para saber qué hay dentro del entrenamiento sin
   abrirlo. Solo las notas del entrenador quedan plegadas tras la flecha. */
function PreviewExerciseRow({ ex, n, exercise, expanded, onToggle }) {
  const hasNotes = !!(ex.instructions && ex.instructions.trim());

  return (
    <div className="wpv__exercise">
      <button
        type="button"
        className="wpv__exercise-head"
        onClick={onToggle}
        aria-expanded={expanded}
        disabled={!hasNotes}
      >
        <span className="wpv__exercise-num">{n}.</span>
        <PreviewThumb exercise={exercise} />
        <span className="wpv__exercise-name">{exercise?.name || 'Ejercicio'}</span>
        <span className="wpv__exercise-stat wpv__exercise-stat--goal">{formatObjetivo(ex)}</span>
        <span className="wpv__exercise-stat wpv__exercise-stat--rest">⏱ {formatDescanso(ex)}</span>
        <span className={`wpv__chevron ${hasNotes ? '' : 'wpv__chevron--hidden'} ${expanded ? 'wpv__chevron--open' : ''}`} title={hasNotes ? 'Ver notas del entrenador' : undefined}>▾</span>
      </button>

      {expanded && hasNotes && (
        <p className="wpv__exercise-notes">{ex.instructions.trim()}</p>
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
    async function loadExercises() {
      try {
        const exs = await storage.getExercises();
        if (cancelled) return;
        setExercisesById(new Map(exs.map(e => [String(e.id), e])));
      } catch (err) {
        console.error('No se pudieron cargar los ejercicios para la vista previa:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadExercises();
    return () => { cancelled = true; };
  }, []);

  const toggleExercise = (exId) => {
    setExpanded(prev => ({ ...prev, [exId]: !prev[exId] }));
  };

  const blocks = workout.blocks || [];
  const totalExercises = blocks.reduce((n, b) => n + (b.exercises?.length || 0), 0);

  // Numeración continua a lo largo de todo el entrenamiento (1, 2, 3...)
  // en vez de reiniciarla en cada bloque.
  let exerciseCounter = 0;

  return (
    <div className="el__modal-overlay" role="dialog" aria-modal="true" {...overlayCloseProps(() => onClose())}>
      <div className="el__modal wpv__modal" onClick={e => e.stopPropagation()}>
        <div className="el__modal-header">
          <h2 className="el__modal-title">{workout.name}</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar vista previa">✕</button>
        </div>

        <div className="el__modal-body wpv__body">
          <div className="wpv__meta-row">
            <span className="wpv__meta-pill">⏱ {workout.estimatedDurationMinutes || 60} minutos</span>
            <span className="wpv__meta-pill">{blocks.length} bloque{blocks.length === 1 ? '' : 's'} · {totalExercises} ejercicio{totalExercises === 1 ? '' : 's'}</span>
            {workout.description && (
              <span className="wpv__description">{workout.description}</span>
            )}
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
                    <span>{block.name || 'Bloque'}</span>
                    <span className="wpv__block-rounds">{rounds} serie{rounds === 1 ? '' : 's'}</span>
                  </div>
                  {(block.exercises || []).map((ex, ei) => {
                    const exUid = ex.id || `${block.id}-${ei}`;
                    exerciseCounter += 1;
                    return (
                      <PreviewExerciseRow
                        key={exUid}
                        ex={ex}
                        n={exerciseCounter}
                        exercise={exercisesById.get(String(ex.exerciseId))}
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
