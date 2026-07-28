import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
import { createHash, randomUUID } from 'crypto';

initializeApp();
const db = getFirestore();

/**
 * createInvite
 * Genera un enlace de invitación para un cliente.
 */
export const createInvite = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { orgId, clientId, email } = data;
  if (!orgId || !clientId || !email) {
    throw new HttpsError('invalid-argument', 'Missing required fields: orgId, clientId, email');
  }

  // 1. Validar que el usuario sea Owner o Coach de la organización
  const memberRef = db.collection('organization_members').doc(`${orgId}_${auth.uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError('permission-denied', 'User is not a member of this organization');
  }
  const memberData = memberSnap.data();
  if (memberData.role !== 'owner' && memberData.role !== 'coach') {
    throw new HttpsError('permission-denied', 'Only coaches or owners can create invitations');
  }
  if (memberData.status !== 'active') {
    throw new HttpsError('permission-denied', 'Your account is suspended');
  }

  // Generar token y hash
  const rawToken = randomUUID();
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

  // Usamos una transacción para invalidar invitaciones previas pendientes y crear la nueva
  const inviteId = await db.runTransaction(async (t) => {
    // Buscar invitaciones pendientes para este clientId
    const pendingQuery = await t.get(
      db.collection('client_invitations')
        .where('orgId', '==', orgId)
        .where('clientId', '==', clientId)
        .where('status', '==', 'pending')
    );

    // Invalidar invitaciones pendientes previas
    pendingQuery.forEach(docSnap => {
      t.update(docSnap.ref, {
        status: 'revoked',
        revokedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1)
      });
    });

    // Crear la nueva invitación
    const newInviteRef = db.collection('client_invitations').doc();
    t.set(newInviteRef, {
      orgId,
      clientId,
      email,
      tokenHash,
      status: 'pending',
      invitedBy: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      version: 1
    });

    return newInviteRef.id;
  });

  // Retornamos el token en crudo al cliente
  return { token: rawToken, inviteId };
});

/**
 * consumeInvite
 * Consume un token de invitación y crea los vínculos del cliente
 */
export const consumeInvite = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { token } = data;
  if (!token) {
    throw new HttpsError('invalid-argument', 'Token is required');
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  await db.runTransaction(async (t) => {
    // 1. Buscar la invitación por hash
    const inviteQuery = await t.get(
      db.collection('client_invitations')
        .where('tokenHash', '==', tokenHash)
    );

    if (inviteQuery.empty) {
      throw new HttpsError('not-found', 'Invalid or non-existent invitation');
    }

    const inviteDoc = inviteQuery.docs[0];
    const inviteData = inviteDoc.data();

    // 2. Comprobar estado
    if (inviteData.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Invitation is already ${inviteData.status}`);
    }

    // 3. Comprobar expiración
    const now = new Date();
    if (inviteData.expiresAt && inviteData.expiresAt.toDate() < now) {
      // Opcional: auto-revocar/caducar
      t.update(inviteDoc.ref, {
        status: 'expired',
        version: FieldValue.increment(1)
      });
      throw new HttpsError('failed-precondition', 'Invitation has expired');
    }

    // 4. Inyección Idempotente de perfiles
    const { orgId, clientId } = inviteData;
    const uid = auth.uid;

    const userRef = db.collection('users').doc(uid);
    const memberRef = db.collection('organization_members').doc(`${orgId}_${uid}`);
    const clientProfileRef = db.collection('client_profiles').doc(`${orgId}_${uid}_${clientId}`);

    // Solo actualizamos 'users' de forma segura (sin sobreescribir si ya existe, o actualizando 'lastLogin')
    t.set(userRef, { email: auth.token.email }, { merge: true });

    t.set(memberRef, {
      orgId,
      userId: uid,
      role: 'client',
      status: 'active'
    }, { merge: true });

    t.set(clientProfileRef, {
      orgId,
      userId: uid,
      clientId,
      status: 'active',
      linkedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // 5. Marcar invitación como consumida
    // 5. Marcar invitación como consumida
    t.update(inviteDoc.ref, {
      status: 'accepted',
      acceptedAt: FieldValue.serverTimestamp(),
      version: FieldValue.increment(1)
    });
  });

  return { success: true };
});

// ==========================================
// OPERACIONES DE DOMINIO (12C)
// ==========================================

export const saveAssignmentFn = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
  
  const { assignment } = data;
  if (!assignment || !assignment.orgId || !assignment.clientId || !assignment.id) {
    throw new HttpsError('invalid-argument', 'Missing required assignment fields');
  }

  const { orgId } = assignment;
  
  // Validar rol de Coach
  const memberRef = db.collection('organization_members').doc(`${orgId}_${auth.uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists || (memberSnap.data().role !== 'coach' && memberSnap.data().role !== 'owner')) {
    throw new HttpsError('permission-denied', 'Only coaches can save assignments');
  }

  await db.runTransaction(async (t) => {
    const assignmentRef = db.collection('workout_assignments').doc(assignment.id);
    const snap = await t.get(assignmentRef);
    
    // Control de concurrencia optimista
    let currentVersion = 0;
    if (snap.exists) {
      currentVersion = snap.data().version || 0;
      if (assignment.version && assignment.version !== currentVersion) {
        throw new HttpsError('aborted', 'Conflict: Document was modified by another request');
      }
    }
    
    const newVersion = currentVersion + 1;
    const docData = {
      ...assignment,
      version: newVersion,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (!snap.exists) docData.createdAt = FieldValue.serverTimestamp();
    
    t.set(assignmentRef, docData);
    
    // Auditoría
    const auditRef = db.collection('audit_logs').doc();
    t.set(auditRef, {
      orgId,
      action: snap.exists ? 'WORKOUT_ASSIGNMENT_UPDATED' : 'WORKOUT_ASSIGNED',
      entityId: assignment.id,
      entityType: 'workout_assignment',
      actorId: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      details: { 
        clientId: assignment.clientId,
        workoutId: assignment.workoutId,
        date: assignment.scheduledAt
      }
    });
  });
  
  return { success: true };
});

export const rescheduleAssignmentFn = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
  
  const { assignmentId, newDate, orgId, version } = data;
  if (!assignmentId || !newDate || !orgId) {
    throw new HttpsError('invalid-argument', 'Missing fields');
  }

  const memberRef = db.collection('organization_members').doc(`${orgId}_${auth.uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists || (memberSnap.data().role !== 'coach' && memberSnap.data().role !== 'owner')) {
    throw new HttpsError('permission-denied', 'Only coaches can reschedule assignments');
  }

  await db.runTransaction(async (t) => {
    const assignmentRef = db.collection('workout_assignments').doc(assignmentId);
    const snap = await t.get(assignmentRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Assignment not found');
    
    const currentData = snap.data();
    if (currentData.orgId !== orgId) throw new HttpsError('permission-denied', 'Wrong orgId');
    if (version !== undefined && currentData.version !== version) {
      throw new HttpsError('aborted', 'Conflict: Document modified');
    }
    
    t.update(assignmentRef, {
      scheduledAt: newDate,
      version: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    const auditRef = db.collection('audit_logs').doc();
    t.set(auditRef, {
      orgId,
      action: 'WORKOUT_ASSIGNMENT_RESCHEDULED',
      entityId: assignmentId,
      entityType: 'workout_assignment',
      actorId: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      details: {
        oldDate: currentData.scheduledAt,
        newDate: newDate
      }
    });
  });
  
  return { success: true };
});

export const saveResultFn = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
  
  const { result } = data;
  if (!result || !result.orgId || !result.clientId || !result.id || !result.assignmentId) {
    throw new HttpsError('invalid-argument', 'Missing result fields');
  }

  const { orgId, clientId } = result;
  
  // Validar rol (puede ser Cliente del propio clientId o Coach)
  const memberRef = db.collection('organization_members').doc(`${orgId}_${auth.uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) throw new HttpsError('permission-denied', 'Not a member');
  
  const role = memberSnap.data().role;
  if (role === 'client') {
    // Si es cliente, verificar que está escribiendo SU resultado
    const profileRef = db.collection('client_profiles').doc(`${orgId}_${auth.uid}_${clientId}`);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      throw new HttpsError('permission-denied', 'Cannot save results for other clients');
    }
  }

  await db.runTransaction(async (t) => {
    // Verificar Assignment base
    const assignmentRef = db.collection('workout_assignments').doc(result.assignmentId);
    const assignSnap = await t.get(assignmentRef);
    if (!assignSnap.exists || assignSnap.data().orgId !== orgId) {
      throw new HttpsError('failed-precondition', 'Assignment does not exist');
    }

    const resultRef = db.collection('workout_results').doc(result.id);
    const snap = await t.get(resultRef);
    
    let currentVersion = 0;
    if (snap.exists) {
      currentVersion = snap.data().version || 0;
      if (result.version && result.version !== currentVersion) {
        throw new HttpsError('aborted', 'Conflict: Document was modified by another request');
      }
    }
    
    const docData = {
      ...result,
      version: currentVersion + 1,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (!snap.exists) docData.createdAt = FieldValue.serverTimestamp();
    
    t.set(resultRef, docData);
    
    // Si la asignación estaba pendiente, marcarla como en progreso/completada
    // (Lógica simplificada: en Julit V8 el resultado contiene el estado global del workout)
    // No modificaremos assignment aquí salvo que sea necesario por dominio. En V8 no se alteraba assignment, solo se creaba result.
    
    const auditRef = db.collection('audit_logs').doc();
    t.set(auditRef, {
      orgId,
      action: snap.exists ? 'WORKOUT_RESULT_UPDATED' : 'WORKOUT_RESULT_LOGGED',
      entityId: result.id,
      entityType: 'workout_result',
      actorId: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      details: {
        assignmentId: result.assignmentId,
        clientId: result.clientId
      }
    });
  });
  
  return { success: true };
});

