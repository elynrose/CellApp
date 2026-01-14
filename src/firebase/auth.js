// Firebase Authentication Service
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './config';

/**
 * Sign up new user with email and password
 */
export async function signUp(email, password, displayName) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create user profile in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: displayName || user.displayName,
      createdAt: new Date(),
      subscription: 'free',
      subscriptionStatus: 'active',
      role: 'user',
      isAdmin: false,
      credits: {
        current: 50, // Free tier gets 50 credits
        total: 50,
        lastReset: new Date(),
        nextReset: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      usage: {
        apiCalls: 0,
        storageUsed: 0,
        sheetsCreated: 0
      }
    });

    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Check if user exists in Firestore, if not create profile
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date(),
        subscription: 'free',
        subscriptionStatus: 'active',
        role: 'user',
        isAdmin: false,
        credits: {
          current: 50, // Free tier gets 50 credits
          total: 50,
          lastReset: new Date(),
          nextReset: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        },
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        usage: {
          apiCalls: 0,
          storageUsed: 0,
          sheetsCreated: 0
        }
      }, { merge: true });
    }

    return { success: true, user };
  } catch (error) {
    let errorMessage = error.message;
    if (error.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Sign-in was cancelled. Please try again.';
    } else if (error.code === 'auth/popup-blocked') {
      errorMessage = 'Popup was blocked by browser. Please allow popups and try again.';
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Check if current user is admin
 */
export async function isCurrentUserAdmin() {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.isAdmin === true || userData.role === 'admin';
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUserProfile() {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'No user logged in' };
    }

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      return { success: true, data: userDoc.data() };
    }
    return { success: false, error: 'User profile not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Make current user admin
 */
// IMPORTANT SECURITY NOTE:
// Do NOT provide any client-side mechanism to grant admin privileges.
// Admin should be granted only via trusted server-side tooling / Firebase Console / Cloud Functions.
//
// This function used to exist and allowed self-escalation by writing `role/isAdmin` on the user doc.
// It has been intentionally removed.

