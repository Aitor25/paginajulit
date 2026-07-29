import { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { firestoreService } from '../services/firestoreService';
import { formatDate } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthProvider';

export default function UserManager() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterRole, setFilterRole] = useState('all');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const dbUsers = await firestoreService.getDocumentsByQuery('users', []);
      setUsers(dbUsers);
    } catch (err) {
      console.error("Error loading users:", err);
      setError("No se pudieron cargar los usuarios. Verifica los permisos.");
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateRole = async (userId, newRole) => {
    if (!window.confirm(`¿Seguro que quieres cambiar el rol a ${newRole}?`)) return;
    try {
      const updates = {
        role: newRole,
        updatedAt: new Date().toISOString()
      };
      
      if (newRole === 'coach' || newRole === 'owner') {
        updates.organizationId = 'julit';
        updates.status = 'active';
      }
      
      await firestoreService.updateDocument('users', userId, updates);
      loadUsers();
    } catch (err) {
      console.error(err);
      alert("Error al actualizar rol");
    }
  };

  const handleUpdateStatus = async (userId, newStatus) => {
    if (!window.confirm(`¿Seguro que quieres cambiar el estado a ${newStatus}?`)) return;
    try {
      await firestoreService.updateDocument('users', userId, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      loadUsers();
    } catch (err) {
      console.error(err);
      alert("Error al actualizar estado");
    }
  };

  const handleLinkClient = async (userId) => {
    const clientId = window.prompt("Introduce el ID de la ficha de cliente (clients/clientId):");
    if (!clientId) return;
    
    try {
      await firestoreService.updateDocument('users', userId, {
        clientId: clientId,
        status: 'active',
        organizationId: 'julit',
        updatedAt: new Date().toISOString()
      });
      loadUsers();
    } catch (err) {
      console.error(err);
      alert("Error al vincular ficha");
    }
  };

  const filteredUsers = users.filter(u => filterRole === 'all' || u.role === filterRole);

  if (userProfile?.role !== 'owner') {
    return (
      <div className="alert error">
        No tienes permisos para acceder a esta sección.
      </div>
    );
  }

  return (
    <div className="section-container">
      <div className="section-header">
        <h2 className="section-title">Gestión de Usuarios</h2>
        <div className="section-actions">
          <select 
            className="el__input el__input--small" 
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">Todos los roles</option>
            <option value="owner">Owners</option>
            <option value="coach">Coaches</option>
            <option value="client">Clientes</option>
          </select>
          <button className="el__btn el__btn--primary el__btn--small" onClick={loadUsers}>
            Actualizar
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando usuarios...</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Vinculaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.uid || user.id}>
                  <td>{user.fullName || 'Sin nombre'}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`badge badge--${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge--${user.status === 'active' ? 'success' : (user.status === 'pending_assignment' ? 'warning' : 'default')}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>
                      <div>Org: {user.organizationId || 'Ninguna'}</div>
                      <div>Ficha: {user.clientId || 'Ninguna'}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {user.role !== 'owner' && (
                        <button className="el__btn el__btn--ghost el__btn--small" onClick={() => handleUpdateRole(user.uid || user.id, 'owner')}>
                          ⭐ Hacer Owner
                        </button>
                      )}
                      {user.role !== 'coach' && (
                        <button className="el__btn el__btn--ghost el__btn--small" onClick={() => handleUpdateRole(user.uid || user.id, 'coach')}>
                          🏋️ Hacer Coach
                        </button>
                      )}
                      {user.role !== 'client' && (
                        <button className="el__btn el__btn--ghost el__btn--small" onClick={() => handleUpdateRole(user.uid || user.id, 'client')}>
                          👤 Hacer Client
                        </button>
                      )}
                      
                      {user.status !== 'active' ? (
                        <button className="el__btn el__btn--ghost el__btn--small" onClick={() => handleUpdateStatus(user.uid || user.id, 'active')} style={{ color: 'var(--green)' }}>
                          Activar
                        </button>
                      ) : (
                        <button className="el__btn el__btn--ghost el__btn--small" onClick={() => handleUpdateStatus(user.uid || user.id, 'disabled')} style={{ color: 'var(--red)' }}>
                          Desactivar
                        </button>
                      )}

                      {user.role === 'client' && !user.clientId && (
                        <button className="el__btn el__btn--primary el__btn--small" onClick={() => handleLinkClient(user.uid || user.id)}>
                          Vincular Ficha
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center' }}>No se encontraron usuarios</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
