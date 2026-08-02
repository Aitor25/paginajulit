import React, { useMemo } from 'react';
import { SIN_ENTRENADOR_COLOR } from './CalendarGrid';
import { toDateKey } from '../utils/dateUtils';
import './CalendarGrid.css'; // Reutilizamos estilos base donde aplique

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SHORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const getStatusColor = (status, type) => {
  if (type === 'program_start' || type === 'program_end') return 'var(--purple)';
  if (type === 'free_session') return 'var(--accent)';
  switch (status) {
    case 'completed': return 'var(--green)';
    case 'missed': return 'var(--red)';
    case 'in_progress': return 'var(--yellow)';
    case 'cancelled': return 'var(--gray-500)';
    case 'pending': 
    default: return 'var(--gray-600)';
  }
};

const getStatusIcon = (status, type) => {
  if (type === 'program_start') return '🚩';
  if (type === 'program_end') return '🏁';
  if (type === 'free_session') return '🆓';
  switch (status) {
    case 'completed': return '✓';
    case 'missed': return '✗';
    case 'in_progress': return '▶';
    case 'cancelled': return '⛔';
    case 'pending': return '☐';
    default: return '•';
  }
};

export const CalendarWeek = ({
  currentDateStr,
  events = [],
  onDateClick,
  onEventClick,
  readOnly = false,
  colorBy = 'status',
  coachColors = {},
  showCoachName = false,
  // En la agenda de un solo deportista todas las sesiones son suyas.
  showClientName = true
}) => {
  const getEventColor = (ev) =>
    colorBy === 'coach'
      ? (ev.coachId ? (coachColors[String(ev.coachId)] || SIN_ENTRENADOR_COLOR) : SIN_ENTRENADOR_COLOR)
      : getStatusColor(ev.status, ev.type);

  const weekDays = useMemo(() => {
    const target = new Date(currentDateStr);
    if (isNaN(target.getTime())) return [];
    
    // JS: 0=Domingo, 1=Lunes. Queremos Lunes=0, Domingo=6
    let dayOfWeek = target.getDay() - 1;
    if (dayOfWeek === -1) dayOfWeek = 6;
    
    // Lunes de esa semana
    const monday = new Date(target);
    monday.setDate(target.getDate() - dayOfWeek);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(monday);
      current.setDate(monday.getDate() + i);
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      days.push({
        dateStr: `${y}-${m}-${d}`,
        dayNumber: current.getDate(),
        isToday: `${y}-${m}-${d}` === toDateKey(new Date())
      });
    }
    return days;
  }, [currentDateStr]);

  return (
    <div className="cal__week-wrapper">
      {/* Cabecera Desktop */}
      <div className="cal__week-header-row hidden-mobile">
        {weekDays.map((d, i) => (
          <div key={d.dateStr} className={`cal__header-cell ${d.isToday ? 'cal__header-cell--today' : ''}`}>
            <div>{DAYS_OF_WEEK[i]}</div>
            <div className="cal__week-header-date">{d.dayNumber}</div>
          </div>
        ))}
      </div>

      <div className="cal__week-grid">
        {weekDays.map((d, i) => {
          const dayEvents = events.filter(e => e.date === d.dateStr);
          
          return (
            <div 
              key={d.dateStr} 
              className={`cal__week-col ${d.isToday ? 'cal__week-col--today' : ''}`}
            >
              {/* Cabecera Mobile - Solo se ve en móvil */}
              <div 
                className="cal__week-mobile-header"
                onClick={() => {
                  if (onDateClick && !readOnly) onDateClick(d.dateStr);
                }}
                role={readOnly ? undefined : "button"}
                tabIndex={readOnly ? undefined : "0"}
                aria-label={`Añadir evento el ${d.dateStr}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (onDateClick && !readOnly) onDateClick(d.dateStr);
                  }
                }}
              >
                <div className="cal__week-mobile-day">
                  <span className="cal__week-mobile-name">{SHORT_DAYS[i]}</span>
                  <span className={`cal__week-mobile-num ${d.isToday ? 'cal__week-mobile-num--today' : ''}`}>
                    {d.dayNumber}
                  </span>
                </div>
                {!readOnly && (
                  <button 
                    className="cal__week-mobile-add" 
                    aria-label="Añadir evento"
                    tabIndex="-1"
                  >
                    +
                  </button>
                )}
              </div>

              {/* Contenedor de eventos (Desktop y Mobile) */}
              <div 
                className="cal__week-events-container"
                onClick={() => {
                  if (onDateClick && !readOnly) onDateClick(d.dateStr);
                }}
                role={readOnly ? undefined : "button"}
                tabIndex={readOnly ? undefined : "0"}
                aria-label={readOnly ? undefined : `Crear evento el ${d.dateStr}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (onDateClick && !readOnly) onDateClick(d.dateStr);
                  }
                }}
              >
                {dayEvents.map(ev => (
                  <button 
                    key={ev.id} 
                    className={`cal__event cal__event--week cal__event--${ev.type}`}
                    style={{ backgroundColor: getEventColor(ev) }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEventClick) onEventClick(ev);
                    }}
                    aria-label={`${ev.title} - ${ev.clientName || 'Sin cliente'}${showCoachName && ev.coachName ? ` - ${ev.coachName}` : ''}`}
                    title={`${ev.title} - ${ev.clientName || 'Sin cliente'}${showCoachName && ev.coachName ? ` · ${ev.coachName}` : ''}`}
                  >
                    <span className="cal__event-icon">{getStatusIcon(ev.status, ev.type)}</span>
                    <div className="cal__event-content-week">
                      <span className="cal__event-title">{ev.title}</span>
                      {showClientName && ev.clientName && <span className="cal__event-client">{ev.clientName}</span>}
                      {showCoachName && ev.coachName && (
                        <span className="cal__event-coach">{ev.coachName}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
