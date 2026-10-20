// Runner-injected, never deployed; only the dedicated Phase 2b preview origin.
// No Firebase Admin, no test bridge, and no credentials checked into git.
import { initializeApp } from 'firebase/app';
import {
  getAuth, getIdToken, browserLocalPersistence, setPersistence, signInWithCustomToken,
} from 'firebase/auth';

window.__seedPhase2bAuth = async (config, token) => {
  if (!/^ourschedule--p2b-e2e-[a-z0-9-]+\.web\.app$/.test(location.hostname) ||
      location.protocol !== 'https:' ||
      location.pathname !== '/__phase2b_auth_bootstrap__' ||
      config.projectId !== 'ourschedule' ||
      config.authDomain !== 'ourschedule.firebaseapp.com' ||
      !config.appId.startsWith('1:400176852634:web:')) {
    throw new Error('Refusing Phase 2b bootstrap outside isolated preview');
  }
  const auth = getAuth(initializeApp(config));
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithCustomToken(auth, token);
  return { uid: credential.user.uid, idToken: await getIdToken(credential.user) };
};
