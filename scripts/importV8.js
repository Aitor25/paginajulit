import fs from 'fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Uso: node importV8.js <archivo_v8.json> <orgId> [projectId]");
  process.exit(1);
}

const [filePath, orgId, projectId = "julit-mock-project"] = args;

// Conectar a emuladores locales por defecto (comentar/modificar para prod)
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

initializeApp({ projectId });
const db = getFirestore();

// Mapeo de claves V8 a nombres de colecciones en Firestore
const collectionMap = {
  exercises: 'exercises',
  ex_categories: 'ex_categories',
  ex_subcategories: 'ex_subcategories',
  materials: 'materials',
  ex_tags: 'ex_tags',
  ex_types: 'ex_types',
  positions: 'positions',
  competitive_levels: 'competitive_levels',
  test_categories: 'test_categories',
  workout_tags: 'workout_tags',
  clients: 'clients',
  workouts: 'workouts',
  workout_assignments: 'workout_assignments',
  workout_results: 'workout_results',
  programs: 'programs',
  program_weeks: 'program_weeks',
  program_days: 'program_days',
  program_assignments: 'program_assignments',
  groups: 'groups',
  anamnesis: 'anamnesis',
  test_definitions: 'test_definitions',
  test_results: 'test_results',
  sports: 'sports',
  teams: 'teams',
  client_categories: 'client_categories',
  private_notes: 'private_notes',
  audit_logs: 'audit_logs',
  change_history: 'audit_logs'
};

const runImport = async () => {
  try {
    const rawData = fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf-8');
    const v8Data = JSON.parse(rawData);

    console.log(`Iniciando importación V8 a Firestore para orgId: ${orgId}`);

    for (const [v8Key, items] of Object.entries(v8Data)) {
      const collectionName = collectionMap[v8Key] || v8Key;
      
      if (!Array.isArray(items)) {
        console.warn(`Saltando clave ${v8Key} (no es un array).`);
        continue;
      }

      console.log(`Importando ${items.length} documentos a la colección '${collectionName}'...`);
      
      let count = 0;
      let batch = db.batch();

      for (const item of items) {
        if (!item.id) continue;

        const docId = String(item.id);
        const docRef = db.collection(collectionName).doc(docId);
        
        const payload = { 
          ...item,
          orgId, // Forzar multi-tenant
          importedAt: new Date().toISOString()
        };

        if (payload.version === undefined) payload.version = 1;
        if (!payload.createdAt) payload.createdAt = new Date().toISOString();

        batch.set(docRef, payload, { merge: true });
        count++;

        if (count % 400 === 0) {
          await batch.commit();
          console.log(`  - Commiteados ${count} documentos en ${collectionName}...`);
          batch = db.batch(); // Create new batch
        }
      }

      if (count % 400 !== 0 && count > 0) {
        await batch.commit();
        console.log(`  - Commiteados ${count} documentos en ${collectionName}...`);
      }
    }

    console.log("¡Importación V8 finalizada con éxito!");
  } catch (error) {
    console.error("Error durante la importación:", error);
    process.exit(1);
  }
};

runImport();
