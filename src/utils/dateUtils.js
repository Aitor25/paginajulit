// Utilidades para formatear fechas de manera segura en FitCoachPro

/**
 * Convierte un Date a la clave local "AAAA-MM-DD" que usa el calendario.
 * No sirve toISOString(): pasa a UTC y en España adelanta la fecha un día
 * (el 31 a las 00:00 locales son las 22:00 UTC del 30), así que el último
 * día del mes se quedaba fuera del rango consultado.
 */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formatea un valor de fecha a formato español "DD/MM/AAAA".
 * Soporta nulos, indefinidos, cadenas vacías y valores inválidos de manera segura.
 */
export function formatDate(value) {
  if (!value) return 'Sin fecha';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no válida';
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

/**
 * Formatea un valor de fecha y hora a formato español "DD/MM/AAAA HH:MM".
 * Útil para registrar intentos múltiples de tests y marcas temporales de auditoría.
 */
export function formatDateTime(value) {
  if (!value) return 'Sin fecha';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no válida';
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * Comprueba si una fecha es futura (estrictamente mayor que el inicio del día actual).
 * Útil para excluir sesiones que aún no pueden realizarse.
 */
export function isFuture(dateValue) {
  if (!dateValue) return false;
  const targetDate = new Date(dateValue);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Inicio del día de hoy
  return targetDate > today;
}

/**
 * Comprueba si una fecha planificada ha superado un periodo de gracia (por defecto 24h tras finalizar el día planificado).
 */
export function isPastGracePeriod(dateValue, graceHours = 24) {
  if (!dateValue) return false;
  
  // Asumimos que dateValue es 'YYYY-MM-DD' o un timestamp
  const targetDate = new Date(dateValue);
  
  // Establecemos el targetDate al final del día planificado (23:59:59)
  targetDate.setHours(23, 59, 59, 999);
  
  // Añadimos el periodo de gracia en horas
  const expirationDate = new Date(targetDate.getTime() + graceHours * 60 * 60 * 1000);
  
  return new Date() > expirationDate;
}

/**
 * Comprueba si una fecha está dentro de un periodo reciente (ej: últimos 30 días).
 */
export function isWithinPeriod(dateValue, periodDays) {
  if (!dateValue) return false;
  const targetDate = new Date(dateValue);
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() - periodDays);
  return targetDate >= limitDate && targetDate <= new Date();
}
