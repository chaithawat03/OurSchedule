import assert from 'node:assert/strict';

export const PROJECT_ID = 'ourschedule';
export const DATABASE_ID = 'ourschedule-e2e';
export const OWNER_UID = 'e2e_staging_owner_v1';
export const MEMBER_UID = 'e2e_staging_member_v1';
export const MAX_CLEANUP_DOCS = 100;
export const ALLOWED_UIDS = Object.freeze([OWNER_UID, MEMBER_UID]);

export function validatePreviewUrl(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', 'Phase 2b requires HTTPS');
  assert.equal(url.username, '', 'No username in URL');
  assert.equal(url.password, '', 'No password in URL');
  assert.equal(url.port, '', 'No custom port');
  assert.equal(url.pathname, '/', 'Preview root only');
  assert.equal(url.search, '', 'No query in preview URL');
  assert.equal(url.hash, '', 'No hash in preview URL');
  assert.match(url.hostname, /^ourschedule--p2b-e2e-[a-z0-9-]+\.web\.app$/,
    'Phase 2b can only access the dedicated Hosting preview channel');
  return url.origin;
}

export function validatePhase2bEnvironment(env) {
  assert.equal(env.GITHUB_REPOSITORY, 'chaithawat03/OurSchedule');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.ok(['workflow_dispatch', 'schedule'].includes(env.GITHUB_EVENT_NAME));
  assert.equal(env.STAGING_E2E_PHASE2B_ENABLED, 'true');
  assert.equal(env.STAGING_E2E_PHASE2B_DELETE_APPROVED, 'true');
  assert.equal(env.STAGING_E2E_ENABLED, 'true', 'Phase 2a must remain enabled');
  assert.equal(env.STAGING_E2E_APPROVE_PERSISTENT_PROFILES, 'true');
  assert.equal(env.STAGING_E2E_SERVICE_ACCOUNT, 'e2e-runner@ourschedule.iam.gserviceaccount.com');
  assert.equal(env.STAGING_E2E_PHASE2B_CLEANUP_SERVICE_ACCOUNT,
    'e2e-cleanup@ourschedule.iam.gserviceaccount.com');
  assert.match(env.STAGING_E2E_APP_ID ?? '', /^1:400176852634:web:[a-zA-Z0-9]+$/);
  assert.match(env.STAGING_E2E_API_KEY ?? '', /^[a-zA-Z0-9_-]{15,128}$/);
  assert.ok((env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '').length > 50, 'Signing token missing');
  assert.ok((env.STAGING_E2E_PHASE2B_CLEANUP_TOKEN ?? '').length > 50, 'Scoped cleanup token missing');
  return Object.freeze({
    origin: validatePreviewUrl(env.STAGING_E2E_PHASE2B_PREVIEW_URL),
    apiKey: env.STAGING_E2E_API_KEY,
    appId: env.STAGING_E2E_APP_ID,
    signingServiceAccount: env.STAGING_E2E_SERVICE_ACCOUNT,
    signingToken: env.GOOGLE_OAUTH_ACCESS_TOKEN,
    cleanupToken: env.STAGING_E2E_PHASE2B_CLEANUP_TOKEN,
    projectId: PROJECT_ID,
    databaseId: DATABASE_ID,
    firebaseConfig: {
      apiKey: env.STAGING_E2E_API_KEY,
      appId: env.STAGING_E2E_APP_ID,
      projectId: PROJECT_ID,
      authDomain: 'ourschedule.firebaseapp.com',
    },
  });
}
