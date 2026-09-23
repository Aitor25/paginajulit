import { useState, useEffect } from 'react';
import { storage, KEYS } from '../services/storage';
import { getExerciseCategoryIds, getExerciseSubcategoryIds } from '../utils/exerciseCatalog';

export default function ExerciseFormModal({
  editingEx = null,
  onClose,
  onSave
}) {
  // Catálogos
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  // Formulario
  const [form, setForm] = useState({
    name: '',
    categoryIds: [],
    subcategoryIds: [],
    description: '',
    technicalInstructions: '',
    favorite: false,
    image: '',
    videoUrl: ''
  });

  const [formError, setFormError] = useState('');

  // Cargar catálogos
  useEffect(() => {
    async function loadData() {
      const dbCats = await storage.getEntities(KEYS.EX_CATEGORIES);
      const dbSubs = await storage.getEntities(KEYS.EX_SUBCATEGORIES);

      setCategories(dbCats);
      setSubcategories(dbSubs);

      if (editingEx) {
        setForm({
          name: editingEx.name || '',
          categoryIds: getExerciseCategoryIds(editingEx),
          subcategoryIds: getExerciseSubcategoryIds(editingEx),
          description: editingEx.description || '',
          technicalInstructions: editingEx.technicalInstructions || '',
          favorite: !!editingEx.favorite,
          image: editingEx.image || '',
          videoUrl: editingEx.videoUrl || ''
        });
      } else {
        setForm({
          name: '',
          categoryIds: [],
          subcategoryIds: [],
          description: '',
          technicalInstructions: '',
          favorite: false,
          image: '',
          videoUrl: ''
        });
      }
    }
    loadData();
  }, [editingEx]);

  const toggleCategory = (id) => {
    setForm(f => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter(c => c !== id)
        : [...f.categoryIds, id]
    }));
    setFormError('');
  };

  const toggleSubcategory = (id) => {
    setForm(f => ({
      ...f,
      subcategoryIds: f.subcategoryIds.includes(id)
        ? f.subcategoryIds.filter(s => s !== id)
        : [...f.subcategoryIds, id]
    }));
  };

  // Subcategorías de cualquiera de las categorías marcadas
  const filteredSubcategories = subcategories.filter(
    s => form.categoryIds.includes(String(s.categoryId))
  );

  // Si se desmarca una categoría, las subcategorías que dependían solo de
  // ella dejan de ser válidas y se quitan de la selección.
  useEffect(() => {
    const validIds = new Set(filteredSubcategories.map(s => String(s.id)));
    setForm(f => {
      const pruned = f.subcategoryIds.filter(id => validIds.has(id));
      if (pruned.length === f.subcategoryIds.length) return f;
      return { ...f, subcategoryIds: pruned };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.categoryIds, subcategories]);

  // Procesar archivo de imagen con canvas y fondo blanco neutro
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('El archivo seleccionado debe ser una imagen válida.');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      alert('La imagen original es demasiado grande. Selecciona un archivo menor a 4MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIDE = 800;

        if (width > height) {
          if (width > MAX_SIDE) {
            height *= MAX_SIDE / width;
            width = MAX_SIDE;
          }
        } else {
          if (height > MAX_SIDE) {
            width *= MAX_SIDE / height;
            height = MAX_SIDE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Fondo blanco neutro para evitar transparencias negras en JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
        setForm(f => ({ ...f, image: compressedBase64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError('El nombre del ejercicio es obligatorio.');
      return;
    }
    if (form.categoryIds.length === 0) {
      setFormError('Selecciona al menos una categoría.');
      return;
    }

    const exerciseData = {
      name: trimmedName,
      categoryIds: form.categoryIds,
      subcategoryIds: form.subcategoryIds,
      description: form.description.trim(),
      technicalInstructions: form.technicalInstructions.trim(),
      favorite: !!form.favorite,
      image: form.image,
      videoUrl: form.videoUrl.trim()
    };

    if (editingEx) {
      exerciseData.id = editingEx.id;
      exerciseData.status = editingEx.status || 'active';
      exerciseData.createdAt = editingEx.createdAt;
    }

    try {
      const saved = await storage.saveExercise(exerciseData);
      if (onSave) onSave(saved);
      onClose();
    } catch (err) {
      console.error(err);
      alert("No se ha podido guardar la imagen en local por falta de espacio. Se conservaron los datos del formulario.");
    }
  };

  return (
    <div className="el__modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="el__modal" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
        <div className="el__modal-header">
          <h2 className="el__modal-title">{editingEx ? 'Editar Ejercicio' : 'Registrar Nuevo Ejercicio'}</h2>
          <button className="el__modal-close" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>

        <form className="el__modal-form" onSubmit={handleSubmit} noValidate>
          {/* Nombre */}
          <div className="el__field">
            <label htmlFor="ex-name" className="el__label">Nombre del Ejercicio *</label>
            <input
              id="ex-name"
              type="text"
              className={`el__input ${formError ? 'el__input--error' : ''}`}
              placeholder="ej. Press Militar Mancuernas"
              value={form.name}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormError(''); }}
              required
              autoFocus
            />
            {formError && <p className="el__field-error">{formError}</p>}
          </div>

          {/* Categoría y Subcategoría: varias de cada, marcando casillas en
              vez de un desplegable de un solo valor. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="el__field">
              <label className="el__label">Categorías *</label>
              <div className="el__checkbox-list">
                {categories.length === 0 && (
                  <p className="el__checkbox-list-empty">No hay categorías creadas.</p>
                )}
                {categories.map(c => (
                  <label key={c.id} className="el__checkbox-item">
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(String(c.id))}
                      onChange={() => toggleCategory(String(c.id))}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="el__field">
              <label className="el__label">Subcategorías</label>
              <div className="el__checkbox-list">
                {form.categoryIds.length === 0 ? (
                  <p className="el__checkbox-list-empty">Elige antes una categoría.</p>
                ) : filteredSubcategories.length === 0 ? (
                  <p className="el__checkbox-list-empty">Sin subcategorías para lo elegido.</p>
                ) : (
                  filteredSubcategories.map(s => (
                    <label key={s.id} className="el__checkbox-item">
                      <input
                        type="checkbox"
                        checked={form.subcategoryIds.includes(String(s.id))}
                        onChange={() => toggleSubcategory(String(s.id))}
                      />
                      {s.name}
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Descripción */}
          <div className="el__field">
            <label htmlFor="ex-desc" className="el__label">Descripción</label>
            <textarea
              id="ex-desc"
              className="el__input el__input--textarea"
              placeholder="Escribe una breve descripción del ejercicio y su enfoque principal..."
              rows="3"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Instrucciones Técnicas */}
          <div className="el__field">
            <label htmlFor="ex-tech" className="el__label">Instrucciones Técnicas / Ejecución</label>
            <textarea
              id="ex-tech"
              className="el__input el__input--textarea"
              placeholder="Indica el agarre, postura de columna, rango de movimiento y tempo sugerido..."
              rows="3"
              value={form.technicalInstructions}
              onChange={e => setForm(f => ({ ...f, technicalInstructions: e.target.value }))}
            />
          </div>

          {/* Enlace Video YouTube */}
          <div className="el__field">
            <label htmlFor="ex-video" className="el__label">URL de Vídeo (YouTube)</label>
            <input
              id="ex-video"
              type="url"
              className="el__input"
              placeholder="https://www.youtube.com/watch?v=..."
              value={form.videoUrl}
              onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
            />
          </div>

          {/* Foto de Ejercicio */}
          <div className="el__field">
            <label htmlFor="ex-photo" className="el__label">Foto del Ejercicio</label>
            <input
              id="ex-photo"
              type="file"
              accept="image/*"
              className="el__input el__input--file"
              onChange={handleImageChange}
            />
            {form.image && (
              <div className="el__img-preview-wrap">
                <img src={form.image} className="el__img-preview" alt="Vista previa de ejercicio" />
                <button
                  type="button"
                  className="el__img-preview-remove"
                  onClick={() => setForm(f => ({ ...f, image: '' }))}
                >
                  Eliminar foto
                </button>
              </div>
            )}
          </div>

          {/* Favorito */}
          <div className="el__field" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              id="ex-fav"
              type="checkbox"
              style={{ width: '16px', height: '16px', margin: 0 }}
              checked={form.favorite}
              onChange={e => setForm(f => ({ ...f, favorite: e.target.checked }))}
            />
            <label htmlFor="ex-fav" className="el__label" style={{ margin: 0, cursor: 'pointer' }}>Marcar como favorito</label>
          </div>

          <div className="el__modal-actions">
            <button type="button" className="el__btn el__btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="el__btn el__btn--primary">
              {editingEx ? 'Guardar Cambios' : 'Registrar Ejercicio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
