const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ============================================================================
// SCRIPT DE INICIALIZACIÓN DE PRODUCCIÓN (OWNER Y ORGANIZACIÓN)
// ============================================================================
// Este script crea la organización principal y asigna el rol de 'owner'
// al correo especificado. Debe ejecutarse una sola vez al configurar
// un nuevo entorno de producción.
//
// USO:
// 1. Descarga tu archivo de credenciales de Firebase (serviceAccountKey.json)
// 2. Colócalo en la carpeta scripts/
// 3. Ejecuta: node scripts/initOwner.js
// ============================================================================

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const OWNER_EMAIL = 'agarciah10@gmail.com';
const ORG_NAME = 'Julit';

async function init() {
  console.log('🚀 Iniciando configuración del entorno de producción...');

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`\n❌ ERROR: No se encontró el archivo de credenciales.`);
    console.error(`Por favor, descarga tu clave privada desde Firebase Console (Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada).`);
    console.error(`Guárdala en: ${SERVICE_ACCOUNT_PATH}\n`);
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  try {
    // 1. Obtener UID del usuario usando Firebase Auth
    console.log(`\n🔍 Buscando usuario con correo: ${OWNER_EMAIL}...`);
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(OWNER_EMAIL);
      console.log(`✅ Usuario encontrado. UID: ${userRecord.uid}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.error(`\n❌ ERROR: El usuario no existe en Firebase Auth.`);
        console.error(`Por favor, regístrate primero en la aplicación web con el correo ${OWNER_EMAIL} para crear la cuenta de Authentication.`);
        process.exit(1);
      } else {
        throw error;
      }
    }

    const uid = userRecord.uid;

    // 2. Crear o recuperar la Organización
    console.log(`\n🏢 Configurando organización '${ORG_NAME}'...`);
    const orgsRef = db.collection('organizations');
    const snapshot = await orgsRef.where('name', '==', ORG_NAME).get();
    
    let orgId;
    if (snapshot.empty) {
      console.log(`Creando nueva organización '${ORG_NAME}'...`);
      const newOrg = await orgsRef.add({
        name: ORG_NAME,
        createdAt: new Date().toISOString()
      });
      orgId = newOrg.id;
      console.log(`✅ Organización creada con ID: ${orgId}`);
    } else {
      orgId = snapshot.docs[0].id;
      console.log(`✅ Organización ya existente encontrada. ID: ${orgId}`);
    }

    // 3. Actualizar el perfil del usuario en Firestore
    console.log(`\n👑 Asignando rol 'owner' al usuario...`);
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`Creando documento de perfil para el usuario...`);
      await userRef.set({
        uid: uid,
        email: OWNER_EMAIL,
        fullName: userRecord.displayName || 'Aitor Garcia',
        role: 'owner',
        organizationId: orgId,
        clientId: null,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else {
      console.log(`Actualizando perfil existente...`);
      await userRef.update({
        role: 'owner',
        organizationId: orgId,
        status: 'active',
        updatedAt: new Date().toISOString()
      });
    }

    console.log(`\n🎉 ¡Configuración completada con éxito!`);
    console.log(`El usuario ${OWNER_EMAIL} es ahora el Owner de la plataforma.`);
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error inesperado durante la inicialización:', error);
    process.exit(1);
  }
}

init();
