import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { useAuth } from '../contexts/AuthProvider';
import WorkoutBuilderView from './WorkoutBuilderView';
import WorkoutAssignmentModal from './WorkoutAssignmentModal';
import WorkoutPreviewModal from './WorkoutPreviewModal';
import GlobalCatalogModal from './GlobalCatalogModal';
import ProgramManager from './ProgramManager';
import './WorkoutManager.css';
import { loadGroupCatalog, getTagIds, workoutTaggedWith, buildGroupOptions, groupDisplayName } from '../utils/clientGroups';

function stripAccents(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function WorkoutManager() {
  const { userProfile } = useAuth();
  const [subTab, setSubTab] = useState('workouts'); // 'workouts' | 'programs'

  const [workouts, setWorkouts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('recent'); // 'recent' | 'name' | 'updated'

  // Listas compactas: por defecto solo se ven los primeros N, con opción
  // de desplegar el resto (la búsqueda ya permite llegar a cualquiera).
  const WORKOUTS_PAGE_SIZE = 10;
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);

  // Selección múltiple: para poder asignar o borrar varios entrenamientos
  // de una sola vez en vez de fila por fila.
  const [selectedIds, setSelectedIds] = useState([]);

  // Modales
  const [assignWorkoutIds, setAssignWorkoutIds] = useState(null); // array de ids a asignar
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  // Al hacer clic en un entrenamiento se abre esta vista previa en vez del
  // constructor directamente; "Editar" dentro de ella es lo que abre el
  // constructor de verdad.
  const [previewWorkout, setPreviewWorkout] = useState(null);

  // Grupos, subgrupos y jugadores: para las carpetas y las etiquetas
  const [groups, setGroups] = useState([]);
  const [subgroups, setSubgroups] = useState([]);
  const [clients, setClients] = useState([]);
  const [folder, setFolder] = useState('all'); // 'all' | 'none' | 'g:<id>' | 'c:<id>'

  // Cargar datos
  const [errorMsg, setErrorMsg] = useState(null);

  async function loadData() {
    try {
      // Sin setLoading(true): "loading" empieza en true y solo la primera carga
      // muestra el aviso. Las recargas (al guardar, al tocar grupos...) no
      // sustituyen la página, así no se cierra ni reinicia ninguna ventana abierta.
      setErrorMsg(null);
      const [dbWorkouts, groupCatalog, dbClients] = await Promise.all([
        storage.getWorkouts(),
        loadGroupCatalog(),
        storage.getClients()
      ]);
      setWorkouts(dbWorkouts);
      setGroups(groupCatalog.groups);
      setSubgroups(groupCatalog.subgroups);
      setClients(dbClients);
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
    setPreviewWorkout(null);
    setEditingWorkout(w);
    setShowBuilder(true);
  };

  const handleDuplicateWorkout = async (w) => {
    try {
      const cloned = await storage.duplicateWorkout(w.id);
      setWorkouts(prev => [cloned, ...prev]);
      setPreviewWorkout(null);
    } catch (err) {
      alert(err.message);
    }
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

  // Plantilla suelta, sin asignar a nadie todavía: deportista y fecha se
  // dejan en blanco en el PDF en vez de exigir una asignación primero.
  const handleDownloadTemplatePdf = async (workout) => {
    try {
      // Carga diferida: jsPDF (con sus tablas de fuentes) solo se descarga
      // cuando alguien pulsa "PDF", no en cada carga de esta página.
      const { downloadWorkoutTemplatePdf } = await import('../utils/workoutPdf');
      await downloadWorkoutTemplatePdf(workout, { coachName: userProfile?.fullName });
    } catch (err) {
      alert(err.message);
    }
  };

  // --- Carpetas y etiquetas ---
  const clientFullName = (id) => {
    const c = clients.find(cl => String(cl.id) === String(id));
    return c ? `${c.firstName} ${c.lastName}` : null;
  };

  const isUntagged = (w) => {
    const t = getTagIds(w);
    return t.groupIds.length === 0 && t.subgroupIds.length === 0 && t.clientIds.length === 0;
  };

  // Entrar en un grupo muestra también lo etiquetado con sus subgrupos.
  const workoutInFolder = (w, key) => {
    if (key === 'none') return isUntagged(w);
    if (key.startsWith('g:')) return workoutTaggedWith(w, key.slice(2), subgroups);
    if (key.startsWith('c:')) return getTagIds(w).clientIds.includes(key.slice(2));
    return true;
  };

  const workoutTagNames = (w) => {
    const t = getTagIds(w);
    return [
      ...[...t.groupIds, ...t.subgroupIds].map(id => ({ key: id, name: groupDisplayName(id, groups, subgroups), isClient: false })),
      ...t.clientIds.map(id => ({ key: id, name: clientFullName(id), isClient: true }))
    ].filter(x => x.name);
  };

  const folderItems = (() => {
    const items = [{ key: 'all', label: 'Todos', count: workouts.length }];
    const groupOptions = buildGroupOptions(groups, subgroups);
    if (groupOptions.length > 0) {
      items.push({ key: 'h-groups', heading: true, label: 'Grupos' });
      groupOptions.forEach(o => items.push({
        key: `g:${o.id}`,
        label: o.name,
        indent: o.isSubgroup,
        count: workouts.filter(w => workoutTaggedWith(w, o.id, subgroups)).length
      }));
    }
    // Solo los jugadores que tienen algún entrenamiento etiquetado
    const taggedClientIds = [...new Set(workouts.flatMap(w => getTagIds(w).clientIds))]
      .filter(id => clientFullName(id))
      .sort((a, b) => clientFullName(a).localeCompare(clientFullName(b), 'es'));
    if (taggedClientIds.length > 0) {
      items.push({ key: 'h-clients', heading: true, label: 'Jugadores' });
      taggedClientIds.forEach(id => items.push({
        key: `c:${id}`,
        label: clientFullName(id),
        count: workouts.filter(w => getTagIds(w).clientIds.includes(id)).length
      }));
    }
    items.push({ key: 'none', label: 'Sin etiquetar', count: workouts.filter(isUntagged).length });
    return items;
  })();

  // --- Filtrado ---
  const filteredWorkouts = useMemo(() => {
    let result = workouts;

    // 3. Buscador
    // Carpeta elegida (grupo, subgrupo, jugador o sin etiquetar)
    if (folder !== 'all') {
      result = result.filter(w => workoutInFolder(w, folder));
    }

    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(w => {
        const nameMatch = stripAccents(w.name).includes(query);
        const descMatch = stripAccents(w.description).includes(query);
        return nameMatch || descMatch;
      });
    }

    const sorted = [...result];
    if (sortOrder === 'name') {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
    } else {
      const field = sortOrder === 'updated' ? 'updatedAt' : 'createdAt';
      sorted.sort((a, b) => new Date(b[field] || 0) - new Date(a[field] || 0));
    }
    return sorted;
  }, [workouts, search, sortOrder, folder, subgroups]);

  const visibleWorkouts = showAllWorkouts ? filteredWorkouts : filteredWorkouts.slice(0, WORKOUTS_PAGE_SIZE);

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
              <button className="el__btn el__btn--ghost" onClick={() => setShowCatalogModal(true)} title="Gestionar grupos y subgrupos">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                Administración de grupos
              </button>
              <button className="el__btn el__btn--primary" onClick={handleOpenCreate} title="Abrir constructor para crear un entrenamiento">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nuevo Entrenamiento
              </button>
            </div>
          </header>

          <div className="wk__layout">
            {/* Carpetas: entrar en un grupo, subgrupo o jugador muestra solo los
                entrenamientos etiquetados con él. */}
            <aside className="wk__folders" aria-label="Carpetas de entrenamientos">
              {folderItems.map(item => item.heading ? (
                <p key={item.key} className="wk__folder-heading">{item.label}</p>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  className={`wk__folder ${item.indent ? 'wk__folder--sub' : ''} ${folder === item.key ? 'wk__folder--active' : ''}`}
                  onClick={() => { setFolder(item.key); setShowAllWorkouts(false); }}
                >
                  <span className="wk__folder-name">{item.label}</span>
                  <span className="wk__folder-count">{item.count}</span>
                </button>
              ))}
            </aside>

            <div className="wk__main">
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

            <select
              className="el__select"
              style={{ width: 'auto' }}
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              aria-label="Ordenar entrenamientos"
            >
              <option value="recent">Añadidos recientemente</option>
              <option value="name">Alfabético (A-Z)</option>
              <option value="updated">Modificados recientemente</option>
            </select>

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
                        <tr key={w.id} className="wk__row" onClick={() => setPreviewWorkout(w)}>
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
                            {(() => {
                              const tagNames = workoutTagNames(w);
                              return tagNames.length > 0 && (
                                <div className="gp__chips" style={{ marginTop: '4px' }}>
                                  {tagNames.map(t => (
                                    <span key={t.key} className={`gp__chip ${t.isClient ? 'gp__chip--client' : ''}`}>{t.name}</span>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {w.estimatedDurationMinutes} min · {blockCount} bloques ({exerciseCount} ej.)
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button className="el__btn el__btn--primary" style={{ height: '30px', padding: '0 10px', fontSize: '0.75rem' }} onClick={() => setAssignWorkoutIds([w.id])}>
                                Asignar
                              </button>
                              <button className="el__btn el__btn--ghost" style={{ height: '30px', padding: '0 10px', fontSize: '0.75rem' }} onClick={() => handleOpenEdit(w)} title="Abrir en el constructor">
                                ✎ Editar
                              </button>
                              <button className="el__btn el__btn--ghost" style={{ height: '30px', padding: '0 10px', fontSize: '0.75rem' }} onClick={() => handleDuplicateWorkout(w)} title="Crear una copia de este entrenamiento">
                                ⧉ Duplicar
                              </button>
                              <button className="el__btn el__btn--ghost" style={{ height: '30px', padding: '0 10px', fontSize: '0.75rem' }} onClick={() => handleDownloadTemplatePdf(w)} title="Descargar PDF del entrenamiento">
                                PDF
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
            </div>
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
              contextKeys={[KEYS.GROUPS, KEYS.SUBGROUPS]}
              initialActiveKey={KEYS.GROUPS}
              title="Administración de grupos"
              onClose={() => {
                setShowCatalogModal(false);
                loadData();
              }}
              onRefresh={loadData}
            />
          )}

          {previewWorkout && (
            <WorkoutPreviewModal
              workout={previewWorkout}
              onClose={() => setPreviewWorkout(null)}
              onEdit={() => handleOpenEdit(previewWorkout)}
              onDuplicate={() => handleDuplicateWorkout(previewWorkout)}
              onAssign={() => {
                setAssignWorkoutIds([previewWorkout.id]);
                setPreviewWorkout(null);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
