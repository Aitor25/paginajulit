import React, { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { CalendarGrid } from './CalendarGrid';
import { CalendarWeek } from './CalendarWeek';
import { RescheduleModal } from './RescheduleModal';
import WorkoutAssignmentModal from './WorkoutAssignmentModal';
import AssignmentDetailModal from './AssignmentDetailModal';

export const ClientCalendarTab = ({ clientId, readOnly = false, onReadOnlyEventClick = null }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null); // Para reprogramar (Coach)
  const [detailEvent, setDetailEvent] = useState(null);     // Para detalles (Ambos)
  const [quickAssignDate, setQuickAssignDate] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
      const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

      await storage.syncMissedAssignments();
      const evs = await storage.getCalendarEvents({
        startDate: firstDay,
        endDate: lastDay,
        clientId: clientId,
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
  }, [currentDate, clientId]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleRescheduleSave = async (assignmentId, newDateStr) => {
    await storage.rescheduleWorkoutAssignment(assignmentId, newDateStr);
    setSelectedEvent(null);
    loadData();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0 }}>Calendario Individual</h3>

        <div style={{ display: 'flex', gap: '8px' }}>
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
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={handlePrevMonth}>&lt;</button>
          <button className="btn btn-secondary btn-sm" onClick={handleToday}>Hoy</button>
          <button className="btn btn-secondary btn-sm" onClick={handleNextMonth}>&gt;</button>
          <span style={{ minWidth: '150px', textAlign: 'center', fontWeight: 'bold' }}>
            {viewMode === 'month' 
              ? currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
              : `Semana del ${currentDate.getDate()} ${currentDate.toLocaleDateString('es-ES', { month: 'short' })}`
            }
          </span>
        </div>
      </div>

      {loading ? (
        <div className="cm__placeholder">Cargando calendario...</div>
      ) : viewMode === 'month' ? (
        <CalendarGrid 
          currentDate={currentDate} 
          events={events} 
          onDateClick={dateStr => !readOnly && setQuickAssignDate(dateStr)}
          onEventClick={ev => {
            if (readOnly) {
              if (ev.type === 'workout') {
                if (onReadOnlyEventClick) onReadOnlyEventClick(ev);
              } else {
                setDetailEvent(ev);
              }
            } else {
              setDetailEvent(ev);
            }
          }}
          readOnly={readOnly}
        />
      ) : (
        <CalendarWeek
          currentDateStr={currentDate.toISOString().split('T')[0]}
          events={events}
          onDateClick={dateStr => !readOnly && setQuickAssignDate(dateStr)}
          onEventClick={ev => {
            if (readOnly) {
              if (ev.type === 'workout') {
                if (onReadOnlyEventClick) onReadOnlyEventClick(ev);
              } else {
                setDetailEvent(ev);
              }
            } else {
              setDetailEvent(ev);
            }
          }}
          readOnly={readOnly}
        />
      )}

      {detailEvent && (
        <AssignmentDetailModal
          event={detailEvent}
          readOnly={readOnly}
          onClose={() => setDetailEvent(null)}
          onRescheduleClick={(ev) => setSelectedEvent(ev)}
        />
      )}

      {selectedEvent && !readOnly && (
        <RescheduleModal 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)}
          onSave={async (assignmentId, newDateStr) => {
            await handleRescheduleSave(assignmentId, newDateStr);
          }}
        />
      )}

      {quickAssignDate && !readOnly && (
        <WorkoutAssignmentModal
          initialDate={quickAssignDate}
          clientId={clientId}
          onClose={() => setQuickAssignDate(null)}
          onSave={async () => {
            setQuickAssignDate(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
};
