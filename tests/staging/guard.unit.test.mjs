import test from 'node:test';
import assert from 'node:assert/strict';
import { customTokenUnsignedPayload } from '../../scripts/staging-e2e/identity.mjs';
import { SYNTHETIC_UIDS, validateStagingEnv } from '../../scripts/staging-e2e/guard.mjs';

const valid = Object.freeze({
  STAGING_E2E_ENABLED: 'true',
  STAGING_E2E_APPROVE_PERSISTENT_PROFILES: 'true',
  GITHUB_REPOSITORY: 'chaithawat03/OurSchedule',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  STAGING_E2E_API_KEY: 'fakeKeyWithoutRealProject987654321',
  STAGING_E2E_APP_ID: '1:400176852634:web:abcdef12345678',
  STAGING_E2E_SERVICE_ACCOUNT: 'e2e-runner@ourschedule.iam.gserviceaccount.com',
  GOOGLE_OAUTH_ACCESS_TOKEN: 'x'.repeat(100),
});
test('exact staging allowlist accepts complete opt-in', () => {
  assert.equal(validateStagingEnv(valid).firebaseConfig.projectId, 'ourschedule');
});
for (const [field, value] of [
  ['STAGING_E2E_ENABLED', 'false'],
  ['STAGING_E2E_APPROVE_PERSISTENT_PROFILES', 'false'],
  ['GITHUB_REPOSITORY', 'attacker/OurSchedule'],
  ['GITHUB_REF', 'refs/pull/123/merge'],
  ['GITHUB_EVENT_NAME', 'pull_request'],
  ['STAGING_E2E_SERVICE_ACCOUNT', 'x@production.iam.gserviceaccount.com'],
  ['GOOGLE_OAUTH_ACCESS_TOKEN', ''],
]) {
  test('fail closed for ' + field, () => {
    assert.throws(() => validateStagingEnv({ ...valid, [field]: value }));
  });
}
test('custom tokens are synthetic-only and carry a bounded lifetime', () => {
  const encoded = customTokenUnsignedPayload(valid.STAGING_E2E_SERVICE_ACCOUNT,
    SYNTHETIC_UIDS[0], 1790000000);
  const payload = JSON.parse(Buffer.from(encoded.split('.')[1], 'base64url').toString());
  assert.equal(payload.uid, SYNTHETIC_UIDS[0]);
  assert.equal(payload.claims.synthetic_e2e, true);
  assert.equal(payload.exp - payload.iat, 1800);
  assert.throws(() => customTokenUnsignedPayload(valid.STAGING_E2E_SERVICE_ACCOUNT,
    'real-user-uid', 1790000000));
});
