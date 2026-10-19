// This module is built on the CI runner, injected only into a one-use synthetic
// document intercepted by Playwright at the exact Staging origin. Never deploy.
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, getIdToken, setPersistence, signInWithCustomToken } from 'firebase/auth';

window.__seedStagingE2eAuth = async (firebaseConfig, customToken) => {
  if (location.origin !== 'https://ourschedule.web.app' ||
      location.pathname !== '/__ourschedule_staging_e2e_bootstrap__' ||
      firebaseConfig.projectId !== 'ourschedule' ||
      firebaseConfig.authDomain !== 'ourschedule.firebaseapp.com') {
    throw new Error('Refusing synthetic authentication outside the exact STAGING origin');
  }
  // Default app name matters: the deployed app reads the same IndexedDB persistence key.
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithCustomToken(auth, customToken);
  return { uid: credential.user.uid, idToken: await getIdToken(credential.user) };
};
