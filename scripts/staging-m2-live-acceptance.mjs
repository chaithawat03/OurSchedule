#!/usr/bin/env node
/**
 * M2 live STAGING-only authorization test, TWO fresh single-use invitations.
 * No admin OAuth/service account is used: every Firestore request has an
 * ephemeral Firebase Anonymous Auth ID token and is enforced by live Rules.
 *
 * Requires INVITE_TOKEN_REMOVE and INVITE_TOKEN_LEAVE (secret local env only);
 * each may be a full staging URL fragment or the raw 43-character token.
 * Never paste a token, API key, full UID or ID token into chat/GitHub logs.
 *
 * The script verifies denied writes with deliberately impossible Firestore
 * preconditions, so failed access controls cannot modify A's existing data.
 * The only intended persistent data changes are TWO legitimate invite
 * acceptances, their immutable accepted audit records, and temporary Member
 * records which are removed by owner/self-leave.
 *
 * IMPORTANT: Anonymous Provider must be enabled only for an attended test,
 * then disabled manually immediately after. This script cannot toggle it.
 */
import { createInterface } from 'node:readline/promises';
import {
  APP_PREFIX, DOC_API, DOC_ROOT, PROJECT, UID_PATTERN, parseInviteInput,
  validateStaging, pathOf, claimWrites, safeDeniedCreate, safeDeniedUpdate,
  joinedRoomsQuery,
} from './lib/m2-live-payloads.mjs';

const env = process.env;
validateStaging(env);
const tokenRemove = parseInviteInput(env.INVITE_TOKEN_REMOVE);
const tokenLeave = parseInviteInput(env.INVITE_TOKEN_LEAVE);
if (tokenRemove === tokenLeave) throw new Error('Two DIFFERENT fresh invites are required');
const apiKey = env.VITE_FIREBASE_API_KEY;
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node.js 24');
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error('Interactive terminal is required (never run this in CI)');
}

const projectUrl = 'https://identitytoolkit.googleapis.com/v1/';
const apiAuthUrl = (operation) =>
  projectUrl + operation + '?key=' + encodeURIComponent(apiKey);
const documentUrl = (path) => DOC_API + '/' + path;
const commitUrl = DOC_API + ':commit';
const queryUrl = DOC_API + ':runQuery';
const MAX_STEPS = 20;

function errorMessage(e) {
  // Deliberately do not expose server response bodies, tokens or document IDs.
  return e instanceof Error ? e.message : 'Unexpected staging test error';
}

async function request(url, method = 'GET', token = null, body = null) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== null) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
    redirect: 'error',
  });
  return response;
}

async function auth(operation, body) {
  const response = await request(apiAuthUrl(operation), 'POST', null, body);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Firebase Auth ' + operation + ' HTTP ' + response.status);
  }
  return response.json();
}
async function docGet(path, token) {
  return request(documentUrl(path), 'GET', token);
}
async function readDocument(path, token) {
  const response = await docGet(path, token);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Required document could not be read: HTTP ' + response.status);
  }
  return response.json();
}
async function statusOf(promise) {
  const response = await promise;
  await response.body?.cancel();
  return response.status;
}
function expectStatus(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(label + ' not verified: expected HTTP ' + expected + ', got HTTP ' + actual);
  }
  console.log(label + ': PASS');
}
async function commit(writes, token) {
  return request(commitUrl, 'POST', token, { writes });
}
async function commitStatus(writes, token) {
  return statusOf(commit(writes, token));
}
async function queryMemberships(uid, token) {
  const response = await request(queryUrl, 'POST', token, joinedRoomsQuery(uid));
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Membership collection-group query not authorized: HTTP ' + response.status);
  }
  const result = await response.json();
  if (!Array.isArray(result)) throw new Error('Unexpected Firestore runQuery result type');
  return result.filter((part) => !!part.document)
    .map((part) => part.document.name);
}

function requireMatch(label, actual, expected) {
  if (actual !== expected) throw new Error(label + ': verification failed');
}

let activeUid = null;
let activeToken = null;
let roomId = null;
let hasMember = false;
let cleanedAuth = false;
let cleanupMemberOk = true;

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pause = async (msg) => { await rl.question(msg); };

async function stageInvite(token, expectedOwner = null, expectedRoom = null) {
  const document = await readDocument('roomInvites/' + token, activeToken);
  const fields = document.fields ?? {};
  const room = fields.roomId?.stringValue;
  const owner = fields.createdByUid?.stringValue;
  const state = fields.state?.stringValue;
  const expiration = Date.parse(fields.expiresAt?.timestampValue ?? '');
  if (!room || !owner || !UID_PATTERN.test(owner) ||
      state !== 'pending' || !Number.isFinite(expiration) ||
      expiration < Date.now() + 60_000) {
    throw new Error('Expected an unused invite valid for at least another minute');
  }
  if (expectedOwner) requireMatch('Both invites must have the same owner', owner, expectedOwner);
  if (expectedRoom) requireMatch('Both invites must target the same room', room, expectedRoom);
  return { room, owner };
}

async function verifyJoined(uid, room) {
  expectStatus('Member can read the joined room',
    await statusOf(docGet('rooms/' + room, activeToken)), 200);
  expectStatus('Member can read own membership',
    await statusOf(docGet('rooms/' + room + '/members/' + uid, activeToken)), 200);
  const results = await queryMemberships(uid, activeToken);
  requireMatch('Joined-room collection-group discovery count', results.length, 1);
  requireMatch('Joined-room collection-group result',
    results[0], pathOf('rooms', room, 'members', uid));
  console.log('Joined-room discovery: PASS');
}

async function verifyRemoved(uid, room) {
  expectStatus('Former Member denied room metadata',
    await statusOf(docGet('rooms/' + room, activeToken)), 403);
  expectStatus('Former Member denied own deleted membership',
    await statusOf(docGet('rooms/' + room + '/members/' + uid, activeToken)), 403);
  const results = await queryMemberships(uid, activeToken);
  requireMatch('Revoked/left Membership must disappear from discovery', results.length, 0);
  console.log('Revocation/leave access isolation: PASS');
}

async function leaveAsB(uid, room) {
  return statusOf(request(documentUrl('rooms/' + room + '/members/' + uid), 'DELETE', activeToken));
}

try {
  console.log('Firebase Staging only: ' + PROJECT + '. No production credentials or Admin SDK.');
  console.log('This live test makes TWO intentional invite redemptions against existing Room.');
  console.log('Invitation records stay accepted (audit); temporary Member records and Auth user are removed.');
  const confirmation = await rl.question('Type LIVE M2 STAGING to create a temporary test identity: ');
  if (confirmation !== 'LIVE M2 STAGING') throw new Error('Operator confirmation not provided');

  const anonymous = await auth('accounts:signUp', { returnSecureToken: true });
  if (!anonymous.idToken || !anonymous.localId || !UID_PATTERN.test(anonymous.localId)) {
    throw new Error('Could not establish test identity');
  }
  activeUid = anonymous.localId;
  activeToken = anonymous.idToken;
  const lookup = await auth('accounts:lookup', { idToken: activeToken });
  requireMatch('Anonymous Auth principal proof', lookup.users?.[0]?.localId, activeUid);

  const first = await stageInvite(tokenRemove);
  const second = await stageInvite(tokenLeave, first.owner, first.room);
  roomId = first.room;
  if (activeUid === first.owner) throw new Error('Test UID must be distinct from Owner UID');

  expectStatus('B own absent profile has owner-scoped readable path',
    await statusOf(docGet('users/' + activeUid, activeToken)), 404);
  expectStatus('B denied existing Google A profile',
    await statusOf(docGet('users/' + first.owner, activeToken)), 403);
  expectStatus('B denied room metadata before invitation',
    await statusOf(docGet('rooms/' + roomId, activeToken)), 403);
  expectStatus('B denied A private event read',
    await statusOf(docGet('users/' + first.owner + '/personalEvents/forbidden', activeToken)), 403);

  // Non-destructive negative WRITES. Impossible preconditions protect target
  // data even if Rules are dangerously permissive. Require explicit 403.
  const deniedWrites = [
    {
      label: 'B denied UPDATE existing A profile',
      writes: [safeDeniedUpdate(pathOf('users', first.owner), {
        displayName: { stringValue: 'security-test-should-never-write' },
      })],
    },
    {
      label: 'B denied CREATE A private event',
      writes: [safeDeniedCreate(pathOf('users', first.owner, 'personalEvents', 'm2-isolation-probe'), {
        title: { stringValue: 'security-test-should-never-write' },
      })],
    },
    {
      label: 'B denied forged Admin membership',
      writes: [safeDeniedCreate(pathOf('rooms', roomId, 'members', activeUid), {
        uid: { stringValue: activeUid },
        role: { stringValue: 'admin' },
        membershipState: { stringValue: 'active' },
      })],
    },
    {
      label: 'B denied DELETE Owner membership',
      writes: [{
        delete: pathOf('rooms', roomId, 'members', first.owner),
        currentDocument: { exists: false },
      }],
    },
  ];
  for (const attempt of deniedWrites) {
    const status = await commitStatus(attempt.writes, activeToken);
    expectStatus(attempt.label, status, 403);
  }

  // Legitimate atomically written Member state. Both invitations were
  // created by the owner using the UI under staging Rules/quotas.
  expectStatus('B accepted first invite atomically',
    await commitStatus(claimWrites(tokenRemove, roomId, activeUid), activeToken), 200);
  hasMember = true;
  await verifyJoined(activeUid, roomId);
  expectStatus('B denied reading Owner membership',
    await statusOf(docGet('rooms/' + roomId + '/members/' + first.owner, activeToken)), 403);

  console.log('Owner: in OurSchedule > Room member manager, select the matching Room.');
  console.log('Remove ONLY the temporary Member with row prefix: ' + activeUid.slice(0, 8) + '…');
  await pause('After Owner clicks "ลบสมาชิก" in the Web UI, press Enter here: ');
  await verifyRemoved(activeUid, roomId);
  hasMember = false;

  expectStatus('Accepted invitation cannot be replayed',
    await commitStatus(claimWrites(tokenRemove, roomId, activeUid), activeToken), 403);
  expectStatus('B accepted second fresh invite atomically',
    await commitStatus(claimWrites(tokenLeave, roomId, activeUid), activeToken), 200);
  hasMember = true;
  await verifyJoined(activeUid, roomId);
  expectStatus('B voluntarily leaves own Member role',
    await leaveAsB(activeUid, roomId), 200);
  hasMember = false;
  await verifyRemoved(activeUid, roomId);

  console.log('LIVE M2 WRITE/INVITE/MEMBER ACCEPTANCE: PASS');
  console.log('Both invitation documents remain accepted, for staging audit.');
} catch (error) {
  console.error('LIVE SECURITY GATE: NOT VERIFIED — ' + errorMessage(error));
  process.exitCode = 1;
} finally {
  // Keep the Firebase test identity active until best-effort membership
  // cleanup is completed, otherwise Owner may have to delete it manually.
  if (activeUid && activeToken && roomId && hasMember) {
    try {
      const deleteStatus = await leaveAsB(activeUid, roomId);
      if (![200, 403, 404].includes(deleteStatus)) cleanupMemberOk = false;
      // Confirm access removed irrespective of Owner/B performing deletion.
      const roomStatus = await statusOf(docGet('rooms/' + roomId, activeToken));
      if (roomStatus !== 403) cleanupMemberOk = false;
      console.log(cleanupMemberOk ? 'Temporary Member cleanup verified.' :
        'WARNING: temporary Member may remain; Owner must remove test member using the UI.');
    } catch {
      cleanupMemberOk = false;
      console.error('WARNING: Member cleanup could not be confirmed. Owner must remove it in the UI.');
    }
  }
  if (activeToken) {
    try {
      await auth('accounts:delete', { idToken: activeToken });
      cleanedAuth = true;
      console.log('Temporary Anonymous Firebase Auth user deleted.');
    } catch {
      console.error('WARNING: test Anonymous UID deletion not confirmed; inspect Firebase Auth Users.');
    }
  }
  rl.close();
  if (!cleanedAuth || !cleanupMemberOk) process.exitCode = 1;
  console.log('MANDATORY: disable Anonymous Sign-in provider in Firebase STAGING now.');
  console.log('Do not share invitation URLs, Firebase IDs or secrets in logs.');
}
