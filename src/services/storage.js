import { sessionService } from './session.js';
import { firestoreService } from './firestoreService.js';
import { functionsService } from './functionsService.js';
import { isFuture, isPastGracePeriod, isWithinPeriod } from '../utils/dateUtils.js';
export const KEYS = {
  EXERCISES: 'fitcoach_exercises',
  CATEGORIES: 'fitcoach_categories', // Legacy - se migra a fitcoach_exercise_categories
  SUBCATEGORIES: 'fitcoach_subcategories', // Legacy - se migra a fitcoach_exercise_subcategories

  // Catálogos Normalizados V4
  EX_CATEGORIES: 'fitcoach_ex_categories',
  EX_SUBCATEGORIES: 'fitcoach_ex_subcategories',
  MATERIALS: 'fitcoach_materials',
  EX_TAGS: 'fitcoach_ex_tags',
  EX_TYPES: 'fitcoach_ex_types',
  POSITIONS: 'fitcoach_positions',
  COMPETITIVE_LEVELS: 'fitcoach_competitive_levels',
  TEST_CATEGORIES: 'fitcoach_test_categories',
  WORKOUT_TAGS: 'fitcoach_workout_tags',

  CLIENTS: 'fitcoach_clients',
  WORKOUTS: 'fitcoach_workouts',
  WORKOUT_ASSIGNMENTS: 'fitcoach_workout_assignments',
  WORKOUT_RESULTS: 'fitcoach_workout_results', // Relacional V6
  PROGRAMS: 'fitcoach_programs',
  PROGRAM_WEEKS: 'fitcoach_program_weeks',
  PROGRAM_DAYS: 'fitcoach_program_days',
  PROGRAM_ASSIGNMENTS: 'fitcoach_program_assignments',
  GROUPS: 'fitcoach_groups',
  ANAMNESIS: 'fitcoach_anamnesis',
  TEST_DEFINITIONS: 'fitcoach_test_definitions',
  TEST_RESULTS: 'fitcoach_test_results',
  SPORTS: 'fitcoach_sports',
  TEAMS: 'fitcoach_teams',
  CLIENT_CATEGORIES: 'fitcoach_client_categories',
  PRIVATE_NOTES: 'fitcoach_private_notes',
  CHANGE_HISTORY: 'fitcoach_change_history'
};

const CURRENT_SCHEMA_VERSION = 8;


const getCollection = async (coll) => {
  const orgId = sessionService.getOrgId();
  if (!orgId) return [];
  return firestoreService.getDocumentsByQuery(coll, [
    { field: 'orgId', op: '==', value: orgId }
  ]);
};

const getCatalog = async (coll) => {
  return firestoreService.getDocumentsByQuery(coll, []);
};

export const FREE_SESSION_ACTIVITY_TYPES = [
  { id: 'fuerza', label: 'Fuerza / Musculación' },
  { id: 'cardio', label: 'Cardio / Aeróbico' },
  { id: 'movilidad', label: 'Movilidad / Flexibilidad' },
  { id: 'deporte', label: 'Deporte específico' },
  { id: 'otro', label: 'Otra actividad' }
];

// Helper para generar IDs únicos locales con fallback
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fallback si falla en contextos no seguros
    }
  }
  return 'uuid-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
}

// Helper para quitar acentos
function stripAccents(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Helper para interactuar con localStorage

export const initializeStorage = () => {
  // Inicialización migrada a Firestore y V12.
  // Ya no se utiliza localStorage.
  console.log("Storage initialized with Firebase backend.");
};

export const storage = {
  getEntities: async (key) => {
    const keyName = Object.keys(KEYS).find(k => KEYS[k] === key);
    if (!keyName) return [];
    const collectionName = keyName.toLowerCase();
    return getCollection(collectionName);
  },

  saveEntity: async (key, entity) => {
    const orgId = sessionService.getOrgId();
    const collectionName = Object.keys(KEYS).find(k => KEYS[k] === key).toLowerCase();

    let saved = { ...entity, orgId };

    if (saved.name) saved.name = saved.name.trim();

    if (!saved.id) {
      saved.id = generateUUID();
      saved.createdAt = new Date().toISOString();
    }
    saved.updatedAt = new Date().toISOString();

    await firestoreService.setDocument(collectionName, String(saved.id), saved);
    return saved;
  },

  deleteEntity: async (key, id) => {
    const collectionName = Object.keys(KEYS).find(k => KEYS[k] === key).toLowerCase();
    await firestoreService.deleteDocument(collectionName, String(id));
    return true;
  },

  // EJERCICIOS
  getExercises: async () => {
    return await getCollection('exercises');
  },
  saveExercise: async (exercise) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) throw new Error('No active organization');

    let saved = { ...exercise, orgId };
    if (!saved.id) {
      saved.id = generateUUID();
      saved.status = 'active';
      saved.createdAt = new Date().toISOString();
    }
    saved.updatedAt = new Date().toISOString();

    await firestoreService.setDocument('exercises', String(saved.id), saved);
    return saved;
  },
  deleteExercise: async (id) => {
    // Integridad Referencial: Bloquear si está en uso en entrenamientos
    const workouts = await getCollection('workouts');
    let occurrences = 0;
    workouts.forEach(w => {
      if (Array.isArray(w.blocks)) {
        w.blocks.forEach(b => {
          if (Array.isArray(b.exercises)) {
            if (b.exercises.some(ex => String(ex.exerciseId) === String(id))) {
              occurrences++;
            }
          }
        });
      }
    });

    if (occurrences > 0) {
      throw new Error(`No puedes eliminar este ejercicio porque está en uso en ${occurrences} entrenamiento(s) planificado(s).`);
    }

    await firestoreService.deleteDocument('exercises', String(id));
    return true;
  },

  // ── ENTRENADORES Y ASIGNACIÓN DE CLIENTES ──

  // Entrenadores (y owners) de la organización, para asignarles clientes.
  // Solo el owner puede listar /users (ver firestore.rules).
  getCoaches: async () => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return [];
    if (sessionService.getRole() !== 'owner') return [];
    const users = await firestoreService.getDocumentsByQuery('users', [
      { field: 'organizationId', op: '==', value: orgId }
    ]);
    return users
      .filter(u => u.role === 'coach' || u.role === 'owner')
      .sort((a, b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || ''));
  },

  // Vincula una cuenta de usuario con una ficha de cliente.
  // Escribe los DOS lados: users.clientId y clients.linkedUserId. El segundo
  // es imprescindible: la regla de Firestore que deja a un cliente leer su
  // propia ficha compara resource.data.linkedUserId con su uid.
  linkUserToClient: async (userId, clientId) => {
    if (sessionService.getRole() !== 'owner') {
      throw new Error('Solo el owner puede vincular fichas.');
    }
    const orgId = sessionService.getOrgId();
    const now = new Date().toISOString();

    // Si la ficha ya estaba vinculada a otra cuenta, se libera esa primero
    const users = await firestoreService.getDocumentsByQuery('users', [
      { field: 'organizationId', op: '==', value: orgId }
    ]);
    for (const u of users) {
      if (String(u.clientId || '') === String(clientId) && String(u.uid || u.id) !== String(userId)) {
        await firestoreService.updateDocument('users', String(u.uid || u.id), {
          clientId: null,
          updatedAt: now
        });
      }
    }

    // El email de contacto de la ficha pasa a ser el de la cuenta vinculada,
    // para que ambos coincidan siempre. Se lee el documento concreto porque
    // una cuenta pendiente de asignar todavía tiene organizationId a null y
    // no saldría en la consulta filtrada por organización.
    let cuenta = users.find(u => String(u.uid || u.id) === String(userId));
    if (!cuenta) {
      cuenta = await firestoreService.getDocument('users', String(userId));
    }

    const ficha = await firestoreService.getDocument('clients', String(clientId));
    const cambios = { linkedUserId: String(userId), updatedAt: now };

    if (cuenta?.email) {
      // Se guarda el email de contacto original para poder devolverlo al
      // desvincular. Solo la primera vez: si la ficha ya estaba vinculada,
      // su email actual es el de la cuenta anterior, no el original.
      if (!ficha?.linkedUserId) {
        cambios.emailBeforeLink = ficha?.email || '';
      }
      cambios.email = cuenta.email;
    }

    await firestoreService.updateDocument('clients', String(clientId), cambios);

    await firestoreService.updateDocument('users', String(userId), {
      clientId: String(clientId),
      status: 'active',
      organizationId: orgId,
      updatedAt: now
    });

    return true;
  },

  // Deshace la vinculación por ambos lados.
  unlinkUserFromClient: async (userId, clientId) => {
    if (sessionService.getRole() !== 'owner') {
      throw new Error('Solo el owner puede desvincular fichas.');
    }
    const now = new Date().toISOString();
    if (clientId) {
      const ficha = await firestoreService.getDocument('clients', String(clientId));
      const cambios = { linkedUserId: null, updatedAt: now };

      // Se devuelve el email de contacto que tenía antes de vincularse
      // (cadena vacía si no tenía). Si la ficha se vinculó antes de que
      // existiera este guardado, emailBeforeLink no está y se deja el email
      // actual tal cual, en vez de inventarse un valor.
      if (ficha && ficha.emailBeforeLink !== undefined) {
        cambios.email = ficha.emailBeforeLink || '';
        cambios.emailBeforeLink = null;
      }

      await firestoreService.updateDocument('clients', String(clientId), cambios);
    }
    await firestoreService.updateDocument('users', String(userId), {
      clientId: null,
      updatedAt: now
    });
    return true;
  },

  // Vincula (o desvincula, pasando null) un cliente a un entrenador.
  assignClientToCoach: async (clientId, coachId) => {
    if (sessionService.getRole() !== 'owner') {
      throw new Error('Solo el owner puede asignar entrenadores.');
    }
    await firestoreService.updateDocument('clients', String(clientId), {
      coachId: coachId ? String(coachId) : null,
      updatedAt: new Date().toISOString()
    });
    return true;
  },

  // CLIENTES
  // Alcance según rol: el owner ve todos los de la organización; un coach
  // solo los que tenga asignados; un cliente solo su propia ficha.
  getClients: async () => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return [];

    // El coach consulta filtrando por coachId en la propia query, no en
    // memoria: las reglas de Firestore rechazan una query que no puedan
    // demostrar que cumple la restricción.
    const filters = [{ field: 'orgId', op: '==', value: orgId }];
    if (sessionService.getRole() === 'coach') {
      filters.push({ field: 'coachId', op: '==', value: sessionService.getUserId() || '__none__' });
    }
    return firestoreService.getDocumentsByQuery('clients', filters);
  },

  // Todos los clientes de la organización, sin filtrar por rol. Solo para
  // usos internos donde hace falta resolver nombres (p. ej. el calendario).
  getAllClientsInOrg: async () => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return [];
    return firestoreService.getDocumentsByQuery('clients', [
      { field: 'orgId', op: '==', value: orgId }
    ]);
  },

  getClientById: async (id) => {
    return firestoreService.getDocument('clients', String(id));
  },
  saveClient: async (client) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) throw new Error('No active organization');

    let savedClient = { ...client, orgId };

    // Si crea la ficha un coach, se le asigna automáticamente: de lo contrario
    // quedaría sin coachId y las reglas de Firestore le negarían el acceso a
    // la ficha que acaba de crear.
    if (!client.id && savedClient.coachId === undefined) {
      savedClient.coachId = sessionService.getRole() === 'coach'
        ? (sessionService.getUserId() || null)
        : null;
    }

    if (client.id) {
      // Update
      savedClient.updatedAt = new Date().toISOString();
      await firestoreService.setDocument('clients', String(client.id), savedClient);
    } else {
      // Create
      savedClient.id = generateUUID();
      savedClient.createdAt = new Date().toISOString();
      savedClient.updatedAt = new Date().toISOString();
      await firestoreService.setDocument('clients', savedClient.id, savedClient);
    }

    return savedClient;
  },
  deleteClient: async (id) => {
    await firestoreService.deleteDocument('clients', String(id));
    return true;
  },
  deleteAssessment: async (id) => {
    return firestoreService.deleteDocument('assessments', String(id));
  },

  migrateLegacyData: async () => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return;
    const isMigrated = localStorage.getItem(`migrated_from_localstorage_${orgId}`);
    if (isMigrated) return;

    try {
      console.log('Iniciando migración de datos legacy desde localStorage...');
      let totalMigrated = 0;

      // Iterar por todas las llaves posibles
      for (const [keyName, localKey] of Object.entries(KEYS)) {
        const collectionName = keyName.toLowerCase();
        
        const localData = localStorage.getItem(localKey);
        if (localData) {
          try {
            const items = JSON.parse(localData);
            if (Array.isArray(items) && items.length > 0) {
              console.log(`Migrando ${items.length} items de ${localKey} a la colección ${collectionName}...`);
              let count = 0;
              for (const item of items) {
                // Forzar orgId si no lo tiene
                const docData = { ...item, orgId: item.orgId || orgId };
                
                // Usar el ID original si existe, sino generar uno
                const docId = String(docData.id || generateUUID());
                if (!docData.id) docData.id = docId;

                await firestoreService.setDocument(collectionName, docId, docData);
                count++;
                totalMigrated++;
              }
              console.log(`Migrados ${count} documentos a ${collectionName}`);
            }
          } catch (err) {
            console.error(`Error parseando ${localKey} de localStorage:`, err);
          }
        }
      }

      localStorage.setItem(`migrated_from_localstorage_${orgId}`, 'true');
      console.log(`Migración completada exitosamente. Total documentos: ${totalMigrated}`);
      
      if (totalMigrated > 0) {
        // Forzar recarga si se migraron cosas
        window.location.reload();
      }
    } catch (err) {
      console.error('Error migrando data de localStorage:', err);
    }
  },

  // ANAMNESIS
  getAnamnesisByClientId: async (clientId) => {
    const list = await getCollection('anamnesis');
    return list.filter(a => String(a.clientId) === String(clientId));
  },
  saveAnamnesis: async (anamnesis) => {
    const orgId = sessionService.getOrgId();
    let saved = { ...anamnesis, orgId };
    if (!saved.id) { saved.id = generateUUID(); saved.createdAt = new Date().toISOString(); }
    saved.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('anamnesis', String(saved.id), saved);
    return saved;
  },
  getTestDefinitions: async () => {
    return await getCollection('test_definitions');
  },
  saveTestDefinition: async (definition) => {
    const orgId = sessionService.getOrgId();
    let saved = { ...definition, orgId };
    if (!saved.id) {
      saved.id = generateUUID();
      saved.status = 'active';
      saved.createdAt = new Date().toISOString();
    }
    saved.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('test_definitions', String(saved.id), saved);
    return saved;
  },

  // RESULTADOS DE TESTS
  getTestResults: async (clientId = null) => {
    const list = await getCollection('test_results');
    if (clientId) {
      return list.filter(r => String(r.clientId) === String(clientId));
    }
    return list;
  },
  getTestResultsByDefinition: async (clientId, testDefinitionId) => {
    const list = await getCollection('test_results');
    return list.filter(r =>
      String(r.clientId) === String(clientId) &&
      String(r.testDefinitionId) === String(testDefinitionId)
    );
  },
  saveTestResult: async (result) => {
    const orgId = sessionService.getOrgId();
    let saved = { ...result, orgId };
    if (!saved.id) {
      saved.id = generateUUID();
      saved.createdAt = new Date().toISOString();
    }
    saved.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('test_results', String(saved.id), saved);
    return saved;
  },
  deleteTestResult: async (id) => {
    await firestoreService.deleteDocument('test_results', String(id));
    return true;
  },

  // ENTRENAMIENTOS (Fase 5)
  getWorkouts: async () => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return [];
    return firestoreService.getDocumentsByQuery('workouts', [
      { field: 'orgId', op: '==', value: orgId }
    ]);
  },
  getWorkoutById: async (id) => {
    return firestoreService.getDocument('workouts', String(id));
  },
  saveWorkout: async (workout) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) throw new Error('No active organization');

    let saved = { ...workout, orgId };

    if (workout.id) {
      saved.updatedAt = new Date().toISOString();
      await firestoreService.setDocument('workouts', String(workout.id), saved);
    } else {
      saved.id = generateUUID();
      saved.createdAt = new Date().toISOString();
      saved.updatedAt = new Date().toISOString();
      await firestoreService.setDocument('workouts', saved.id, saved);
    }

    return saved;
  },
  deleteWorkout: async (id) => {
    await firestoreService.deleteDocument('workouts', String(id));
    // En Firestore deberíamos hacer limpieza por backend o Cloud Function,
    // pero temporalmente dejamos la eliminación directa del lado cliente.
    return true;
  },

  // ASIGNACIONES (Fase 5)
  // ASIGNACIONES (Fase 5)
  getWorkoutAssignments: async (clientId = null, groupId = null) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return [];

    let filters = [{ field: 'orgId', op: '==', value: orgId }];
    if (clientId) {
      filters.push({ field: 'clientId', op: '==', value: String(clientId) });
    }
    if (groupId) {
      filters.push({ field: 'groupId', op: '==', value: String(groupId) });
    }

    return firestoreService.getDocumentsByQuery('workout_assignments', filters);
  },

  saveWorkoutAssignment: async (assign) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) throw new Error('No active organization');

    // Validar exclusividad
    if (assign.clientId && assign.groupId) {
      throw new Error("No puedes asignar una rutina a un deportista y a un grupo simultáneamente.");
    }
    if (!assign.clientId && !assign.groupId) {
      throw new Error("Debes especificar un deportista o un grupo para realizar la asignación.");
    }
    if (!assign.workoutId) {
      throw new Error("Integridad: Toda asignación debe tener un workoutId válido.");
    }

    let saved = { ...assign, orgId };

    // Capturar snapshot profundo de ejercicios si no existe (al crear o editar)
    if (!saved.plannedSnapshot) {
      const template = await storage.getWorkoutById(saved.workoutId);
      const exercises = await storage.getExercises();
      if (template) {
        saved.plannedSnapshot = {
          templateWorkoutId: template.id,
          templateVersion: 1,
          capturedAt: new Date().toISOString(),
          name: template.name,
          estimatedDurationMinutes: template.estimatedDurationMinutes || 60,
          blocks: (template.blocks || []).map(b => ({
            id: b.id,
            name: b.name,
            type: b.type,
            order: b.order,
            rounds: b.rounds,
            restBetweenRoundsSeconds: b.restBetweenRoundsSeconds,
            exercises: (b.exercises || []).map(e => {
              const exName = exercises.find(ex => String(ex.id) === String(e.exerciseId))?.name || 'Ejercicio';
              return {
                ...e,
                exerciseName: exName
              };
            })
          }))
        };
      }
    }

    if (!saved.id) {
      saved.id = generateUUID();
    }

    // Call Cloud Function for critical mutation
    await functionsService.call('saveAssignmentFn', { assignment: saved });

    // RECALCULAR PROGRESO DERIVADO SI TIENE PROGRAMA VINCULADO
    if (saved.programAssignmentId) {
      await storage.updateAssignmentProgress(saved.programAssignmentId);
    }

    return saved;
  },

  rescheduleAssignment: async (assignmentId, newDate, version) => {
    const orgId = sessionService.getOrgId();
    await functionsService.call('rescheduleAssignmentFn', {
      assignmentId: String(assignmentId),
      newDate,
      orgId,
      version
    });
    return true;
  },

  deleteWorkoutAssignment: async (id) => {
    // Si necesitas borrar por Cloud Function, deberías crearla. 
    // Por ahora usamos escritura directa asumiendo que el admin puede.
    await firestoreService.deleteDocument('workout_assignments', String(id));
    return true;
  },

  // PROGRAMAS DE ENTRENAMIENTO (Fase 6)
  getPrograms: async () => {
    return await getCollection('programs');
  },

  getProgramById: async (id) => {
    const programs = await getCollection('programs');
    const p = programs.find(item => String(item.id) === String(id));
    if (!p) return null;

    const weeks = (await getCollection('program_weeks')).filter(w => w.programId === p.id);
    weeks.sort((a, b) => a.weekNumber - b.weekNumber);

    const allDays = await getCollection('program_days');
    const weeksWithDays = weeks.map(w => {
      const days = allDays.filter(d => d.programWeekId === w.id);
      days.sort((a, b) => a.dayOffset - b.dayOffset);
      return { ...w, days };
    });

    return {
      ...p,
      weeks: weeksWithDays
    };
  },

  saveProgram: async (program) => {
    if (Number(program.durationWeeks) < 1) throw new Error("La duración del programa debe ser de al menos 1 semana.");
    const orgId = sessionService.getOrgId();
    let saved = { ...program, orgId };
    if (!saved.id) { saved.id = generateUUID(); saved.createdAt = new Date().toISOString(); }
    saved.updatedAt = new Date().toISOString();

    // We will save weeks and days nested to avoid managing collections
    await firestoreService.setDocument('programs', String(saved.id), saved);
    return saved;
  },

  deleteProgram: async (id) => {
    const assigns = await getCollection('program_assignments');
    if (assigns.some(a => String(a.programId) === String(id))) {
      throw new Error("No se puede eliminar un programa que ha sido asignado.");
    }
    await firestoreService.deleteDocument('programs', String(id));
    return true;
  },

  duplicateProgram: async (id) => {
    const fullProg = await storage.getProgramById(id);
    if (!fullProg) throw new Error("Programa no encontrado.");

    const cloned = {
      name: `[Copia] - ${fullProg.name}`,
      description: fullProg.description,
      durationWeeks: fullProg.durationWeeks,
      tagIds: [...(fullProg.tagIds || [])],
      status: 'draft',
      weeks: fullProg.weeks.map(w => ({
        weekNumber: w.weekNumber,
        name: w.name,
        phase: w.phase,
        objectives: w.objectives,
        notes: w.notes,
        days: w.days.map(d => ({
          dayOffset: d.dayOffset,
          restDay: d.restDay,
          workoutId: d.workoutId,
          workoutVersion: d.workoutVersion,
          notes: d.notes
        }))
      }))
    };

    return storage.saveProgram(cloned);
  },

  // ASIGNACIONES DE PROGRAMAS Y GENERACIÓN DE SESIONES
  getProgramAssignments: async (clientId = null) => {
    const list = await getCollection('program_assignments');
    if (clientId) {
      return list.filter(a => String(a.clientId) === String(clientId));
    }
    return list;
  },

  saveProgramAssignment: async (assign) => {
    const orgId = sessionService.getOrgId();
    let saved = { ...assign, orgId };
    if (!saved.id) {
      saved.id = generateUUID();
      saved.createdAt = new Date().toISOString();
      saved.status = 'active';
      saved.progressPercentage = 0;
    }
    saved.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('program_assignments', String(saved.id), saved);
    return saved;
  },

  deleteProgramAssignment: async (id) => {
    await firestoreService.deleteDocument('program_assignments', String(id));
    return true;
  },

  updateAssignmentProgress: async (assignmentId) => {
    const assign = await firestoreService.getDocument('program_assignments', String(assignmentId));
    if (!assign) return;
    const waList = await getCollection('workout_assignments');
    const linked = waList.filter(wa => String(wa.programAssignmentId) === String(assignmentId));

    if (linked.length === 0) {
      assign.progressPercentage = 0;
    } else {
      const completed = linked.filter(wa => wa.status === 'completed' || wa.status === 'skipped');
      assign.progressPercentage = Math.round((completed.length / linked.length) * 100);
    }
    if (assign.progressPercentage === 100) assign.status = 'completed';
    else if (assign.status === 'completed' && assign.progressPercentage < 100) assign.status = 'active';
    assign.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('program_assignments', String(assignmentId), assign);
  },

  getPrivateNotes: async (clientId = null) => {
    const list = await getCollection('private_notes');
    if (clientId) {
      return list.filter(n => String(n.clientId) === String(clientId));
    }
    return list;
  },
  savePrivateNote: async (note) => {
    const orgId = sessionService.getOrgId();
    let saved = { ...note, orgId };
    if (!saved.id) {
      saved.id = generateUUID();
      saved.createdAt = new Date().toISOString();
    }
    saved.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('private_notes', String(saved.id), saved);
    return saved;
  },

  updateWorkoutAssignmentSnapshot: async (assignmentId, snapshot) => {
    const wa = await firestoreService.getDocument('workout_assignments', String(assignmentId));
    if (wa) {
      wa.plannedSnapshot = snapshot;
      wa.updatedAt = new Date().toISOString();
      await firestoreService.setDocument('workout_assignments', String(assignmentId), wa);
    }
  },
  syncMissedAssignments: async () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const waList = await getCollection('workout_assignments');
    for (const a of waList) {
      if (a.status === 'pending' || a.status === 'in_progress') {
        if (a.scheduledAt && a.scheduledAt < todayStr) {
          a.status = 'missed';
          a.updatedAt = now.toISOString();
          await firestoreService.setDocument('workout_assignments', String(a.id), a);
          if (a.programAssignmentId) await storage.updateAssignmentProgress(a.programAssignmentId);
        }
      }
    }
  },
  revertMissedAssignment: async (assignmentId) => {
    const wa = await firestoreService.getDocument('workout_assignments', String(assignmentId));
    if (wa && wa.status === 'missed') {
      wa.status = 'pending';
      wa.updatedAt = new Date().toISOString();
      await firestoreService.setDocument('workout_assignments', String(assignmentId), wa);
      if (wa.programAssignmentId) await storage.updateAssignmentProgress(wa.programAssignmentId);
    }
  },

  getComplianceMetrics: async (periodDays = 30) => {
    const assignments = await getCollection('workout_assignments');
    const results = await getCollection('workout_results');

    // Filtrar asignaciones dentro del periodo y pasadas
    const eligibleAssignments = assignments.filter(a => {
      // Excluir canceladas
      if (a.status === 'cancelled') return false;
      // Excluir futuras
      if (isFuture(a.scheduledAt)) return false;
      // Verificar si está dentro del periodo
      return isWithinPeriod(a.scheduledAt, periodDays);
    });

    // 1. Métricas Agregadas
    let totalEligible = 0;
    let totalCompleted = 0;
    let totalMissed = 0;
    let clientMetrics = {};

    eligibleAssignments.forEach(assign => {
      totalEligible++;
      if (assign.status === 'completed') totalCompleted++;
      if (assign.status === 'missed') totalMissed++;

      if (!clientMetrics[assign.clientId]) {
        clientMetrics[assign.clientId] = {
          clientId: assign.clientId,
          eligible: 0,
          completed: 0,
          missed: 0
        };
      }
      clientMetrics[assign.clientId].eligible++;
      if (assign.status === 'completed') clientMetrics[assign.clientId].completed++;
      if (assign.status === 'missed') clientMetrics[assign.clientId].missed++;
    });

    const aggregateAdherence = totalEligible > 0 ? (totalCompleted / totalEligible) * 100 : null;

    // Calcular adherencia por cliente y ordenar (peores primero)
    const clientList = Object.values(clientMetrics).map(c => ({
      ...c,
      adherence: c.eligible > 0 ? (c.completed / c.eligible) * 100 : null
    })).sort((a, b) => (a.adherence || 0) - (b.adherence || 0));

    // Actividad reciente: Sesiones libres o asignaciones completadas en el periodo
    const recentActivity = results.filter(r => {
      if (r.status !== 'submitted') return false;
      // Para sesiones libres, usar createdAt. Para planificadas, createdAt también sirve como fecha de ejecución.
      return isWithinPeriod(r.createdAt, periodDays);
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      aggregate: {
        totalEligible,
        totalCompleted,
        totalMissed,
        adherencePercentage: aggregateAdherence
      },
      clients: clientList,
      recentActivity
    };
  },

  // ── FEEDBACK Y EVOLUCIÓN (FASE 9) ──


  // RESULTADOS Y SEGUIMIENTO
  getWorkoutResults: async (clientId = null) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return [];
    let filters = [{ field: 'orgId', op: '==', value: orgId }];
    if (clientId) {
      filters.push({ field: 'clientId', op: '==', value: String(clientId) });
    }
    return await firestoreService.getDocumentsByQuery('workout_results', filters);
  },

  getWorkoutResultByAssignmentId: async (assignmentId) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) return null;
    const res = await firestoreService.getDocumentsByQuery('workout_results', [
      { field: 'orgId', op: '==', value: orgId },
      { field: 'assignmentId', op: '==', value: String(assignmentId) }
    ]);
    return res.length > 0 ? res[0] : null;
  },

  saveWorkoutResult: async (result) => {
    const orgId = sessionService.getOrgId();
    if (!orgId) throw new Error('No active organization');

    if (sessionService.getRole() === 'client') {
      if (String(result.clientId) !== String(sessionService.getActiveClientId())) {
        throw new Error("Permiso denegado: No puedes registrar resultados para otro deportista.");
      }
    }

    let saved = { ...result, orgId };
    if (!saved.id) saved.id = generateUUID();

    if (saved.workoutAssignmentId) {
      saved.assignmentId = String(saved.workoutAssignmentId);
    }
    if (saved.assignmentId && !saved.workoutAssignmentId) {
      saved.workoutAssignmentId = saved.assignmentId;
    }

    await functionsService.call('saveResultFn', { result: saved });
    return saved;
  },

  deleteWorkoutResult: async (id) => {
    await firestoreService.deleteDocument('workout_results', String(id));
    return true;
  },

  reopenWorkoutResult: async (assignmentId) => {
    const res = await storage.getWorkoutResultByAssignmentId(assignmentId);
    if (res) {
      await storage.deleteWorkoutResult(res.id);
    }
    const assign = await firestoreService.getDocument('workout_assignments', String(assignmentId));
    if (assign) {
      assign.status = 'in_progress';
      await firestoreService.setDocument('workout_assignments', String(assignmentId), assign);
    }
    return true;
  },

  saveWorkoutFeedback: async (resultId, feedbackText) => {
    const res = await firestoreService.getDocument('workout_results', String(resultId));
    if (!res) throw new Error("Resultado de entrenamiento no encontrado.");
    res.feedbackText = feedbackText;
    res.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('workout_results', String(resultId), res);
    return res;
  },

  getTestEvolution: async (clientId, testDefinitionId) => {
    const allResults = await getCollection('test_results');
    const defs = await getCollection('test_definitions');

    const testDef = defs.find(d => String(d.id) === String(testDefinitionId));
    if (!testDef) throw new Error("Definición de test no encontrada.");

    // Filtrar cliente y test
    let clientResults = allResults.filter(r =>
      String(r.clientId) === String(clientId) &&
      String(r.testDefinitionId) === String(testDefinitionId)
    );

    // Ordenar cronológicamente (ascendente). Determinismo asegurado: Date -> createdAt -> id
    clientResults.sort((a, b) => {
      const dateA = new Date(a.performedAt || a.createdAt).getTime();
      const dateB = new Date(b.performedAt || b.createdAt).getTime();
      if (dateA !== dateB) return dateA - dateB;

      const createdA = new Date(a.createdAt).getTime();
      const createdB = new Date(b.createdAt).getTime();
      if (createdA !== createdB) return createdA - createdB;

      return String(a.id).localeCompare(String(b.id));
    });

    // Formatear para UI
    const evolution = clientResults.map((r, index) => {
      let value = null;
      if (testDef.valueType === 'number' || testDef.valueType === 'time') {
        value = r.numericValue;
      } else if (testDef.valueType === 'boolean') {
        value = r.booleanValue;
      } else {
        value = r.textValue;
      }

      let variance = null;
      // Solo calcular variación si ambos son numéricos y la unidad coincide
      if (index > 0 && typeof value === 'number') {
        const prev = clientResults[index - 1];
        const prevValue = testDef.valueType === 'number' || testDef.valueType === 'time' ? prev.numericValue : null;

        // Si las unidades guardadas en los resultados son incompatibles, no calculamos variación.
        // Asumimos que son compatibles si la unidad string coincide (o ambas son omitidas).
        if (typeof prevValue === 'number' && (r.unit || '') === (prev.unit || '')) {
          variance = value - prevValue;
        }
      }

      return {
        id: r.id,
        date: r.performedAt || r.createdAt,
        value: value,
        unit: r.unit || testDef.defaultUnit || '',
        variance: variance,
        attemptNumber: r.attemptNumber,
        observations: r.observations
      };
    });

    return {
      testDefinition: testDef,
      evolution
    };
  },

  // ── FASE 10: ANALÍTICA AVANZADA ──

  getAnalyticalType: (exerciseType) => {
    switch (exerciseType) {
      case 'Weight/Reps': return 'strength';
      case 'Time': return 'duration';
      case 'Distance': return 'distance';
      default: return 'unsupported';
    }
  },

  normalizeUnit: (value, unit, baseType) => {
    if (!unit) return { value, unit: '' };
    const u = unit.toLowerCase().trim();
    if (baseType === 'strength') {
      if (u === 'lbs' || u === 'lb') return { value: value * 0.453592, unit: 'kg' };
      if (u === 'kg') return { value, unit: 'kg' };
    }
    if (baseType === 'duration') {
      if (u === 'min') return { value: value * 60, unit: 's' };
      if (u === 's' || u === 'sec') return { value, unit: 's' };
    }
    if (baseType === 'distance') {
      if (u === 'km') return { value: value * 1000, unit: 'm' };
      if (u === 'm') return { value, unit: 'm' };
    }
    return { value: null, unit: 'unknown' }; // Unidad no reconocida
  },

  getExerciseAnalytics: async (clientId, exerciseId, periodDays = null) => {
    const results = (await getCollection('workout_results')).filter(r => String(r.clientId) === String(clientId) && (r.status === 'completed' || r.status === 'submitted'));
    const exercises = await getCollection('exercises');
    let exerciseDef = exercises.find(e => String(e.id) === String(exerciseId));

    // Si no está en catálogo, buscar en snapshots
    if (!exerciseDef) {
      for (const res of results) {
        if (res.loggedBlocks) {
          const match = res.loggedBlocks.find(b => String(b.exerciseId) === String(exerciseId));
          if (match && match.exerciseSnapshot) {
            exerciseDef = match.exerciseSnapshot;
            break;
          }
        }
      }
    }

    if (!exerciseDef) throw new Error("Ejercicio no encontrado en catálogo ni en histórico.");

    const analyticalType = storage.getAnalyticalType(exerciseDef.type);

    // Agrupar bloques por WorkoutResult
    const sessions = [];

    for (const res of results) {
      if (!res.loggedBlocks) continue;

      const blocksForExercise = res.loggedBlocks.filter(b => String(b.exerciseId) === String(exerciseId));
      if (blocksForExercise.length === 0) continue;

      let sessionDate = res.performedAt || res.createdAt;

      // Filtrar por periodo si existe
      if (periodDays !== null && !isWithinPeriod(sessionDate, periodDays)) {
        continue;
      }

      let sessionVolume = 0;
      let sessionMaxLoad = 0;
      let sessionMax1RM = 0;
      let sessionMaxDistance = 0;
      let totalReps = 0;
      let hasValidData = false;

      blocksForExercise.forEach(block => {
        if (!block.sets) return;
        block.sets.forEach(set => {
          // Ignorar series incompletas, vacías, o con repeticiones 0
          if (set.completed === false) return;

          if (analyticalType === 'strength') {
            const w = Number(set.weight);
            const r = Number(set.reps);
            if (isNaN(w) || isNaN(r) || r <= 0 || w < 0) return;

            const norm = storage.normalizeUnit(w, set.unit || 'kg', 'strength');
            if (norm.value === null) return; // Incompatible

            const weightKg = norm.value;
            sessionVolume += (weightKg * r);
            totalReps += r;
            if (weightKg > sessionMaxLoad) sessionMaxLoad = weightKg;

            if (r >= 1 && r <= 10 && weightKg > 0) {
              const estimated1RM = weightKg * (36 / (37 - r));
              if (estimated1RM > sessionMax1RM) sessionMax1RM = estimated1RM;
            }
            hasValidData = true;
          } else if (analyticalType === 'duration') {
            const t = Number(set.time);
            if (isNaN(t) || t <= 0) return;
            const norm = storage.normalizeUnit(t, set.unit || 's', 'duration');
            if (norm.value !== null) {
              sessionVolume += norm.value;
              hasValidData = true;
            }
          } else if (analyticalType === 'distance') {
            const d = Number(set.distance);
            if (isNaN(d) || d <= 0) return;
            const norm = storage.normalizeUnit(d, set.unit || 'm', 'distance');
            if (norm.value !== null) {
              sessionVolume += norm.value;
              if (norm.value > sessionMaxDistance) sessionMaxDistance = norm.value;
              hasValidData = true;
            }
          }
        });
      });

      if (hasValidData) {
        sessions.push({
          resultId: res.id,
          date: sessionDate,
          rpe: res.feedbackRpe || null,
          volume: sessionVolume,
          maxLoad: sessionMaxLoad,
          max1RM: sessionMax1RM,
          maxDistance: sessionMaxDistance,
          totalReps: totalReps
        });
      }
    }

    // Ordenar cronológicamente (ascendente)
    sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Generar history con variaciones
    const history = sessions.map((s, idx) => {
      let prev = idx > 0 ? sessions[idx - 1] : null;
      let varVolume = prev ? s.volume - prev.volume : null;
      let pctVolume = (prev && prev.volume > 0) ? (varVolume / prev.volume) * 100 : null;

      let var1RM = prev ? s.max1RM - prev.max1RM : null;
      let pct1RM = (prev && prev.max1RM > 0) ? (var1RM / prev.max1RM) * 100 : null;

      return {
        ...s,
        varVolume,
        pctVolume,
        var1RM,
        pct1RM
      };
    });

    // Calcular Records con Contexto
    let prMaxLoad = { value: 0, date: null, resultId: null };
    let prMax1RM = { value: 0, date: null, resultId: null };
    let prMaxVolume = { value: 0, date: null, resultId: null };
    let prMaxDistance = { value: 0, date: null, resultId: null };

    sessions.forEach(s => {
      if (s.maxLoad > prMaxLoad.value) prMaxLoad = { value: s.maxLoad, date: s.date, resultId: s.resultId };
      if (s.max1RM > prMax1RM.value) prMax1RM = { value: s.max1RM, date: s.date, resultId: s.resultId };
      if (s.volume > prMaxVolume.value) prMaxVolume = { value: s.volume, date: s.date, resultId: s.resultId };
      if (s.maxDistance > prMaxDistance.value) prMaxDistance = { value: s.maxDistance, date: s.date, resultId: s.resultId };
    });

    return {
      exerciseDef,
      analyticalType,
      history,
      records: {
        maxLoad: prMaxLoad,
        max1RM: prMax1RM,
        maxVolume: prMaxVolume,
        maxDistance: prMaxDistance
      }
    };
  },

  getClientPersonalRecords: async (clientId) => {
    // Get all completed workouts
    const results = (await getCollection('workout_results')).filter(r => String(r.clientId) === String(clientId) && (r.status === 'completed' || r.status === 'submitted'));

    const executedExerciseIds = new Set();
    results.forEach(r => {
      if (r.loggedBlocks) {
        r.loggedBlocks.forEach(b => executedExerciseIds.add(b.exerciseId));
      }
    });

    const prs = [];
    for (const exId of executedExerciseIds) {
      try {
        const analytics = await storage.getExerciseAnalytics(clientId, exId);
        if (analytics.history.length > 0) {
          prs.push({
            exerciseId: exId,
            exerciseName: analytics.exerciseDef.name,
            analyticalType: analytics.analyticalType,
            records: analytics.records
          });
        }
      } catch (err) {
        // Ignorar ejercicios rotos en este resumen
      }
    }
    return prs;
  },

  // ── FASE 11: CALENDARIO Y PLANIFICACIÓN GLOBAL ──

  getCalendarEvents: async ({ startDate, endDate, clientId = null, statuses = null, includeProgramMilestones = false }) => {
    const startStr = startDate.split('T')[0];
    const endStr = endDate.split('T')[0];

    const isDateInRange = (dateStr) => {
      if (!dateStr) return false;
      const d = dateStr.split('T')[0];
      return d >= startStr && d <= endStr;
    };

    let events = [];
    // getClients ya aplica el alcance por rol (owner ve todos, coach solo los
    // suyos) y consulta filtrando en Firestore, no en memoria.
    const clients = await storage.getClients();
    // Los clientes se guardan con firstName/lastName; no existe campo "name",
    // así que esto devolvía siempre "Cliente Desconocido".
    const getClientName = (cId) => {
      const c = clients.find(cl => String(cl.id) === String(cId));
      if (!c) return 'Cliente Desconocido';
      const full = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      return full || 'Cliente Desconocido';
    };

    // ── Alcance por rol ──
    // owner  -> todos los clientes de la organización
    // coach  -> solo los clientes que tenga asignados
    // client -> solo su propia ficha
    // Se calcula SIEMPRE, también cuando llega un clientId explícito: así un
    // coach no puede ver la agenda de un cliente que no es suyo pasando su id.
    const role = sessionService.getRole();

    // "clients" ya viene acotado por rol desde getClients(); aquí solo se
    // estrecha más si se pide un cliente concreto.
    let visibles = clients;
    if (clientId) {
      visibles = visibles.filter(c => String(c.id) === String(clientId));
    }
    const allowedIds = new Set(visibles.map(c => String(c.id)));
    const isAllowed = (cId) => allowedIds.has(String(cId));

    // Datos del entrenador de cada cliente, para pintar y agrupar en la vista
    // del owner. Solo el owner puede listar /users (ver firestore.rules), así
    // que para el resto de roles nos limitamos al id, sin resolver el nombre.
    let coaches = [];
    if (role === 'owner') {
      try {
        coaches = await firestoreService.getDocumentsByQuery('users', [
          { field: 'organizationId', op: '==', value: sessionService.getOrgId() }
        ]);
      } catch (err) {
        console.error('No se pudo cargar el listado de entrenadores:', err);
      }
    }
    const getCoachInfo = (cId) => {
      const c = clients.find(cl => String(cl.id) === String(cId));
      if (!c || !c.coachId) return { coachId: null, coachName: 'Sin entrenador' };
      const u = coaches.find(x => String(x.uid || x.id) === String(c.coachId));
      return {
        coachId: String(c.coachId),
        coachName: u ? (u.fullName || u.email || 'Entrenador') : 'Entrenador'
      };
    };

    // 1. Extraer Workout Assignments
    let workoutAssignments = await getCollection('workout_assignments');
    workoutAssignments = workoutAssignments.filter(wa => isAllowed(wa.clientId));
    if (statuses && statuses.length > 0) {
      workoutAssignments = workoutAssignments.filter(wa => statuses.includes(wa.status));
    }

    workoutAssignments.forEach(wa => {
      const scheduledDate = wa.scheduledAt.split('T')[0];
      if (isDateInRange(scheduledDate)) {
        events.push({
          id: `wa-${wa.id}`,
          type: 'workout',
          date: scheduledDate,
          title: wa.plannedSnapshot?.name || 'Entrenamiento',
          clientId: wa.clientId,
          clientName: getClientName(wa.clientId),
          ...getCoachInfo(wa.clientId),
          status: wa.status,
          assignmentId: wa.id
        });
      }
    });

    // 2. Extraer Free Sessions (Desde WorkoutResults)
    let workoutResults = await getCollection('workout_results');
    workoutResults = workoutResults.filter(wr => isAllowed(wr.clientId));
    const freeSessions = workoutResults.filter(wr => wr.workoutAssignmentId === null);
    freeSessions.forEach(fs => {
      const performedDate = (fs.performedAt || fs.createdAt).split('T')[0];
      if (isDateInRange(performedDate)) {
        events.push({
          id: `fs-${fs.id}`,
          type: 'free_session',
          date: performedDate,
          title: fs.freeSessionTitle || 'Sesión Libre',
          clientId: fs.clientId,
          clientName: getClientName(fs.clientId),
          ...getCoachInfo(fs.clientId),
          status: fs.status,
          resultId: fs.id
        });
      }
    });

    // 3. Extraer Hitos de Programas (Si se solicita)
    if (includeProgramMilestones) {
      let programAssignments = await getCollection('program_assignments');
      programAssignments = programAssignments.filter(pa => isAllowed(pa.clientId));

      for (const pa of programAssignments) {
        const startDate = pa.scheduledAt.split('T')[0];

        // Inferir End Date
        let endDateStr = startDate;
        let durationWeeks = 1;

        if (pa.plannedSnapshot && pa.plannedSnapshot.durationWeeks) {
          durationWeeks = pa.plannedSnapshot.durationWeeks;
        } else if (pa.programId) {
          const progs = await getCollection('programs');
          const p = progs.find(x => x.id === pa.programId);
          if (p && p.durationWeeks) durationWeeks = p.durationWeeks;
        }

        const eDate = new Date(startDate);
        eDate.setDate(eDate.getDate() + (durationWeeks * 7) - 1);
        endDateStr = eDate.toISOString().split('T')[0];

        const programTitle = pa.plannedSnapshot?.name || 'Programa';

        if (isDateInRange(startDate)) {
          events.push({
            id: `pa-start-${pa.id}`,
            type: 'program_start',
            date: startDate,
            title: `[INICIO] ${programTitle}`,
            clientId: pa.clientId,
            clientName: getClientName(pa.clientId),
            ...getCoachInfo(pa.clientId),
            programId: pa.programId,
            programAssignmentId: pa.id
          });
        }

        if (isDateInRange(endDateStr)) {
          events.push({
            id: `pa-end-${pa.id}`,
            type: 'program_end',
            date: endDateStr,
            title: `[FIN] ${programTitle}`,
            clientId: pa.clientId,
            clientName: getClientName(pa.clientId),
            ...getCoachInfo(pa.clientId),
            programId: pa.programId,
            programAssignmentId: pa.id
          });
        }
      }
    }

    // Ordenar de forma determinista (fecha asc, tipo, id)
    events.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id.localeCompare(b.id);
    });

    return events;
  },

  rescheduleWorkoutAssignment: async (assignmentId, newDateStr) => {
    const wa = await firestoreService.getDocument('workout_assignments', String(assignmentId));
    if (!wa) throw new Error("Asignación no encontrada.");
    wa.scheduledAt = newDateStr;
    wa.updatedAt = new Date().toISOString();
    await firestoreService.setDocument('workout_assignments', String(assignmentId), wa);
    return true;
  }
};

// ── CAPABILITIES WRAPPING DE SEGURIDAD PARA EL ROL CLIENTE ──
const coachOnlyMethods = [
  'saveEntity', 'deleteEntity', 'saveExercise', 'deleteExercise',
  'saveClient', 'deleteClient', 'saveAnamnesis', 'saveTestDefinition',
  'saveWorkout', 'deleteWorkout', 'saveProgram', 'deleteProgram',
  'saveProgramAssignment', 'deleteProgramAssignment', 'savePrivateNote',
  'deletePrivateNote', 'revertMissedAssignment', 'saveWorkoutFeedback',
  'rescheduleWorkoutAssignment'
];

const checkCoachPermission = () => {
  if (sessionService.getRole() === 'client') {
    throw new Error("Permiso denegado: Tu rol de deportista no tiene privilegios para realizar esta acción.");
  }
};

// Interceptar las llamadas para aplicar la política
coachOnlyMethods.forEach(method => {
  if (typeof storage[method] === 'function') {
    const original = storage[method];
    storage[method] = async (...args) => {
      checkCoachPermission();
      return original.apply(storage, args);
    };
  }
});

// Helper for ChangeLogs (Re-added since it was lost)
storage.saveChangeLog = async (log) => {
  const orgId = sessionService.getOrgId();
  const userId = sessionService.getUserId() || 'system';
  let saved = {
    ...log,
    orgId,
    userId,
    id: generateUUID(),
    createdAt: new Date().toISOString()
  };
  await firestoreService.setDocument('audit_logs', String(saved.id), saved);
  return saved;
};

export default storage;
