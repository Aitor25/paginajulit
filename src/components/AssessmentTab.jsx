import { useState, useEffect, useMemo } from 'react';
import { storage, KEYS } from '../services/storage';
import { formatDateTime } from '../utils/dateUtils';
import GlobalCatalogModal from './GlobalCatalogModal';
import './AssessmentTab.css';

/* ─── Helpers y Validaciones de Tiempos ──────────────────── */

function stripAccents(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function validateTimeFormat(str) {
  if (!str) return false;
  const clean = str.replace(/\s/g, '');
  const regex = /^(\d{1,2}:)?\d{1,2}(\.\d{1,3})?$/;
  return regex.test(clean);
}

function parseTimeToSeconds(str) {
  if (!str) return null;
  const clean = str.replace(/\s/g, '');
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return (minutes * 60) + seconds;
  }
  return parseFloat(clean) || null;
}

function formatSecondsToTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  if (mins > 0) {
    return `${mins}:${secs.padStart(5, '0')} min`;
  }
  return `${secs} s`;
}

const DEFAULT_FORM_STATE = {
  testDefinitionId: '',
  performedAt: '',
  value: '',
  unit: '',
  attemptNumber: '1',
  observations: '',
  // Subformulario para test nuevo
  newName: '',
  newDescription: '',
  newProtocol: '',
  newCategoryId: '',
  newValueType: 'number',
  newDefaultUnit: '',
  newComparisonDirection: 'neutral'
};

export default function AssessmentTab({ clientId }) {
  // Datos principales
  const [anamnesis, setAnamnesis] = useState(null);
  const [testDefinitions, setTestDefinitions] = useState([]);
  const [testCategories, setTestCategories] = useState([]);
  const [results, setResults] = useState([]);

  // Estados visuales y de edición
  const [isEditingAnamnesis, setIsEditingAnamnesis] = useState(false);
  const [anamnesisForm, setAnamnesisForm] = useState({
    previousInjuries: '',
    currentInjuries: '',
    surgeries: '',
    medications: '',
    healthNotes: '',
    shortTermGoals: '',
    longTermGoals: ''
  });

  // Filtros de resultados
  const [search, setSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('Todas');
  const [sortBy, setSortBy] = useState('date-desc');

  // Modales y sub-vistas
  const [showModal, setShowModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingResult, setEditingResult] = useState(null);
  const [deletingResult, setDeletingResult] = useState(null);
  const [selectedHistoryDefId, setSelectedHistoryDefId] = useState(null);
  const [testEvolutionData, setTestEvolutionData] = useState([]);

  // Formulario de test
  const [form, setForm] = useState(DEFAULT_FORM_STATE);
  const [formError, setFormError] = useState('');

  // Cargar datos
  async function loadData() {
    const dbAnam = await storage.getAnamnesisByClientId(clientId);
    const dbDefs = await storage.getTestDefinitions();
    const dbCats = await storage.getEntities(KEYS.TEST_CATEGORIES);
    const dbResults = await storage.getTestResults(clientId);

    setAnamnesis(dbAnam);
    setAnamnesisForm({
      previousInjuries: dbAnam.previousInjuries || 'Ninguna',
      currentInjuries: dbAnam.currentInjuries || 'Ninguna',
      surgeries: dbAnam.surgeries || 'Ninguna',
      medications: dbAnam.medications || 'Ninguna',
      healthNotes: dbAnam.healthNotes || '',
      shortTermGoals: dbAnam.shortTermGoals || '',
      longTermGoals: dbAnam.longTermGoals || ''
    });

    setTestDefinitions(dbDefs);
    setTestCategories(dbCats);
    setResults(dbResults);

    // Seleccionar por defecto la primera categoría para el formulario
    if (dbCats.length > 0 && !form.newCategoryId) {
      setForm(f => ({ ...f, newCategoryId: String(dbCats[0].id) }));
    }
  }

  useEffect(() => {
    loadData();
  }, [clientId]);

  // Cargar evolución cuando se selecciona un test
  useEffect(() => {
    async function loadEvo() {
      if (selectedHistoryDefId) {
        const evo = await storage.getTestEvolution(clientId, selectedHistoryDefId);
        setTestEvolutionData(evo.evolution);
      } else {
        setTestEvolutionData([]);
      }
    }
    loadEvo();
  }, [selectedHistoryDefId, clientId, results]);

  // --- Manejadores Anamnesis ---
  async function handleSaveAnamnesis(e) {
    e.preventDefault();
    if (!anamnesis) return;

    const updated = {
      ...anamnesis,
      ...anamnesisForm,
      clientId: String(clientId)
    };

    const saved = await storage.saveAnamnesis(updated);
    setAnamnesis(saved);
    setIsEditingAnamnesis(false);
  }

  // --- Manejadores Formulario Test ---
  const handleOpenCreateModal = () => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setEditingResult(null);
    setForm({
      ...DEFAULT_FORM_STATE,
      testDefinitionId: testDefinitions[0]?.id ? String(testDefinitions[0].id) : 'new',
      newCategoryId: testCategories[0]?.id ? String(testCategories[0].id) : '',
      performedAt: localDateTime,
      unit: testDefinitions[0]?.defaultUnit || ''
    });
    setFormError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (res) => {
    const def = testDefinitions.find(d => d.id === res.testDefinitionId);
    let displayValue = '';

    if (def) {
      if (def.valueType === 'time') {
        displayValue = formatSecondsToTime(res.numericValue).replace(' min', '').replace(' s', '');
      } else if (def.valueType === 'number') {
        displayValue = String(res.numericValue);
      } else if (def.valueType === 'boolean') {
        displayValue = res.booleanValue ? 'true' : 'false';
      } else {
        displayValue = res.textValue || '';
      }
    }

    const localDateTime = res.performedAt ? res.performedAt.slice(0, 16) : '';

    setEditingResult(res);
    setForm({
      testDefinitionId: String(res.testDefinitionId),
      performedAt: localDateTime,
      value: displayValue,
      unit: res.unit || '',
      attemptNumber: String(res.attemptNumber || 1),
      observations: res.observations || '',
      newName: '',
      newDescription: '',
      newProtocol: '',
      newCategoryId: testCategories[0]?.id ? String(testCategories[0].id) : '',
      newValueType: 'number',
      newDefaultUnit: '',
      newComparisonDirection: 'neutral'
    });
    setFormError('');
    setShowModal(true);
  };

  const handleTestDefinitionChange = (e) => {
    const val = e.target.value;
    setForm(f => {
      if (val === 'new') {
        return {
          ...f,
          testDefinitionId: val,
          value: '',
          unit: ''
        };
      }
      const def = testDefinitions.find(d => String(d.id) === String(val));
      return {
        ...f,
        testDefinitionId: val,
        unit: def ? def.defaultUnit : '',
        value: def?.valueType === 'boolean' ? 'true' : ''
      };
    });
  };

  async function handleSaveTest(e) {
    e.preventDefault();
    setFormError('');

    let defId = null;
    let valueType = 'number';

    if (form.testDefinitionId === 'new') {
      const newDefName = form.newName.trim();
      if (!newDefName) {
        setFormError('El nombre del tipo de test es obligatorio.');
        return;
      }
      if (!form.newCategoryId) {
        setFormError('Debes seleccionar una categoría de test.');
        return;
      }

      // Reutiliza o crea definición normalizada
      const savedDef = await storage.saveTestDefinition({
        name: newDefName,
        description: form.newDescription.trim(),
        protocol: form.newProtocol.trim(),
        categoryId: String(form.newCategoryId),
        defaultUnit: form.newDefaultUnit.trim(),
        valueType: form.newValueType,
        comparisonDirection: form.newComparisonDirection
      });

      defId = savedDef.id;
      valueType = savedDef.valueType;

      // Recargar catálogo de definiciones
      const dbDefs = await storage.getTestDefinitions();
      setTestDefinitions(dbDefs);
    } else {
      defId = String(form.testDefinitionId);
      const def = testDefinitions.find(d => String(d.id) === defId);
      if (!def) return;
      valueType = def.valueType;
    }

    // Validaciones de rangos y formatos
    let numericVal = null;
    let textVal = null;
    let boolVal = null;
    const rawVal = form.value.trim();

    if (valueType === 'number') {
      const parsed = parseFloat(rawVal);
      if (isNaN(parsed)) {
        setFormError('El resultado debe ser un número válido.');
        return;
      }
      numericVal = parsed;
    } else if (valueType === 'time') {
      if (!validateTimeFormat(rawVal)) {
        setFormError('El formato de tiempo debe ser MM:SS.CC o SS.CC.');
        return;
      }
      numericVal = parseTimeToSeconds(rawVal);
    } else if (valueType === 'boolean') {
      boolVal = rawVal === 'true';
    } else {
      textVal = rawVal;
    }

    const performedISO = form.performedAt ? new Date(form.performedAt).toISOString() : new Date().toISOString();

    const resultData = {
      clientId: String(clientId),
      testDefinitionId: defId,
      performedAt: performedISO,
      numericValue: numericVal,
      textValue: textVal,
      booleanValue: boolVal,
      unit: form.unit.trim(),
      attemptNumber: form.attemptNumber ? Number(form.attemptNumber) : 1,
      observations: form.observations.trim()
    };

    if (editingResult) {
      resultData.id = editingResult.id;
    }

    try {
      const saved = await storage.saveTestResult(resultData);
      setResults(prev => {
        if (editingResult) {
          return prev.map(r => r.id === saved.id ? saved : r);
        } else {
          return [...prev, saved];
        }
      });
      setShowModal(false);
      setEditingResult(null);
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingResult) return;
    await storage.deleteTestResult(deletingResult.id);
    setResults(prev => prev.filter(r => r.id !== deletingResult.id));
    setDeletingResult(null);
  }

  // --- Listado y Filtros ---
  const filteredResults = useMemo(() => {
    let result = results;

    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(r => {
        const def = testDefinitions.find(d => d.id === r.testDefinitionId);
        return def && stripAccents(def.name).includes(query);
      });
    }

    if (selectedCategoryFilter !== 'Todas') {
      result = result.filter(r => {
        const def = testDefinitions.find(d => String(d.id) === String(r.testDefinitionId));
        return def && String(def.categoryId) === String(selectedCategoryFilter);
      });
    }

    const sorted = [...result];
    if (sortBy === 'date-desc') {
      sorted.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
    } else if (sortBy === 'date-asc') {
      sorted.sort((a, b) => new Date(a.performedAt) - new Date(b.performedAt));
    }

    return sorted;
  }, [results, search, selectedCategoryFilter, sortBy, testDefinitions]);

  return (
    <div className="as__container">
      
      {/* 🔒 AVISO PRIVACIDAD */}
      <div className="as__privacy-banner">
        <span>🔒 INFORMACIÓN PRIVADA - EXCLUSIVA DEL ENTRENADOR</span>
      </div>

      {/* ══ APARTADO 1: ANAMNESIS ═══════════════════════════════ */}
      <div className="as__anamnesis-section">
        <div className="as__section-header">
          <h3 className="as__section-title">Anamnesis Deportiva e Historial Clínico</h3>
          {!isEditingAnamnesis ? (
            <button className="el__btn el__btn--ghost" onClick={() => setIsEditingAnamnesis(true)}>
              ✎ Editar Anamnesis
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="el__btn el__btn--ghost" onClick={() => setIsEditingAnamnesis(false)}>
                Cancelar
              </button>
              <button className="el__btn el__btn--primary" onClick={handleSaveAnamnesis}>
                Guardar
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveAnamnesis} className="as__anamnesis-grid">
          <div className="as__anamnesis-field">
            <span className="as__anamnesis-label">Lesiones Previas</span>
            {isEditingAnamnesis ? (
              <textarea
                className="el__input el__input--textarea"
                value={anamnesisForm.previousInjuries}
                onChange={e => setAnamnesisForm(f => ({ ...f, previousInjuries: e.target.value }))}
              />
            ) : (
              <div className="as__anamnesis-value">{anamnesisForm.previousInjuries || 'Ninguna'}</div>
            )}
          </div>

          <div className="as__anamnesis-field">
            <span className="as__anamnesis-label">Lesiones Actuales / Molestias</span>
            {isEditingAnamnesis ? (
              <textarea
                className="el__input el__input--textarea"
                value={anamnesisForm.currentInjuries}
                onChange={e => setAnamnesisForm(f => ({ ...f, currentInjuries: e.target.value }))}
              />
            ) : (
              <div className="as__anamnesis-value">{anamnesisForm.currentInjuries || 'Ninguna'}</div>
            )}
          </div>

          <div className="as__anamnesis-field">
            <span className="as__anamnesis-label">Operaciones / Cirugías</span>
            {isEditingAnamnesis ? (
              <textarea
                className="el__input el__input--textarea"
                value={anamnesisForm.surgeries}
                onChange={e => setAnamnesisForm(f => ({ ...f, surgeries: e.target.value }))}
              />
            ) : (
              <div className="as__anamnesis-value">{anamnesisForm.surgeries || 'Ninguna'}</div>
            )}
          </div>

          <div className="as__anamnesis-field">
            <span className="as__anamnesis-label">Medicación Habitual</span>
            {isEditingAnamnesis ? (
              <textarea
                className="el__input el__input--textarea"
                value={anamnesisForm.medications}
                onChange={e => setAnamnesisForm(f => ({ ...f, medications: e.target.value }))}
              />
            ) : (
              <div className="as__anamnesis-value">{anamnesisForm.medications || 'Ninguna'}</div>
            )}
          </div>

          <div className="as__anamnesis-field" style={{ gridColumn: 'span 2' }}>
            <span className="as__anamnesis-label">Notas Médicas y de Salud</span>
            {isEditingAnamnesis ? (
              <textarea
                className="el__input el__input--textarea"
                placeholder="Alergias, asma, dolencias crónicas..."
                value={anamnesisForm.healthNotes}
                onChange={e => setAnamnesisForm(f => ({ ...f, healthNotes: e.target.value }))}
              />
            ) : (
              <div className="as__anamnesis-value" style={{ minHeight: '60px' }}>
                {anamnesisForm.healthNotes || 'Sin anotaciones de salud.'}
              </div>
            )}
          </div>

          <div className="as__anamnesis-field">
            <span className="as__anamnesis-label">Objetivos a Corto Plazo</span>
            {isEditingAnamnesis ? (
              <textarea
                className="el__input el__input--textarea"
                value={anamnesisForm.shortTermGoals}
                onChange={e => setAnamnesisForm(f => ({ ...f, shortTermGoals: e.target.value }))}
              />
            ) : (
              <div className="as__anamnesis-value">{anamnesisForm.shortTermGoals || 'No declarados'}</div>
            )}
          </div>

          <div className="as__anamnesis-field">
            <span className="as__anamnesis-label">Objetivos a Largo Plazo</span>
            {isEditingAnamnesis ? (
              <textarea
                className="el__input el__input--textarea"
                value={anamnesisForm.longTermGoals}
                onChange={e => setAnamnesisForm(f => ({ ...f, longTermGoals: e.target.value }))}
              />
            ) : (
              <div className="as__anamnesis-value">{anamnesisForm.longTermGoals || 'No declarados'}</div>
            )}
          </div>
        </form>
        
        <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: '16px', fontStyle: 'italic' }}>
          * Nota de seguridad: El almacenamiento local (localStorage) no cuenta con cifrado nativo. No se deben registrar datos médicos reales altamente confidenciales en este entorno local de desarrollo.
        </p>
      </div>

      {/* ══ APARTADO 2: TESTS FÍSICOS ══════════════════════════ */}
      <div className="as__tests-section">
        <div className="as__section-header">
          <h3 className="as__section-title">Historial de Valoraciones y Tests Físicos</h3>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="el__btn el__btn--ghost" onClick={() => setShowCatModal(true)} title="Gestionar categorías de test físico">
              Gestionar Categorías
            </button>
            <button className="el__btn el__btn--primary" onClick={handleOpenCreateModal} title="Registrar una nueva medición">
              + Registrar Test
            </button>
          </div>
        </div>

        {/* Toolbar de filtros de test */}
        <div className="cm__toolbar">
          <div className="cm__search-wrap">
            <svg className="cm__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="cm__search"
              placeholder="Buscar test por nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Buscar test"
            />
          </div>

          <div className="cm__select-wrap">
            <select className="cm__select" value={selectedCategoryFilter} onChange={e => setSelectedCategoryFilter(e.target.value)} aria-label="Filtrar por categoría">
              <option value="Todas">Categoría: Todas</option>
              {testCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="cm__select-wrap">
            <select className="cm__select" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Ordenar listado">
              <option value="date-desc">Fecha: Más recientes</option>
              <option value="date-asc">Fecha: Más antiguos</option>
            </select>
          </div>
        </div>

        {/* Listado de mediciones */}
        {filteredResults.length === 0 ? (
          <div className="cm__empty" style={{ padding: '40px 24px' }}>
            <p>No se encontraron test físicos registrados.</p>
            <span>Registra tu primera medición pulsando el botón "+ Registrar Test".</span>
          </div>
        ) : (
          <div className="as__results-list" role="list">
            {filteredResults.map(res => {
              const def = testDefinitions.find(d => d.id === res.testDefinitionId);
              if (!def) return null;

              const catName = testCategories.find(tc => tc.id === def.categoryId)?.name || 'Sin categoría';

              let valueDisplay = '';
              if (def.valueType === 'time') {
                valueDisplay = formatSecondsToTime(res.numericValue);
              } else if (def.valueType === 'number') {
                valueDisplay = `${res.numericValue} ${res.unit}`;
              } else if (def.valueType === 'boolean') {
                valueDisplay = res.booleanValue ? 'Pasa (Sí)' : 'No pasa (No)';
              } else {
                valueDisplay = res.textValue || '';
              }

              return (
                <div key={res.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <article className="as__result-card" role="listitem">
                    <div className="as__result-main">
                      <h4 className="as__result-test-name">{def.name}</h4>
                      <div className="as__result-meta">
                        <span className="badge badge--default" style={{ fontSize: '0.625rem' }}>{catName}</span>
                        <span>{formatDateTime(res.performedAt)}</span>
                        {res.attemptNumber && <span>Intento #{res.attemptNumber}</span>}
                      </div>
                      {res.observations && <p className="as__result-obs">"{res.observations}"</p>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <span className="as__result-value-badge">
                        {valueDisplay}
                      </span>

                      <div className="as__result-actions">
                        <button
                          className="el__cat-edit-trigger"
                          onClick={() => setSelectedHistoryDefId(selectedHistoryDefId === def.id ? null : def.id)}
                          title="Ver evolución histórica de este test"
                        >
                          Historial
                        </button>
                        <button
                          className="el__card-admin-btn"
                          onClick={() => handleOpenEditModal(res)}
                          title="Editar resultado"
                        >
                          ✎
                        </button>
                        <button
                          className="el__card-admin-btn el__card-admin-btn--delete"
                          onClick={() => setDeletingResult(res)}
                          title="Eliminar resultado"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </article>

                  {/* Historial Progresión */}
                  {selectedHistoryDefId === def.id && (
                    <div className="as__history-drawer">
                      <h5 className="as__history-title">Progresión temporal de {def.name}</h5>
                      <div className="as__history-timeline">
                        {testEvolutionData.map(evo => {
                          let hVal = '';
                          if (def.valueType === 'time') hVal = formatSecondsToTime(evo.value);
                          else if (def.valueType === 'number') hVal = `${evo.value} ${evo.unit}`;
                          else if (def.valueType === 'boolean') hVal = evo.value ? 'Pasa' : 'No pasa';
                          else hVal = evo.value || '';

                          return (
                            <div key={evo.id} className="as__history-item">
                              <span>{formatDateTime(evo.date)}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="as__history-val">{hVal}</span>
                                {evo.variance !== null && (
                                  <span style={{ 
                                    fontSize: '0.75rem', 
                                    fontWeight: 'bold',
                                    color: evo.variance > 0 ? '#16a34a' : evo.variance < 0 ? '#dc2626' : 'var(--text-secondary)'
                                  }}>
                                    {evo.variance > 0 ? `+${evo.variance}` : evo.variance} {evo.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {testEvolutionData.length === 0 && (
                          <div className="as__history-item" style={{ justifyContent: 'center' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Cargando evolución...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ MODAL DE REGISTRO / EDICIÓN DE TEST ══════════════ */}
      {showModal && (
        <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="el__modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="el__modal-header">
              <h2 className="el__modal-title">{editingResult ? 'Editar Resultado del Test' : 'Registrar Nuevo Test'}</h2>
              <button className="el__modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveTest} className="el__modal-form" noValidate>
              
              {!editingResult ? (
                <div className="el__field">
                  <label htmlFor="form-test-id" className="el__label">Selecciona el tipo de Test *</label>
                  <select
                    id="form-test-id"
                    className="el__input el__input--select"
                    value={form.testDefinitionId}
                    onChange={handleTestDefinitionChange}
                  >
                    {testDefinitions.map(d => {
                      const cName = testCategories.find(tc => tc.id === d.categoryId)?.name || 'Sin categoría';
                      return (
                        <option key={d.id} value={d.id}>{d.name} ({cName})</option>
                      );
                    })}
                    <option value="new">+ Crear un tipo de test nuevo...</option>
                  </select>
                </div>
              ) : (
                <div className="el__field">
                  <label className="el__label">Tipo de Test</label>
                  <input
                    type="text"
                    className="el__input"
                    value={testDefinitions.find(d => String(d.id) === String(form.testDefinitionId))?.name || ''}
                    disabled
                  />
                </div>
              )}

              {/* Subformulario de nuevo tipo de test */}
              {form.testDefinitionId === 'new' && (
                <div style={{ padding: '12px 14px', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent)' }}>Configurar nuevo tipo de test</h4>
                  
                  <div className="el__field">
                    <label className="el__label">Nombre del Test *</label>
                    <input
                      type="text"
                      className="el__input"
                      placeholder="ej. CMJ, Sprint 30m"
                      value={form.newName}
                      onChange={e => setForm(f => ({ ...f, newName: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="el__field">
                      <label className="el__label">Categoría *</label>
                      <select
                        className="el__input el__input--select"
                        value={form.newCategoryId}
                        onChange={e => setForm(f => ({ ...f, newCategoryId: e.target.value }))}
                      >
                        {testCategories.map(tc => (
                          <option key={tc.id} value={tc.id}>{tc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="el__field">
                      <label className="el__label">Tipo de Valor *</label>
                      <select
                        className="el__input el__input--select"
                        value={form.newValueType}
                        onChange={e => setForm(f => ({ ...f, newValueType: e.target.value }))}
                      >
                        <option value="number">Número</option>
                        <option value="time">Tiempo</option>
                        <option value="boolean">Pasa/No pasa (Boolean)</option>
                        <option value="text">Cualitativo / Texto</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="el__field">
                      <label className="el__label">Unidad por defecto</label>
                      <input
                        type="text"
                        className="el__input"
                        placeholder="ej. cm, s, kg"
                        value={form.newDefaultUnit}
                        onChange={e => setForm(f => ({ ...f, newDefaultUnit: e.target.value, unit: e.target.value }))}
                      />
                    </div>
                    <div className="el__field">
                      <label className="el__label">Dirección comparación</label>
                      <select
                        className="el__input el__input--select"
                        value={form.newComparisonDirection}
                        onChange={e => setForm(f => ({ ...f, newComparisonDirection: e.target.value }))}
                      >
                        <option value="higher">Mayor es mejor</option>
                        <option value="lower">Menor es mejor</option>
                        <option value="neutral">Neutro / Cualitativo</option>
                      </select>
                    </div>
                  </div>

                  <div className="el__field">
                    <label className="el__label">Protocolo de ejecución</label>
                    <textarea
                      className="el__input el__input--textarea"
                      placeholder="Indica cómo realizar correctamente el test..."
                      rows="2"
                      value={form.newProtocol}
                      onChange={e => setForm(f => ({ ...f, newProtocol: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {/* Fecha y hora */}
              <div className="el__field">
                <label htmlFor="form-performed" className="el__label">Fecha y Hora de realización *</label>
                <input
                  id="form-performed"
                  type="datetime-local"
                  className="el__input"
                  value={form.performedAt}
                  onChange={e => setForm(f => ({ ...f, performedAt: e.target.value }))}
                  required
                />
              </div>

              {/* Intento */}
              <div className="el__field">
                <label htmlFor="form-attempt" className="el__label">Intento número (Opcional)</label>
                <input
                  id="form-attempt"
                  type="number"
                  min="1"
                  className="el__input"
                  value={form.attemptNumber}
                  onChange={e => setForm(f => ({ ...f, attemptNumber: e.target.value }))}
                />
              </div>

              {/* Resultado de la medición */}
              <div className="el__field">
                <label htmlFor="form-val" className="el__label">Resultado de la medición *</label>
                {(() => {
                  const def = testDefinitions.find(d => String(d.id) === String(form.testDefinitionId)) || (form.testDefinitionId === 'new' ? {
                    valueType: form.newValueType
                  } : null);

                  if (!def) return <input id="form-val" className="el__input" disabled placeholder="Elige un test..." />;

                  if (def.valueType === 'boolean') {
                    return (
                      <select
                        id="form-val"
                        className="el__input el__input--select"
                        value={form.value || 'true'}
                        onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      >
                        <option value="true">Pasa (Sí)</option>
                        <option value="false">No pasa (No)</option>
                      </select>
                    );
                  }

                  if (def.valueType === 'time') {
                    return (
                      <div>
                        <input
                          id="form-val"
                          type="text"
                          className="el__input"
                          placeholder="ej: 01:23.45 o 4.15"
                          value={form.value}
                          onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: '2px', display: 'block' }}>
                          Usa formato Minutos:Segundos.Centésimas (MM:SS.CC) o Segundos.Centésimas.
                        </span>
                      </div>
                    );
                  }

                  if (def.valueType === 'number') {
                    return (
                      <input
                        id="form-val"
                        type="number"
                        step="any"
                        className="el__input"
                        placeholder="ej. 42"
                        value={form.value}
                        onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      />
                    );
                  }

                  return (
                    <input
                      id="form-val"
                      type="text"
                      className="el__input"
                      placeholder="Resultado cualitativo..."
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    />
                  );
                })()}
              </div>

              {form.testDefinitionId !== 'new' && (
                <div className="el__field">
                  <label htmlFor="form-unit" className="el__label">Unidad de medida (ej: cm, kg, s)</label>
                  <input
                    id="form-unit"
                    type="text"
                    className="el__input"
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  />
                </div>
              )}

              <div className="el__field">
                <label htmlFor="form-obs" className="el__label">Observaciones</label>
                <textarea
                  id="form-obs"
                  className="el__input el__input--textarea"
                  placeholder="Detalles sobre fatiga o material..."
                  rows="2"
                  value={form.observations}
                  onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                />
              </div>

              {formError && <p className="el__field-error">{formError}</p>}

              <div className="el__modal-actions">
                <button type="button" className="el__btn el__btn--ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="el__btn el__btn--primary">
                  {editingResult ? 'Guardar Cambios' : 'Guardar Resultado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ CONFIRMACIÓN DE ELIMINACIÓN DE RESULTADO ══ */}
      {deletingResult && (
        <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeletingResult(null)}>
          <div className="el__modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="el__modal-header" style={{ borderBottom: 'none', paddingBottom: '10px' }}>
              <h2 className="el__modal-title">¿Eliminar resultado?</h2>
            </div>
            <div className="el__modal-body" style={{ padding: '0 24px 20px', fontSize: '0.8125rem', color: 'var(--gray-600)', lineHeight: '1.5' }}>
              <p>¿Estás seguro de que deseas eliminar este resultado de test?</p>
            </div>
            <div className="el__modal-actions" style={{ padding: '0 24px 24px', borderTop: 'none' }}>
              <button className="el__btn el__btn--ghost" onClick={() => setDeletingResult(null)}>Cancelar</button>
              <button
                className="el__btn el__btn--primary"
                style={{ background: '#e53e3e', boxShadow: 'none' }}
                onClick={handleConfirmDelete}
              >
                Eliminar Resultado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE CATEGORÍAS CONTEXTUAL ══════════════ */}
      {showCatModal && (
        <GlobalCatalogModal
          contextKeys={[KEYS.TEST_CATEGORIES, KEYS.TEST_DEFINITIONS]}
          initialActiveKey={KEYS.TEST_CATEGORIES}
          onClose={() => {
            setShowCatModal(false);
            loadData();
          }}
          onRefresh={loadData}
        />
      )}

    </div>
  );
}
