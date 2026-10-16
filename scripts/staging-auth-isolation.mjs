#!/usr/bin/env node
/**
 * Staging-only, read-only Firestore Rules integration check.
 *
 * Requires the Firebase Console Anonymous Auth provider TEMPORARILY enabled
 * in staging only. Uses a freshly created Firebase anonymous ID token
 * (NEVER a gcloud/service-account OAuth token that bypasses Rules).
 *
 * Invocation:
 *   cd ~/OurSchedule
 *   read -r -p "Existing Google user's Firestore document UID: " OWNER_UID
 *   export OWNER_UID
 *   node --env-file=.env.local scripts/staging-auth-isolation.mjs
 *   unset OWNER_UID
 *
 * NEVER prints Auth tokens, API keys, UID values, email or document payloads.
 * No Firestore writes. Deletes the temporary anonymous Auth user in finally.
 */
const project = process.env.VITE_FIREBASE_PROJECT_ID;
const appId = process.env.VITE_FIREBASE_APP_ID;
const apiKey = process.env.VITE_FIREBASE_API_KEY;
const ownerUid = process.env.OWNER_UID;

function stop(message) {
  throw new Error(message);
}
if (project !== 'ourschedule' || !appId?.startsWith('1:400176852634:web:')) {
  stop('Not the approved Firebase staging Web App: aborting without network access');
}
if (!apiKey || !ownerUid || !/^[a-zA-Z0-9_-]{6,128}$/.test(ownerUid)) {
  stop('Expected Firebase Web API key and OWNER_UID (from the staging users collection)');
}
if (!process.versions.node.startsWith('24.')) {
  stop('Node.js 24 is required');
}

const authBase = 'https://identitytoolkit.googleapis.com/v1/';
const firestoreBase =
  'https://firestore.googleapis.com/v1/projects/ourschedule/databases/(default)/documents';
const authUrl = (action) => authBase + action + '?key=' + encodeURIComponent(apiKey);

async function postAuth(action, data) {
  const response = await fetch(authUrl(action), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Do not echo body: it could contain sensitive account information.
    stop('Firebase Authentication request ' + action + ' returned HTTP ' + response.status);
  }
  return response.json();
}

async function readStatus(path, idToken) {
  const response = await fetch(firestoreBase + '/' + path, {
    method: 'GET',
    headers: idToken ? { Authorization: 'Bearer ' + idToken } : {},
    signal: AbortSignal.timeout(20000),
  });
  // Never print response body: the document might contain personal data.
  await response.body?.cancel();
  return response.status;
}

function expectStatus(label, actual, expected) {
  if (actual !== expected) {
    stop(label + ' FAIL: expected HTTP ' + expected + ', got ' + actual);
  }
  console.log(label + ': PASS (HTTP ' + actual + ')');
}

let temporaryIdToken = null;
let temporaryUid = null;
let failure = null;
let cleanupOk = false;

try {
  console.log('Checking live Firestore rules against staging; no document writes.');
  const anonymous = await postAuth('accounts:signUp', { returnSecureToken: true });
  if (!anonymous.idToken || !anonymous.localId || anonymous.localId === ownerUid) {
    stop('Anonymous test account was not created with a separate UID');
  }
  temporaryIdToken = anonymous.idToken;
  temporaryUid = anonymous.localId;

  // Confirm this is a valid Firebase-authenticated principal, not only
  // an invalid bearer token giving meaningless "permission denied".
  const lookup = await postAuth('accounts:lookup', { idToken: temporaryIdToken });
  if (lookup.users?.[0]?.localId !== temporaryUid) {
    stop('Temporary test user could not be authenticated');
  }

  // The temporary anonymous profile is NOT created by this test. Because
  // /users/{uid} allows authenticated own-get, a missing document must be 404.
  expectStatus('B read own nonexistent profile', await readStatus(
    'users/' + encodeURIComponent(temporaryUid), temporaryIdToken,
  ), 404);

  expectStatus('B read A Google profile', await readStatus(
    'users/' + encodeURIComponent(ownerUid), temporaryIdToken,
  ), 403);

  expectStatus('Unsigned client read A profile', await readStatus(
    'users/' + encodeURIComponent(ownerUid), null,
  ), 403);

  expectStatus('B list all profiles', await readStatus(
    'users?pageSize=1', temporaryIdToken,
  ), 403);

  expectStatus('B read A private event', await readStatus(
    'users/' + encodeURIComponent(ownerUid) + '/personalEvents/test-forbidden', temporaryIdToken,
  ), 403);

  // List without ownerUid equality filter is forbidden even when M2.1 Rules
  // are eventually staged; currently M1 denies all /rooms access.
  expectStatus('B list global rooms', await readStatus(
    'rooms?pageSize=1', temporaryIdToken,
  ), 403);

  console.log('PASS: staging live cross-UID READ isolation checks completed.');
} catch (error) {
  failure = error instanceof Error ? error.message : 'Unknown security test error';
} finally {
  if (temporaryIdToken) {
    try {
      await postAuth('accounts:delete', { idToken: temporaryIdToken });
      cleanupOk = true;
      console.log('Temporary anonymous Firebase Auth account deleted.');
    } catch {
      console.error('CLEANUP FAILED: delete the temporary anonymous user in Firebase Console > Authentication > Users.');
    }
  }
}

if (failure || !cleanupOk) {
  console.error(failure ? 'LIVE ISOLATION TEST FAILED: ' + failure : 'LIVE TEST FAILED: cleanup not confirmed.');
  process.exitCode = 1;
} else {
  console.log('IMPORTANT: Disable Anonymous provider again in the STAGING Firebase Console.');
}
