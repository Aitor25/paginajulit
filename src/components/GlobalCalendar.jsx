import React, { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { CalendarGrid } from './CalendarGrid';
import { CalendarWeek } from './CalendarWeek';
import { RescheduleModal } from './RescheduleModal';
import WorkoutAssignmentModal from './WorkoutAssignmentModal';
import AssignmentDetailModal from './AssignmentDetailModal';

export default function GlobalCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [selectedClientId, setSelectedClientId] = useState('all');
  const [clients, setClients] = useState([]);
  
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
  }, [currentDate, selectedClientId, selectedStatus]);

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
    setSelectedEvent(null);
    loadData(); // Recargar datos
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
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={handlePrevMonth}>&lt;</button>
            <button className="btn btn-secondary" onClick={handleToday}>Hoy</button>
            <button className="btn btn-secondary" onClick={handleNextMonth}>&gt;</button>
            <h2 style={{ margin: '0 15px', fontSize: '1.25rem', minWidth: '180px', textAlign: 'center' }}>
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
          </div>
        </div>

        <div className="card-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Cargando calendario...</div>
          ) : viewMode === 'month' ? (
            <CalendarGrid 
              currentDate={currentDate} 
              events={events} 
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              readOnly={false}
            />
          ) : (
            <CalendarWeek
              currentDateStr={currentDate.toISOString().split('T')[0]}
              events={events}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              readOnly={false}
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
          onSave={async () => {
            setRescheduleEvent(null);
            await loadData();
          }}
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
