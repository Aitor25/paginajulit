import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { formatDate } from '../utils/dateUtils';
import WorkoutBuilderView from './WorkoutBuilderView';
import WorkoutAssignmentModal from './WorkoutAssignmentModal';
import GlobalCatalogModal from './GlobalCatalogModal';
import ProgramManager from './ProgramManager';
import './WorkoutManager.css';

function stripAccents(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function WorkoutManager() {
  const [subTab, setSubTab] = useState('workouts'); // 'workouts' | 'programs'

  const [workouts, setWorkouts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);

  // Filtros
  const [search, setSearch] = useState('');

  // Listas compactas: por defecto solo se ven los primeros N, con opción
  // de desplegar el resto (la búsqueda ya permite llegar a cualquiera).
  const WORKOUTS_PAGE_SIZE = 10;
  const ASSIGNMENTS_PAGE_SIZE = 5;
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const [showAllAssignments, setShowAllAssignments] = useState(false);

  // Selección múltiple: para poder asignar o borrar varios entrenamientos
  // de una sola vez en vez de fila por fila.
  const [selectedIds, setSelectedIds] = useState([]);

  // Modales
  const [assignWorkoutIds, setAssignWorkoutIds] = useState(null); // array de ids a asignar
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Cargar datos
  const [errorMsg, setErrorMsg] = useState(null);

  async function loadData() {
    try {
      setLoading(true);
      setErrorMsg(null);
      const dbWorkouts = await storage.getWorkouts();
      const dbAssigns = await storage.getWorkoutAssignments();
      const dbClients = await storage.getClients();
      const dbGroups = await storage.getEntities(KEYS.GROUPS);

      setWorkouts(dbWorkouts);
      setAssignments(dbAssigns);
      setClients(dbClients);
      setGroups(dbGroups);
    } catch (error) {
      console.error("Error loading workout data:", error);
      setErrorMsg(error.message || String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // --- CRUD Rutinas ---
  const handleOpenCreate = () => {
    setEditingWorkout(null);
    setShowBuilder(true);
  };

  const handleOpenEdit = (w) => {
    setEditingWorkout(w);
    setShowBuilder(true);
  };

  // Se actualiza el estado local en vez de volver a llamar a loadData():
  // loadData() pone loading=true, y con eso toda la sección se sustituye un
  // instante por "Cargando módulo de entrenamientos...", un parpadeo que se
  // siente como si la página entera se hubiera recargado solo por borrar
  // una fila.
  const handleDeleteWorkout = async (id, name) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la plantilla "${name}"? Se borrarán también todas sus asignaciones programadas.`)) return;
    await storage.deleteWorkout(id);
    setWorkouts(prev => prev.filter(w => w.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  const handleBulkDeleteWorkouts = async () => {
    const count = selectedIds.length;
    if (count === 0) return;
    if (!window.confirm(`¿Seguro que deseas eliminar ${count} entrenamiento${count === 1 ? '' : 's'}? Se borrarán también todas sus asignaciones programadas.`)) return;
    await Promise.all(selectedIds.map(id => storage.deleteWorkout(id)));
    const idsSet = new Set(selectedIds);
    setWorkouts(prev => prev.filter(w => !idsSet.has(w.id)));
    setSelectedIds([]);
  };

  const toggleSelected = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = visibleWorkouts.map(w => w.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : visibleIds);
  };

  // --- CRUD Asignaciones ---
  const handleDeleteAssignment = async (id) => {
    if (!window.confirm("¿Seguro que deseas anular esta asignación programada?")) return;
    await storage.deleteWorkoutAssignment(id);
    setAssignments(prev => prev.filter(a => a.id !== id));
  };

  // --- Filtrado ---
  const filteredWorkouts = useMemo(() => {
    let result = workouts;

    // 3. Buscador
    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(w => {
        const nameMatch = stripAccents(w.name).includes(query);
        const descMatch = stripAccents(w.description).includes(query);
        return nameMatch || descMatch;
      });
    }

    return result;
  }, [workouts, search]);

  const visibleWorkouts = showAllWorkouts ? filteredWorkouts : filteredWorkouts.slice(0, WORKOUTS_PAGE_SIZE);

  const sortedAssignments = useMemo(
    () => [...assignments].sort((a, b) => String(b.scheduledAt).localeCompare(String(a.scheduledAt))),
    [assignments]
  );
  const visibleAssignments = showAllAssignments ? sortedAssignments : sortedAssignments.slice(0, ASSIGNMENTS_PAGE_SIZE);

  if (loading) {
    return <div className="wm-container"><p>Cargando módulo de entrenamientos...</p></div>;
  }
  if (errorMsg) {
    return <div className="wm-container" style={{color: 'red'}}><p>Error: {errorMsg}</p></div>;
  }

  if (showBuilder) {
    return (
      <WorkoutBuilderView
        editingWorkout={editingWorkout}
        onClose={() => {
          setShowBuilder(false);
          setEditingWorkout(null);
        }}
        onSave={loadData}
      />
    );
  }

  return (
    <section className="cm" aria-label="Entrenamientos y Planificación">
      {/* Sub-navegación superior */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--gray-200)', marginBottom: '16px', paddingBottom: '4px' }}>
        <button
          className={`el__btn ${subTab === 'workouts' ? 'el__btn--primary' : 'el__btn--ghost'}`}
          style={{ height: '36px', padding: '0 16px', fontSize: '0.8125rem' }}
          onClick={() => setSubTab('workouts')}
        >
          🏋️ Plantillas de Entrenamiento
        </button>
        <button
          className={`el__btn ${subTab === 'programs' ? 'el__btn--primary' : 'el__btn--ghost'}`}
          style={{ height: '36px', padding: '0 16px', fontSize: '0.8125rem' }}
          onClick={() => setSubTab('programs')}
        >
          📅 Programas y Macrociclos
        </button>
      </div>

      {subTab === 'programs' ? (
        <ProgramManager />
      ) : (
        <>
          {/* Cabecera */}
          <header className="cm__header">
            <div className="el__title-group">
              <h1 className="cm__title">Biblioteca de Entrenamientos</h1>
              <p className="cm__subtitle">
                Crea entrenamientos estructurados y asígnalos de manera rápida a clientes o equipos.
              </p>
            </div>

            <div className="cm__header-actions">
              <button className="el__btn el__btn--ghost" onClick={() => setShowCatalogModal(true)} title="Gestionar categorías, materiales y etiquetas de entrenamientos">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                Gestionar Catálogos
              </button>
              <button className="el__btn el__btn--primary" onClick={handleOpenCreate} title="Abrir constructor para crear un entrenamiento">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nuevo Entrenamiento
              </button>
            </div>
          </header>

          {/* Toolbar filtros */}
          <div className="cm__toolbar">
            <div className="cm__search-wrap">
              <svg className="cm__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                className="cm__search"
                placeholder="Buscar entrenamiento por nombre o descripción..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Buscar entrenamientos"
              />
            </div>

            {selectedIds.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', fontWeight: 600 }}>
                  {selectedIds.length} seleccionado{selectedIds.length === 1 ? '' : 's'}
                </span>
                <button
                  className="el__btn el__btn--primary"
                  style={{ height: '32px', padding: '0 12px', fontSize: '0.75rem' }}
                  onClick={() => setAssignWorkoutIds(selectedIds)}
                >
                  Asignar seleccionados
                </button>
                <button
                  className="el__btn el__btn--ghost"
                  style={{ height: '32px', padding: '0 12px', fontSize: '0.75rem', color: '#e53e3e', borderColor: '#fbc2c2' }}
                  onClick={handleBulkDeleteWorkouts}
                >
                  Eliminar seleccionados
                </button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px', fontSize: '0.8125rem', color: 'var(--gray-400)' }}>
            Mostrando <strong>{visibleWorkouts.length}</strong> de {filteredWorkouts.length} plantillas de entrenamiento.
          </div>

          {/* Lista de Entrenamientos */}
          {filteredWorkouts.length === 0 ? (
            <div className="cm__empty" style={{ padding: '60px 24px' }}>
              <p>No se encontraron plantillas de entrenamiento.</p>
              <span>Ajusta los filtros o empieza creando un nuevo entrenamiento en el constructor.</span>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '32px' }}>
                        <input
                          type="checkbox"
                          checked={visibleWorkouts.length > 0 && visibleWorkouts.every(w => selectedIds.includes(w.id))}
                          onChange={toggleSelectAllVisible}
                          aria-label="Seleccionar todos los entrenamientos visibles"
                        />
                      </th>
                      <th>Entrenamiento</th>
                      <th>Duración</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWorkouts.map(w => {
                      const blockCount = w.blocks?.length || 0;
                      let exerciseCount = 0;
                      w.blocks?.forEach(b => {
                        exerciseCount += b.exercises?.length || 0;
                      });

                      return (
                        <tr key={w.id} className="wk__row" onClick={() => handleOpenEdit(w)}>
                          <td onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(w.id)}
                              onChange={() => toggleSelected(w.id)}
                              aria-label={`Seleccionar ${w.name}`}
                            />
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{w.name}</div>
                            {w.description && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '2px' }}>{w.description}</div>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {w.estimatedDurationMinutes} min · {blockCount} bloques ({exerciseCount} ej.)
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button className="el__btn el__btn--primary" style={{ height: '30px', padding: '0 10px', fontSize: '0.75rem' }} onClick={() => setAssignWorkoutIds([w.id])}>
                                Asignar
                              </button>
                              <button className="el__btn el__btn--ghost" style={{ height: '30px', width: '30px', padding: 0, color: '#e53e3e', borderColor: '#fbc2c2' }} onClick={() => handleDeleteWorkout(w.id, w.name)} title="Eliminar definitivamente">
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!showAllWorkouts && filteredWorkouts.length > WORKOUTS_PAGE_SIZE && (
                <button
                  className="el__btn el__btn--ghost"
                  style={{ marginTop: '12px', width: '100%' }}
                  onClick={() => setShowAllWorkouts(true)}
                >
                  Ver más… ({filteredWorkouts.length - WORKOUTS_PAGE_SIZE} más)
                </button>
              )}
            </>
          )}

          {/* ══ APARTADO 3: HISTORIAL DE ASIGNACIONES RECIENTES ═════ */}
          <div style={{ marginTop: '48px', borderTop: '1px solid var(--gray-200)', paddingTop: '32px' }}>
            <h3 className="wb__section-title">Calendario de Entrenamientos Asignados</h3>

            {assignments.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', textAlign: 'center', padding: '24px', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)' }}>
                No hay asignaciones registradas recientemente.
              </p>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Entrenamiento</th>
                        <th>Asignado a</th>
                        <th>Programado para</th>
                        <th>Estado</th>
                        <th style={{ textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAssignments.map(a => {
                        const wName = workouts.find(w => w.id === a.workoutId)?.name || 'Entrenamiento eliminado';

                        let targetName = 'N/A';
                        if (a.clientId) {
                          const c = clients.find(cl => cl.id === a.clientId);
                          targetName = c ? `👤 ${c.firstName} ${c.lastName}` : 'Cliente no encontrado';
                        } else if (a.groupId) {
                          const g = groups.find(gp => gp.id === a.groupId);
                          targetName = g ? `👥 Grupo: ${g.name}` : 'Grupo no encontrado';
                        }

                        return (
                          <tr key={a.id}>
                            <td style={{ fontWeight: 600 }}>{wName}</td>
                            <td>{targetName}</td>
                            <td>{formatDate(a.scheduledAt)}</td>
                            <td>
                              <span className={`cm__card-status-badge cm__card-status-badge--${a.status === 'completed' ? 'active' : 'pending'}`} style={{ position: 'static' }}>
                                {a.status === 'completed' ? 'Completado' : 'Pendiente'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {a.status === 'completed' && (
                                <button
                                  className="el__card-admin-btn"
                                  style={{ marginRight: '6px', borderColor: '#fde047', color: '#854d0e' }}
                                  onClick={async () => {
                                    if (window.confirm("¿Seguro que deseas reabrir esta sesión finalizada para el deportista? El resultado volverá a estado borrador.")) {
                                      await storage.reopenWorkoutResult(a.id);
                                      await loadData();
                                    }
                                  }}
                                  title="Reabrir entrenamiento"
                                >
                                  Reabrir
                                </button>
                              )}
                              <button className="el__card-admin-btn el__card-admin-btn--delete" onClick={() => handleDeleteAssignment(a.id)} title="Anular asignación">
                                Anular
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!showAllAssignments && sortedAssignments.length > ASSIGNMENTS_PAGE_SIZE && (
                  <button
                    className="el__btn el__btn--ghost"
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={() => setShowAllAssignments(true)}
                  >
                    Ver más… ({sortedAssignments.length - ASSIGNMENTS_PAGE_SIZE} más)
                  </button>
                )}
              </>
            )}
          </div>

          {/* MODALES */}
          {assignWorkoutIds && (
            <WorkoutAssignmentModal
              workoutIds={assignWorkoutIds}
              onClose={() => setAssignWorkoutIds(null)}
              onSave={() => {
                setAssignWorkoutIds(null);
                setSelectedIds([]);
                loadData();
              }}
            />
          )}

          {showCatalogModal && (
            <GlobalCatalogModal
              contextKeys={[KEYS.GROUPS]}
              initialActiveKey={KEYS.GROUPS}
              onClose={() => {
                setShowCatalogModal(false);
                loadData();
              }}
              onRefresh={loadData}
            />
          )}
        </>
      )}
    </section>
  );
}
