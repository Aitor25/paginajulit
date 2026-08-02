import React, { useMemo, useState, useRef, useEffect } from 'react';
import './CalendarGrid.css';
import { toDateKey } from '../utils/dateUtils';

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Etiquetas visibles de los estados. En la base se guardan en inglés, pero al
// usuario se le enseñaban tal cual ("pending", "missed"...).
const STATUS_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completado',
  missed: 'Perdido',
  cancelled: 'Cancelado'
};

export const getStatusLabel = (status) => STATUS_LABELS[status] || 'Sin estado';

export const getStatusColor = (status, type) => {
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

export const getStatusIcon = (status, type) => {
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

// Rectángulos que se pintan en la vista compacta antes de resumir con "+N".
const MAX_MINI = 4;

// Texto del tooltip de la vista compacta, donde los eventos no se ven.
function resumenDelDia(dayEvents) {
  const cabecera = dayEvents.length === 1 ? '1 sesión' : `${dayEvents.length} sesiones`;
  return [cabecera, ...dayEvents.map(ev => `· ${ev.title}${ev.clientName ? ` (${ev.clientName})` : ''}`)].join('\n');
}

// Color de cada entrenador. Acepta los usuarios completos (para respetar el
// calendarColor que haya elegido el owner) o una simple lista de ids. Los que
// no tengan color propio reciben uno estable de la paleta.
export function buildCoachColorMap(coaches = []) {
  const map = {};
  const sinColorPropio = [];

  for (const c of coaches) {
    if (!c) continue;
    const id = String(typeof c === 'object' ? (c.uid || c.id) : c);
    if (!id || map[id]) continue;
    const propio = typeof c === 'object' ? c.calendarColor : null;
    if (propio) map[id] = propio;
    else sinColorPropio.push(id);
  }

  sinColorPropio
    .sort()
    .forEach((id, i) => { map[id] = COACH_COLORS[i % COACH_COLORS.length]; });

  return map;
}

// Cuántos eventos se listan por celda cuando la rejilla puede crecer a lo alto.
const MAX_EVENTOS_POR_CELDA = 3;

// Lee un número de una custom property para no duplicar en JS medidas que ya
// están en el CSS (alto de evento, hueco y espacio fijo de la celda).
function medidaCss(estilos, nombre, porDefecto) {
  const v = parseFloat(estilos.getPropertyValue(nombre));
  return Number.isFinite(v) ? v : porDefecto;
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
  showCoachName = false,
  // En la agenda de un solo deportista el nombre sobra: son todas suyas y solo
  // servía para desbordar la tarjeta.
  showClientName = true,
  // La agenda del owner reparte a partes iguales la altura disponible entre
  // las semanas del mes, así que la celda no puede crecer: hay que calcular
  // cuántos eventos caben de verdad y resumir el resto en "+N más".
  fitRowsToHeight = false
}) => {
  const getEventColor = (ev) =>
    colorBy === 'coach'
      ? (ev.coachId ? (coachColors[String(ev.coachId)] || SIN_ENTRENADOR_COLOR) : SIN_ENTRENADOR_COLOR)
      : getStatusColor(ev.status, ev.type);

  // Día desplegado y posición del desplegable. Va en coordenadas de pantalla
  // porque la celda recorta su contenido: dentro de ella el panel se veía
  // cortado justo igual que los eventos que pretende mostrar.
  const [expanded, setExpanded] = useState(null);
  const gridRef = useRef(null);
  const [huecosPorCelda, setHuecosPorCelda] = useState(MAX_EVENTOS_POR_CELDA);
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

  // Mide la fila real y deduce cuántos eventos caben. Se recalcula al
  // redimensionar y al cambiar de mes (los meses tienen 5 o 6 semanas).
  useEffect(() => {
    if (!fitRowsToHeight) {
      setHuecosPorCelda(MAX_EVENTOS_POR_CELDA);
      return;
    }
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;

    const medir = () => {
      const estilos = getComputedStyle(grid);
      const altoFila = grid.getBoundingClientRect().height / Math.max(1, totalRows);
      const fijo = medidaCss(estilos, '--cal-cell-chrome', 37);
      const altoEvento = medidaCss(estilos, '--cal-event-h', 20);
      const hueco = medidaCss(estilos, '--cal-event-gap', 3);
      const libre = altoFila - fijo;
      setHuecosPorCelda(Math.max(1, Math.floor((libre + hueco) / (altoEvento + hueco))));
    };

    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [fitRowsToHeight, totalRows]);

  // Cerrar el desplegable con Escape, como el resto de modales de la app.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const abrirDesplegable = (e, dateStr) => {
    const r = e.currentTarget.getBoundingClientRect();
    setExpanded({ dateStr, x: r.left, y: r.bottom + 4 });
  };

  const renderCell = (dayNumber, isCurrentMonth = true) => {
    let dateStr = '';
    if (isCurrentMonth && dayNumber) {
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayNumber).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    }

    const dayEvents = isCurrentMonth ? events.filter(e => e.date === dateStr) : [];
    
    const isToday = isCurrentMonth && dateStr === toDateKey(new Date());
    
    // Si no caben todos, el botón "+N más" ocupa uno de los huecos: por eso se
    // reserva sitio para él en vez de pintar eventos que quedarían recortados.
    const cabenTodos = dayEvents.length <= huecosPorCelda;
    const visibleEvents = cabenTodos
      ? dayEvents
      : dayEvents.slice(0, Math.max(0, huecosPorCelda - 1));
    const overflowCount = dayEvents.length - visibleEvents.length;

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
        
        {/* Vista compacta (pantalla estrecha): no cabe el texto del evento,
            así que cada sesión se resume en un rectángulo de su color. Son
            pulsables y llevan una zona de toque mayor que el dibujo. */}
        {isCurrentMonth && dayEvents.length > 0 && (
          <div className="cal__mini-list" title={resumenDelDia(dayEvents)}>
            {dayEvents.slice(0, MAX_MINI).map(ev => (
              <button
                key={ev.id}
                type="button"
                className="cal__mini-event"
                style={{ backgroundColor: getEventColor(ev) }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEventClick) onEventClick(ev);
                }}
                aria-label={
                  `Ver detalle del evento: ${ev.title}` +
                  (showClientName && ev.clientName ? ` de ${ev.clientName}` : '')
                }
              />
            ))}
            {dayEvents.length > MAX_MINI && (
              <button
                type="button"
                className="cal__mini-more"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirDesplegable(e, dateStr);
                }}
                aria-label={`Ver los ${dayEvents.length} eventos del ${dateStr}`}
              >
                +{dayEvents.length - MAX_MINI}
              </button>
            )}
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
                {showClientName && ev.clientName && <span className="cal__event-client">({ev.clientName})</span>}
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
                  abrirDesplegable(e, dateStr);
                }}
                aria-label={`Ver los ${dayEvents.length} eventos del ${dateStr}`}
              >
                {/* Si la celda es tan baja que no cabe ni un evento, "+N más"
                    no diría más que de qué. Ahí se anuncia el total. */}
                {visibleEvents.length === 0
                  ? `${overflowCount} ${overflowCount === 1 ? 'sesión' : 'sesiones'}`
                  : `+${overflowCount} más`}
              </button>
            )}

          </div>
        )}
      </div>
    );
  };

  const eventosDesplegados = expanded
    ? events.filter(e => e.date === expanded.dateStr)
    : [];

  return (
    <div className="cal__wrapper">
      <div className="cal__header-row">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="cal__header-cell">{day}</div>
        ))}
      </div>
      <div className="cal__grid" style={{ '--cal-rows': totalRows }} ref={gridRef}>
        {/* Blank days before first day of month */}
        {Array.from({ length: blankDaysBefore }).map((_, i) => renderCell(null, false))}

        {/* Actual days of month */}
        {Array.from({ length: daysInMonth }).map((_, i) => renderCell(i + 1, true))}

        {/* Blank days after last day of month */}
        {Array.from({ length: blankDaysAfter }).map((_, i) => renderCell(null, false))}
      </div>

      {/* Desplegable del día, fijo respecto a la ventana: la celda y la propia
          rejilla recortan su contenido, y dentro de ellas se veía cortado. */}
      {expanded && (
        <>
          <div className="cal__popup-backdrop" onClick={() => setExpanded(null)} />
          <div
            className="cal__events-popup"
            role="dialog"
            aria-label={`Eventos del ${expanded.dateStr}`}
            style={{
              left: Math.max(8, Math.min(expanded.x, window.innerWidth - 268)),
              top: Math.max(8, Math.min(expanded.y, window.innerHeight - 260))
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="cal__events-popup-header">
              <span>{expanded.dateStr}</span>
              <button onClick={() => setExpanded(null)} aria-label="Cerrar">×</button>
            </div>
            <div className="cal__events-popup-body">
              {eventosDesplegados.map(ev => (
                <button
                  key={ev.id}
                  className={`cal__event cal__event--${ev.type}`}
                  style={{ backgroundColor: getEventColor(ev) }}
                  onClick={() => {
                    setExpanded(null);
                    if (onEventClick) onEventClick(ev);
                  }}
                  aria-label={`Ver detalle del evento: ${ev.title}`}
                >
                  <span className="cal__event-icon">{getStatusIcon(ev.status, ev.type)}</span>
                  <span className="cal__event-title">{ev.title}</span>
                  {showClientName && ev.clientName && <span className="cal__event-client">({ev.clientName})</span>}
                  {showCoachName && ev.coachName && (
                    <span className="cal__event-coach">· {ev.coachName}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
