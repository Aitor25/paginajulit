import { useState, useEffect } from 'react';
import { storage, KEYS } from '../services/storage';
import './GlobalCatalogModal.css';

const ALL_CATALOGS = [
  { key: KEYS.EX_CATEGORIES, label: 'Categorías de Ejercicios' },
  { key: KEYS.EX_SUBCATEGORIES, label: 'Subcategorías de Ejercicios' },
  { key: KEYS.GROUPS, label: 'Grupos de Entrenamiento' },
  { key: KEYS.SPORTS, label: 'Deportes' },
  { key: KEYS.TEAMS, label: 'Equipos / Clubes' },
  { key: KEYS.CLIENT_CATEGORIES, label: 'Categorías de Cliente' },
  { key: KEYS.POSITIONS, label: 'Posiciones de Cliente' },
  { key: KEYS.COMPETITIVE_LEVELS, label: 'Niveles Competitivos' },
  { key: KEYS.TEST_CATEGORIES, label: 'Categorías de Test' },
  { key: KEYS.TEST_DEFINITIONS, label: 'Definiciones de Tests' }
];

export default function GlobalCatalogModal({
  mode = 'complete',
  contextKeys = [],
  initialActiveKey = null,
  onClose,
  onRefresh
}) {
  // Filtrar catálogos a mostrar según el modo
  const catalogsToShow = mode === 'contextual'
    ? ALL_CATALOGS.filter(c => contextKeys.includes(c.key))
    : ALL_CATALOGS;

  const [activeKey, setActiveKey] = useState(initialActiveKey || catalogsToShow[0]?.key || KEYS.EX_CATEGORIES);
  const [items, setItems] = useState([]);
  
  // Listas auxiliares para relaciones en subformularios
  const [exerciseCategories, setExerciseCategories] = useState([]);
  const [testCategories, setTestCategories] = useState([]);
  
  // Estados para creación
  const [newName, setNewName] = useState('');
  const [extraField, setExtraField] = useState(''); // description (para grupos) o categoryId (para subcategorías) o code (para tipos)
  const [newDefinitionCategory, setNewDefinitionCategory] = useState('');
  const [newDefinitionType, setNewDefinitionType] = useState('number');
  const [newDefinitionUnit, setNewDefinitionUnit] = useState('');
  const [newDefinitionAllowClientEntry, setNewDefinitionAllowClientEntry] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Estados para edición inline
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingExtra, setEditingExtra] = useState('');
  const [editingDefinitionCategory, setEditingDefinitionCategory] = useState('');
  const [editingDefinitionType, setEditingDefinitionType] = useState('number');
  const [editingDefinitionUnit, setEditingDefinitionUnit] = useState('');
  const [editingDefinitionAllowClientEntry, setEditingDefinitionAllowClientEntry] = useState(false);

  // Cargar registros del catálogo activo
  useEffect(() => {
    async function loadCatalogItems() {
      setErrorMsg('');
      setNewName('');
      setExtraField('');
      setEditingId(null);

      const data = await storage.getEntities(activeKey);
      
      // Ordenar alfabéticamente
      data.sort((a, b) => a.name.localeCompare(b.name));
      setItems(data);

      // Si es subcategoría, necesitamos cargar las categorías para el select
      if (activeKey === KEYS.EX_SUBCATEGORIES) {
        const cats = await storage.getEntities(KEYS.EX_CATEGORIES);
        setExerciseCategories(cats);
        if (cats.length > 0) {
          setExtraField(String(cats[0].id));
        }
      }

      // Si es definiciones de test, cargar categorías de test
      if (activeKey === KEYS.TEST_DEFINITIONS) {
        const testCats = await storage.getEntities(KEYS.TEST_CATEGORIES);
        setTestCategories(testCats);
        if (testCats.length > 0) {
          setNewDefinitionCategory(String(testCats[0].id));
        }
        setNewDefinitionType('number');
        setNewDefinitionUnit('');
        setNewDefinitionAllowClientEntry(false);
      }
    }
    loadCatalogItems();
  }, [activeKey]);

  async function refreshList() {
    const data = await storage.getEntities(activeKey);
    data.sort((a, b) => a.name.localeCompare(b.name));
    setItems(data);
    if (onRefresh) onRefresh();
  }

  // --- Operaciones CRUD ---
  async function handleAdd(e) {
    e.preventDefault();
    setErrorMsg('');
    const trimmed = newName.trim();
    if (!trimmed) return;

    const payload = { name: trimmed };

    if (activeKey === KEYS.EX_SUBCATEGORIES) {
      if (!extraField) {
        setErrorMsg('Debes seleccionar una categoría principal.');
        return;
      }
      payload.categoryId = String(extraField);
    } else if (activeKey === KEYS.GROUPS) {
      payload.description = extraField.trim();
        } else if (activeKey === KEYS.TEST_DEFINITIONS) {
      if (!newDefinitionCategory) {
        setErrorMsg('Debes seleccionar una categoría de test.');
        return;
      }
      payload.categoryId = String(newDefinitionCategory);
      payload.type = newDefinitionType;
      payload.unit = newDefinitionUnit.trim() || null;
      payload.allowClientEntry = !!newDefinitionAllowClientEntry;
    }

    try {
      await storage.saveEntity(activeKey, payload);
      setNewName('');
      if (activeKey === KEYS.GROUPS) setExtraField('');
      await refreshList();
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  async function handleSaveEdit(id) {
    setErrorMsg('');
    const trimmed = editingName.trim();
    if (!trimmed) return;

    const original = items.find(i => i.id === id);
    if (!original) return;

    const payload = {
      ...original,
      name: trimmed
    };

    if (activeKey === KEYS.EX_SUBCATEGORIES) {
      payload.categoryId = String(editingExtra);
    } else if (activeKey === KEYS.GROUPS) {
      payload.description = editingExtra.trim();
        } else if (activeKey === KEYS.TEST_DEFINITIONS) {
      payload.categoryId = String(editingDefinitionCategory);
      payload.type = editingDefinitionType;
      payload.unit = editingDefinitionUnit.trim() || null;
      payload.allowClientEntry = !!editingDefinitionAllowClientEntry;
    }

    try {
      await storage.saveEntity(activeKey, payload);
      setEditingId(null);
      await refreshList();
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  async function handleDelete(id, name) {
    setErrorMsg('');
    
    // Alertas de impacto al entrenador
    let confirmPrompt = `¿Seguro que deseas eliminar "${name}" del catálogo?`;
    
    if (activeKey === KEYS.EX_CATEGORIES || activeKey === KEYS.EX_SUBCATEGORIES) {
      confirmPrompt += `\n* IMPORTANTE: Se bloqueará la acción si algún ejercicio está utilizándolo.`;
    } else if (activeKey === KEYS.TEST_DEFINITIONS) {
      confirmPrompt += `\n* IMPORTANTE: Se bloqueará el borrado si tiene mediciones históricas guardadas.`;
    } else {
      confirmPrompt += `\n* Los registros de clientes u hojas asociadas se actualizarán a "Sin asignar" (null).`;
    }

    if (!window.confirm(confirmPrompt)) return;

    try {
      await storage.deleteEntity(activeKey, id);
      await refreshList();
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  return (
    <div className="gc__modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="gc__modal" onClick={e => e.stopPropagation()}>
        
        <div className="gc__header">
          <h2 className="gc__title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            Administración de Catálogos
          </h2>
          <button className="gc__close" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>

        {/* Pestañas de Catálogos */}
        <div className="gc__tabs-container">
          {catalogsToShow.map(c => (
            <button
              key={c.key}
              className={`gc__tab-btn ${activeKey === c.key ? 'gc__tab-btn--active' : ''}`}
              onClick={() => setActiveKey(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="gc__body">
          
          {errorMsg && (
            <div className="gc__alert" style={{ background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030' }}>
              <strong>Error de Integridad:</strong> {errorMsg}
            </div>
          )}

          {/* Listado de Entidades del Catálogo Seleccionado */}
          <div>
            <p className="el__cat-section-label" style={{ marginBottom: '8px' }}>
              Registros en "{ALL_CATALOGS.find(c => c.key === activeKey)?.label}" ({items.length})
            </p>
            {items.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', padding: '16px', textAlign: 'center', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)' }}>
                No hay elementos registrados en este catálogo.
              </p>
            ) : (
              <ul className="gc__entity-list" role="list">
                {items.map(item => {
                  const isEditing = editingId === item.id;
                  
                  // Obtener detalles extras para la visualización
                  let subDetail = '';
                  if (activeKey === KEYS.EX_SUBCATEGORIES) {
                    const catName = exerciseCategories.find(c => c.id === item.categoryId)?.name || 'Sin categoría';
                    subDetail = `Categoría: ${catName}`;
                  } else if (activeKey === KEYS.GROUPS && item.description) {
                    subDetail = item.description;
                                    } else if (activeKey === KEYS.TEST_DEFINITIONS) {
                    const catName = testCategories.find(c => c.id === item.categoryId)?.name || 'Sin categoría';
                    subDetail = `Categoría: ${catName} | Tipo: ${item.type} ${item.unit ? `(${item.unit})` : ''} | ${item.allowClientEntry ? '🔓 Auto-registro' : '🔒 Coach only'}`;
                  }

                  return (
                    <li key={item.id} className="gc__entity-item">
                      {isEditing ? (
                        /* Modo Edición Inline */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              className="el__input"
                              style={{ height: '36px' }}
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              required
                            />
                            <button className="el__btn el__btn--primary" style={{ padding: '0 12px', height: '36px' }} onClick={() => handleSaveEdit(item.id)}>
                              Guardar
                            </button>
                            <button className="el__btn el__btn--ghost" style={{ padding: '0 12px', height: '36px' }} onClick={() => setEditingId(null)}>
                              Cancelar
                            </button>
                          </div>

                          {/* Inputs adicionales de edición si aplica */}
                          {activeKey === KEYS.EX_SUBCATEGORIES && (
                            <div className="el__field">
                              <label className="el__label" style={{ fontSize: '0.7rem' }}>Categoría de ejercicio asociada</label>
                              <select
                                className="el__input el__input--select"
                                value={editingExtra}
                                onChange={e => setEditingExtra(e.target.value)}
                              >
                                {exerciseCategories.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {activeKey === KEYS.GROUPS && (
                            <input
                              type="text"
                              className="el__input"
                              placeholder="Descripción opcional..."
                              value={editingExtra}
                              onChange={e => setEditingExtra(e.target.value)}
                            />
                          )}

                          {activeKey === KEYS.TEST_DEFINITIONS && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginTop: '8px' }}>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.7rem' }}>Categoría de test</label>
                                <select
                                  className="el__input el__input--select"
                                  value={editingDefinitionCategory}
                                  onChange={e => setEditingDefinitionCategory(e.target.value)}
                                >
                                  {testCategories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.7rem' }}>Tipo de resultado</label>
                                <select
                                  className="el__input el__input--select"
                                  value={editingDefinitionType}
                                  onChange={e => setEditingDefinitionType(e.target.value)}
                                >
                                  <option value="number">Numérico (number)</option>
                                  <option value="time">Tiempo (time)</option>
                                  <option value="text">Texto (text)</option>
                                  <option value="boolean">Verdadero / Falso (boolean)</option>
                                </select>
                              </div>
                              <div className="el__field" style={{ margin: 0 }}>
                                <label className="el__label" style={{ fontSize: '0.7rem' }}>Unidad (opcional)</label>
                                <input
                                  type="text"
                                  className="el__input"
                                  style={{ height: '36px' }}
                                  placeholder="ej. kg, cm"
                                  value={editingDefinitionUnit}
                                  onChange={e => setEditingDefinitionUnit(e.target.value)}
                                />
                              </div>
                              <div className="el__field" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', cursor: 'pointer', margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={editingDefinitionAllowClientEntry}
                                    onChange={e => setEditingDefinitionAllowClientEntry(e.target.checked)}
                                  />
                                  Auto-registro
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Modo Lectura */
                        <>
                          <div className="gc__entity-name-wrap">
                            <span className="gc__entity-name">{item.name}</span>
                            {subDetail && <span className="gc__entity-meta">{subDetail}</span>}
                          </div>
                          <div className="gc__entity-actions">
                            <button
                              className="gc__action-btn gc__action-btn--edit"
                              onClick={() => {
                                setEditingId(item.id);
                                setEditingName(item.name);
                                setEditingExtra(
                                  activeKey === KEYS.EX_SUBCATEGORIES
                                    ? String(item.categoryId)
                                    : activeKey === KEYS.GROUPS
                                    ? item.description || ''
                                    : ''
                                );
                                if (activeKey === KEYS.TEST_DEFINITIONS) {
                                  setEditingDefinitionCategory(String(item.categoryId));
                                  setEditingDefinitionType(item.type);
                                  setEditingDefinitionUnit(item.unit || '');
                                  setEditingDefinitionAllowClientEntry(!!item.allowClientEntry);
                                }
                              }}
                            >
                              Editar
                            </button>
                            <button className="gc__action-btn gc__action-btn--delete" onClick={() => handleDelete(item.id, item.name)}>
                              Borrar
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Formulario de Inserción */}
          {!editingId && (
            <form onSubmit={handleAdd} className="gc__add-form">
              <h3 className="gc__add-title">Añadir registro nuevo</h3>
              
              <div className="el__field">
                <label className="el__label">Nombre del registro *</label>
                <input
                  type="text"
                  className="el__input"
                  placeholder="Escribe el nombre aquí..."
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                />
              </div>

              {/* Campos condicionales para subformularios */}
              {activeKey === KEYS.EX_SUBCATEGORIES && (
                <div className="el__field">
                  <label className="el__label">Categoría a la que pertenece *</label>
                  <select
                    className="el__input el__input--select"
                    value={extraField}
                    onChange={e => setExtraField(e.target.value)}
                  >
                    {exerciseCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeKey === KEYS.GROUPS && (
                <div className="el__field">
                  <label className="el__label">Descripción opcional</label>
                  <input
                    type="text"
                    className="el__input"
                    placeholder="ej. Sesión para atletas de campo"
                    value={extraField}
                    onChange={e => setExtraField(e.target.value)}
                  />
                </div>
              )}

              {activeKey === KEYS.TEST_DEFINITIONS && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginTop: '10px', width: '100%' }}>
                  <div className="el__field" style={{ margin: 0 }}>
                    <label className="el__label">Categoría del test *</label>
                    <select
                      className="el__input el__input--select"
                      value={newDefinitionCategory}
                      onChange={e => setNewDefinitionCategory(e.target.value)}
                    >
                      {testCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="el__field" style={{ margin: 0 }}>
                    <label className="el__label">Tipo de resultado *</label>
                    <select
                      className="el__input el__input--select"
                      value={newDefinitionType}
                      onChange={e => setNewDefinitionType(e.target.value)}
                    >
                      <option value="number">Numérico (number)</option>
                      <option value="time">Tiempo (time)</option>
                      <option value="text">Texto (text)</option>
                      <option value="boolean">Verdadero / Falso (boolean)</option>
                    </select>
                  </div>
                  <div className="el__field" style={{ margin: 0 }}>
                    <label className="el__label">Unidad de medida</label>
                    <input
                      type="text"
                      className="el__input"
                      placeholder="ej. kg, s, cm"
                      value={newDefinitionUnit}
                      onChange={e => setNewDefinitionUnit(e.target.value)}
                    />
                  </div>
                  <div className="el__field" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={newDefinitionAllowClientEntry}
                        onChange={e => setNewDefinitionAllowClientEntry(e.target.checked)}
                      />
                      Auto-registro
                    </label>
                  </div>
                </div>
              )}

              <button type="submit" className="el__btn el__btn--primary" style={{ alignSelf: 'flex-end' }}>
                Añadir al catálogo
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
}
