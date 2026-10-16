import { readFileSync } from 'node:fs';
import { includeQuota } from './quotaHelpers.mjs';
import { after, before, describe, it } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-ourschedule-ci',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { if (environment) await environment.cleanup(); });

const context = (uid) => environment.authenticatedContext(uid).firestore();
const tokens = [
  'A'.repeat(43), 'B'.repeat(43), 'C'.repeat(43), 'D'.repeat(43),
  'E'.repeat(43), 'F'.repeat(43), 'G'.repeat(43), 'H'.repeat(43),
  'I'.repeat(43), 'J'.repeat(43), 'K'.repeat(43), 'L'.repeat(43),
  'M'.repeat(43), 'N'.repeat(43), 'O'.repeat(43),
];
const future = () => Timestamp.fromMillis(Date.now() + 36 * 60 * 60 * 1000);
const inviteRecord = (uid, roomId, extra = {}) => ({
  roomId,
  createdByUid: uid,
  createdAt: serverTimestamp(),
  expiresAt: future(),
  state: 'pending',
  acceptedByUid: null,
  acceptedAt: null,
  ...extra,
});
async function makeRoom(ownerUid, roomId) {
  const db = context(ownerUid);
  const batch = writeBatch(db);
  await includeQuota(batch, db, ownerUid, 'rooms', roomId);
  batch.set(doc(db, 'rooms', roomId), {
    ownerUid, name: 'Room example',
    assignmentPolicy: 'REQUIRE_ACCEPTANCE',
    defaultVisibility: 'PRIVATE',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', roomId, 'members', ownerUid), {
    uid: ownerUid, role: 'owner', membershipState: 'active',
    joinedAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
  return db;
}
async function makeInvite(ownerUid, roomId, token) {
  const db = context(ownerUid);
  const batch = writeBatch(db);
  await includeQuota(batch, db, ownerUid, 'invites', token);
  batch.set(doc(db, 'roomInvites', token), inviteRecord(ownerUid, roomId));
  await assertSucceeds(batch.commit());
  return db;
}
async function claimInvite(uid, token, roomId, overrides = {}) {
  const db = context(uid);
  const batch = writeBatch(db);
  batch.update(doc(db, 'roomInvites', token), {
    state: 'accepted', acceptedByUid: uid, acceptedAt: serverTimestamp(),
    ...overrides.invite,
  });
  batch.set(doc(db, 'rooms', roomId, 'members', uid), {
    uid, role: 'member', membershipState: 'active',
    joinedAt: serverTimestamp(), inviteId: token,
    ...overrides.member,
  });
  return batch.commit();
}

describe('M2.2a single-use invitation and Member invariants', () => {

  it('cannot issue an invite without quota or re-use one quota transition for multiple invites', async () => {
    const uid = 'invite-quota-issuer';
    const roomId = 'room-invite-quota';
    await makeRoom(uid, roomId);
    const db = context(uid);
    await assertFails(setDoc(doc(db, 'roomInvites', 'p'.repeat(43)), inviteRecord(uid, roomId)));
    const batch = writeBatch(db);
    await includeQuota(batch, db, uid, 'invites', 'q'.repeat(43));
    for (const token of ['q'.repeat(43), 'r'.repeat(43)]) {
      batch.set(doc(db, 'roomInvites', token), inviteRecord(uid, roomId));
    }
    await assertFails(batch.commit());
  });

  it('caps invitations at ten per 24h and denies direct quota manipulation', async () => {
    const uid = 'invite-daily-cap';
    const roomId = 'room-invite-daily-cap';
    await makeRoom(uid, roomId);
    for (let i = 0; i < 10; i++) {
      await makeInvite(uid, roomId, String.fromCharCode(97 + i).repeat(43));
    }
    const db = context(uid);
    const batch = writeBatch(db);
    const token = 'k'.repeat(43);
    await includeQuota(batch, db, uid, 'invites', token);
    batch.set(doc(db, 'roomInvites', token), inviteRecord(uid, roomId));
    await assertFails(batch.commit());
    await assertFails(updateDoc(doc(db, 'users', uid, 'quotas', 'invites'), {
      count: 1, windowStart: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  it('allows owner to issue a valid invite; requires authentication for a direct get and forbids listing', async () => {
    const roomId = 'invite-room-one';
    await makeRoom('issuer-one', roomId);
    const owner = await makeInvite('issuer-one', roomId, tokens[0]);
    const recipient = context('recipient-one');
    const snapshot = await assertSucceeds(getDoc(doc(recipient, 'roomInvites', tokens[0])));
    if (snapshot.data()?.state !== 'pending') throw new Error('Invite not pending');
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'roomInvites', tokens[0])));
    await assertFails(getDocs(collection(owner, 'roomInvites')));
    await assertFails(getDocs(query(collection(recipient, 'roomInvites'), limit(1))));
    await assertFails(getDoc(doc(owner, 'roomInvites', 'too-short')));
  });

  it('rejects nonowners, weak IDs, forged fields and overlong expiry', async () => {
    await makeRoom('issuer-two', 'invite-room-two');
    const outsider = context('outsider-two');
    await assertFails(setDoc(doc(outsider, 'roomInvites', tokens[1]), inviteRecord('outsider-two', 'invite-room-two')));
    const owner = context('issuer-two');
    await assertFails(setDoc(doc(owner, 'roomInvites', 'predictable'), inviteRecord('issuer-two', 'invite-room-two')));
    await assertFails(setDoc(doc(owner, 'roomInvites', tokens[1]), inviteRecord('issuer-two', 'invite-room-two', { adminUid: 'issuer-two' })));
    await assertFails(setDoc(doc(owner, 'roomInvites', tokens[1]), inviteRecord('issuer-two', 'invite-room-two', { state: 'accepted' })));
    await assertFails(setDoc(doc(owner, 'roomInvites', tokens[1]), inviteRecord('issuer-two', 'invite-room-two', { expiresAt: Timestamp.fromMillis(Date.now() + 6 * 24 * 60 * 60 * 1000) })));
  });

  it('joins atomically via invite and reveals only room and own member metadata', async () => {
    await makeRoom('issuer-three', 'invite-room-three');
    await makeInvite('issuer-three', 'invite-room-three', tokens[2]);
    await assertSucceeds(claimInvite('guest-three', tokens[2], 'invite-room-three'));
    const member = context('guest-three');
    const room = await assertSucceeds(getDoc(doc(member, 'rooms', 'invite-room-three')));
    const membership = await assertSucceeds(getDoc(doc(member, 'rooms', 'invite-room-three', 'members', 'guest-three')));
    if (!room.exists() || membership.data()?.role !== 'member') throw new Error('No joined membership');
    const owner = context('issuer-three');
    await assertSucceeds(getDoc(doc(owner, 'rooms', 'invite-room-three')));
    await assertFails(getDoc(doc(member, 'rooms', 'invite-room-three', 'members', 'issuer-three')));
    await assertFails(getDocs(query(collection(member, 'rooms'), where('ownerUid', '==', 'issuer-three'), limit(20))));
    await assertFails(setDoc(doc(member, 'rooms', 'invite-room-three', 'events', 'leak'), { title: 'must deny' }));
  });

  it('prevents replay by a different UID and prevents rewriting redemption', async () => {
    await makeRoom('issuer-four', 'invite-room-four');
    await makeInvite('issuer-four', 'invite-room-four', tokens[3]);
    await assertSucceeds(claimInvite('guest-four', tokens[3], 'invite-room-four'));
    await assertFails(claimInvite('attacker-four', tokens[3], 'invite-room-four'));
    const db = context('guest-four');
    await assertFails(updateDoc(doc(db, 'roomInvites', tokens[3]), { acceptedByUid: 'attacker-four' }));
    await assertFails(deleteDoc(doc(db, 'roomInvites', tokens[3])));
  });

  it('prevents direct Member creation, escalation to Admin and cross-room redemption', async () => {
    await makeRoom('issuer-five', 'invite-room-five');
    await makeRoom('issuer-five', 'invite-room-five-other');
    await makeInvite('issuer-five', 'invite-room-five', tokens[4]);
    const guest = context('guest-five');
    await assertFails(setDoc(doc(guest, 'rooms', 'invite-room-five', 'members', 'guest-five'), {
      uid: 'guest-five', role: 'member', membershipState: 'active',
      joinedAt: serverTimestamp(), inviteId: tokens[4],
    }));
    await assertFails(claimInvite('guest-five', tokens[4], 'invite-room-five', { member: { role: 'admin' } }));
    await assertFails(claimInvite('guest-five', tokens[4], 'invite-room-five-other'));
    const snapshot = await assertSucceeds(getDoc(doc(guest, 'roomInvites', tokens[4])));
    if (snapshot.data()?.state !== 'pending') throw new Error('Rejected attack consumed invite');
  });

  it('only owner can revoke pending invitation and revoked invitation cannot be used', async () => {
    await makeRoom('issuer-six', 'invite-room-six');
    const owner = await makeInvite('issuer-six', 'invite-room-six', tokens[5]);
    const guest = context('guest-six');
    await assertFails(updateDoc(doc(guest, 'roomInvites', tokens[5]), { state: 'revoked' }));
    await assertSucceeds(updateDoc(doc(owner, 'roomInvites', tokens[5]), { state: 'revoked' }));
    await assertFails(claimInvite('guest-six', tokens[5], 'invite-room-six'));
  });

  it('expired invitation cannot be accepted even if its document exists', async () => {
    await makeRoom('issuer-seven', 'invite-room-seven');
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'roomInvites', tokens[6]), {
        ...inviteRecord('issuer-seven', 'invite-room-seven'),
        createdAt: Timestamp.fromMillis(Date.now() - 72 * 60 * 60 * 1000),
        expiresAt: Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000),
      });
    });
    await assertFails(claimInvite('guest-seven', tokens[6], 'invite-room-seven'));
  });

  it('owner cannot redeem invitation as a new member or change own owner role', async () => {
    await makeRoom('issuer-eight', 'invite-room-eight');
    await makeInvite('issuer-eight', 'invite-room-eight', tokens[7]);
    await assertFails(claimInvite('issuer-eight', tokens[7], 'invite-room-eight'));
    const owner = context('issuer-eight');
    await assertFails(updateDoc(doc(owner, 'rooms', 'invite-room-eight', 'members', 'issuer-eight'), { role: 'member' }));
  });

  it('cannot accept invitation by editing invite alone without matching Member batch', async () => {
    await makeRoom('issuer-nine', 'invite-room-nine');
    await makeInvite('issuer-nine', 'invite-room-nine', tokens[8]);
    const db = context('guest-nine');
    await assertFails(updateDoc(doc(db, 'roomInvites', tokens[8]), {
      state: 'accepted', acceptedByUid: 'guest-nine', acceptedAt: serverTimestamp(),
    }));
  });

  it('two users racing on one invitation cannot both become members', async () => {
    await makeRoom('issuer-ten', 'invite-room-ten');
    await makeInvite('issuer-ten', 'invite-room-ten', tokens[9]);
    const promises = await Promise.allSettled([
      claimInvite('guest-ten-a', tokens[9], 'invite-room-ten'),
      claimInvite('guest-ten-b', tokens[9], 'invite-room-ten'),
    ]);
    const winners = promises.filter((p) => p.status === 'fulfilled').length;
    if (winners !== 1) throw new Error('Expected one successful redeemer, saw ' + winners);
  });

  it('does not grant membership to an outsider using someone else’s invite metadata', async () => {
    await makeRoom('issuer-eleven', 'invite-room-eleven');
    await makeInvite('issuer-eleven', 'invite-room-eleven', tokens[10]);
    await assertFails(claimInvite('guest-eleven', tokens[10], 'invite-room-eleven', {
      invite: { acceptedByUid: 'different-uid' },
    }));
  });
});
