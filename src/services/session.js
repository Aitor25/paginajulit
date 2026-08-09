// Servicio de sesión evolucionado.
// Almacena estáticamente el contexto actual (usuario, orgId, membresía) para que storage.js
// y otros repositorios puedan construir las queries correctamente sin inyectar hooks en funciones puras.

let currentState = {
  user: null,
  orgId: null,
  role: null,
  // Ficha vinculada al usuario logueado cuando es un cliente (viene de
  // users/{uid}.clientId). null para coach/owner.
  clientId: null
};

export const sessionService = {
  setSession: (user, orgId, role, clientId = null) => {
    currentState.user = user;
    currentState.orgId = orgId;
    currentState.role = role;
    currentState.clientId = clientId;
  },

  getCurrentUser: () => currentState.user,
  getUserId: () => currentState.user?.uid,
  getOrgId: () => currentState.orgId,
  getRole: () => currentState.role,
  getClientId: () => currentState.clientId
};
