/**
 * Borra los clientes de prueba (los marcados con isTestData: true) y todo lo
 * que cuelgue de ellos, para no dejar datos huérfanos.
 *
 * CÓMO USARLO
 * 1. Abre la app con tu sesión de OWNER (en local o en producción).
 * 2. Abre la consola del navegador (Cmd+Option+J en Chrome).
 * 3. Pega el contenido de este archivo y pulsa Enter.
 *
 * Es idempotente: si lo ejecutas dos veces, la segunda no encuentra nada y no
 * hace nada. No toca ningún cliente que no tenga isTestData: true.
 */
(async () => {
  const { firestoreService } = await import('/src/services/firestoreService.js');

  // Colecciones que referencian a un cliente mediante clientId
  const RELACIONADAS = [
    'workout_assignments',
    'workout_results',
    'program_assignments',
    'anamnesis',
    'test_results',
    'private_notes'
  ];

  const clientes = await firestoreService.getDocumentsByQuery('clients', []);
  const prueba = clientes.filter(c => c.isTestData === true);

  if (prueba.length === 0) {
    console.log('No hay clientes de prueba que borrar.');
    return;
  }

  console.log(`Se van a borrar ${prueba.length} clientes de prueba:`);
  console.table(prueba.map(c => ({ nombre: `${c.firstName} ${c.lastName}`, id: c.id })));

  const ids = new Set(prueba.map(c => String(c.id)));
  let huerfanos = 0;

  // 1. Datos relacionados
  for (const coll of RELACIONADAS) {
    let docs = [];
    try {
      docs = await firestoreService.getDocumentsByQuery(coll, []);
    } catch (e) {
      console.warn(`  (no se pudo leer ${coll}: ${e.message})`);
      continue;
    }
    const aBorrar = docs.filter(d => ids.has(String(d.clientId)));
    for (const d of aBorrar) {
      try {
        await firestoreService.deleteDocument(coll, String(d.id));
        huerfanos++;
      } catch (e) {
        console.warn(`  fallo borrando ${coll}/${d.id}: ${e.message}`);
      }
    }
    if (aBorrar.length) console.log(`  ${coll}: ${aBorrar.length} borrados`);
  }

  // 2. Las fichas
  let borrados = 0;
  for (const c of prueba) {
    try {
      await firestoreService.deleteDocument('clients', String(c.id));
      borrados++;
    } catch (e) {
      console.error(`  fallo borrando cliente ${c.id}: ${e.message}`);
    }
  }

  console.log(`Listo: ${borrados} clientes y ${huerfanos} registros relacionados borrados.`);
  console.log('Recarga la página para ver el resultado.');
})();
