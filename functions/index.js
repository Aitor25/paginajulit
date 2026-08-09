import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
import { createHash, randomUUID } from 'crypto';

initializeApp();
const db = getFirestore();

/**
 * Perfil de usuario real de la app: users/{uid}, con role y organizationId.
 * NUNCA usar la colección "organization_members" ni "client_profiles":
 * son de un modelo de datos anterior que nada en la app llega a escribir
 * (ni el frontend ni firestore.rules las usan), así que cualquier función
 * que dependiera de ellas fallaba siempre con las cuentas reales.
 */
async function getUserProfile(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function requireCoachOrOwner(profile, orgId) {
  if (!profile || profile.organizationId !== orgId) {
    throw new HttpsError('permission-denied', 'User is not a member of this organization');
  }
  if (profile.role !== 'coach' && profile.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only coaches or owners can perform this action');
  }
  if (profile.status !== 'active') {
    throw new HttpsError('permission-denied', 'Your account is suspended');
  }
}

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
  const profile = await getUserProfile(auth.uid);
  requireCoachOrOwner(profile, orgId);

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
    const clientRef = db.collection('clients').doc(String(clientId));

    // El modelo real de la app vive en users/{uid}: role, organizationId,
    // clientId y status. Se actualiza aquí en vez de en una colección
    // paralela que el resto de la app nunca lee.
    t.set(userRef, {
      email: auth.token.email,
      role: 'client',
      organizationId: orgId,
      clientId: String(clientId),
      status: 'active',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // linkedUserId es lo que permite al cliente leer su propia ficha
    // (ver firestore.rules).
    t.set(clientRef, {
      linkedUserId: uid,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

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
  const profile = await getUserProfile(auth.uid);
  requireCoachOrOwner(profile, orgId);

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

  const profile = await getUserProfile(auth.uid);
  requireCoachOrOwner(profile, orgId);

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

  // Validar rol: puede ser el propio cliente registrando su resultado, o
  // un coach/owner de la organización.
  const profile = await getUserProfile(auth.uid);
  if (!profile || profile.organizationId !== orgId) {
    throw new HttpsError('permission-denied', 'Not a member');
  }
  if (profile.role === 'client') {
    if (String(profile.clientId || '') !== String(clientId)) {
      throw new HttpsError('permission-denied', 'Cannot save results for other clients');
    }
  } else if (profile.role !== 'coach' && profile.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Not a member');
  }

  await db.runTransaction(async (t) => {
    // Todas las lecturas van antes que cualquier escritura: Firestore no
    // permite mezclarlas dentro de una transacción (un t.get() después de
    // un t.set()/t.update() hace fallar la transacción entera con un error
    // interno). Por eso las dos lecturas -asignación y resultado- se hacen
    // primero, y las escrituras -asignación, resultado, auditoría- después.
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

    // Esta función nunca tocaba el estado de la asignación: se guardaba el
    // resultado, pero "Finalizar Entrenamiento" no dejaba ningún rastro en
    // workout_assignments.status, así que la sesión seguía viéndose como
    // "pendiente" o "perdida" para siempre y no había forma de distinguir
    // que ya se había completado. El cliente no puede escribir en
    // workout_assignments directamente (las reglas de Firestore lo
    // reservan a coach/owner), así que este cambio de estado tiene que
    // hacerse aquí, en la función que sí corre con privilegios de servidor.
    const assignData = assignSnap.data();
    const assignmentUpdate = { updatedAt: FieldValue.serverTimestamp() };
    if (result.status === 'submitted') {
      assignmentUpdate.status = 'completed';
    } else if (result.status === 'draft' && assignData.status !== 'completed' && assignData.status !== 'cancelled') {
      assignmentUpdate.status = 'in_progress';
    }
    t.update(assignmentRef, assignmentUpdate);

    const docData = {
      ...result,
      version: currentVersion + 1,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (!snap.exists) docData.createdAt = FieldValue.serverTimestamp();

    t.set(resultRef, docData);

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
