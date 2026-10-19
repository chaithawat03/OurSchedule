import assert from 'node:assert/strict';
import { STAGING_PROJECT, SYNTHETIC_UIDS } from './guard.mjs';

const CUSTOM_TOKEN_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const b64url = (value) => Buffer.from(value).toString('base64url');

export function customTokenUnsignedPayload(serviceAccount, uid, nowSeconds) {
  assert.ok(SYNTHETIC_UIDS.includes(uid), 'Refusing non-test identity');
  assert.ok(serviceAccount.endsWith('@' + STAGING_PROJECT + '.iam.gserviceaccount.com'));
  assert.ok(Number.isSafeInteger(nowSeconds) && nowSeconds > 0);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount, sub: serviceAccount, aud: CUSTOM_TOKEN_AUDIENCE,
    iat: nowSeconds, exp: nowSeconds + 1800, uid,
    claims: { synthetic_e2e: true },
  };
  return b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
}

async function strictJson(response, operation) {
  if (!response.ok) throw new Error(operation + ' failed (HTTP ' + response.status + ')');
  return response.json();
}

/**
 * The OAuth token is used only to call IAMCredentials signBlob.
 * Never use an IAM OAuth token for Firestore assertions: it bypasses Rules.
 */
export async function mintFirebaseCustomToken({ serviceAccount, oauthToken, uid, fetchImpl = fetch }) {
  const unsigned = customTokenUnsignedPayload(serviceAccount, uid, Math.floor(Date.now() / 1000));
  const url = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +
    encodeURIComponent(serviceAccount) + ':signBlob';
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + oauthToken, 'content-type': 'application/json' },
    body: JSON.stringify({ payload: Buffer.from(unsigned).toString('base64') }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await strictJson(response, 'IAM signBlob');
  assert.match(body.signedBlob ?? '', /^[A-Za-z0-9+/]+=*$/);
  return unsigned + '.' + Buffer.from(body.signedBlob, 'base64').toString('base64url');
}

export async function deleteSyntheticAuthUser(apiKey, idToken, fetchImpl = fetch) {
  const response = await fetchImpl(
    'https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + encodeURIComponent(apiKey),
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(15000) },
  );
  await strictJson(response, 'Firebase test identity self-delete');
}

export async function rulesGetDocument(idToken, segments, fetchImpl = fetch) {
  assert.ok(Array.isArray(segments) && segments.length >= 2);
  assert.ok(segments.every((part) => /^[a-zA-Z0-9_-]{1,128}$/.test(part)),
    'Unsafe Firestore path');
  const path = segments.map(encodeURIComponent).join('/');
  const response = await fetchImpl(
    'https://firestore.googleapis.com/v1/projects/' + STAGING_PROJECT +
    '/databases/(default)/documents/' + path,
    { headers: { authorization: 'Bearer ' + idToken }, signal: AbortSignal.timeout(15000) },
  );
  // Do not parse or log private document content.
  return response.status;
}
