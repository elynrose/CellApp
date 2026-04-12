// Firebase configuration — override via Vite env (see .env.example). Falls back to project defaults.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA63ET1bNMnxY3ZVmnaa8FCUuvkMOVls5k',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'cellulai.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'cellulai',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'cellulai.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '857760697765',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:857760697765:web:74605f6e0667d0feebec4c',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-NBGFZ6T90R'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export default app;
