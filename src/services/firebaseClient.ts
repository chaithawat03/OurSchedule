import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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

// Optional staged rollout: register the Web App and reCAPTCHA key in
// Firebase Console first. No enforcement is enabled by client code alone.
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
if (app && typeof appCheckSiteKey === 'string' && appCheckSiteKey.trim().length > 0) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

// The emulator test mode is allowed ONLY on Vite's dev server with an
// isolated demo Firebase project. A production build must never use it.
const emulatorRequested = import.meta.env.VITE_E2E_EMULATORS === '1';
const emulatorAllowed = import.meta.env.DEV
  && config.projectId === 'demo-ourschedule-e2e'
  && config.authDomain === 'demo-ourschedule-e2e.firebaseapp.com'
  && config.apiKey === 'fake-demo-e2e-only';
if (emulatorRequested && !emulatorAllowed) {
  throw new Error('Refusing E2E emulator mode outside the isolated local demo project');
}
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
if (emulatorRequested && auth && db) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
export const firebaseClient = auth && db ? { auth, db } : null;
