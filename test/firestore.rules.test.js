import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let testEnv;

beforeAll(async () => {
  // Initialize testing environment with local rules
  testEnv = await initializeTestEnvironment({
    projectId: "julit-mock-project",
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // --- SEEDS ---
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Org A setup
    await db.collection('organizations').doc('orgA').set({ name: 'Org A' });
    await db.collection('organization_members').doc('orgA_ownerA').set({ orgId: 'orgA', userId: 'ownerA', role: 'owner', status: 'active' });
    await db.collection('organization_members').doc('orgA_coachA').set({ orgId: 'orgA', userId: 'coachA', role: 'coach', status: 'active' });
    await db.collection('organization_members').doc('orgA_clientA').set({ orgId: 'orgA', userId: 'clientA', role: 'client', status: 'active' });
    await db.collection('client_profiles').doc('orgA_clientA_clientDocA').set({ orgId: 'orgA', userId: 'clientA', clientId: 'clientDocA' });
    
    await db.collection('clients').doc('clientDocA').set({ orgId: 'orgA', name: 'Mock Client A' });
    await db.collection('workouts').doc('workoutA').set({ orgId: 'orgA', name: 'Workout A' });
    await db.collection('workout_assignments').doc('assignmentA').set({ orgId: 'orgA', clientId: 'clientDocA' });
    await db.collection('workout_results').doc('resultA').set({ orgId: 'orgA', clientId: 'clientDocA' });

    // Org B setup
    await db.collection('organizations').doc('orgB').set({ name: 'Org B' });
    await db.collection('organization_members').doc('orgB_ownerB').set({ orgId: 'orgB', userId: 'ownerB', role: 'owner', status: 'active' });
    await db.collection('organization_members').doc('orgB_coachB').set({ orgId: 'orgB', userId: 'coachB', role: 'coach', status: 'active' });
    await db.collection('organization_members').doc('orgB_clientB').set({ orgId: 'orgB', userId: 'clientB', role: 'client', status: 'active' });
    await db.collection('client_profiles').doc('orgB_clientB_clientDocB').set({ orgId: 'orgB', userId: 'clientB', clientId: 'clientDocB' });
    
    await db.collection('clients').doc('clientDocB').set({ orgId: 'orgB', name: 'Mock Client B' });
    await db.collection('workouts').doc('workoutB').set({ orgId: 'orgB', name: 'Workout B' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// --- HELPER CONTEXTS ---
function getDb(userId) {
  return testEnv.authenticatedContext(userId).firestore();
}
function getUnauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

// --- TESTS ---
describe('Firestore Security Rules', () => {

  describe('Aislamiento Multi-Tenant', () => {
    it('Coach A puede leer clientes de Org A', async () => {
      const db = getDb('coachA');
      await assertSucceeds(db.collection('clients').where('orgId', '==', 'orgA').get());
    });

    it('Coach A no puede leer clientes de Org B', async () => {
      const db = getDb('coachA');
      await assertFails(db.collection('clients').doc('clientDocB').get());
    });

    it('Owner A puede modificar orgA pero no orgB', async () => {
      const db = getDb('ownerA');
      await assertSucceeds(db.collection('organizations').doc('orgA').update({ name: 'New Name' }));
      await assertFails(db.collection('organizations').doc('orgB').update({ name: 'Hacked' }));
    });
    
    it('Coach A no puede modificar organization_members', async () => {
      const db = getDb('coachA');
      await assertFails(db.collection('organization_members').doc('orgA_coachA').update({ role: 'owner' }));
    });
  });

  describe('Restricciones de Cliente', () => {
    it('Cliente A puede leer su propio cliente en clients', async () => {
      const db = getDb('clientA');
      await assertSucceeds(db.collection('clients').doc('clientDocA').get());
    });

    it('Cliente A no puede leer otros clientes de su misma orgA', async () => {
      const db = getDb('clientA');
      // No existe otro clientDocA2, pero si lo probamos, fallaría porque no está en client_profiles
      await assertFails(db.collection('clients').doc('otherDoc').get());
    });

    it('Cliente A NO puede leer workouts de su OrgA', async () => {
      const db = getDb('clientA');
      await assertFails(db.collection('workouts').doc('workoutA').get());
    });

    it('Cliente A puede leer sus asignaciones', async () => {
      const db = getDb('clientA');
      await assertSucceeds(db.collection('workout_assignments').doc('assignmentA').get());
    });

    it('Cliente A no puede escribir en workout_results (denegado en 12A)', async () => {
      const db = getDb('clientA');
      await assertFails(db.collection('workout_results').doc('newResult').set({ orgId: 'orgA', clientId: 'clientDocA' }));
    });
  });

  describe('Restricciones de Auditoría e Invitaciones', () => {
    it('Coach A no puede escribir en audit_logs', async () => {
      const db = getDb('coachA');
      await assertFails(db.collection('audit_logs').doc('log1').set({ orgId: 'orgA', action: 'test' }));
    });

    it('Coach A no puede crear invitaciones directamente', async () => {
      const db = getDb('coachA');
      await assertFails(db.collection('client_invitations').doc('inv1').set({ orgId: 'orgA' }));
    });
  });
});
