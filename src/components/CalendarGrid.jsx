import React, { useMemo, useState } from 'react';
import './CalendarGrid.css';

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const getStatusColor = (status, type) => {
  if (type === 'program_start' || type === 'program_end') return 'var(--purple)';
  if (type === 'free_session') return 'var(--accent)'; // Cyan/Blue
  
  switch (status) {
    case 'completed': return 'var(--green)';
    case 'missed': return 'var(--red)';
    case 'in_progress': return 'var(--yellow)';
    case 'cancelled': return 'var(--gray-500)';
    case 'pending': 
    default: return 'var(--gray-600)'; // Neutral dark for pending
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

// Paleta para distinguir entrenadores en la vista del owner. Tonos con
// contraste suficiente para texto blanco encima.
export const COACH_COLORS = [
  '#4F46E5', // indigo
  '#0891B2', // cyan
  '#059669', // emerald
  '#D97706', // amber
  '#DB2777', // pink
  '#7C3AED', // violet
  '#DC2626', // red
  '#0284C7', // sky
  '#65A30D', // lime
  '#C2410C'  // orange
];

export const SIN_ENTRENADOR_COLOR = '#6B7280'; // gris

// Asigna un color estable a cada entrenador según el orden recibido.
export function buildCoachColorMap(coachIds = []) {
  const map = {};
  [...new Set(coachIds.filter(Boolean).map(String))]
    .sort()
    .forEach((id, i) => { map[id] = COACH_COLORS[i % COACH_COLORS.length]; });
  return map;
}

export const CalendarGrid = ({
  currentDate,
  events = [],
  onDateClick,
  onEventClick,
  readOnly = false,
  // 'status' (por defecto) o 'coach' para colorear por entrenador
  colorBy = 'status',
  coachColors = {},
  showCoachName = false
}) => {
  const getEventColor = (ev) =>
    colorBy === 'coach'
      ? (ev.coachId ? (coachColors[String(ev.coachId)] || SIN_ENTRENADOR_COLOR) : SIN_ENTRENADOR_COLOR)
      : getStatusColor(ev.status, ev.type);

  const [expandedDate, setExpandedDate] = useState(null);
  const { daysInMonth, blankDaysBefore, blankDaysAfter, totalRows } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // In JS, 0 is Sunday, 1 is Monday. We want Monday=0, Sunday=6
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;
    
    let endDayOfWeek = lastDayOfMonth.getDay() - 1;
    if (endDayOfWeek === -1) endDayOfWeek = 6;
    
    const totalCells = startDayOfWeek + lastDayOfMonth.getDate() + (6 - endDayOfWeek);

    return {
      daysInMonth: lastDayOfMonth.getDate(),
      blankDaysBefore: startDayOfWeek,
      blankDaysAfter: 6 - endDayOfWeek,
      totalRows: totalCells / 7
    };
  }, [currentDate]);

  const renderCell = (dayNumber, isCurrentMonth = true) => {
    let dateStr = '';
    if (isCurrentMonth && dayNumber) {
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayNumber).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    }

    const dayEvents = isCurrentMonth ? events.filter(e => e.date === dateStr) : [];
    
    const isToday = isCurrentMonth && dateStr === new Date().toISOString().split('T')[0];
    
    // Density management: Show up to 3 events.
    const maxVisibleEvents = 3;
    const visibleEvents = dayEvents.slice(0, maxVisibleEvents);
    const overflowCount = dayEvents.length - maxVisibleEvents;

    return (
      <div 
        key={isCurrentMonth ? `day-${dayNumber}` : `blank-${Math.random()}`} 
        className={`cal__cell ${!isCurrentMonth ? 'cal__cell--blank' : ''} ${isToday ? 'cal__cell--today' : ''}`}
        onClick={() => {
          if (isCurrentMonth && onDateClick && !readOnly) onDateClick(dateStr);
        }}
        role={isCurrentMonth && !readOnly ? "button" : undefined}
        tabIndex={isCurrentMonth && !readOnly ? "0" : undefined}
        aria-label={isCurrentMonth && !readOnly ? `Crear evento el ${dateStr}` : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isCurrentMonth && onDateClick && !readOnly) onDateClick(dateStr);
          }
        }}
      >
        {isCurrentMonth && (
          <div className="cal__cell-header">
            <span className="cal__date-num">{dayNumber}</span>
          </div>
        )}
        
        {isCurrentMonth && dayEvents.length > 0 && (
          <div className="cal__mobile-indicator" title={`${dayEvents.length} eventos`}>
            {dayEvents.length}
          </div>
        )}

        {isCurrentMonth && (
          <div className="cal__events-container">
            {visibleEvents.map(ev => (
              <button 
                key={ev.id} 
                className={`cal__event cal__event--${ev.type}`}
                style={{ backgroundColor: getEventColor(ev) }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEventClick) onEventClick(ev);
                }}
                aria-label={
                  `Ver detalle del evento: ${ev.title}` +
                  (ev.clientName ? ` de ${ev.clientName}` : '') +
                  (showCoachName && ev.coachName ? `, entrenador ${ev.coachName}` : '')
                }
              >
                <span className="cal__event-icon">{getStatusIcon(ev.status, ev.type)}</span>
                <span className="cal__event-title">{ev.title}</span>
                {ev.clientName && <span className="cal__event-client">({ev.clientName})</span>}
                {showCoachName && ev.coachName && (
                  <span className="cal__event-coach">· {ev.coachName}</span>
                )}
              </button>
            ))}
            {overflowCount > 0 && (
              <button 
                className="cal__event-overflow"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedDate(dateStr);
                }}
                aria-label={`Ver ${overflowCount} eventos más`}
              >
                +{overflowCount} más
              </button>
            )}
            
            {expandedDate === dateStr && (
              <div className="cal__events-popup">
                <div className="cal__events-popup-header">
                  <span>{dateStr}</span>
                  <button onClick={(e) => { e.stopPropagation(); setExpandedDate(null); }}>×</button>
                </div>
                <div className="cal__events-popup-body">
                  {dayEvents.map(ev => (
                    <button 
                      key={ev.id} 
                      className={`cal__event cal__event--${ev.type}`}
                      style={{ backgroundColor: getEventColor(ev) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedDate(null);
                        if (onEventClick) onEventClick(ev);
                      }}
                      aria-label={`Ver detalle del evento: ${ev.title}`}
                    >
                      <span className="cal__event-icon">{getStatusIcon(ev.status, ev.type)}</span>
                      <span className="cal__event-title">{ev.title}</span>
                      {ev.clientName && <span className="cal__event-client">({ev.clientName})</span>}
                      {showCoachName && ev.coachName && (
                        <span className="cal__event-coach">· {ev.coachName}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="cal__wrapper">
      <div className="cal__header-row">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="cal__header-cell">{day}</div>
        ))}
      </div>
      <div className="cal__grid" style={{ '--cal-rows': totalRows }}>
        {/* Blank days before first day of month */}
        {Array.from({ length: blankDaysBefore }).map((_, i) => renderCell(null, false))}
        
        {/* Actual days of month */}
        {Array.from({ length: daysInMonth }).map((_, i) => renderCell(i + 1, true))}
        
        {/* Blank days after last day of month */}
        {Array.from({ length: blankDaysAfter }).map((_, i) => renderCell(null, false))}
      </div>
    </div>
  );
};
