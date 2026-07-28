import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../config/firebase';

export const authService = {
  login: (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  },
  
  register: (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
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
