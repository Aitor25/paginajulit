import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

const googleProvider = new GoogleAuthProvider();

const initializeUserProfile = async (user, fullName = '') => {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const newUserDoc = {
      uid: user.uid,
      email: user.email,
      fullName: fullName || user.displayName || '',
      role: 'client',
      organizationId: null,
      clientId: null,
      status: 'pending_assignment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(userRef, newUserDoc);
  }
};

export const authService = {
  login: (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  },
  
  loginWithGoogle: async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    await initializeUserProfile(cred.user);
    return cred;
  },
  
  register: async (email, password, fullName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await initializeUserProfile(cred.user, fullName);
    return cred;
  },
  
  logout: () => {
    return signOut(auth);
  },
  
  resetPassword: (email) => {
    return sendPasswordResetEmail(auth, email);
  },
  
  onAuthStateChanged: (callback) => {
    return onAuthStateChanged(auth, callback);
  },
  
  getCurrentUser: () => {
    return auth.currentUser;
  }
};
