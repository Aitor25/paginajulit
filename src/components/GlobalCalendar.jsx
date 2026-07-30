import React, { useState, useEffect, useMemo } from 'react';
import { storage } from '../services/storage';
import { CalendarGrid, buildCoachColorMap, SIN_ENTRENADOR_COLOR } from './CalendarGrid';
import { CalendarWeek } from './CalendarWeek';
import { RescheduleModal } from './RescheduleModal';
import WorkoutAssignmentModal from './WorkoutAssignmentModal';
import AssignmentDetailModal from './AssignmentDetailModal';
import { useAuth } from '../contexts/AuthProvider';

export default function GlobalCalendar() {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [selectedClientId, setSelectedClientId] = useState('all');
  const [clients, setClients] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [selectedCoachId, setSelectedCoachId] = useState('all');
  
  const [detailEvent, setDetailEvent] = useState(null);
  const [rescheduleEvent, setRescheduleEvent] = useState(null);
  
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Nuevo estado para la creación rápida
  const [quickAssignDate, setQuickAssignDate] = useState(null);
  
  // Filtros
  const [selectedStatus, setSelectedStatus] = useState('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
      const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const allClients = await storage.getClients();
      setClients(allClients);

      if (isOwner) {
        setCoaches(await storage.getCoaches());
      }

      let statuses = null;
      if (selectedStatus) {
        statuses = [selectedStatus];
      }

      await storage.syncMissedAssignments();
      const evs = await storage.getCalendarEvents({
        startDate: firstDay,
        endDate: lastDay,
        clientId: selectedClientId || null,
        statuses: statuses,
        includeProgramMilestones: true
      });
      setEvents(evs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentDate, selectedClientId, selectedStatus, isOwner]);

  // Color estable por entrenador (solo lo usa la vista del owner)
  const coachColors = useMemo(
    () => buildCoachColorMap(coaches.map(c => c.uid || c.id)),
    [coaches]
  );

  // Filtro por entrenador, aplicado en cliente sobre los eventos ya cargados
  const visibleEvents = useMemo(() => {
    if (!isOwner || selectedCoachId === 'all') return events;
    if (selectedCoachId === 'none') return events.filter(ev => !ev.coachId);
    return events.filter(ev => String(ev.coachId) === String(selectedCoachId));
  }, [events, isOwner, selectedCoachId]);

  // Entrenadores que realmente aparecen este mes, para la leyenda
  const coachesEnLeyenda = useMemo(() => {
    if (!isOwner) return [];
    const presentes = new Map();
    let haySinAsignar = false;
    for (const ev of events) {
      if (ev.coachId) presentes.set(String(ev.coachId), ev.coachName || 'Entrenador');
      else haySinAsignar = true;
    }
    const list = [...presentes.entries()].map(([id, name]) => ({ id, name, color: coachColors[id] || SIN_ENTRENADOR_COLOR }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (haySinAsignar) list.push({ id: 'none', name: 'Sin entrenador', color: SIN_ENTRENADOR_COLOR });
    return list;
  }, [events, isOwner, coachColors]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateClick = (dateStr) => {
    setQuickAssignDate(dateStr);
  };

  const handleEventClick = (event) => {
    setDetailEvent(event);
  };

  const handleRescheduleSave = async (assignmentId, newDateStr) => {
    await storage.rescheduleWorkoutAssignment(assignmentId, newDateStr);
    setRescheduleEvent(null);
    setDetailEvent(null);
    await loadData(); // Recargar datos
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Calendario Global</h1>
          <p className="view-subtitle">Planificación multicliente y control de agenda.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          
          <div className="cal__nav">
            <button className="btn btn-secondary" onClick={handlePrevMonth}>&lt;</button>
            <button className="btn btn-secondary" onClick={handleToday}>Hoy</button>
            <button className="btn btn-secondary" onClick={handleNextMonth}>&gt;</button>
            <h2 className="cal__month-label">
              {viewMode === 'month' 
                ? currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                : `Semana del ${currentDate.getDate()} ${currentDate.toLocaleDateString('es-ES', { month: 'short' })}`
              }
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--gray-100)', padding: '4px', borderRadius: '6px' }}>
              <button
                className={`btn btn-sm ${viewMode === 'month' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('month')}
              >
                Mes
              </button>
              <button
                className={`btn btn-sm ${viewMode === 'week' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('week')}
              >
                Semana
              </button>
            </div>

            <select 
              className="form-control" 
              value={selectedClientId} 
              onChange={(e) => setSelectedClientId(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="">Todos los clientes</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
            
            <select 
              className="form-control" 
              value={selectedStatus} 
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="completed">Completado</option>
              <option value="missed">Perdido</option>
              <option value="in_progress">En progreso</option>
            </select>

            {/* Filtro por entrenador: solo tiene sentido para el owner */}
            {isOwner && (
              <select
                className="form-control"
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value)}
                aria-label="Filtrar por entrenador"
              >
                <option value="all">Todos los entrenadores</option>
                {coaches.map(c => (
                  <option key={c.uid || c.id} value={c.uid || c.id}>
                    {c.fullName || c.email}
                  </option>
                ))}
                <option value="none">Sin entrenador</option>
              </select>
            )}
          </div>
        </div>

        {/* Leyenda de colores por entrenador */}
        {isOwner && coachesEnLeyenda.length > 0 && (
          <div className="cal__legend">
            <span className="cal__legend-label">Entrenador:</span>
            {coachesEnLeyenda.map(c => (
              <span key={c.id} className="cal__legend-item">
                <span className="cal__legend-dot" style={{ backgroundColor: c.color }} />
                {c.name}
              </span>
            ))}
          </div>
        )}

        <div className="card-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Cargando calendario...</div>
          ) : viewMode === 'month' ? (
            <CalendarGrid
              currentDate={currentDate}
              events={visibleEvents}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              readOnly={false}
              colorBy={isOwner ? 'coach' : 'status'}
              coachColors={coachColors}
              showCoachName={isOwner}
            />
          ) : (
            <CalendarWeek
              currentDateStr={currentDate.toISOString().split('T')[0]}
              events={visibleEvents}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              readOnly={false}
              colorBy={isOwner ? 'coach' : 'status'}
              coachColors={coachColors}
              showCoachName={isOwner}
            />
          )}
        </div>
      </div>

      {detailEvent && (
        <AssignmentDetailModal
          event={detailEvent}
          readOnly={false}
          onClose={() => setDetailEvent(null)}
          onRescheduleClick={(ev) => setRescheduleEvent(ev)}
        />
      )}

      {rescheduleEvent && (
        <RescheduleModal
          event={rescheduleEvent}
          onClose={() => setRescheduleEvent(null)}
          onSave={handleRescheduleSave}
        />
      )}

      {quickAssignDate && (
        <WorkoutAssignmentModal
          initialDate={quickAssignDate}
          clientId={selectedClientId !== 'all' ? selectedClientId : null}
          onClose={() => setQuickAssignDate(null)}
          onSave={async () => {
            setQuickAssignDate(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
}
