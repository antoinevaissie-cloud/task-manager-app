// ===============================================
// FIREBASE CONFIGURATION FOR REACT APP
// ===============================================

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your Firebase project configuration
// These values are safe to include in client-side code
const firebaseConfig = {
  apiKey: "AIzaSyCfzOqFSpDlIEXnVuUaf1Y7SQMdcf1LPRU",
  authDomain: "task-manager-av-2025.firebaseapp.com",
  projectId: "task-manager-av-2025",
  storageBucket: "task-manager-av-2025.firebasestorage.app",
  messagingSenderId: "415161203267",
  appId: "1:415161203267:web:5d94877bbcb8318ab232f6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configure Google Auth provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Auth helper functions
export const signInWithGoogle = async () => {
  try {
    const { signInWithPopup } = await import('firebase/auth');
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export default app;
