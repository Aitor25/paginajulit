// Servicio de sesión evolucionado.
// Almacena estáticamente el contexto actual (usuario, orgId, membresía) para que storage.js
// y otros repositorios puedan construir las queries correctamente sin inyectar hooks en funciones puras.

let currentState = {
  user: null,
  orgId: null,
  role: null, // role real de organization_members
  
  // Mantenemos el estado del "cliente simulado" de la UI temporalmente para no romper App.jsx 
  // (hasta que App.jsx deje de permitir cambiar de rol en caliente)
  simulatedRole: sessionStorage.getItem('fitcoach_session_role') || 'coach',
  activeClientId: sessionStorage.getItem('fitcoach_session_active_client_id')
    ? Number(sessionStorage.getItem('fitcoach_session_active_client_id'))
    : null
};

export const sessionService = {
  // === Estado Real (Firebase) ===
  setSession: (user, orgId, role) => {
    currentState.user = user;
    currentState.orgId = orgId;
    currentState.role = role;
  },

  getCurrentUser: () => currentState.user,
  getOrgId: () => currentState.orgId,
  getRealRole: () => currentState.role,

  // === Estado Simulado UI (Heredado V8) ===
  getRole: () => {
    return currentState.simulatedRole;
  },

  setRole: (role) => {
    currentState.simulatedRole = role;
    sessionStorage.setItem('fitcoach_session_role', role);
    window.dispatchEvent(new Event('fitcoach_session_changed'));
  },

  getActiveClientId: () => {
    return currentState.activeClientId;
  },

  setActiveClientId: (clientId) => {
    if (clientId) {
      currentState.activeClientId = clientId;
      sessionStorage.setItem('fitcoach_session_active_client_id', clientId);
    } else {
      currentState.activeClientId = null;
      sessionStorage.removeItem('fitcoach_session_active_client_id');
    }
    window.dispatchEvent(new Event('fitcoach_session_changed'));
  }
};
