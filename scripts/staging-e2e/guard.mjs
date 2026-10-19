import assert from 'node:assert/strict';

export const STAGING_ORIGIN = 'https://ourschedule.web.app';
export const STAGING_PROJECT = 'ourschedule';
export const SYNTHETIC_UIDS = Object.freeze(['e2e_staging_owner_v1', 'e2e_staging_member_v1']);

/**
 * Fail closed before OIDC, browser network calls, or Firebase writes.
 * Staging is the ONLY live project; never infer a project from user input.
 */
export function validateStagingEnv(env) {
  assert.equal(env.STAGING_E2E_ENABLED, 'true', 'Staging E2E requires explicit opt-in');
  assert.equal(env.STAGING_E2E_APPROVE_PERSISTENT_PROFILES, 'true',
    'Profile docs cannot be hard-deleted under current Rules; review residual docs first');
  assert.equal(env.GITHUB_REPOSITORY, 'chaithawat03/OurSchedule',
    'Staging E2E is restricted to the canonical repository');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Staging E2E runs from main only');
  assert.ok(['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME),
    'Staging E2E must not run on pull_request or untrusted events');
  assert.match(env.STAGING_E2E_API_KEY ?? '', /^[A-Za-z0-9_-]{15,128}$/,
    'Missing or invalid public Firebase Web API key');
  assert.match(env.STAGING_E2E_APP_ID ?? '', /^1:400176852634:web:[a-zA-Z0-9]+$/,
    'Missing or invalid Staging Firebase Web App ID');
  assert.match(env.STAGING_E2E_SERVICE_ACCOUNT ?? '',
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]+\.iam\.gserviceaccount\.com$/,
    'Invalid dedicated Google Cloud service account');
  assert.ok((env.STAGING_E2E_SERVICE_ACCOUNT ?? '').endsWith('@ourschedule.iam.gserviceaccount.com'),
    'Signing service account must belong to STAGING project');
  assert.ok(env.GOOGLE_OAUTH_ACCESS_TOKEN?.length > 50, 'Missing short-lived WIF access token');
  return {
    apiKey: env.STAGING_E2E_API_KEY,
    appId: env.STAGING_E2E_APP_ID,
    serviceAccount: env.STAGING_E2E_SERVICE_ACCOUNT,
    firebaseConfig: {
      apiKey: env.STAGING_E2E_API_KEY,
      appId: env.STAGING_E2E_APP_ID,
      authDomain: 'ourschedule.firebaseapp.com',
      projectId: STAGING_PROJECT,
    },
  };
}
