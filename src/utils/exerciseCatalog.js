// Un ejercicio puede tener varias categorías y subcategorías (antes solo
// una de cada). Los ejercicios guardados antes de este cambio solo tienen
// los campos antiguos categoryId/subcategoryId (un único valor); estos
// helpers los leen igual como una lista de un elemento, así que no hace
// falta migrar los datos existentes para que sigan funcionando.

export function getExerciseCategoryIds(ex) {
  if (Array.isArray(ex?.categoryIds) && ex.categoryIds.length > 0) {
    return ex.categoryIds.map(String);
  }
  return ex?.categoryId ? [String(ex.categoryId)] : [];
}

export function getExerciseSubcategoryIds(ex) {
  if (Array.isArray(ex?.subcategoryIds) && ex.subcategoryIds.length > 0) {
    return ex.subcategoryIds.map(String);
  }
  return ex?.subcategoryId ? [String(ex.subcategoryId)] : [];
}

export function getExerciseCategoryNames(ex, categories) {
  const ids = new Set(getExerciseCategoryIds(ex));
  return categories.filter(c => ids.has(String(c.id))).map(c => c.name);
}

export function getExerciseSubcategoryNames(ex, subcategories) {
  const ids = new Set(getExerciseSubcategoryIds(ex));
  return subcategories.filter(s => ids.has(String(s.id))).map(s => s.name);
}

// Orden alfabético por nombre (sin distinguir mayúsculas ni tildes), para
// que categorías y subcategorías salgan siempre igual en filtros y
// desplegables en vez de en el orden en que se crearon.
export function sortByName(items) {
  return [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
}
