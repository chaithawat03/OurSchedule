import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { customTokenUnsignedPayload, mintFirebaseCustomToken,
  rulesGetDocument } from '../../scripts/staging-e2e/identity.mjs';

test('runner-only Firebase Auth bootstrap is bundled without external chunks', async () => {
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: 'error',
    build: {
      write: false, sourcemap: false, minify: true,
      rollupOptions: {
        input: 'tests/staging/auth-bootstrap.js',
        output: { inlineDynamicImports: true, format: 'es' },
      },
    },
  });
  const entries = result.output.filter((item) => item.type === 'chunk' && item.isEntry);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].imports.length, 0);
  assert.ok(entries[0].code.includes('__seedStagingE2eAuth'));
  assert.ok(!entries[0].code.includes('demo-ourschedule-e2e'));
});

test('IAM signs a canonical short-lived RS256 synthetic UID only', async () => {
  const sa = 'e2e-runner@ourschedule.iam.gserviceaccount.com';
  let calls = 0;
  const token = await mintFirebaseCustomToken({
    serviceAccount: sa, oauthToken: 'synthetic-oauth-token',
    uid: 'e2e_staging_owner_v1',
    fetchImpl: async (url, init) => {
      calls++;
      assert.ok(url.startsWith('https://iamcredentials.googleapis.com/'));
      assert.equal(init.headers.authorization, 'Bearer synthetic-oauth-token');
      const signed = Buffer.from(JSON.stringify(init.body ? JSON.parse(init.body) : null));
      assert.ok(signed.length > 0);
      const unsigned = Buffer.from(JSON.parse(init.body).payload, 'base64').toString();
      assert.ok(unsigned.includes('.'));
      return { ok: true, json: async () => ({
        signedBlob: Buffer.from('mock-signature').toString('base64'),
      }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(token.split('.').length, 3);
  assert.equal(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).uid,
    'e2e_staging_owner_v1');
  assert.throws(() => customTokenUnsignedPayload(sa, 'external-human-uid', 1800000000));
});

test('Firestore REST request uses the caller Firebase ID token and not privileged IAM', async () => {
  const status = await rulesGetDocument('synthetic-firebase-id-token',
    ['users', 'e2e_staging_member_v1'],
    async (url, init) => {
      assert.ok(url.startsWith('https://firestore.googleapis.com/v1/projects/ourschedule/'));
      assert.ok(url.endsWith('/users/e2e_staging_member_v1'));
      assert.equal(init.headers.authorization, 'Bearer synthetic-firebase-id-token');
      return { status: 403 };
    });
  assert.equal(status, 403);
  await assert.rejects(rulesGetDocument('token', ['users', '../victim'],
    async () => ({ status: 200 })));
});
