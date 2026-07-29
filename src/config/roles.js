/**
 * Configuración centralizada de roles y accesos
 */

export const OWNER_EMAILS = [
  'agarciah10@gmail.com'
];

/**
 * Verifica de forma segura si un email pertenece a la lista de owners (case-insensitive).
 * 
 * @param {string} email Correo electrónico a verificar
 * @returns {boolean} true si es owner, false en caso contrario
 */
export function isOwnerEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  const normalizedEmail = email.trim().toLowerCase();
  return OWNER_EMAILS.some(ownerEmail => ownerEmail.trim().toLowerCase() === normalizedEmail);
}
