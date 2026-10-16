import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

export const firebaseClient = app ? {
  auth: getAuth(app),
  db: getFirestore(app),
} : null;
