import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInviteInput, validateStaging, pathOf, claimWrites,
  safeDeniedUpdate, safeDeniedCreate, joinedRoomsQuery,
} from '../../scripts/lib/m2-live-payloads.mjs';

const token = 'A'.repeat(43);
const uid = 'anonymous-test-uid';

describe('staging live test payloads (offline / no Firebase requests)', () => {
  it('accepts only staging invite fragments or strict 43-char tokens', () => {
    assert.equal(parseInviteInput(token), token);
    assert.equal(parseInviteInput('https://ourschedule.web.app/#invite=' + token), token);
    for (const bad of ['', 'short', 'https://evil.example/#invite=' + token,
      'https://ourschedule.web.app/?invite=' + token, token + 'x']) {
      assert.throws(() => parseInviteInput(bad));
    }
  });

  it('blocks other Firebase projects and App Check-enabled direct REST test', () => {
    const ok = {
      VITE_FIREBASE_PROJECT_ID: 'ourschedule',
      VITE_FIREBASE_APP_ID: '1:400176852634:web:test',
      VITE_FIREBASE_API_KEY: 'test',
      VITE_FIREBASE_AUTH_DOMAIN: 'ourschedule.firebaseapp.com',
    };
    assert.doesNotThrow(() => validateStaging(ok));
    assert.throws(() => validateStaging({ ...ok, VITE_FIREBASE_PROJECT_ID: 'ourschedule-prod' }));
    assert.throws(() => validateStaging({ ...ok, VITE_RECAPTCHA_V3_SITE_KEY: 'configured' }));
  });

  it('models an atomic invite update followed by a create-only Member, both with server timestamps', () => {
    const writes = claimWrites(token, 'testRoom', uid);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0].updateMask.fieldPaths, ['state', 'acceptedByUid']);
    assert.deepEqual(writes[0].updateTransforms, [{ fieldPath: 'acceptedAt', setToServerValue: 'REQUEST_TIME' }]);
    assert.deepEqual(writes[1].updateTransforms, [{ fieldPath: 'joinedAt', setToServerValue: 'REQUEST_TIME' }]);
    assert.equal(writes[1].currentDocument.exists, false);
    assert.equal(writes[1].update.fields.role.stringValue, 'member');
  });

  it('makes unauthorized writes impossible to mutate even if allowed by bad rules', () => {
    const name = pathOf('users', uid);
    assert.equal(safeDeniedUpdate(name, { displayName: { stringValue: 'test' } }).currentDocument.exists, false);
    assert.equal(safeDeniedCreate(pathOf('users', uid, 'personalEvents', 'probe'),
      { title: { stringValue: 'test' } }).currentDocument.exists, true);
    assert.throws(() => pathOf('users', '../escape'));
  });

  it('requires uid+member+active equality filters server-side', () => {
    const filters = joinedRoomsQuery(uid).structuredQuery.where.compositeFilter.filters;
    assert.deepEqual(filters.map((f) => f.fieldFilter.field.fieldPath),
      ['uid', 'role', 'membershipState']);
    assert.deepEqual(filters.map((f) => f.fieldFilter.value.stringValue),
      [uid, 'member', 'active']);
    assert.equal(joinedRoomsQuery(uid).structuredQuery.limit, 20);
  });
});
