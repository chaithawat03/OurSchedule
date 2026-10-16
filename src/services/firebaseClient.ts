import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(config).every(
  (value) => typeof value === 'string' && value.trim().length > 0,
);

// CI/tests build without credentials and never connect to a live Firebase project.
const app = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(config))
  : null;

export const firebaseClient = app ? {
  auth: getAuth(app),
  db: getFirestore(app),
} : null;
