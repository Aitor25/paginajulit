import { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { formatDate } from '../utils/dateUtils';

export default function CoachDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics7, setMetrics7] = useState(null);
  const [metrics30, setMetrics30] = useState(null);
  const [clients, setClients] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      // Migrar datos antiguos a la organización del usuario
      await storage.migrateLegacyData();

      // Execute sync of missed assignments automatically upon entering dashboard
      await storage.syncMissedAssignments();

      const m7 = await storage.getComplianceMetrics(7);
      const m30 = await storage.getComplianceMetrics(30);
      const dbClients = await storage.getClients();
      
      let assignments = [];
      for (const c of dbClients) {
        const clientAssigns = await storage.getWorkoutAssignments(c.id);
        assignments = [...assignments, ...clientAssigns];
      }

      setMetrics7(m7);
      setMetrics30(m30);
      setClients(dbClients);
      setAllAssignments(assignments);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleRevertMissed = async (assignmentId) => {
    if (!window.confirm("¿Seguro que deseas revertir esta sesión perdida? Volverá al estado 'pendiente'.")) {
      return;
    }
    try {
      await storage.revertMissedAssignment(assignmentId);
      await loadDashboard(); // Recargar todo para reflejar el cambio en métricas
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return <div className="el__placeholder">Cargando Dashboard...</div>;
  }

  const activeMetrics = selectedPeriod === 7 ? metrics7 : metrics30;
  
  if (!activeMetrics) return null;

  const getClientName = (cId) => {
    const c = clients.find(cl => String(cl.id) === String(cId));
    return c ? `${c.firstName} ${c.lastName}` : `Deportista #${cId}`;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Dashboard de Cumplimiento</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`el__btn ${selectedPeriod === 7 ? 'el__btn--primary' : 'el__btn--ghost'}`}
            onClick={() => setSelectedPeriod(7)}
          >
            Últimos 7 días
          </button>
          <button 
            className={`el__btn ${selectedPeriod === 30 ? 'el__btn--primary' : 'el__btn--ghost'}`}
            onClick={() => setSelectedPeriod(30)}
          >
            Últimos 30 días
          </button>
        </div>
      </div>

      {/* KPIs Globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="el__card" style={{ padding: '24px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Adherencia Global</h3>
          {activeMetrics.aggregate.totalEligible === 0 ? (
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Sin datos</div>
          ) : (
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: activeMetrics.aggregate.adherencePercentage >= 80 ? 'var(--green)' : activeMetrics.aggregate.adherencePercentage >= 50 ? '#fbbf24' : 'var(--red)' }}>
              {activeMetrics.aggregate.adherencePercentage.toFixed(1)}%
            </div>
          )}
        </div>
        <div className="el__card" style={{ padding: '24px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Completadas</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--green)' }}>
            {activeMetrics.aggregate.totalCompleted}
          </div>
        </div>
        <div className="el__card" style={{ padding: '24px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Perdidas</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--red)' }}>
            {activeMetrics.aggregate.totalMissed}
          </div>
        </div>
        <div className="el__card" style={{ padding: '24px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Elegibles</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
            {activeMetrics.aggregate.totalEligible}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '24px' }}>
        
        {/* Clientes Críticos */}
        <div className="el__card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '16px' }}>Deportistas Críticos</h3>
          {activeMetrics.clients.filter(c => c.eligible > 0 && c.adherence < 70).length === 0 ? (
            <div className="el__placeholder" style={{ padding: '16px', minHeight: 'auto' }}>
              <p>No hay deportistas con adherencia baja (&lt; 70%)</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeMetrics.clients
                .filter(c => c.eligible > 0 && c.adherence < 70)
                .map(c => (
                <div key={c.clientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', borderLeft: '4px solid var(--red)' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{getClientName(c.clientId)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.completed} completadas / {c.missed} perdidas de {c.eligible}</div>
                  </div>
                  <div style={{ fontWeight: 'bold', color: 'var(--red)' }}>
                    {c.adherence.toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feed de Actividad Reciente */}
        <div className="el__card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '16px' }}>Actividad Reciente</h3>
          {activeMetrics.recentActivity.length === 0 ? (
            <div className="el__placeholder" style={{ padding: '16px', minHeight: 'auto' }}>
              <p>No hay actividad en el periodo seleccionado.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeMetrics.recentActivity.slice(0, 10).map(r => {
                const isFree = r.workoutAssignmentId === null || r.workoutAssignmentId === undefined;
                return (
                  <div key={r.id} style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', borderLeft: `4px solid ${isFree ? '#3b82f6' : 'var(--green)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.875rem' }}>{getClientName(r.clientId)}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDate(r.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                      {isFree ? `🌟 Sesión Libre: ${r.freeSessionTitle || 'Sin título'} (${r.freeSessionActivityType})` : `✅ Sesión Planificada Completada`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Corrección de Sesiones Perdidas */}
        <div className="el__card" style={{ padding: '24px', gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '16px' }}>Sesiones Perdidas Recientes</h3>
          {(() => {
            const missedAssignments = allAssignments.filter(a => a.status === 'missed').sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)).slice(0, 5);
            if (missedAssignments.length === 0) {
              return (
                <div className="el__placeholder" style={{ padding: '16px', minHeight: 'auto' }}>
                  <p>No hay sesiones perdidas recientemente.</p>
                </div>
              );
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {missedAssignments.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', borderLeft: '4px solid var(--red)' }}>
                    <div>
                      <strong style={{ fontSize: '0.875rem' }}>{getClientName(a.clientId)}</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>{a.plannedSnapshot?.name || 'Sesión de Rutina'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Programada para: {formatDate(a.scheduledAt)}</div>
                    </div>
                    <button 
                      className="el__btn el__btn--ghost" 
                      style={{ color: 'var(--accent)', borderColor: 'var(--accent)', fontSize: '0.75rem', padding: '4px 8px' }}
                      onClick={() => handleRevertMissed(a.id)}
                    >
                      Revertir a Pendiente
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

    </div>
  );
}
