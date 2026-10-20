import { useState } from 'react';

/* Casillas de grupos con sus subgrupos debajo (se pueden marcar varios de
   cada). Opcionalmente, una lista de jugadores concretos con buscador, para
   las etiquetas de los entrenamientos. */
export default function GroupPicker({
  groups,
  subgroups,
  value,            // { groupIds, subgroupIds, clientIds? }
  onChange,
  clients = null    // si se pasa, se muestra la sección de jugadores
}) {
  const [clientSearch, setClientSearch] = useState('');

  const toggle = (field, id) => {
    const list = value[field] || [];
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    onChange({ ...value, [field]: next });
  };

  const groupIdSet = new Set(groups.map(g => String(g.id)));
  const orphanSubgroups = subgroups.filter(s => !groupIdSet.has(String(s.categoryId)));

  const renderSubgroup = s => (
    <label key={s.id} className="el__checkbox-item gp__sub">
      <input
        type="checkbox"
        checked={(value.subgroupIds || []).includes(String(s.id))}
        onChange={() => toggle('subgroupIds', String(s.id))}
      />
      {s.name}
    </label>
  );

  const query = clientSearch.trim().toLowerCase();
  const visibleClients = clients
    ? clients
        .filter(c => !query || `${c.firstName} ${c.lastName}`.toLowerCase().includes(query) || (value.clientIds || []).includes(String(c.id)))
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es'))
    : [];

  return (
    <div className="gp">
      <div className="el__checkbox-list gp__list">
        {groups.length === 0 && subgroups.length === 0 && (
          <p className="el__checkbox-list-empty">No hay grupos creados. Créalos en "Administración de grupos".</p>
        )}
        {groups.map(g => (
          <div key={g.id} className="gp__group">
            <label className="el__checkbox-item gp__group-name">
              <input
                type="checkbox"
                checked={(value.groupIds || []).includes(String(g.id))}
                onChange={() => toggle('groupIds', String(g.id))}
              />
              {g.name}
            </label>
            {subgroups.filter(s => String(s.categoryId) === String(g.id)).map(renderSubgroup)}
          </div>
        ))}
        {orphanSubgroups.map(renderSubgroup)}
      </div>

      {clients && (
        <div className="gp__clients">
          <input
            type="text"
            className="el__input gp__client-search"
            placeholder="Buscar jugador…"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
          <div className="el__checkbox-list gp__list">
            {visibleClients.length === 0 && (
              <p className="el__checkbox-list-empty">No hay jugadores que coincidan.</p>
            )}
            {visibleClients.map(c => (
              <label key={c.id} className="el__checkbox-item">
                <input
                  type="checkbox"
                  checked={(value.clientIds || []).includes(String(c.id))}
                  onChange={() => toggle('clientIds', String(c.id))}
                />
                {c.firstName} {c.lastName}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
