import { useState, useMemo, useEffect } from 'react';
import { storage, KEYS } from '../services/storage';
import ExerciseFormModal from './ExerciseFormModal';
import GlobalCatalogModal from './GlobalCatalogModal';
import './ExerciseLibrary.css';

/* ─── Helpers ─────────────────────────────────────────────── */

function stripAccents(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getYouTubeThumbnail(videoUrl) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    let videoId = null;
    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.slice(1);
    } else if (url.hostname.includes('youtube.com')) {
      videoId = url.searchParams.get('v');
    }
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  } catch {
    return null;
  }
}

function getYouTubeEmbedUrl(videoUrl) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    let videoId = null;
    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.slice(1);
    } else if (url.hostname.includes('youtube.com')) {
      videoId = url.searchParams.get('v');
    }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
  } catch {
    return null;
  }
}

function getCategoryBadgeClass(categoryId) {
  const map = {
    1: 'badge--blue',  // Tren Superior
    2: 'badge--green', // Tren Inferior
    3: 'badge--amber'  // Core
  };
  return map[categoryId] || 'badge--default';
}

/* ─── Sub-componente: Video / Imagen Preview ────────────── */
function VideoThumbnail({ videoUrl, name, image }) {
  const [imgError, setImgError] = useState(false);
  const thumbnailUrl = getYouTubeThumbnail(videoUrl);
  const src = (!imgError && image) ? image : (!imgError ? thumbnailUrl : null);
  const showImg = !!src;

  return (
    <div className="el__card-img-wrap">
      {showImg ? (
        <img
          src={src}
          alt={`Visualización de ${name}`}
          className="el__card-img"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="el__card-img-fallback">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5" strokeLinecap="round">
            <rect x="2" y="6" width="20" height="14" rx="3"/>
            <path d="M8 10l6 4-6 4V10z" fill="var(--gray-200)" stroke="none"/>
          </svg>
          <span>Sin imagen</span>
        </div>
      )}

      {videoUrl && showImg && (
        <div className="el__card-play-overlay" aria-hidden="true">
          <span className="el__card-play-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </span>
        </div>
      )}
    </div>
  );
}

export default function ExerciseLibrary() {
  // Datos principales relacionales V4
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  // Estados visuales
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState('Todas');
  const [selectedSubcatFilter, setSelectedSubcatFilter] = useState('Todas');
  const [sortOrder, setSortOrder] = useState('name-asc');

  // Modales
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEx, setEditingEx] = useState(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Cargar datos
  const [errorMsg, setErrorMsg] = useState(null);

  async function loadLibraryData() {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const dbExs = await storage.getExercises();
      const dbCats = await storage.getEntities(KEYS.EX_CATEGORIES);
      const dbSubs = await storage.getEntities(KEYS.EX_SUBCATEGORIES);

      setExercises(dbExs);
      setCategories(dbCats);
      setSubcategories(dbSubs);
    } catch (error) {
      console.error("Error loading library data:", error);
      setErrorMsg(error.message || String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLibraryData();
  }, []);

  // Limpiar filtros
  const handleClearFilters = () => {
    setSearch('');
    setSelectedCatFilter('Todas');
    setSelectedSubcatFilter('Todas');
    setSortOrder('name-asc');
  };

  // --- Toggle Favoritos Instantáneo ---
  const handleToggleFavorite = async (e, ex) => {
    e.stopPropagation(); // Evitar abrir modal de vídeo
    const updated = {
      ...ex,
      favorite: !ex.favorite
    };
    // Guardar en persistencia asíncrona
    await storage.saveExercise(updated);
    setExercises(prev => prev.map(item => item.id === ex.id ? updated : item));
  };

  // --- CRUD Ejercicio ---
  const handleOpenCreate = () => {
    setEditingEx(null);
    setShowFormModal(true);
  };

  const handleOpenEdit = (e, ex) => {
    e.stopPropagation();
    setEditingEx(ex);
    setShowFormModal(true);
  };

  const handleDeleteExercise = async (e, ex) => {
    e.stopPropagation();
    if (!window.confirm(`¿Seguro que deseas eliminar definitivamente "${ex.name}" de la biblioteca?`)) return;
    try {
      await storage.deleteExercise(ex.id);
      setExercises(prev => prev.filter(item => item.id !== ex.id));
    } catch (err) {
      alert(err.message); // Bloqueo por integridad si está en uso en rutinas
    }
  };

  // Filtrado y Ordenación Relacional
  const filteredExercises = useMemo(() => {
    let result = exercises;

    // 1. Favoritos
    if (onlyFavorites) {
      result = result.filter(ex => !!ex.favorite);
    }

    // 2. Filtro Categoría
    if (selectedCatFilter !== 'Todas') {
      result = result.filter(ex => String(ex.categoryId) === String(selectedCatFilter));
    }

    // 3. Filtro Subcategoría
    if (selectedSubcatFilter !== 'Todas') {
      result = result.filter(ex => String(ex.subcategoryId) === String(selectedSubcatFilter));
    }

    // 7. Buscador
    if (search.trim()) {
      const query = stripAccents(search);
      result = result.filter(ex => {
        const nameMatch = stripAccents(ex.name).includes(query);
        
        // Buscar nombres correspondientes a los IDs para buscar por categoría
        const catName = categories.find(c => c.id === ex.categoryId)?.name || '';
        const catMatch = stripAccents(catName).includes(query);

        const subName = subcategories.find(s => s.id === ex.subcategoryId)?.name || '';
        const subcatMatch = stripAccents(subName).includes(query);

        return nameMatch || catMatch || subcatMatch;
      });
    }

    // 8. Ordenación
    const sorted = [...result];
    if (sortOrder === 'name-asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'name-desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortOrder === 'favorites') {
      sorted.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
    }

    return sorted;
  }, [exercises, onlyFavorites, selectedCatFilter, selectedSubcatFilter, search, sortOrder, categories, subcategories]);

  if (loading) {
    return <div className="el__placeholder"><p>Cargando biblioteca de ejercicios...</p></div>;
  }
  if (errorMsg) {
    return <div className="el__placeholder" style={{color: 'red'}}><p>Error: {errorMsg}</p></div>;
  }

  return (
    <section className="el" aria-label="Biblioteca de Ejercicios">
      
      {/* Cabecera */}
      <header className="el__header">
        <div className="el__title-group">
          <h1 className="el__title">Biblioteca de Ejercicios</h1>
          <p className="el__subtitle">
            Crea, edita y gestiona el catálogo de ejercicios de fuerza, cardio y movilidad.
          </p>
        </div>

        <div className="el__header-actions">
          <button className="el__btn el__btn--ghost" onClick={() => setShowCatalogModal(true)} title="Gestionar categorías y subcategorías">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            Gestionar Catálogos
          </button>
          <button className="el__btn el__btn--primary" onClick={handleOpenCreate} title="Registrar ejercicio nuevo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Añadir Ejercicio
          </button>
        </div>
      </header>

      {/* Barra de Filtros */}
      <div className="el__toolbar-container">
        <div className="el__toolbar-main">
          
          {/* Buscador */}
          <div className="el__search-wrap">
            <svg className="el__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="el__search-input"
              placeholder="Buscar por nombre, categoría o músculos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar ejercicios"
            />
            {search && (
              <button className="el__search-clear" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
                ✕
              </button>
            )}
          </div>

          <button
            className={`el__btn el__btn--ghost el__btn-filter ${showFilters ? 'el__btn-filter--active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            {showFilters ? 'Ocultar Filtros' : 'Filtros avanzados'}
          </button>

          <button
            className={`el__btn el__btn--ghost ${onlyFavorites ? 'el__btn--fav-active' : ''}`}
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            title="Mostrar solo marcados como favoritos"
          >
            ★ Favoritos
          </button>

          <div className="el__select-wrap">
            <select
              className="el__select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              aria-label="Ordenar listado"
            >
              <option value="name-asc">Nombre (A-Z)</option>
              <option value="name-desc">Nombre (Z-A)</option>
              <option value="favorites">Favoritos Primero</option>
            </select>
          </div>
        </div>

        {/* Filtros Plegables */}
        {showFilters && (
          <div className="el__toolbar-filters">
            {/* Categoría */}
            <div className="el__select-wrap">
              <select className="el__select" value={selectedCatFilter} onChange={(e) => setSelectedCatFilter(e.target.value)}>
                <option value="Todas">Categoría: Todas</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Subcategoría */}
            <div className="el__select-wrap">
              <select className="el__select" value={selectedSubcatFilter} onChange={(e) => setSelectedSubcatFilter(e.target.value)}>
                <option value="Todas">Subcategoría: Todas</option>
                {subcategories
                  .filter(s => selectedCatFilter === 'Todas' || String(s.categoryId) === String(selectedCatFilter))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
            </div>

            {(selectedCatFilter !== 'Todas' || selectedSubcatFilter !== 'Todas') && (
              <button className="el__btn-clear-filters" onClick={handleClearFilters}>
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '16px', fontSize: '0.8125rem', color: 'var(--gray-400)' }}>
        Mostrando <strong>{filteredExercises.length}</strong> de {exercises.length} ejercicios disponibles.
      </div>

      {/* Grid de Tarjetas */}
      {filteredExercises.length === 0 ? (
        <div className="el__empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
          <p>No se encontraron ejercicios en la biblioteca.</p>
          <span>Ajusta los filtros o añade uno nuevo.</span>
        </div>
      ) : (
        <div className="el__grid" role="list">
          {filteredExercises.map(ex => {
            const catName = categories.find(c => c.id === ex.categoryId)?.name || 'Sin categoría';
            const subName = subcategories.find(s => s.id === ex.subcategoryId)?.name || '';
            
            return (
              <article
                key={ex.id}
                className="el__card"
                onClick={() => ex.videoUrl && setActiveVideoUrl(ex.videoUrl)}
                role="listitem"
                style={{ cursor: ex.videoUrl ? 'pointer' : 'default' }}
              >
                {/* Estrella de favorito */}
                <button
                  className={`el__card-fav-star ${ex.favorite ? 'el__card-fav-star--active' : ''}`}
                  onClick={(e) => handleToggleFavorite(e, ex)}
                  aria-label={ex.favorite ? "Quitar de favoritos" : "Marcar como favorito"}
                >
                  ★
                </button>

                {/* Imagen/Miniatura */}
                <VideoThumbnail videoUrl={ex.videoUrl} name={ex.name} image={ex.image} />

                {/* Contenido */}
                <div className="el__card-content">
                  <div className="el__card-badges">
                    <span className={`badge ${getCategoryBadgeClass(ex.categoryId)}`}>
                      {catName}
                    </span>
                    {subName && (
                      <span className="badge badge--default">
                        {subName}
                      </span>
                    )}
                  </div>

                  <h3 className="el__card-title">{ex.name}</h3>
                  <p className="el__card-desc">{ex.description || 'Sin descripción.'}</p>
                  
                  {ex.technicalInstructions && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--gray-400)', borderLeft: '2px solid var(--gray-200)', paddingLeft: '8px' }}>
                      <strong>Instrucciones:</strong> {ex.technicalInstructions}
                    </div>
                  )}

                  {/* Acciones de administración */}
                  <div className="el__card-admin-actions">
                    <button
                      className="el__card-admin-btn"
                      onClick={(e) => handleOpenEdit(e, ex)}
                      title="Editar ejercicio"
                    >
                      ✎
                    </button>
                    <button
                      className="el__card-admin-btn el__card-admin-btn--delete"
                      onClick={(e) => handleDeleteExercise(e, ex)}
                      title="Eliminar ejercicio definitivamente"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ══ MODAL DE VÍDEO (YOUTUBE EMBED) ═══════════════════ */}
      {activeVideoUrl && (
        <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={() => setActiveVideoUrl(null)}>
          <div className="el__modal el__modal--video" onClick={e => e.stopPropagation()}>
            <div className="el__modal-header" style={{ borderBottom: 'none', padding: '12px' }}>
              <button className="el__modal-close" onClick={() => setActiveVideoUrl(null)} aria-label="Cerrar reproductor">
                ✕
              </button>
            </div>
            <div className="el__video-aspect">
              <iframe
                src={getYouTubeEmbedUrl(activeVideoUrl)}
                title="Reproductor de vídeo de ejercicio"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL UNIFICADO: AÑADIR / EDITAR EJERCICIO ════════ */}
      {showFormModal && (
        <ExerciseFormModal
          editingEx={editingEx}
          onClose={() => {
            setShowFormModal(false);
            setEditingEx(null);
          }}
          onSave={loadLibraryData}
        />
      )}

      {/* ══ MODAL GLOBAL DE CATÁLOGOS CONTEXTUAL ══════════════ */}
      {showCatalogModal && (
        <GlobalCatalogModal
          contextKeys={[KEYS.EX_CATEGORIES, KEYS.EX_SUBCATEGORIES]}
          initialActiveKey={KEYS.EX_CATEGORIES}
          onClose={() => setShowCatalogModal(false)}
          onRefresh={loadLibraryData}
        />
      )}

    </section>
  );
}
