#!/usr/bin/env node
/**
 * Attended M3.2a LIVE two-UID security verification against Firebase STAGING.
 * OWNER (Google A) uses deployed browser UI; temporary Anonymous Firebase
 * Auth UID B runs through Firestore REST, therefore live Rules are enforced.
 *
 * Requires exactly one UNUSED Owner-issued room invitation URL/token in
 * INVITE_TOKEN_M3. Requires a room with REQUIRE_ACCEPTANCE assignment policy.
 * Do not share invitation URLs, tokens, API keys, names or Firebase IDs.
 *
 * This script DOES NOT deploy/toggle providers. Owner must enable Anonymous
 * only for this attended window and DISABLE it immediately afterwards.
 * It permanently consumes ONE room invite and THREE room activity quota slots.
 * Created invitation/inbox and soft-cancelled event documents remain on
 * STAGING for audit, even after anonymous B and Member are deleted.
 */
import { createInterface } from 'node:readline/promises';
import {
  DOC_API, DOC_ROOT, PROJECT, UID_PATTERN, parseInviteInput,
  validateStaging, pathOf, claimWrites, safeDeniedUpdate, safeDeniedCreate,
  joinedRoomsQuery,
} from './lib/m2-live-payloads.mjs';
import {
  LABEL_ACCEPT, LABEL_DECLINE, LABEL_REVOKE, inboxQuery,
  roomEventsListQuery, decideInvitation, parseInboxDocument, findNewAssignment,
} from './lib/m3-room-live-payloads.mjs';

const cfg = process.env;
validateStaging(cfg);
const inviteToken = parseInviteInput(cfg.INVITE_TOKEN_M3);
const onlyRevocation = cfg.M3_ONLY_REVOKE === '1';
if (cfg.M3_ONLY_REVOKE && !['0', '1'].includes(cfg.M3_ONLY_REVOKE))
  throw new Error('M3_ONLY_REVOKE must be 0, 1 or omitted');
const major = Number(process.versions.node.split('.')[0]);
if (major !== 24) throw new Error('Node 24 required');
if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw new Error('Attended interactive Cloud Shell is required; never run in CI');

const apiKey = cfg.VITE_FIREBASE_API_KEY;
const authApi = (name) =>
  'https://identitytoolkit.googleapis.com/v1/' + name + '?key=' + encodeURIComponent(apiKey);
const urlFor = (suffix) => DOC_API + '/' + suffix;
const commitUrl = DOC_API + ':commit';
const queryUrl = (parent) => {
  if (parent === DOC_ROOT) return DOC_API + ':runQuery';
  if (!parent.startsWith(DOC_ROOT + '/')) throw new Error('Invalid Firestore query parent');
  return DOC_API + '/' + parent.slice(DOC_ROOT.length + 1) + ':runQuery';
};

let uid = null;
let idToken = null;
let ownerUid = null;
let roomId = null;
let memberMayExist = false;
let testPassed = false;
let authCleaned = false;
let memberCleaned = true;
const rl = createInterface({ input: process.stdin, output: process.stdout });
let cancelledBySignal = false;
rl.on('SIGINT', () => {
  cancelledBySignal = true;
  console.error('\nInterrupted: attempting cleanup. Do not close Cloud Shell.');
  rl.close();
});
const pause = (message) => rl.question(message);
function fail(message) { throw new Error(message); }

async function request(url, method = 'GET', token = null, body = null) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== null) headers['Content-Type'] = 'application/json';
  return fetch(url, {
    method, headers,
    body: body === null ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
}
async function statusOf(resultPromise) {
  const response = await resultPromise;
  await response.body?.cancel();
  return response.status;
}
function expect(label, actual, status) {
  if (actual !== status) fail(label + ': expected HTTP ' + status +
    ', got HTTP ' + actual + ' (NOT VERIFIED)');
  console.log(label + ': PASS');
}
async function auth(name, body) {
  const res = await request(authApi(name), 'POST', null, body);
  if (!res.ok) {
    const status = res.status;
    await res.body?.cancel();
    fail('Auth ' + name + ' HTTP ' + status);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
const getDoc = (suffix) => request(urlFor(suffix), 'GET', idToken);
async function readDoc(suffix) {
  const response = await getDoc(suffix);
  if (!response.ok) {
    const code = response.status;
    await response.body?.cancel();
    fail('Expected document not readable: HTTP ' + code);
  }
  return response.json();
}
const commit = (writes) =>
  request(commitUrl, 'POST', idToken, { writes });
async function runQuery({ parent, body }) {
  if (parent !== DOC_ROOT && !parent.startsWith(DOC_ROOT + '/')) fail('Unexpected REST query parent');
  const response = await request(queryUrl(parent), 'POST', idToken, body);
  if (!response.ok) {
    const status = response.status;
    await response.body?.cancel();
    fail('Firestore query rejected HTTP ' + status);
  }
  const parts = await response.json();
  if (!Array.isArray(parts)) fail('Unexpected runQuery result');
  return parts.filter((part) => Boolean(part.document)).map((part) => part.document);
}
const codeOf = (writes) => statusOf(commit(writes));
async function inbox() {
  const documents = await runQuery(inboxQuery(uid));
  return documents.map((item) => parseInboxDocument(item, uid, roomId, ownerUid));
}
async function expectDocDenied(label, suffix) {
  expect(label, await statusOf(getDoc(suffix)), 403);
}
async function expectEventDenied(label, eventId) {
  await expectDocDenied(label, 'rooms/' + roomId + '/events/' + eventId);
}
async function leave() {
  return statusOf(request(urlFor('rooms/' + roomId + '/members/' + uid), 'DELETE', idToken));
}
async function createStage(label, count) {
  console.log('\nOWNER ACTION: open https://ourschedule.web.app > ห้องของฉัน > M3.2a');
  console.log('Select the TEST room with REQUIRE_ACCEPTANCE and Member prefix ' + uid.slice(0, 8) + '…');
  console.log('Create ONE PRIVATE assigned activity for this Member with EXACT title: ' + label);
  console.log('Choose valid start/end times within 24h; click ส่งกิจกรรม.');
  await pause('After the Owner sees the SweetAlert2 success toast, press Enter here: ');
  if (cancelledBySignal) fail('Operator interrupted');
  const assignments = await inbox();
  const item = findNewAssignment(assignments, label, count);
  console.log('Recipient scoped inbox: new PENDING invitation found');
  return item.eventId;
}

try {
  console.log('Firebase project: ' + PROJECT + ' STAGING ONLY. No Admin SDK and no Production.');
  console.log(onlyRevocation
    ? 'REVOKE-ONLY: 1 Owner invite, 1 temporary Anonymous UID, 1 PRIVATE assignment.'
    : 'Full run: 1 Owner invite, 1 temporary Anonymous UID, 3 PRIVATE assignments.');
  console.log('Owner must remain signed in with Google and open the room assignment UI.');
  console.log('The selected existing room MUST use REQUIRE_ACCEPTANCE; this tool will stop otherwise.');
  const confirm = await pause('Type LIVE M3.2A STAGING to create temporary Member B: ');
  if (confirm !== 'LIVE M3.2A STAGING') fail('Operator did not authorize live test');

  const a = await auth('accounts:signUp', { returnSecureToken: true });
  if (!UID_PATTERN.test(a.localId ?? '') || !a.idToken)
    fail('Temporary Firebase Auth user not established');
  uid = a.localId;
  idToken = a.idToken;
  const proof = await auth('accounts:lookup', { idToken });
  if (proof.users?.[0]?.localId !== uid) fail('Auth UID mismatch');

  const invite = await readDoc('roomInvites/' + inviteToken);
  const fields = invite.fields ?? {};
  roomId = fields.roomId?.stringValue;
  ownerUid = fields.createdByUid?.stringValue;
  pathOf('rooms', roomId);
  if (!UID_PATTERN.test(ownerUid ?? '') || ownerUid === uid ||
      fields.state?.stringValue !== 'pending' ||
      Date.parse(fields.expiresAt?.timestampValue ?? '') < Date.now() + 60000) {
    fail('Invite must be pending, unexpired, and issued by a distinct Owner');
  }
  console.log('Verified Owner-issued pending invitation. Temporary recipient prefix: ' +
    uid.slice(0, 8) + '…');

  await expectDocDenied('B denied Owner profile',
    'users/' + ownerUid);
  await expectDocDenied('B denied room before joining', 'rooms/' + roomId);
  expect('B denied room-wide activity listing',
    await statusOf(request(queryUrl(roomEventsListQuery(roomId).parent), 'POST', idToken,
      roomEventsListQuery(roomId).body)), 403);
  expect('B denied forged Owner room metadata write',
    await codeOf([safeDeniedUpdate(pathOf('rooms', roomId), {
      name: { stringValue: 'NEVER-WRITTEN' },
    })]), 403);

  memberMayExist = true; // Set before the join request so finally attempts safe cleanup after uncertainty.
  expect('B accepted single-use room invitation',
    await codeOf(claimWrites(inviteToken, roomId, uid)), 200);
  const room = await readDoc('rooms/' + roomId);
  if (room.fields?.assignmentPolicy?.stringValue !== 'REQUIRE_ACCEPTANCE') {
    fail('Room must use REQUIRE_ACCEPTANCE; no AUTO_ASSIGN test in this session');
  }
  expect('B can see own Member row',
    await statusOf(getDoc('rooms/' + roomId + '/members/' + uid)), 200);
  const before = await inbox();
  if (before.length !== 0) fail('Unexpected assignments on new anonymous UID');

  console.log('\nOne joined Member now exists in room. Refresh Owner UI member list.');
  if (!onlyRevocation) {
  const first = await createStage(LABEL_ACCEPT, 0);
  await expectEventDenied('PENDING B denied private event details', first);
  expect('B denied fake status+creator manipulation',
    await codeOf([safeDeniedUpdate(
      pathOf('users', uid, 'roomActivityInvites', first),
      { creatorUid: { stringValue: uid }, state: { stringValue: 'ACCEPTED' } },
    )]), 403);
  expect('B cannot create unrelated Owner invite',
    await codeOf([safeDeniedCreate(
      pathOf('users', ownerUid, 'roomActivityInvites', 'm3-test-' + crypto.randomUUID()),
      { state: { stringValue: 'ACCEPTED' } },
    )]), 403);
  expect('B accepts assignment with server timestamp',
    await codeOf(decideInvitation(uid, first, 'ACCEPTED')), 200);
  expect('Accepted Member B can read exactly assigned PRIVATE event',
    await statusOf(getDoc('rooms/' + roomId + '/events/' + first)), 200);
  expect('B cannot edit Creator event data',
    await codeOf([safeDeniedUpdate(pathOf('rooms', roomId, 'events', first), {
      title: { stringValue: 'NOT-WRITTEN' },
    })]), 403);
  expect('B cannot list PRIVATE event collection',
    await statusOf(request(queryUrl(roomEventsListQuery(roomId).parent), 'POST', idToken,
      roomEventsListQuery(roomId).body)), 403);

  console.log('\nOWNER ACTION: cancel ONLY the activity titled ' + LABEL_ACCEPT);
  await pause('After cancellation confirmation and SweetAlert2 toast, press Enter: ');
  await expectEventDenied('Cancelled PRIVATE event no longer readable to B', first);

  const second = await createStage(LABEL_DECLINE, 1);
  await expectEventDenied('Pending B denied second PRIVATE event', second);
  expect('B declines second assignment',
    await codeOf(decideInvitation(uid, second, 'DECLINED')), 200);
  await expectEventDenied('Declined PRIVATE event remains unreadable to B', second);
  expect('B cannot change declined decision to accepted',
    await codeOf(decideInvitation(uid, second, 'ACCEPTED')), 403);

  }
  const third = await createStage(LABEL_REVOKE, onlyRevocation ? 0 : 2);
  expect('B accepts third assignment',
    await codeOf(decideInvitation(uid, third, 'ACCEPTED')), 200);
  expect('B reads accepted third PRIVATE event',
    await statusOf(getDoc('rooms/' + roomId + '/events/' + third)), 200);

  console.log('\nOWNER ACTION: open จัดการสมาชิก (Owner) for the SAME room.');
  console.log('Remove ONLY temporary Member with prefix ' + uid.slice(0, 8) + '…');
  await pause('After Owner removes B and sees SweetAlert2 success, press Enter: ');
  await expectEventDenied('Removed B denied previously accepted PRIVATE event', third);
  await expectDocDenied('Removed B denied room metadata', 'rooms/' + roomId);
  const memberships = await runQuery({
    parent: DOC_ROOT,
    body: joinedRoomsQuery(uid),
  });
  if (memberships.length !== 0) fail('Removed Member still appears in joined-room discovery');
  console.log('Revoked B membership discovery: PASS');
  memberMayExist = false;

  // Historical teaser is allowed to remain in B inbox. Event contents
  // MUST remain denied; do not interpret archived inbox as active access.
  const history = await inbox();
  if (history.length !== (onlyRevocation ? 1 : 3)) fail('Unexpected history after Member removal');
  console.log('Scoped recipient decision history preserved: PASS');
  testPassed = true;
} catch (error) {
  console.error('M3.2A LIVE SECURITY: NOT VERIFIED — ' +
    (error instanceof Error ? error.message : 'Unexpected error'));
  process.exitCode = 1;
} finally {
  if (idToken && uid && roomId && memberMayExist) {
    try {
      const s = await leave();
      if (![200, 403, 404].includes(s)) memberCleaned = false;
      const after = await statusOf(getDoc('rooms/' + roomId));
      if (after !== 403) memberCleaned = false;
      console.log(memberCleaned ? 'Temporary Member cleanup: VERIFIED' :
        'WARNING: Member cleanup incomplete; Owner must remove B via UI');
    } catch {
      memberCleaned = false;
      console.error('WARNING: Could not verify Member cleanup; Owner must remove B manually');
    }
  }
  if (idToken) {
    try {
      await auth('accounts:delete', { idToken });
      authCleaned = true;
      console.log('Temporary Anonymous Auth user deleted.');
    } catch {
      console.error('WARNING: Anonymous Auth user deletion not confirmed. Inspect Firebase Auth Users.');
    }
  }
  rl.close();
  console.log('MANDATORY NOW: turn Anonymous Sign-in back to DISABLED in Firebase STAGING.');
  console.log(onlyRevocation
    ? 'OWNER CLEANUP: soft-cancel the M32A-REVOKE test activity.'
    : 'OWNER CLEANUP: soft-cancel remaining M32A-DECLINE and M32A-REVOKE test activities.');
  console.log('Accepted room invite, event docs and per-recipient inbox docs remain as Staging audit.');
  console.log('Never share bearer invite/token, full UID, API key or ID token in chat or GitHub.');
  if (testPassed && authCleaned && memberCleaned && !cancelledBySignal) {
    console.log(onlyRevocation
      ? 'M3.2A REVOKE-ONLY LIVE SECURITY ACCEPTANCE: PASS'
      : 'M3.2A LIVE SECURITY ACCEPTANCE: PASS');
  } else {
    process.exitCode = 1;
    console.error(onlyRevocation
      ? 'M3.2A REVOKE-ONLY LIVE SECURITY ACCEPTANCE: INCOMPLETE'
      : 'M3.2A LIVE SECURITY ACCEPTANCE: INCOMPLETE');
  }
}
