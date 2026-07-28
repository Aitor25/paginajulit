// Servicio de sesión evolucionado.
// Almacena estáticamente el contexto actual (usuario, orgId, membresía) para que storage.js
// y otros repositorios puedan construir las queries correctamente sin inyectar hooks en funciones puras.

let currentState = {
  user: null,
  orgId: null,
  role: null,
  activeClientId: null
};

export const sessionService = {
  setSession: (user, orgId, role) => {
    currentState.user = user;
    currentState.orgId = orgId;
    currentState.role = role;
  },

  getCurrentUser: () => currentState.user,
  getUserId: () => currentState.user?.uid,
  getOrgId: () => currentState.orgId,
  getRole: () => currentState.role,

  getActiveClientId: () => {
    return currentState.activeClientId;
  },

  setActiveClientId: (clientId) => {
    currentState.activeClientId = clientId;
    window.dispatchEvent(new Event('fitcoach_session_changed'));
  }
};
