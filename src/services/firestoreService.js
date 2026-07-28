import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../config/firebase';

const normalizeError = (error) => {
  return new Error(error.message || 'Error de base de datos. Inténtelo más tarde.');
};

export const firestoreService = {
  // === Lecturas ===
  getDocument: async (collectionName, docId) => {
    try {
      const docRef = doc(db, collectionName, docId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (error) {
      console.error(`Error en getDocument (${collectionName}):`, error);
      throw normalizeError(error);
    }
  },

  getDocumentsByQuery: async (collectionName, filters = []) => {
    try {
      // filters: [{ field, op, value }]
      let q = collection(db, collectionName);
      for (const f of filters) {
        q = query(q, where(f.field, f.op, f.value));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error(`Error en getDocumentsByQuery (${collectionName}):`, error);
      throw normalizeError(error);
    }
  },

  // === Escrituras (solo las permitidas directamente) ===
  setDocument: async (collectionName, docId, data, merge = true) => {
    try {
      const docRef = doc(db, collectionName, docId);
      await setDoc(docRef, data, { merge });
      return docId;
    } catch (error) {
      console.error(`Error en setDocument (${collectionName}):`, error);
      throw normalizeError(error);
    }
  },
  
  createDocument: async (collectionName, data) => {
    try {
      // Usa un ID autogenerado
      const docRef = doc(collection(db, collectionName));
      await setDoc(docRef, data);
      return docRef.id;
    } catch (error) {
      console.error(`Error en createDocument (${collectionName}):`, error);
      throw normalizeError(error);
    }
  },

  updateDocument: async (collectionName, docId, data) => {
    try {
      const docRef = doc(db, collectionName, docId);
      await updateDoc(docRef, data);
    } catch (error) {
      console.error(`Error en updateDocument (${collectionName}):`, error);
      throw normalizeError(error);
    }
  },

  deleteDocument: async (collectionName, docId) => {
    try {
      const docRef = doc(db, collectionName, docId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error(`Error en deleteDocument (${collectionName}):`, error);
      throw normalizeError(error);
    }
  },

  // Exponer db si excepcionalmente es necesario transaccionar en frontend (no recomendado)
  _db: db
};
