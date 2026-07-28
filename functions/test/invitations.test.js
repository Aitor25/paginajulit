import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import * as functionsTest from 'firebase-functions-test';
import { createInvite, consumeInvite } from '../index.js';
import { randomUUID } from 'crypto';

// Initialize firebase-functions-test
const testEnv = functionsTest.default({
  projectId: 'julit-mock-project'
});

describe('Cloud Functions: Invitations', () => {
  let db;

  beforeAll(() => {
    db = admin.firestore();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(async () => {
    // Limpiar firestore (solo de colecciones involucradas)
    const collections = ['client_invitations', 'organization_members', 'users', 'client_profiles'];
    for (const coll of collections) {
      const snap = await db.collection(coll).get();
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  });

  it('createInvite: Debería fallar si el usuario no es coach/owner', async () => {
    const wrapped = testEnv.wrap(createInvite);
    let error;
    try {
      await wrapped({ data: { orgId: 'orgA', clientId: 'clientA', email: 'test@test.com' }, auth: { uid: 'unauthorized_user' } });
    } catch (err) {
      error = err;
    }
    
    if (!error) throw new Error('Expected function to throw');
    if (error.code !== 'permission-denied') throw new Error(`Wrong error code: ${error.code}`);
  });

  it('createInvite: Debería crear invitación y retornar token crudo', async () => {
    const wrapped = testEnv.wrap(createInvite);
    
    await db.collection('organization_members').doc('orgA_coach1').set({
      orgId: 'orgA', userId: 'coach1', role: 'coach', status: 'active'
    });

    const res = await wrapped({ data: { orgId: 'orgA', clientId: 'client1', email: 'test@test.com' }, auth: { uid: 'coach1' } });
    
    if (!res.token || !res.inviteId) throw new Error('Missing token or inviteId in response');

    const inviteDoc = await db.collection('client_invitations').doc(res.inviteId).get();
    if (!inviteDoc.exists) throw new Error('Invite not found in DB');
    
    const data = inviteDoc.data();
    if (data.status !== 'pending') throw new Error('Incorrect status');
    if (data.email !== 'test@test.com') throw new Error('Incorrect email');
    if (data.tokenHash === res.token) throw new Error('Stored token as plain text!');
  });

  it('createInvite: Debería revocar invitaciones previas pendientes', async () => {
    const wrapped = testEnv.wrap(createInvite);
    
    await db.collection('organization_members').doc('orgA_coach1').set({
      orgId: 'orgA', userId: 'coach1', role: 'owner', status: 'active'
    });

    await db.collection('organization_members').doc('orgA_coach1').set({
      orgId: 'orgA', userId: 'coach1', role: 'owner', status: 'active'
    });

    const prevInviteRef = db.collection('client_invitations').doc('prev1');
    await prevInviteRef.set({
      orgId: 'orgA', clientId: 'client1', status: 'pending', version: 1
    });

    await wrapped({ data: { orgId: 'orgA', clientId: 'client1', email: 't@t.com' }, auth: { uid: 'coach1' } });

    const prevSnap = await prevInviteRef.get();
    if (prevSnap.data().status !== 'revoked') throw new Error('Previous invite was not revoked');
  });

  it('consumeInvite: Debería consumir invitación correctamente e inyectar perfiles', async () => {
    const createWrapped = testEnv.wrap(createInvite);
    const consumeWrapped = testEnv.wrap(consumeInvite);
    
    await db.collection('organization_members').doc('orgB_coach1').set({
      orgId: 'orgB', userId: 'coach1', role: 'coach', status: 'active'
    });

    const { token, inviteId } = await createWrapped({ data: { orgId: 'orgB', clientId: 'clientB', email: 'b@t.com' }, auth: { uid: 'coach1' } });

    await consumeWrapped({ data: { token }, auth: { uid: 'client_uid', token: { email: 'client@t.com' } } });

    const inviteSnap = await db.collection('client_invitations').doc(inviteId).get();
    if (inviteSnap.data().status !== 'accepted') throw new Error('Invite not accepted');

    const memberSnap = await db.collection('organization_members').doc('orgB_client_uid').get();
    if (!memberSnap.exists || memberSnap.data().role !== 'client') throw new Error('Member not injected');

    const clientProfileSnap = await db.collection('client_profiles').doc('orgB_client_uid_clientB').get();
    if (!clientProfileSnap.exists || clientProfileSnap.data().clientId !== 'clientB') throw new Error('Client Profile not injected');
  });

  it('consumeInvite: Debería fallar si token no existe o es inválido', async () => {
    const consumeWrapped = testEnv.wrap(consumeInvite);
    let error;
    try {
      await consumeWrapped({ data: { token: 'fake-token' }, auth: { uid: 'user', token: {} } });
    } catch (err) {
      error = err;
    }
    if (!error || error.code !== 'not-found') throw new Error('Should throw not-found');
  });

  it('consumeInvite: Debería fallar si ya fue aceptada o caducada (doble consumo)', async () => {
    const createWrapped = testEnv.wrap(createInvite);
    const consumeWrapped = testEnv.wrap(consumeInvite);
    
    await db.collection('organization_members').doc('orgB_coach1').set({
      orgId: 'orgB', userId: 'coach1', role: 'coach', status: 'active'
    });

    const { token } = await createWrapped({ data: { orgId: 'orgB', clientId: 'clientB', email: 'b@t.com' }, auth: { uid: 'coach1' } });

    await consumeWrapped({ data: { token }, auth: { uid: 'client_uid1', token: { email: 'client1@t.com' } } });
    
    let error;
    try {
      await consumeWrapped({ data: { token }, auth: { uid: 'client_uid2', token: { email: 'client2@t.com' } } });
    } catch (err) {
      error = err;
    }
    if (!error || error.code !== 'failed-precondition') throw new Error('Double consume should throw failed-precondition');
  });
});
