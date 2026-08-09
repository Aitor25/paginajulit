import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { firestoreService } from '../services/firestoreService';
import { formatDate, formatDateTime } from '../utils/dateUtils';
import GlobalCatalogModal from './GlobalCatalogModal';
import AssessmentTab from './AssessmentTab';
import { ClientCalendarTab } from './ClientCalendarTab';
import { buildCoachColorMap, SIN_ENTRENADOR_COLOR } from './CalendarGrid';
import { useAuth } from '../contexts/AuthProvider';
import './ClientManager.css';

/* ─── Helpers ─────────────────────────────────────────────── */

function stripAccents(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function calculateAge(birthDateString) {
  if (!birthDateString) return '';
  const today = new Date();
  const birthDate = new Date(birthDateString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/* ─── Componente: Ficha Detallada del Cliente ────────────── */
function ClientDetail({
  clientId,
  onClose,
  onEdit,
  onDelete,
  groups,
  sports,
  teams
}) {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';

  const [client, setClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [linkedAccount, setLinkedAccount] = useState(null);
  const [savingCoach, setSavingCoach] = useState(false);
  const [coachError, setCoachError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');

  // Workouts data
  const [workouts, setWorkouts] = useState([]);
  const [results, setResults] = useState([]);
  const [editingFeedbackId, setEditingFeedbackId] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');

  // Analítica de ejercicios
  const [exercisesList, setExercisesList] = useState([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [analyticsPeriod, setAnalyticsPeriod] = useState(''); // '' = Todos, 30, 180
  const [exerciseAnalyticsData, setExerciseAnalyticsData] = useState(null);

  // Cargar cliente y notas privadas
  useEffect(() => {
    async function loadClientData() {
      const c = await storage.getClientById(clientId);
      if (c) {
        setClient(c);
        const n = await storage.getPrivateNotes(clientId);
        setNotes(n.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        
        // Cargar assignments y resultados para el tab workouts
        const assigns = await storage.getWorkoutAssignments(clientId);
        const res = await storage.getWorkoutResults(clientId);
        setWorkouts(assigns);
        setResults(res);

        // Cargar catálogo de ejercicios para analítica
        const exList = await storage.getEntities(KEYS.EXERCISES);
        setExercisesList(exList);
      }
    }
    loadClientData();
  }, [clientId]);

  // Listado de entrenadores para el selector de asignación. Solo el owner
  // puede listar /users, así que para el resto de roles queda vacío.
  useEffect(() => {
    if (!isOwner) return;
    storage.getCoaches().then(setCoaches).catch(err => {
      console.error('Error cargando entrenadores', err);
    });
  }, [isOwner]);

  // Cuenta de acceso vinculada a esta ficha. Se lee el documento concreto
  // (no un listado): las reglas permiten "get" de /users a cualquier coach,
  // pero "list" solo al owner.
  useEffect(() => {
    if (!client?.linkedUserId) {
      setLinkedAccount(null);
      return;
    }
    firestoreService.getDocument('users', String(client.linkedUserId))
      .then(setLinkedAccount)
      .catch(err => {
        console.error('Error cargando la cuenta vinculada', err);
        setLinkedAccount(null);
      });
  }, [client?.linkedUserId]);

  async function handleAssignCoach(coachId) {
    setCoachError('');
    setSavingCoach(true);
    try {
      await storage.assignClientToCoach(clientId, coachId || null);
      setClient(prev => prev ? { ...prev, coachId: coachId || null } : prev);
    } catch (err) {
      setCoachError(err.message);
    } finally {
      setSavingCoach(false);
    }
  }

  // Cargar analítica cuando cambie ejercicio o periodo
  useEffect(() => {
    async function loadAn() {
      if (!selectedExerciseId) {
        setExerciseAnalyticsData(null);
        return;
      }
      try {
        const p = analyticsPeriod ? Number(analyticsPeriod) : null;
        const data = await storage.getExerciseAnalytics(clientId, selectedExerciseId, p);
        setExerciseAnalyticsData(data);
      } catch (err) {
        console.error("Error al cargar analítica", err);
        setExerciseAnalyticsData(null);
      }
    }
    loadAn();
  }, [selectedExerciseId, analyticsPeriod, clientId, results]);

  // Manejador Feedback
  async function handleSaveFeedback(resultId) {
    try {
      const saved = await storage.saveWorkoutFeedback(resultId, feedbackText);
      setResults(prev => prev.map(r => r.id === resultId ? saved : r));
      setEditingFeedbackId(null);
      setFeedbackText('');
    } catch (err) {
      alert("Error guardando feedback: " + err.message);
    }
  }

  if (!client) {
    return <div className="cm__placeholder"><p>Cargando información del cliente...</p></div>;
  }

  // Sin valor => undefined, para poder ocultar la fila en vez de mostrar
  // "Sin deporte", "Sin equipo"... en todos los deportistas.
  const groupName = groups.find(g => String(g.id) === String(client.groupId))?.name;
  const sportName = sports.find(s => String(s.id) === String(client.sportId))?.name;
  const teamName = teams.find(t => String(t.id) === String(client.teamId))?.name;

  const datosDeportivos = [
    ['Deporte', sportName],
    ['Equipo / Club', teamName],
    ['Grupo de Entrenamiento', groupName]
  ].filter(([, valor]) => !!valor);

  const age = calculateAge(client.birthDate);

  // --- CRUD Notas Privadas ---
  async function handleAddNote(e) {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    const newNote = {
      clientId: client.id,
      text: newNoteText.trim()
    };

    const saved = await storage.savePrivateNote(newNote);
    setNotes(prev => [saved, ...prev]);
    setNewNoteText('');
  }

  async function handleSaveEditNote(noteId) {
    if (!editNoteText.trim()) return;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const updated = {
      ...note,
      text: editNoteText.trim()
    };

    const saved = await storage.savePrivateNote(updated);
    setNotes(prev => prev.map(n => n.id === noteId ? saved : n));
    setEditingNoteId(null);
    setEditNoteText('');
  }

  async function handleDeleteNote(noteId) {
    if (!window.confirm("¿Seguro que deseas eliminar esta nota privada de la ficha?")) return;
    await storage.deletePrivateNote(noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
  }

  return (
    <div className="cm__detail">
      {/* Cabecera de Ficha */}
      <div className="cm__detail-header-row">
        <div className="cm__detail-profile">
          <div className="cm__detail-avatar-wrap">
            {client.image ? (
              <img src={client.image} alt={`${client.firstName} ${client.lastName}`} className="cm__detail-avatar" />
            ) : (
              <div className="cm__detail-avatar-fallback">
                {client.firstName[0]}
              </div>
            )}
          </div>
          <div className="cm__detail-title-group">
            <div className="cm__detail-name-row">
              <h2 className="cm__detail-name">{client.firstName} {client.lastName}</h2>
            </div>
            {(sportName || teamName || groupName) && (
              <p className="cm__detail-meta-text">
                {[sportName, teamName].filter(Boolean).join(' · ')}
                {groupName && (sportName || teamName) ? ' · ' : ''}
                {groupName && <strong>{groupName}</strong>}
              </p>
            )}

            {/* Asignación de entrenador: solo el owner puede cambiarla */}
            {isOwner ? (
              <div className="cm__coach-assign">
                <label className="cm__coach-assign-label" htmlFor="cm-coach-select">
                  Entrenador asignado
                </label>
                <select
                  id="cm-coach-select"
                  className="el__input el__input--select cm__coach-assign-select"
                  value={client.coachId || ''}
                  onChange={e => handleAssignCoach(e.target.value)}
                  disabled={savingCoach}
                >
                  <option value="">— Sin asignar —</option>
                  {coaches.map(c => (
                    <option key={c.uid || c.id} value={c.uid || c.id}>
                      {c.fullName || c.email}{c.role === 'owner' ? ' (owner)' : ''}
                    </option>
                  ))}
                </select>
                {savingCoach && <span className="cm__coach-assign-hint">Guardando…</span>}
                {coachError && <span className="cm__coach-assign-error">{coachError}</span>}
              </div>
            ) : null}
          </div>
        </div>

        <div className="cm__detail-actions">
          <button className="el__btn el__btn--ghost" onClick={() => onEdit(client)} aria-label="Editar deportista">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar perfil
          </button>
          <button className="el__btn el__btn--ghost" style={{ color: '#e53e3e', borderColor: '#fbc2c2' }} onClick={() => onDelete(client)} aria-label="Eliminar definitivamente">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
            Eliminar
          </button>
          <button className="el__btn el__btn--primary" onClick={onClose} aria-label="Volver al listado">
            Volver
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="cm__detail-tabs">
        <button className={`cm__detail-tab-btn ${activeTab === 'info' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('info')}>
          Información
        </button>
        <button className={`cm__detail-tab-btn ${activeTab === 'assessments' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('assessments')}>
          Valoraciones
        </button>
        <button className={`cm__detail-tab-btn ${activeTab === 'analytics' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('analytics')}>
          Analítica de Ejercicios
        </button>
        <button className={`cm__detail-tab-btn ${activeTab === 'workouts' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('workouts')}>
          Historial Entrenamientos
        </button>
        <button className={`cm__detail-tab-btn ${activeTab === 'programs' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('programs')}>
          Programas
        </button>
        <button className={`cm__detail-tab-btn ${activeTab === 'calendar' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('calendar')}>
          Calendario
        </button>
        <button className={`cm__detail-tab-btn ${activeTab === 'payments' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('payments')}>
          Pagos
        </button>
        <button className={`cm__detail-tab-btn ${activeTab === 'notes' ? 'cm__detail-tab-btn--active' : ''}`} onClick={() => setActiveTab('notes')}>
          Notas Privadas ({notes.length})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="cm__detail-tab-content">
        {activeTab === 'info' && (
          <div className="cm__info-grid">
            <div className="cm__info-card">
              <h3 className="cm__info-card-title">Datos Personales</h3>
              <div className="cm__info-list">
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Fecha de Nacimiento:</span>
                  <span className="cm__info-item-value">{client.birthDate || 'No declarada'}</span>
                </div>
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Edad calculada:</span>
                  <span className="cm__info-item-value">{age ? `${age} años` : 'N/A'}</span>
                </div>
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Sexo:</span>
                  <span className="cm__info-item-value" style={{ textTransform: 'capitalize' }}>
                    {client.gender === 'male' ? 'Masculino' : client.gender === 'female' ? 'Femenino' : 'Otro'}
                  </span>
                </div>
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Teléfono:</span>
                  <span className="cm__info-item-value">{client.phone || 'N/A'}</span>
                </div>
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Email:</span>
                  <span className="cm__info-item-value">{client.email || 'N/A'}</span>
                </div>
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Cuenta de acceso:</span>
                  <span className="cm__info-item-value">
                    {client.linkedUserId
                      ? (linkedAccount
                          ? <span className="cm__linked-account">✅ {linkedAccount.email}</span>
                          : 'Vinculada')
                      : <span className="cm__linked-none">Sin vincular</span>}
                  </span>
                </div>
                <div className="cm__info-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  <span className="cm__info-item-label">Observaciones Generales:</span>
                  <span className="cm__info-item-value" style={{ textAlign: 'left', fontWeight: 'normal', color: 'var(--gray-600)', marginTop: '4px' }}>
                    {client.generalNotes || 'Sin observaciones.'}
                  </span>
                </div>
              </div>
            </div>

            <div className="cm__info-card">
              <h3 className="cm__info-card-title">Ficha Deportiva</h3>
              <div className="cm__info-list">
                {datosDeportivos.map(([etiqueta, valor]) => (
                  <div className="cm__info-item" key={etiqueta}>
                    <span className="cm__info-item-label">{etiqueta}:</span>
                    <span className="cm__info-item-value">{valor}</span>
                  </div>
                ))}
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Altura:</span>
                  <span className="cm__info-item-value">{client.height ? `${client.height} cm` : 'N/A'}</span>
                </div>
                <div className="cm__info-item">
                  <span className="cm__info-item-label">Peso Corporal:</span>
                  <span className="cm__info-item-value">{client.weight ? `${client.weight} kg` : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assessments' && (
          <AssessmentTab clientId={client.id} />
        )}

        {activeTab === 'analytics' && (
          <div className="cm__analytics">
            <div className="el__card" style={{ padding: '20px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.125rem' }}>Filtros de Analítica</h3>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label className="el__label">Ejercicio</label>
                  <select 
                    className="el__select"
                    value={selectedExerciseId}
                    onChange={(e) => setSelectedExerciseId(e.target.value)}
                  >
                    <option value="">Selecciona un ejercicio...</option>
                    {exercisesList.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.name} ({ex.type})</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label className="el__label">Periodo de Tiempo</label>
                  <select 
                    className="el__select"
                    value={analyticsPeriod}
                    onChange={(e) => setAnalyticsPeriod(e.target.value)}
                  >
                    <option value="">Histórico Total</option>
                    <option value="30">Últimos 30 días</option>
                    <option value="180">Últimos 6 meses</option>
                  </select>
                </div>
              </div>
            </div>

            {exerciseAnalyticsData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Récords Personales */}
                <div className="el__card" style={{ padding: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap', backgroundColor: 'var(--off-white)' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Carga Máxima Absoluta</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                      {exerciseAnalyticsData.records.maxLoad.value > 0 ? `${exerciseAnalyticsData.records.maxLoad.value.toFixed(1)} kg` : '-'}
                    </div>
                  </div>
                  {exerciseAnalyticsData.analyticalType === 'strength' && (
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Mejor 1RM Estimado</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                        {exerciseAnalyticsData.records.max1RM.value > 0 ? `${exerciseAnalyticsData.records.max1RM.value.toFixed(1)} kg` : '-'}
                      </div>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Volumen Máx. Sesión</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                      {exerciseAnalyticsData.records.maxVolume.value > 0 ? `${exerciseAnalyticsData.records.maxVolume.value.toFixed(1)} ${exerciseAnalyticsData.analyticalType === 'duration' ? 's' : exerciseAnalyticsData.analyticalType === 'distance' ? 'm' : 'kg'}` : '-'}
                    </div>
                  </div>
                  {exerciseAnalyticsData.analyticalType === 'distance' && (
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Distancia Máxima</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                        {exerciseAnalyticsData.records.maxDistance.value > 0 ? `${exerciseAnalyticsData.records.maxDistance.value.toFixed(1)} m` : '-'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Historial Evolutivo */}
                <div className="el__card" style={{ padding: '20px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '1.125rem' }}>Evolución Cronológica</h3>
                  {exerciseAnalyticsData.history.length === 0 ? (
                    <p style={{ color: 'var(--gray-500)' }}>No hay datos registrados en el periodo para este ejercicio.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="el__table" style={{ minWidth: '600px' }}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Volumen Total</th>
                            {exerciseAnalyticsData.analyticalType === 'strength' && <th>Carga Máx.</th>}
                            {exerciseAnalyticsData.analyticalType === 'strength' && <th>1RM Est.</th>}
                            {exerciseAnalyticsData.analyticalType === 'distance' && <th>Distancia Máx.</th>}
                            <th>RPE Sesión</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exerciseAnalyticsData.history.map((h, i) => {
                            const showVarVol = h.varVolume !== null && Math.abs(h.varVolume) > 0.01;
                            const showVar1RM = h.var1RM !== null && Math.abs(h.var1RM) > 0.01;
                            return (
                              <tr key={i}>
                                <td>{formatDate(h.date)}</td>
                                <td>
                                  {h.volume > 0 ? h.volume.toFixed(1) : '-'}
                                  {showVarVol && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: h.varVolume > 0 ? 'var(--green)' : 'var(--red)' }}>
                                      ({h.varVolume > 0 ? '+' : ''}{h.varVolume.toFixed(1)}{h.pctVolume !== null ? ` | ${h.pctVolume > 0 ? '+' : ''}${h.pctVolume.toFixed(1)}%` : ''})
                                    </span>
                                  )}
                                </td>
                                {exerciseAnalyticsData.analyticalType === 'strength' && <td>{h.maxLoad > 0 ? h.maxLoad.toFixed(1) : '-'}</td>}
                                {exerciseAnalyticsData.analyticalType === 'strength' && (
                                  <td>
                                    {h.max1RM > 0 ? h.max1RM.toFixed(1) : '-'}
                                    {showVar1RM && (
                                      <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: h.var1RM > 0 ? 'var(--green)' : 'var(--red)' }}>
                                        ({h.var1RM > 0 ? '+' : ''}{h.var1RM.toFixed(1)}{h.pct1RM !== null ? ` | ${h.pct1RM > 0 ? '+' : ''}${h.pct1RM.toFixed(1)}%` : ''})
                                      </span>
                                    )}
                                  </td>
                                )}
                                {exerciseAnalyticsData.analyticalType === 'distance' && <td>{h.maxDistance > 0 ? h.maxDistance.toFixed(1) : '-'}</td>}
                                <td>{h.rpe ? `${h.rpe}/10` : '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {activeTab === 'workouts' && (
          <div className="cm__workouts-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {results.filter(r => r.status === 'completed' || r.status === 'submitted').sort((a, b) => new Date(b.performedAt || b.createdAt) - new Date(a.performedAt || a.createdAt)).map(res => {
              const assign = workouts.find(w => w.id === res.workoutAssignmentId);
              const isFree = !assign;
              
              return (
                <div key={res.id} className="el__card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>
                        {isFree ? `🌟 ${res.freeSessionTitle || 'Sesión Libre'} (${res.freeSessionActivityType})` : (assign?.plannedSnapshot?.name || 'Sesión Programada')}
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        📅 Completado el {formatDate(res.performedAt || res.createdAt)}
                        {res.durationMinutes ? ` · ${res.durationMinutes} min` : ''}
                      </span>
                    </div>
                  </div>
                  
                  {/* Feedback del entrenador */}
                  <div style={{ marginTop: '12px', padding: '12px', background: 'var(--off-white)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.8125rem', color: 'var(--gray-800)' }}>🗣️ Feedback del Entrenador</h5>
                    
                    {editingFeedbackId === res.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <textarea
                          className="el__input el__input--textarea"
                          rows="3"
                          value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)}
                          placeholder="Escribe el feedback cualitativo para el cliente..."
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button className="el__btn el__btn--ghost" onClick={() => setEditingFeedbackId(null)} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Cancelar</button>
                          <button className="el__btn el__btn--primary" onClick={() => handleSaveFeedback(res.id)} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {res.coachFeedback ? (
                          <>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.875rem', color: 'var(--gray-700)' }}>{res.coachFeedback}</p>
                            <button className="el__btn el__btn--ghost" onClick={() => { setEditingFeedbackId(res.id); setFeedbackText(res.coachFeedback); }} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                              ✎ Editar Feedback
                            </button>
                          </>
                        ) : (
                          <button className="el__btn el__btn--ghost" onClick={() => { setEditingFeedbackId(res.id); setFeedbackText(''); }} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                            + Añadir Feedback
                          </button>
                        )}
                        {res.reviewedAt && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray-400)', marginTop: '8px' }}>
                            Revisado el: {formatDateTime(res.reviewedAt)}
                            {res.coachFeedbackUpdatedAt && res.coachFeedbackUpdatedAt !== res.reviewedAt && ` (Editado: ${formatDateTime(res.coachFeedbackUpdatedAt)})`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {results.filter(r => r.status === 'completed' || r.status === 'submitted').length === 0 && (
              <div className="cm__placeholder">
                <p>Este cliente no tiene sesiones completadas.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'programs' && (
          <div className="cm__placeholder">
            <h4 className="cm__placeholder-title">Sin programas asignados</h4>
            <p className="cm__placeholder-desc">
              No hay planes de larga duración vinculados. La asignación masiva de programas se implementará en la **Fase 6**.
            </p>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="cm__detail-section">
            <ClientCalendarTab clientId={client.id} />
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="cm__placeholder">
            <h4 className="cm__placeholder-title">Gestión de pagos</h4>
            <p className="cm__placeholder-desc">
              Historial de suscripciones y facturación del deportista.
            </p>
          </div>
        )}

        {/* Notas Privadas */}
        {activeTab === 'notes' && (
          <div>
            <div className="cm__notes-timeline">
              {notes.length === 0 ? (
                <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem', textAlign: 'center', padding: '24px 0' }}>
                  No hay anotaciones privadas guardadas para este cliente.
                </p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="cm__note-card">
                    <div className="cm__note-header">
                      <span className="cm__note-date">
                        Creado: {formatDateTime(note.createdAt)}
                        {note.updatedAt !== note.createdAt && ` (Modificado: ${formatDateTime(note.updatedAt)})`}
                      </span>
                      <div className="cm__note-actions">
                        <button
                          className="el__cat-action-btn el__cat-action-btn--cancel"
                          style={{ width: '24px', height: '24px', borderWidth: '1px' }}
                          title="Editar nota"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditNoteText(note.text);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          className="el__cat-action-btn el__cat-action-btn--cancel"
                          style={{ width: '24px', height: '24px', borderColor: '#fcc', color: '#e53e3e' }}
                          title="Eliminar nota"
                          onClick={() => handleDeleteNote(note.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {editingNoteId === note.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                        <textarea
                          className="el__input el__input--textarea"
                          value={editNoteText}
                          onChange={e => setEditNoteText(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button className="el__btn el__btn--ghost" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setEditingNoteId(null)}>
                            Cancelar
                          </button>
                          <button className="el__btn el__btn--primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleSaveEditNote(note.id)}>
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="cm__note-text">{note.text}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddNote} className="cm__note-form">
              <h4 style={{ fontSize: '0.8125rem', fontWeight: '700', color: 'var(--gray-800)' }}>Nueva anotación (Solo visible para ti)</h4>
              <textarea
                className="el__input el__input--textarea"
                placeholder="Escribe comentarios de rendimiento, historial médico o apuntes sobre cargas de entrenamiento..."
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                required
              />
              <button type="submit" className="el__btn el__btn--primary" style={{ alignSelf: 'flex-end' }}>
                Añadir Nota
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Componente Principal (ClientManager) ────────────────── */
export default function ClientManager() {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';

  const [clients, setClients] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sports, setSports] = useState([]);
  const [teams, setTeams] = useState([]);

  /* Búsqueda, filtros y ordenación */
  const [search, setSearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('Todos');
  const [selectedSportFilter, setSelectedSportFilter] = useState('Todos');
  const [selectedCoachFilter, setSelectedCoachFilter] = useState('Todos');
  const [sortOrder, setSortOrder] = useState('name-asc');

  /* Enrutamiento SPA interno */
  const [selectedClientId, setSelectedClientId] = useState(null);

  /* Modales */
  const [showModal, setShowModal] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deletingClient, setDeletingClient] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState('');

  /* Formulario deportista */
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'male',
    phone: '',
    email: '',
    height: '',
    weight: '',
    sportId: '',
    teamId: '',
    groupId: '',
    image: '',
    generalNotes: ''
  });
  const [formError, setFormError] = useState('');

  // Carga inicial
  async function loadData() {
    const dbClients = await storage.getClients();
    const dbGroups = await storage.getEntities(KEYS.GROUPS);
    const dbSports = await storage.getEntities(KEYS.SPORTS);
    const dbTeams = await storage.getEntities(KEYS.TEAMS);

    setClients(dbClients);
    setGroups(dbGroups);
    if (isOwner) {
      storage.getCoaches().then(setCoaches).catch(err => console.error('Error cargando entrenadores', err));
    }
    setSports(dbSports);
    setTeams(dbTeams);
  }

  useEffect(() => {
    loadData();
  }, [isOwner]);

  // Color estable por entrenador, el mismo que usa el calendario
  const coachColors = useMemo(
    () => buildCoachColorMap(coaches.map(c => c.uid || c.id)),
    [coaches]
  );

  const coachName = (coachId) => {
    if (!coachId) return null;
    const c = coaches.find(x => String(x.uid || x.id) === String(coachId));
    return c ? (c.fullName || c.email) : 'Entrenador';
  };

  // Deportes dinámicos para filtros
  const dynamicSports = useMemo(() => {
    const list = sports.map(s => s.name);
    return ['Todos', ...new Set(list)];
  }, [sports]);

  // Limpiar filtros
  const handleClearFilters = () => {
    setSearch('');
    setSelectedGroupFilter('Todos');
    setSelectedSportFilter('Todos');
    setSelectedCoachFilter('Todos');
    setSelectedStatusFilter('active');
    setSortOrder('name-asc');
  };

  /* ── Lista de clientes filtrada ── */
  const filteredClients = useMemo(() => {
    let result = clients;

    // 1. Buscador
    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(c => {
        const fName = stripAccents(c.firstName).includes(query);
        const lName = stripAccents(c.lastName).includes(query);
        const emailMatch = stripAccents(c.email).includes(query);

        const sport = sports.find(s => s.id === c.sportId);
        const sportMatch = sport && stripAccents(sport.name).includes(query);

        const team = teams.find(t => t.id === c.teamId);
        const teamMatch = team && stripAccents(team.name).includes(query);

        const group = groups.find(g => g.id === c.groupId);
        const groupMatch = group && stripAccents(group.name).includes(query);

        return fName || lName || emailMatch || sportMatch || teamMatch || groupMatch;
      });
    }

    // 2. Filtro Grupo
    if (selectedGroupFilter !== 'Todos') {
      result = result.filter(c => {
        if (selectedGroupFilter === 'none') return c.groupId === null;
        return String(c.groupId) === String(selectedGroupFilter);
      });
    }

    // 3. Filtro Deporte
    if (selectedSportFilter !== 'Todos') {
      result = result.filter(c => {
        const sport = sports.find(s => s.id === c.sportId);
        return sport && sport.name === selectedSportFilter;
      });
    }

    // 4. Filtro Entrenador
    if (selectedCoachFilter !== 'Todos') {
      if (selectedCoachFilter === 'none') {
        result = result.filter(c => !c.coachId);
      } else {
        result = result.filter(c => String(c.coachId) === String(selectedCoachFilter));
      }
    }

    // 5. Ordenación
    const sorted = [...result];
    if (sortOrder === 'name-asc') {
      sorted.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    } else if (sortOrder === 'name-desc') {
      sorted.sort((a, b) => `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`));
    } else if (sortOrder === 'newest') {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    return sorted;
  }, [clients, search, selectedGroupFilter, selectedSportFilter, selectedCoachFilter, sortOrder, sports, teams, groups]);

  /* ── Procesamiento de Foto con Canvas y Fondo Blanco ── */
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona una imagen válida.');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      alert('La imagen original excede los 4MB. Elige un archivo más liviano.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIDE = 800;

        if (width > height) {
          if (width > MAX_SIDE) {
            height *= MAX_SIDE / width;
            width = MAX_SIDE;
          }
        } else {
          if (height > MAX_SIDE) {
            width *= MAX_SIDE / height;
            height = MAX_SIDE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Fondo blanco neutro para transparencias
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        setForm(f => ({ ...f, image: compressed }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  /* ── Guardar Cliente ── */
  async function handleSubmitClient(e) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError('El nombre y los apellidos son obligatorios.');
      return;
    }

    const clientData = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      birthDate: form.birthDate,
      gender: form.gender,
      phone: form.phone.trim(),
      email: form.email.trim(),
      height: form.height ? Number(form.height) : null,
      weight: form.weight ? Number(form.weight) : null,
      sportId: form.sportId ? String(form.sportId) : null,
      teamId: form.teamId ? String(form.teamId) : null,
      groupId: form.groupId ? String(form.groupId) : null,
      image: form.image,
      generalNotes: form.generalNotes.trim()
    };

    if (editingClient) {
      clientData.id = editingClient.id;
      clientData.createdAt = editingClient.createdAt;
    }

    try {
      const saved = await storage.saveClient(clientData);
      setClients(prev => {
        if (editingClient) {
          return prev.map(c => c.id === saved.id ? saved : c);
        } else {
          return [...prev, saved];
        }
      });
      handleCloseModal();
    } catch (err) {
      console.error(err);
      alert("No se ha podido guardar la imagen en local por falta de espacio. Se conservaron los datos del formulario.");
    }
  }

  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setForm({
      firstName: '',
      lastName: '',
      birthDate: '',
      gender: 'male',
      phone: '',
      email: '',
      height: '',
      weight: '',
      sportId: sports[0]?.id || '',
      teamId: teams[0]?.id || '',
      groupId: '',
      image: '',
      generalNotes: ''
    });
    setFormError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (c) => {
    setEditingClient(c);
    setForm({
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      birthDate: c.birthDate || '',
      gender: c.gender || 'male',
      phone: c.phone || '',
      email: c.email || '',
      height: c.height || '',
      weight: c.weight || '',
      sportId: c.sportId || '',
      teamId: c.teamId || '',
      groupId: c.groupId || '',
      image: c.image || '',
      generalNotes: c.generalNotes || ''
    });
    setFormError('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingClient(null);
    setFormError('');
  };

  const handleDeleteClientClick = (c) => {
    setDeletingClient(c);
    setConfirmDeleteName('');
  };

  const handleConfirmDelete = async () => {
    if (!deletingClient) return;
    if (confirmDeleteName.trim().toLowerCase() !== deletingClient.firstName.trim().toLowerCase()) {
      alert("Para confirmar, debes escribir exactamente el nombre del cliente.");
      return;
    }

    await storage.deleteClient(deletingClient.id);
    setClients(prev => prev.filter(c => c.id !== deletingClient.id));
    
    if (selectedClientId === deletingClient.id) {
      setSelectedClientId(null);
    }
    setDeletingClient(null);
  };

  return (
    <section className="cm" aria-label="Gestor de Clientes">
      
      {selectedClientId ? (
        <ClientDetail
          clientId={selectedClientId}
          onClose={() => setSelectedClientId(null)}
          onEdit={handleOpenEditModal}
          onDelete={handleDeleteClientClick}
          groups={groups}
          sports={sports}
          teams={teams}
        />
      ) : (
        <>
          <header className="cm__header">
            <div className="el__title-group">
              <h1 className="cm__title">Clientes</h1>
              <p className="cm__subtitle">
                Gestiona y revisa los datos de tus deportistas y grupos de entrenamiento.
              </p>
            </div>

            <div className="cm__header-actions">
              <button className="el__btn el__btn--ghost" onClick={() => setShowEntityModal(true)} title="Gestionar grupos, deportes, clubes y categorías">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                Gestionar Entidades
              </button>
              <button className="el__btn el__btn--primary" onClick={handleOpenCreateModal} title="Registrar deportista nuevo">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Añadir Cliente
              </button>
            </div>
          </header>

          {/* Filtros */}
          <div className="cm__toolbar">
            <div className="cm__search-wrap">
              <svg className="cm__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                className="cm__search"
                placeholder="Buscar por nombre, posición, nivel, deporte o grupo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Buscar clientes"
              />
              {search && (
                <button className="cm__search-clear" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
                  ✕
                </button>
              )}
            </div>

            <div className="cm__select-wrap">
              <select className="cm__select" value={selectedGroupFilter} onChange={e => setSelectedGroupFilter(e.target.value)} aria-label="Filtrar por grupo">
                <option value="Todos">Grupo: Todos</option>
                <option value="none">Sin grupo</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="cm__select-wrap">
              <select className="cm__select" value={selectedSportFilter} onChange={e => setSelectedSportFilter(e.target.value)} aria-label="Filtrar por deporte">
                {dynamicSports.map(s => (
                  <option key={s} value={s}>{s === 'Todos' ? 'Deporte: Todos' : s}</option>
                ))}
              </select>
            </div>

            {isOwner && (
              <div className="cm__select-wrap">
                <select className="cm__select" value={selectedCoachFilter} onChange={e => setSelectedCoachFilter(e.target.value)} aria-label="Filtrar por entrenador">
                  <option value="Todos">Entrenador: Todos</option>
                  {coaches.map(c => (
                    <option key={c.uid || c.id} value={c.uid || c.id}>{c.fullName || c.email}</option>
                  ))}
                  <option value="none">Sin entrenador</option>
                </select>
              </div>
            )}

            <div className="cm__select-wrap">
              <select className="cm__select" value={sortOrder} onChange={e => setSortOrder(e.target.value)} aria-label="Ordenar listado">
                <option value="name-asc">Nombre (A-Z)</option>
                <option value="name-desc">Nombre (Z-A)</option>
                <option value="newest">Más reciente</option>
              </select>
            </div>

            {(search || selectedGroupFilter !== 'Todos' || selectedSportFilter !== 'Todos' || selectedCoachFilter !== 'Todos' || sortOrder !== 'name-asc') && (
              <button className="el__btn el__btn--ghost" onClick={handleClearFilters} style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
                Limpiar filtros
              </button>
            )}
          </div>

          <div style={{ marginBottom: '16px', fontSize: '0.8125rem', color: 'var(--gray-400)' }}>
            Mostrando <strong>{filteredClients.length}</strong> de {clients.length} clientes.
          </div>

          {/* Tarjetas */}
          {filteredClients.length === 0 ? (
            <div className="cm__empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              <p>No se encontraron clientes.</p>
              <span>Prueba a limpiar filtros o añade un deportista nuevo.</span>
            </div>
          ) : (
            <div className="cm__grid" role="list">
              {filteredClients.map(c => {
                // Solo se muestra lo que el deportista tenga realmente
                // asignado: no todos tienen deporte, equipo o grupo.
                const sportName = sports.find(s => String(s.id) === String(c.sportId))?.name;
                const teamName = teams.find(t => String(t.id) === String(c.teamId))?.name;
                const groupName = groups.find(g => String(g.id) === String(c.groupId))?.name;
                const subtitulo = [sportName, teamName].filter(Boolean).join(' · ');
                
                return (
                  <article key={c.id} className="cm__card" onClick={() => setSelectedClientId(c.id)} role="listitem">
                    <div className="cm__card-avatar-wrap">
                      {c.image ? (
                        <img src={c.image} alt={c.firstName} className="cm__card-avatar" />
                      ) : (
                        <div className="cm__card-avatar-fallback">
                          {c.firstName[0]}
                        </div>
                      )}
                    </div>
                    
                    <h3 className="cm__card-name">{c.firstName} {c.lastName}</h3>
                    {subtitulo && <p className="cm__card-sport">{subtitulo}</p>}

                    {groupName && (
                      <div className="cm__card-badges">
                        <span className="badge badge--default" style={{ fontSize: '0.625rem' }}>{groupName}</span>
                      </div>
                    )}

                    {isOwner && (
                      <span className="cm__card-coach">
                        <span
                          className="cm__card-coach-dot"
                          style={{ backgroundColor: c.coachId ? (coachColors[String(c.coachId)] || SIN_ENTRENADOR_COLOR) : SIN_ENTRENADOR_COLOR }}
                        />
                        {coachName(c.coachId) || 'Sin entrenador'}
                      </span>
                    )}

                    <button className="el__btn el__btn--ghost el__card-btn" onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClientId(c.id);
                    }}>
                      Ver Ficha
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══ MODAL ÚNICO: CREAR / EDITAR CLIENTE ═══════════════ */}
      {showModal && (
        <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && handleCloseModal()}>
          <div className="el__modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="el__modal-header">
              <h2 className="el__modal-title">{editingClient ? 'Editar Perfil del Cliente' : 'Registrar Nuevo Cliente'}</h2>
              <button className="el__modal-close" onClick={handleCloseModal} aria-label="Cerrar modal">
                ✕
              </button>
            </div>

            <form className="el__modal-form" onSubmit={handleSubmitClient} noValidate>
              
              {/* Nombre y Apellidos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="el__field">
                  <label htmlFor="form-firstname" className="el__label">Nombre *</label>
                  <input
                    id="form-firstname"
                    type="text"
                    className={`el__input ${formError ? 'el__input--error' : ''}`}
                    placeholder="ej. Aitor"
                    value={form.firstName}
                    onChange={e => { setForm(f => ({ ...f, firstName: e.target.value })); setFormError(''); }}
                    required
                    autoFocus
                  />
                </div>
                <div className="el__field">
                  <label htmlFor="form-lastname" className="el__label">Apellidos *</label>
                  <input
                    id="form-lastname"
                    type="text"
                    className={`el__input ${formError ? 'el__input--error' : ''}`}
                    placeholder="ej. García"
                    value={form.lastName}
                    onChange={e => { setForm(f => ({ ...f, lastName: e.target.value })); setFormError(''); }}
                    required
                  />
                </div>
              </div>
              {formError && <p className="el__field-error">{formError}</p>}

              {/* Fecha Nacimiento y Sexo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="el__field">
                  <label htmlFor="form-birthdate" className="el__label">Fecha de Nacimiento</label>
                  <input
                    id="form-birthdate"
                    type="date"
                    className="el__input"
                    value={form.birthDate}
                    onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                  />
                </div>
                <div className="el__field">
                  <label htmlFor="form-gender" className="el__label">Sexo</label>
                  <select
                    id="form-gender"
                    className="el__input el__input--select"
                    value={form.gender}
                    onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                  >
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
              </div>

              {/* Teléfono y Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '12px' }}>
                <div className="el__field">
                  <label htmlFor="form-phone" className="el__label">Teléfono</label>
                  <input
                    id="form-phone"
                    type="tel"
                    className="el__input"
                    placeholder="600112233"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="el__field">
                  <label htmlFor="form-email" className="el__label">Correo Electrónico</label>
                  <input
                    id="form-email"
                    type="email"
                    className="el__input"
                    placeholder="ejemplo@correo.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>

              {/* Altura y Peso */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="el__field">
                  <label htmlFor="form-height" className="el__label">Altura (cm)</label>
                  <input
                    id="form-height"
                    type="number"
                    className="el__input"
                    placeholder="180"
                    value={form.height}
                    onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                  />
                </div>
                <div className="el__field">
                  <label htmlFor="form-weight" className="el__label">Peso Corporal (kg)</label>
                  <input
                    id="form-weight"
                    type="number"
                    className="el__input"
                    placeholder="75"
                    step="0.1"
                    value={form.weight}
                    onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                  />
                </div>
              </div>

              {/* Deporte, Club y Grupo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="el__field">
                  <label htmlFor="form-sport" className="el__label">Deporte</label>
                  <select
                    id="form-sport"
                    className="el__input el__input--select"
                    value={form.sportId}
                    onChange={e => setForm(f => ({ ...f, sportId: e.target.value }))}
                  >
                    <option value="">Sin deporte</option>
                    {sports.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="el__field">
                  <label htmlFor="form-team" className="el__label">Equipo / Club</label>
                  <select
                    id="form-team"
                    className="el__input el__input--select"
                    value={form.teamId}
                    onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))}
                  >
                    <option value="">Sin equipo</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="el__field">
                  <label htmlFor="form-group" className="el__label">Grupo</label>
                  <select
                    id="form-group"
                    className="el__input el__input--select"
                    value={form.groupId}
                    onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))}
                  >
                    <option value="">Sin grupo</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Observaciones generales */}
              <div className="el__field">
                <label htmlFor="form-notes" className="el__label">Observaciones Generales</label>
                <textarea
                  id="form-notes"
                  className="el__input el__input--textarea"
                  placeholder="Observaciones de salud, lesiones o aptitudes generales..."
                  rows="3"
                  value={form.generalNotes}
                  onChange={e => setForm(f => ({ ...f, generalNotes: e.target.value }))}
                />
              </div>

              {/* Foto de Perfil */}
              <div className="el__field">
                <label htmlFor="form-photo" className="el__label">Foto de Perfil</label>
                <input
                  id="form-photo"
                  type="file"
                  accept="image/*"
                  className="el__input el__input--file"
                  onChange={handleImageChange}
                />
                {form.image && (
                  <div className="el__img-preview-wrap">
                    <img src={form.image} className="el__img-preview" alt="Vista previa de perfil" />
                    <button
                      type="button"
                      className="el__img-preview-remove"
                      onClick={() => setForm(f => ({ ...f, image: '' }))}
                    >
                      Eliminar foto
                    </button>
                  </div>
                )}
              </div>

              <div className="el__modal-actions">
                <button type="button" className="el__btn el__btn--ghost" onClick={handleCloseModal}>
                  Cancelar
                </button>
                <button type="submit" className="el__btn el__btn--primary">
                  {editingClient ? 'Guardar Cambios' : 'Registrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ MODAL DE ELIMINACIÓN DEFINITIVA EXPLÍCITA ══════ */}
      {deletingClient && (
        <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeletingClient(null)}>
          <div className="el__modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="el__modal-header" style={{ borderBottom: 'none', paddingBottom: '10px' }}>
              <h2 className="el__modal-title" style={{ color: '#e53e3e' }}>¿Eliminar definitivamente?</h2>
            </div>
            
            <div className="el__modal-body" style={{ padding: '0 24px 16px', fontSize: '0.8125rem', color: 'var(--gray-600)', lineHeight: '1.5' }}>
              <p>
                Estás a punto de borrar definitivamente la ficha de <strong>"{deletingClient.firstName} {deletingClient.lastName}"</strong>.
                Esta acción es **irreversible** y destruirá todas sus notas privadas.
              </p>
              
              <div className="el__field">
                <label className="el__label" htmlFor="confirm-del-name">
                  Escribe el primer nombre del deportista (<strong>{deletingClient.firstName}</strong>) para confirmar:
                </label>
                <input
                  id="confirm-del-name"
                  type="text"
                  className="el__input"
                  placeholder="Escribe el nombre aquí..."
                  value={confirmDeleteName}
                  onChange={e => setConfirmDeleteName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="el__modal-actions" style={{ padding: '0 24px 24px', borderTop: 'none' }}>
              <button className="el__btn el__btn--ghost" onClick={() => setDeletingClient(null)}>Cancelar</button>
              <button
                className="el__btn el__btn--primary"
                style={{ 
                  background: '#e53e3e', 
                  boxShadow: 'none',
                  opacity: confirmDeleteName.trim().toLowerCase() === deletingClient.firstName.trim().toLowerCase() ? 1 : 0.4,
                  pointerEvents: confirmDeleteName.trim().toLowerCase() === deletingClient.firstName.trim().toLowerCase() ? 'auto' : 'none'
                }}
                onClick={handleConfirmDelete}
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE GESTIÓN DE ENTIDADES UNIFICADO ═══════════ */}
      {showEntityModal && (
        <GlobalCatalogModal
          contextKeys={[KEYS.SPORTS, KEYS.TEAMS, KEYS.GROUPS]}
          initialActiveKey={KEYS.SPORTS}
          onClose={() => {
            setShowEntityModal(false);
            loadData();
          }}
          onRefresh={loadData}
        />
      )}

    </section>
  );
}
