import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { formatDate } from '../utils/dateUtils';
import ProgramBuilderView from './ProgramBuilderView';
import ProgramAssignmentModal from './ProgramAssignmentModal';
import GlobalCatalogModal from './GlobalCatalogModal';
import './ProgramManager.css';

function stripAccents(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function ProgramManager() {
  // Datos principales
  const [programs, setPrograms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);

  // Estados visuales y navegación SPA
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);

  // Filtros
  const [search, setSearch] = useState('');

  // Modales
  const [assignProgramId, setAssignProgramId] = useState(null);
  const [assignDurationWeeks, setAssignDurationWeeks] = useState(4);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Cargar datos relacionales
  async function loadData() {
    setLoading(true);
    const dbPrograms = await storage.getPrograms();
    const dbAssigns = await storage.getProgramAssignments();
    const dbClients = await storage.getClients();
    const dbGroups = await storage.getEntities(KEYS.GROUPS);

    setPrograms(dbPrograms);
    setAssignments(dbAssigns);
    setClients(dbClients);
    setGroups(dbGroups);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // --- CRUD Programas ---
  const handleOpenCreate = () => {
    setEditingProgram(null);
    setShowBuilder(true);
  };

  const handleOpenEdit = async (p) => {
    // Cargar con semanas y días cargados en jerarquía
    const fullProg = await storage.getProgramById(p.id);
    setEditingProgram(fullProg);
    setShowBuilder(true);
  };

  const handleDuplicateProgram = async (id) => {
    try {
      await storage.duplicateProgram(id);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProgram = async (id, name) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el programa "${name}"? Se anularán todas las asignaciones de clientes activas.`)) return;
    await storage.deleteProgram(id);
    await loadData();
  };

  // --- CRUD Asignaciones ---
  const handleDeleteAssignment = async (id) => {
    if (!window.confirm("¿Seguro que deseas anular este programa para el deportista? Se removerán sus sesiones pendientes del calendario.")) return;
    await storage.deleteProgramAssignment(id);
    await loadData();
  };

  // --- Filtrado ---
  const filteredPrograms = useMemo(() => {
    let result = programs;

    // 3. Buscador
    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(p => {
        const nameMatch = stripAccents(p.name).includes(query);
        const descMatch = stripAccents(p.description || '').includes(query);
        return nameMatch || descMatch;
      });
    }

    return result;
  }, [programs, search]);

  if (loading) {
    return <div className="el__placeholder"><p>Cargando módulo de programas...</p></div>;
  }

  if (showBuilder) {
    return (
      <ProgramBuilderView
        editingProgram={editingProgram}
        onClose={() => {
          setShowBuilder(false);
          setEditingProgram(null);
        }}
        onSave={loadData}
      />
    );
  }

  return (
    <section className="cm" aria-label="Programas de Entrenamiento">
      
      {/* Cabecera */}
      <header className="cm__header">
        <div className="el__title-group">
          <h1 className="cm__title">Programas y Macrociclos</h1>
          <p className="cm__subtitle">
            Diseña planificaciones de mediano/largo plazo y asocia entrenamientos estructurados a tus clientes.
          </p>
        </div>

        <div className="cm__header-actions">
          <button className="el__btn el__btn--ghost" onClick={() => setShowCatalogModal(true)} title="Gestionar categorías, materiales y etiquetas de entrenamientos">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            Gestionar Catálogos
          </button>
          <button className="el__btn el__btn--primary" onClick={handleOpenCreate} title="Abrir editor para crear un programa">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo Programa
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
            placeholder="Buscar programa por nombre o descripción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Buscar programas"
          />
        </div>

      </div>

      <div style={{ marginBottom: '16px', fontSize: '0.8125rem', color: 'var(--gray-400)' }}>
        Mostrando <strong>{filteredPrograms.length}</strong> de {programs.length} programas.
      </div>

      {/* Lista de Programas: misma tabla que las rutinas — fila completa
          clicable para editar, sin lápiz. */}
      {filteredPrograms.length === 0 ? (
        <div className="cm__empty" style={{ padding: '60px 24px' }}>
          <p>No se encontraron programas de entrenamiento.</p>
          <span>Ajusta los filtros o empieza creando una nueva planificación.</span>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Programa</th>
                <th>Duración</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map(p => {
                const activeCount = assignments.filter(a => a.programId === p.id && a.status === 'active').length;

                return (
                  <tr key={p.id} className="wk__row" onClick={() => handleOpenEdit(p)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '2px' }}>{p.description}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {p.durationWeeks} semanas · {activeCount} atleta{activeCount === 1 ? '' : 's'} activo{activeCount === 1 ? '' : 's'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          className="el__btn el__btn--primary"
                          style={{ height: '30px', padding: '0 10px', fontSize: '0.75rem' }}
                          onClick={() => {
                            setAssignProgramId(p.id);
                            setAssignDurationWeeks(p.durationWeeks);
                          }}
                        >
                          Asignar
                        </button>
                        <button className="el__btn el__btn--ghost" style={{ height: '30px', width: '30px', padding: 0 }} onClick={() => handleDuplicateProgram(p.id)} title="Duplicar programa">
                          📋
                        </button>
                        <button className="el__btn el__btn--ghost" style={{ height: '30px', width: '30px', padding: 0, color: '#e53e3e', borderColor: '#fbc2c2' }} onClick={() => handleDeleteProgram(p.id, p.name)} title="Eliminar definitivamente">
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
      )}

      {/* ══ APARTADO 3: ATLETAS PLANIFICADOS Y PROGRESO ══════════ */}
      <div style={{ marginTop: '48px', borderTop: '1px solid var(--gray-200)', paddingTop: '32px' }}>
        <h3 className="wb__section-title">Seguimiento de Planificación Activa</h3>
        
        {assignments.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', textAlign: 'center', padding: '24px', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)' }}>
            No hay deportistas planificados actualmente.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--gray-200)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Deportista</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Programa asignado</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Procedencia</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Vigencia</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gray-700)' }}>Progreso del Plan</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map(a => {
                  const pName = programs.find(p => p.id === a.programId)?.name || 'Programa eliminado';
                  const clientObj = clients.find(cl => cl.id === a.clientId);
                  const clientName = clientObj ? `${clientObj.firstName} ${clientObj.lastName}` : `Atleta ID #${a.clientId}`;
                  
                  let groupName = 'Plan Individual';
                  if (a.groupId) {
                    const g = groups.find(gp => gp.id === a.groupId);
                    groupName = g ? `👥 Grupo: ${g.name}` : 'Grupo no encontrado';
                  }

                  const progressVal = Number(a.progressPercentage) || 0;

                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: '600' }}>{clientName}</td>
                      <td style={{ padding: '12px 16px' }}>{pName}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--gray-500)' }}>{groupName}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {formatDate(a.startDate)} al {formatDate(a.endDate)}
                      </td>
                      <td style={{ padding: '12px 16px', width: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '32px' }}>{progressVal}%</span>
                          <div className="pm__progress-bar-wrap" style={{ flex: 1, margin: 0 }}>
                            <div className="pm__progress-bar-fill" style={{ width: `${progressVal}%` }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button className="el__card-admin-btn el__card-admin-btn--delete" onClick={() => handleDeleteAssignment(a.id)} title="Cancelar planificación">
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
      {assignProgramId && (
        <ProgramAssignmentModal
          programId={assignProgramId}
          durationWeeks={assignDurationWeeks}
          onClose={() => setAssignProgramId(null)}
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

    </section>
  );
}
