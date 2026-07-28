import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import * as functionsTest from 'firebase-functions-test';
import { saveAssignmentFn, rescheduleAssignmentFn, saveResultFn } from '../index.js';

const testEnv = functionsTest.default({
  projectId: 'julit-mock-project'
});

describe('Cloud Functions: Domain (Assignments & Results)', () => {
  let db;

  beforeAll(() => {
    db = admin.firestore();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(async () => {
    const collections = ['workout_assignments', 'workout_results', 'audit_logs', 'organization_members', 'client_profiles'];
    for (const coll of collections) {
      const snap = await db.collection(coll).get();
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    
    // Seed basic org member
    await db.collection('organization_members').doc('orgA_coach1').set({
      orgId: 'orgA', userId: 'coach1', role: 'coach', status: 'active'
    });
    
    await db.collection('organization_members').doc('orgA_client1').set({
      orgId: 'orgA', userId: 'client1', role: 'client', status: 'active'
    });
    
    await db.collection('client_profiles').doc('orgA_client1_client_profile_1').set({
      orgId: 'orgA', userId: 'client1', clientId: 'client_profile_1', status: 'active'
    });
  });

  it('saveAssignmentFn: Guarda asignación e inyecta log de auditoría', async () => {
    const wrapped = testEnv.wrap(saveAssignmentFn);
    const assignmentData = {
      id: 'assign1',
      orgId: 'orgA',
      clientId: 'client_profile_1',
      workoutId: 'workout1',
      scheduledAt: '2025-01-01'
    };

    await wrapped({ data: { assignment: assignmentData }, auth: { uid: 'coach1' } });

    const snap = await db.collection('workout_assignments').doc('assign1').get();
    if (!snap.exists) throw new Error('Assignment not saved');
    if (snap.data().version !== 1) throw new Error('Version should be 1');

    const logsSnap = await db.collection('audit_logs').where('entityId', '==', 'assign1').get();
    if (logsSnap.empty) throw new Error('Audit log not created');
    if (logsSnap.docs[0].data().action !== 'WORKOUT_ASSIGNED') throw new Error('Wrong audit action');
  });

  it('rescheduleAssignmentFn: Reprograma asignación y actualiza version', async () => {
    const wrapped = testEnv.wrap(rescheduleAssignmentFn);
    
    await db.collection('workout_assignments').doc('assign2').set({
      orgId: 'orgA',
      clientId: 'c1',
      scheduledAt: '2025-01-01',
      version: 1
    });

    await wrapped({ 
      data: { assignmentId: 'assign2', newDate: '2025-01-02', orgId: 'orgA', version: 1 }, 
      auth: { uid: 'coach1' } 
    });

    const snap = await db.collection('workout_assignments').doc('assign2').get();
    if (snap.data().scheduledAt !== '2025-01-02') throw new Error('Not rescheduled');
    if (snap.data().version !== 2) throw new Error('Version not incremented');

    const logsSnap = await db.collection('audit_logs').where('action', '==', 'WORKOUT_ASSIGNMENT_RESCHEDULED').get();
    if (logsSnap.empty) throw new Error('Audit log missing');
  });

  it('saveResultFn: Cliente puede guardar su propio resultado', async () => {
    const wrapped = testEnv.wrap(saveResultFn);
    
    await db.collection('workout_assignments').doc('assign3').set({
      orgId: 'orgA', clientId: 'client_profile_1'
    });

    const resultData = {
      id: 'result1',
      orgId: 'orgA',
      clientId: 'client_profile_1',
      assignmentId: 'assign3',
      metrics: { rpe: 8 }
    };

    await wrapped({ data: { result: resultData }, auth: { uid: 'client1' } });

    const snap = await db.collection('workout_results').doc('result1').get();
    if (!snap.exists) throw new Error('Result not saved');
  });
  
  it('saveResultFn: Fallo optimista si version no coincide', async () => {
    const wrapped = testEnv.wrap(saveResultFn);
    
    await db.collection('workout_assignments').doc('assign4').set({
      orgId: 'orgA', clientId: 'client_profile_1'
    });

    await db.collection('workout_results').doc('result2').set({
      id: 'result2', orgId: 'orgA', clientId: 'client_profile_1', assignmentId: 'assign4', version: 2
    });

    const resultData = {
      id: 'result2', orgId: 'orgA', clientId: 'client_profile_1', assignmentId: 'assign4', version: 1 // Versión vieja
    };

    let error;
    try {
      await wrapped({ data: { result: resultData }, auth: { uid: 'coach1' } });
    } catch (err) {
      error = err;
    }

    if (!error || error.code !== 'aborted') throw new Error('Should throw aborted for conflict');
  });
});
