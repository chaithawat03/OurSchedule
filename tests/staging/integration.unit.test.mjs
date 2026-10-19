import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { customTokenUnsignedPayload, deleteSyntheticAuthUser, mintFirebaseCustomToken,
  reconcileSyntheticAuthUser, rulesGetDocument, verifySyntheticIdTokenUid } from '../../scripts/staging-e2e/identity.mjs';

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


test('reconciliation recovers a synthetic account without an existing browser session', async () => {
  const calls = [];
  const uid = 'e2e_staging_member_v1';
  await reconcileSyntheticAuthUser({
    uid,
    apiKey: 'synthetic-web-api-key',
    serviceAccount: 'e2e-runner@ourschedule.iam.gserviceaccount.com',
    oauthToken: 'synthetic-short-lived-oauth',
    fetchImpl: async (url, init) => {
      const operation = url.includes(':signBlob') ? 'sign' :
        url.includes('signInWithCustomToken') ? 'signin' :
        url.includes('accounts:lookup') ? 'lookup' :
        url.includes('accounts:delete') ? 'delete' : 'unexpected';
      calls.push(operation);
      if (operation === 'sign') {
        assert.equal(init.headers.authorization, 'Bearer synthetic-short-lived-oauth');
        return { ok: true, json: async () => ({
          signedBlob: Buffer.from('signature').toString('base64'),
        }) };
      }
      if (operation === 'signin') {
        const body = JSON.parse(init.body);
        assert.equal(body.returnSecureToken, true);
        assert.equal(JSON.parse(Buffer.from(body.token.split('.')[1], 'base64url').toString()).uid, uid);
        // The v1 custom-token response has NO localId (this was the production bug).
        return { ok: true, json: async () => ({ idToken: 'x'.repeat(75) }) };
      }
      if (operation === 'lookup') {
        assert.equal(JSON.parse(init.body).idToken, 'x'.repeat(75));
        return { ok: true, json: async () => ({ users: [{ localId: uid }] }) };
      }
      if (operation === 'delete') {
        assert.equal(JSON.parse(init.body).idToken, 'x'.repeat(75));
        // Identity Toolkit may respond HTTP 200 with NO JSON body at all.
        return { ok: true, status: 200, json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        } };
      }
      throw new Error('Unexpected mock endpoint');
    },
  });
  assert.deepEqual(calls, ['sign', 'signin', 'lookup', 'delete']);
});

test('cleanup refuses a mismatched UID and never calls delete', async () => {
  const operations = [];
  await assert.rejects(reconcileSyntheticAuthUser({
    uid: 'e2e_staging_owner_v1',
    apiKey: 'synthetic-web-api-key',
    serviceAccount: 'e2e-runner@ourschedule.iam.gserviceaccount.com',
    oauthToken: 'synthetic-short-lived-oauth',
    fetchImpl: async (url) => {
      if (url.includes(':signBlob')) {
        operations.push('sign');
        return { ok: true, json: async () => ({
          signedBlob: Buffer.from('signature').toString('base64'),
        }) };
      }
      if (url.includes('signInWithCustomToken')) {
        operations.push('signin');
        return { ok: true, json: async () => ({ idToken: 'x'.repeat(75) }) };
      }
      if (url.includes('accounts:lookup')) {
        operations.push('lookup');
        return { ok: true, json: async () => ({
          users: [{ localId: 'some-unrelated-person' }],
        }) };
      }
      operations.push('delete');
      return { ok: true, json: async () => ({}) };
    },
  }), /mismatched Firebase UID/);
  assert.deepEqual(operations, ['sign', 'signin', 'lookup']);
});

test('cleanup denies unknown user without making any HTTP call', async () => {
  let calls = 0;
  await assert.rejects(reconcileSyntheticAuthUser({
    uid: 'a-real-customer',
    apiKey: 'key',
    serviceAccount: 'e2e-runner@ourschedule.iam.gserviceaccount.com',
    oauthToken: 'mock',
    fetchImpl: async () => { calls++; throw new Error('must not call'); },
  }));
  assert.equal(calls, 0);
});


test('Auth deletion HTTP 200 without a response body is successful', async () => {
  let called = false;
  await deleteSyntheticAuthUser('synthetic-web-api-key', 'temporary-test-id-token',
    async (url, request) => {
      called = true;
      assert.ok(url.includes('accounts:delete'));
      assert.equal(JSON.parse(request.body).idToken, 'temporary-test-id-token');
      return {
        ok: true,
        status: 200,
        json: () => { throw new Error('Must not attempt JSON parse on delete success'); },
      };
    });
  assert.equal(called, true);
});

test('Auth deletion reports sanitized HTTP status when server refuses deletion', async () => {
  await assert.rejects(deleteSyntheticAuthUser('synthetic-web-api-key', 'temporary-test-id-token',
    async () => ({
      ok: false, status: 403,
      json: () => { throw new Error('Must not parse potentially sensitive response body'); },
    })), /Firebase test identity self-delete failed \(HTTP 403\)/);
});


test('lookup refuses zero or multiple users before destructive cleanup', async () => {
  for (const users of [[], [{ localId: 'e2e_staging_owner_v1' }, { localId: 'e2e_staging_member_v1' }]]) {
    await assert.rejects(verifySyntheticIdTokenUid({
      uid: 'e2e_staging_owner_v1',
      apiKey: 'synthetic-web-api-key',
      idToken: 'x'.repeat(75),
      fetchImpl: async (url, request) => {
        assert.ok(url.includes('accounts:lookup'));
        assert.equal(JSON.parse(request.body).idToken, 'x'.repeat(75));
        return { ok: true, json: async () => ({ users }) };
      },
    }), /exactly one verified Firebase user/);
  }
});

test('lookup refusal on HTTP 403 does not proceed to account deletion', async () => {
  const requests = [];
  await assert.rejects(reconcileSyntheticAuthUser({
    uid: 'e2e_staging_owner_v1', apiKey: 'synthetic-key',
    serviceAccount: 'e2e-runner@ourschedule.iam.gserviceaccount.com',
    oauthToken: 'synthetic-oauth',
    fetchImpl: async (url) => {
      const stage = url.includes('signBlob') ? 'sign' :
        url.includes('signInWithCustomToken') ? 'signin' :
        url.includes('accounts:lookup') ? 'lookup' : 'delete';
      requests.push(stage);
      if (stage === 'sign') return { ok: true, json: async () => ({
        signedBlob: Buffer.from('signature').toString('base64'),
      }) };
      if (stage === 'signin') return { ok: true, json: async () => ({
        idToken: 'x'.repeat(75),
      }) };
      if (stage === 'lookup') return { ok: false, status: 403 };
      throw new Error('Delete should not be called');
    },
  }), /Firebase synthetic UID lookup failed \(HTTP 403\)/);
  assert.deepEqual(requests, ['sign', 'signin', 'lookup']);
});
