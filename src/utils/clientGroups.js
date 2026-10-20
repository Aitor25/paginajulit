// Grupos de clientes en dos niveles (grupo > subgrupo), compartidos por la
// ficha de clientes, las asignaciones y las etiquetas de entrenamientos.
//
// Un cliente puede estar en varios grupos y subgrupos a la vez
// (client.groupIds / client.subgroupIds). Las fichas antiguas solo tenían un
// grupo (client.groupId): se siguen leyendo como si fuera la lista.
import { storage, KEYS } from '../services/storage';
import { sortByName } from './exerciseCatalog';

export async function loadGroupCatalog() {
  const [groups, subgroups] = await Promise.all([
    storage.getEntities(KEYS.GROUPS),
    storage.getEntities(KEYS.SUBGROUPS)
  ]);
  return { groups: sortByName(groups), subgroups: sortByName(subgroups) };
}

export function getClientGroupIds(client) {
  if (Array.isArray(client?.groupIds)) return client.groupIds.map(String);
  return client?.groupId ? [String(client.groupId)] : [];
}

export function getClientSubgroupIds(client) {
  return Array.isArray(client?.subgroupIds) ? client.subgroupIds.map(String) : [];
}

export function getTagIds(workout) {
  const t = workout?.tags || {};
  return {
    groupIds: (t.groupIds || []).map(String),
    subgroupIds: (t.subgroupIds || []).map(String),
    clientIds: (t.clientIds || []).map(String)
  };
}

// ¿Pertenece el cliente al grupo o subgrupo `id`? Estar en un subgrupo cuenta
// también como estar en su grupo (un jugador de 1ª Nacional es de Tolosa
// Eskubaloia aunque no se le haya marcado el grupo).
export function clientInGroup(client, id, subgroups) {
  const target = String(id);
  const groupIds = getClientGroupIds(client);
  const subgroupIds = getClientSubgroupIds(client);
  if (groupIds.includes(target) || subgroupIds.includes(target)) return true;
  return subgroupIds.some(sid => String(subgroups.find(s => String(s.id) === sid)?.categoryId) === target);
}

// ¿Está el entrenamiento etiquetado con el grupo o subgrupo `id`? Igual que con
// los clientes, una etiqueta de subgrupo cuenta también para su grupo.
export function workoutTaggedWith(workout, id, subgroups) {
  const target = String(id);
  const { groupIds, subgroupIds } = getTagIds(workout);
  if (groupIds.includes(target) || subgroupIds.includes(target)) return true;
  return subgroupIds.some(sid => String(subgroups.find(s => String(s.id) === sid)?.categoryId) === target);
}

// Opciones para un desplegable: cada grupo seguido de sus subgrupos
// sangrados; los subgrupos sin grupo, al final.
export function buildGroupOptions(groups, subgroups) {
  const options = [];
  groups.forEach(g => {
    options.push({ id: String(g.id), name: g.name, label: g.name, isSubgroup: false });
    subgroups
      .filter(s => String(s.categoryId) === String(g.id))
      .forEach(s => options.push({ id: String(s.id), name: s.name, label: `   ↳ ${s.name}`, isSubgroup: true }));
  });
  const groupIdSet = new Set(groups.map(g => String(g.id)));
  subgroups
    .filter(s => !groupIdSet.has(String(s.categoryId)))
    .forEach(s => options.push({ id: String(s.id), name: s.name, label: `↳ ${s.name}`, isSubgroup: true }));
  return options;
}

// Nombre de un grupo o subgrupo; los subgrupos llevan delante su grupo
// ("Tolosa Eskubaloia › 1ª Nacional") para no confundir nombres repetidos.
export function groupDisplayName(id, groups, subgroups) {
  const target = String(id);
  const g = groups.find(x => String(x.id) === target);
  if (g) return g.name;
  const s = subgroups.find(x => String(x.id) === target);
  if (!s) return null;
  const parent = groups.find(x => String(x.id) === String(s.categoryId));
  return parent ? `${parent.name} › ${s.name}` : s.name;
}
