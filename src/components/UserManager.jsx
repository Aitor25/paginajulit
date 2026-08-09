import { useState, useEffect, useMemo } from 'react';
import { firestoreService } from '../services/firestoreService';
import { storage } from '../services/storage';
import { useAuth } from '../contexts/AuthProvider';
import './UserManager.css';

/* ─── Modal de vinculación de ficha ───────────────────────── */
function LinkClientModal({ user, onClose, onLinked }) {
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Alta rápida
  const [creating, setCreating] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cs, us] = await Promise.all([
          storage.getClients(),
          firestoreService.getDocumentsByQuery('users', [])
        ]);
        cs.sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        );
        setClients(cs);
        setUsers(us);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Qué cuenta ocupa cada ficha, para avisar de las ya vinculadas
  const ocupadas = useMemo(() => {
    const m = {};
    for (const u of users) {
      if (u.clientId) m[String(u.clientId)] = u.fullName || u.email;
    }
    return m;
  }, [users]);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      `${c.firstName} ${c.lastName} ${c.email || ''}`.toLowerCase().includes(q)
    );
  }, [clients, search]);

  async function vincular(clientId) {
    setError('');
    setSaving(true);
    try {
      await storage.linkUserToClient(user.uid || user.id, clientId);
      onLinked();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function crearYVincular(e) {
    e.preventDefault();
    if (!newFirstName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const nuevo = await storage.saveClient({
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        email: user.email || '',
        birthDate: '', gender: '', phone: '',
        height: null, weight: null,
        sportId: null, teamId: null, groupId: null,
        image: '', status: 'active', generalNotes: ''
      });
      await storage.linkUserToClient(user.uid || user.id, nuevo.id);
      onLinked();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div
      className="el__modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lk-title"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="el__modal lk__modal">
        <div className="el__modal-header">
          <h2 id="lk-title" className="el__modal-title">Vincular ficha</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="el__modal-body lk__body">
          <p className="lk__intro">
            Cuenta: <strong>{user.fullName || user.email}</strong>
          </p>

          {error && <div className="el__error-msg">{error}</div>}

          {creating ? (
            <form className="lk__create" onSubmit={crearYVincular}>
              <div className="el__field">
                <label className="el__label" htmlFor="lk-nombre">Nombre *</label>
                <input
                  id="lk-nombre"
                  className="el__input"
                  value={newFirstName}
                  onChange={e => setNewFirstName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="el__field">
                <label className="el__label" htmlFor="lk-apellidos">Apellidos</label>
                <input
                  id="lk-apellidos"
                  className="el__input"
                  value={newLastName}
                  onChange={e => setNewLastName(e.target.value)}
                />
              </div>
              <div className="lk__create-actions">
                <button type="button" className="el__btn el__btn--ghost" onClick={() => setCreating(false)} disabled={saving}>
                  Volver a la lista
                </button>
                <button type="submit" className="el__btn el__btn--primary" disabled={saving}>
                  {saving ? 'Creando…' : 'Crear y vincular'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <input
                className="el__input"
                placeholder="Buscar deportista por nombre…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Buscar deportista"
              />

              {loading ? (
                <div className="el__placeholder">Cargando fichas…</div>
              ) : visibles.length === 0 ? (
                <div className="el__placeholder">
                  {clients.length === 0
                    ? 'No hay ninguna ficha creada todavía.'
                    : 'Ningún deportista coincide con la búsqueda.'}
                </div>
              ) : (
                <ul className="lk__list">
                  {visibles.map(c => {
                    const ocupadaPor = ocupadas[String(c.id)];
                    const esLaActual = String(user.clientId || '') === String(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          className={`lk__item ${esLaActual ? 'lk__item--current' : ''}`}
                          onClick={() => vincular(c.id)}
                          disabled={saving || esLaActual}
                        >
                          <span className="lk__item-name">
                            {c.firstName} {c.lastName}
                          </span>
                          <span className="lk__item-meta">
                            {esLaActual
                              ? 'Ya vinculada a esta cuenta'
                              : ocupadaPor
                                ? `Ocupada por ${ocupadaPor} — se reasignará`
                                : 'Libre'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <button
                className="el__btn el__btn--secondary lk__new-btn"
                onClick={() => { setCreating(true); setError(''); }}
                disabled={saving}
              >
                + Crear ficha nueva para esta cuenta
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserManager() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterRole, setFilterRole] = useState('all');
  const [linkingUser, setLinkingUser] = useState(null);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const [dbUsers, dbClients] = await Promise.all([
        firestoreService.getDocumentsByQuery('users', []),
        storage.getClients().catch(() => [])
      ]);
      setUsers(dbUsers);
      setClients(dbClients);
    } catch (err) {
      console.error("Error loading users:", err);
      setError("No se pudieron cargar los usuarios. Verifica los permisos.");
    } finally {
      setLoading(false);
    }
  }

  // Nombre legible de la ficha vinculada, en vez del UUID
  const nombreDeFicha = (clientId) => {
    if (!clientId) return 'Ninguna';
    const c = clients.find(x => String(x.id) === String(clientId));
    return c ? `${c.firstName} ${c.lastName}`.trim() : 'Ficha no encontrada';
  };

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

  const handleUnlinkClient = async (user) => {
    if (!window.confirm(`¿Desvincular la ficha de ${user.fullName || user.email}?`)) return;
    try {
      await storage.unlinkUserFromClient(user.uid || user.id, user.clientId);
      loadUsers();
    } catch (err) {
      console.error(err);
      setError('No se pudo desvincular la ficha: ' + err.message);
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
                      <div>Ficha: {nombreDeFicha(user.clientId)}</div>
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

                      {user.role === 'client' && (
                        user.clientId ? (
                          <>
                            <button className="el__btn el__btn--ghost el__btn--small" onClick={() => setLinkingUser(user)}>
                              Cambiar Ficha
                            </button>
                            <button className="el__btn el__btn--ghost el__btn--small" onClick={() => handleUnlinkClient(user)} style={{ color: 'var(--red)' }}>
                              Desvincular
                            </button>
                          </>
                        ) : (
                          <button className="el__btn el__btn--primary el__btn--small" onClick={() => setLinkingUser(user)}>
                            Vincular Ficha
                          </button>
                        )
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

      {linkingUser && (
        <LinkClientModal
          user={linkingUser}
          onClose={() => setLinkingUser(null)}
          onLinked={() => { setLinkingUser(null); loadUsers(); }}
        />
      )}
    </div>
  );
}
