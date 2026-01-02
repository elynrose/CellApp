// Firebase configuration and initialization for React app
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA63ET1bNMnxY3ZVmnaa8FCUuvkMOVls5k",
  authDomain: "cellulai.firebaseapp.com",
  projectId: "cellulai",
  storageBucket: "cellulai.firebasestorage.app",
  messagingSenderId: "857760697765",
  appId: "1:857760697765:web:74605f6e0667d0feebec4c",
  measurementId: "G-NBGFZ6T90R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export default app;


