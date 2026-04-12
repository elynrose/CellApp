// Firebase web app — override any field with VITE_FIREBASE_* (see .env.example).
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/** Default project: cellapp-prod-a3f9 (from Firebase Console / apps:sdkconfig WEB). */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAvht3bQYdZafX5_Rc4hmEHQHW-WNGaw4Q',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'cellapp-prod-a3f9.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'cellapp-prod-a3f9',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'cellapp-prod-a3f9.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '384242874610',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:384242874610:web:ba18a8869410c95453786b',
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {})
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export default app;
