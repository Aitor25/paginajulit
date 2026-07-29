import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { formatDateTime } from '../utils/dateUtils';
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
  const [workoutTags, setWorkoutTags] = useState([]);
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('Todas');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('active');

  // Modales
  const [assignWorkoutId, setAssignWorkoutId] = useState(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Cargar datos
  const [errorMsg, setErrorMsg] = useState(null);

  async function loadData() {
    try {
      setLoading(true);
      setErrorMsg(null);
      const dbWorkouts = await storage.getWorkouts();
      const dbAssigns = await storage.getWorkoutAssignments();
      const dbWTags = await storage.getEntities(KEYS.WORKOUT_TAGS);
      const dbClients = await storage.getClients();
      const dbGroups = await storage.getEntities(KEYS.GROUPS);

      setWorkouts(dbWorkouts);
      setAssignments(dbAssigns);
      setWorkoutTags(dbWTags);
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

  const handleDeleteWorkout = async (id, name) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la plantilla "${name}"? Se borrarán también todas sus asignaciones programadas.`)) return;
    await storage.deleteWorkout(id);
    await loadData();
  };

  const handleQuickArchive = async (w) => {
    const nextStatus = w.status === 'archived' ? 'active' : 'archived';
    await storage.saveWorkout({
      ...w,
      status: nextStatus
    });
    await loadData();
  };

  // --- CRUD Asignaciones ---
  const handleDeleteAssignment = async (id) => {
    if (!window.confirm("¿Seguro que deseas anular esta asignación programada?")) return;
    await storage.deleteWorkoutAssignment(id);
    await loadData();
  };

  // --- Filtrado ---
  const filteredWorkouts = useMemo(() => {
    let result = workouts;

    // 1. Estado
    if (selectedStatusFilter !== 'Todas') {
      result = result.filter(w => w.status === selectedStatusFilter);
    }

    // 2. Etiqueta
    if (selectedTagFilter !== 'Todas') {
      result = result.filter(w => Array.isArray(w.tagIds) && w.tagIds.includes(Number(selectedTagFilter)));
    }

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
  }, [workouts, selectedStatusFilter, selectedTagFilter, search]);

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
          🏋️ Plantillas de Rutina
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
                Crea rutinas de ejercicios estructuradas y asígnalas de manera rápida a clientes o equipos.
              </p>
            </div>

            <div className="cm__header-actions">
              <button className="el__btn el__btn--ghost" onClick={() => setShowCatalogModal(true)} title="Gestionar categorías, materiales y etiquetas de rutinas">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                Gestionar Catálogos
              </button>
              <button className="el__btn el__btn--primary" onClick={handleOpenCreate} title="Abrir constructor para crear una rutina">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nueva Rutina
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
                placeholder="Buscar rutina por nombre o descripción..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Buscar rutinas"
              />
            </div>

            <div className="cm__select-wrap">
              <select className="cm__select" value={selectedTagFilter} onChange={e => setSelectedTagFilter(e.target.value)} aria-label="Filtrar por etiqueta de rutina">
                <option value="Todas">Etiqueta: Todas</option>
                {workoutTags.map(wt => (
                  <option key={wt.id} value={wt.id}>{wt.name}</option>
                ))}
              </select>
            </div>

            <div className="cm__select-wrap">
              <select className="cm__select" value={selectedStatusFilter} onChange={e => setSelectedStatusFilter(e.target.value)} aria-label="Filtrar por estado">
                <option value="Todas">Estado: Todos</option>
                <option value="active">Activas</option>
                <option value="draft">Borrador</option>
                <option value="archived">Archivadas</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px', fontSize: '0.8125rem', color: 'var(--gray-400)' }}>
            Mostrando <strong>{filteredWorkouts.length}</strong> de {workouts.length} plantillas de entrenamiento.
          </div>

          {/* Cuadrícula de Rutinas */}
          {filteredWorkouts.length === 0 ? (
            <div className="cm__empty" style={{ padding: '60px 24px' }}>
              <p>No se encontraron plantillas de entrenamiento.</p>
              <span>Ajusta los filtros o empieza creando una nueva rutina en el constructor.</span>
            </div>
          ) : (
            <div className="wk__grid">
              {filteredWorkouts.map(w => {
                // Contadores
                const blockCount = w.blocks?.length || 0;
                let exerciseCount = 0;
                w.blocks?.forEach(b => {
                  exerciseCount += b.exercises?.length || 0;
                });

                return (
                  <article key={w.id} className="wk__card">
                    <div className="wk__card-header">
                      <h3 className="wk__card-title">{w.name}</h3>
                      <span className={`cm__card-status-badge cm__card-status-badge--${w.status}`}>
                        {w.status === 'active' ? 'Activo' : w.status === 'draft' ? 'Borrador' : 'Archivado'}
                      </span>
                    </div>

                    <p className="wk__card-desc">{w.description || 'Sin descripción de objetivos.'}</p>

                    {/* Badges de tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {w.tagIds?.map(tagId => {
                        const tName = workoutTags.find(t => t.id === tagId)?.name;
                        return tName ? <span key={tagId} className="badge badge--default" style={{ fontSize: '0.65rem' }}>{tName}</span> : null;
                      })}
                    </div>

                    <div className="wk__card-meta">
                      <span>{w.estimatedDurationMinutes} minutos</span>
                      <span>{blockCount} Bloques ({exerciseCount} Ej.)</span>
                    </div>

                    {/* Acciones */}
                    <div className="wk__card-actions">
                      <button className="el__btn el__btn--primary" style={{ flex: 1, height: '32px', padding: 0, fontSize: '0.75rem' }} onClick={() => setAssignWorkoutId(w.id)}>
                        Asignar
                      </button>
                      <button className="el__btn el__btn--ghost" style={{ height: '32px', width: '32px', padding: 0 }} onClick={() => handleOpenEdit(w)} title="Editar rutina">
                        ✎
                      </button>
                      <button className="el__btn el__btn--ghost" style={{ height: '32px', width: '32px', padding: 0 }} onClick={() => handleQuickArchive(w)} title={w.status === 'archived' ? 'Desarchivar' : 'Archivar'}>
                        🗃
                      </button>
                      <button className="el__btn el__btn--ghost" style={{ height: '32px', width: '32px', padding: 0, color: '#e53e3e', borderColor: '#fbc2c2' }} onClick={() => handleDeleteWorkout(w.id, w.name)} title="Eliminar definitivamente">
                        ✕
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* ══ APARTADO 3: HISTORIAL DE ASIGNACIONES RECIENTES ═════ */}
          <div style={{ marginTop: '48px', borderTop: '1px solid var(--gray-200)', paddingTop: '32px' }}>
            <h3 className="wb__section-title">Calendario de Rutinas Asignadas</h3>
            
            {assignments.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', textAlign: 'center', padding: '24px', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)' }}>
                No hay asignaciones registradas recientemente.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--gray-200)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Entrenamiento</th>
                      <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Asignado a</th>
                      <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Programado para</th>
                      <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Estado</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => {
                      const wName = workouts.find(w => w.id === a.workoutId)?.name || 'Rutina eliminada';
                      
                      let targetName = 'N/A';
                      if (a.clientId) {
                        const c = clients.find(cl => cl.id === a.clientId);
                        targetName = c ? `👤 ${c.firstName} ${c.lastName}` : 'Cliente no encontrado';
                      } else if (a.groupId) {
                        const g = groups.find(gp => gp.id === a.groupId);
                        targetName = g ? `👥 Grupo: ${g.name}` : 'Grupo no encontrado';
                      }

                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '600' }}>{wName}</td>
                          <td style={{ padding: '12px 16px' }}>{targetName}</td>
                          <td style={{ padding: '12px 16px' }}>{formatDateTime(a.performedAt || a.scheduledAt)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`cm__card-status-badge cm__card-status-badge--${a.status === 'completed' ? 'active' : 'pending'}`}>
                              {a.status === 'completed' ? 'Completado' : 'Pendiente'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
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
            )}
          </div>

          {/* MODALES */}
          {assignWorkoutId && (
            <WorkoutAssignmentModal
              workoutId={assignWorkoutId}
              onClose={() => setAssignWorkoutId(null)}
              onSave={loadData}
            />
          )}

          {showCatalogModal && (
            <GlobalCatalogModal
              mode="complete"
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
