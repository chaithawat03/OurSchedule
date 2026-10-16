import { readFileSync } from 'node:fs';
import { includeQuota } from './quotaHelpers.mjs';
import { after, before, describe, it } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-ourschedule-ci',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { if (environment) await environment.cleanup(); });

const roomData = (ownerUid, extra = {}) => ({
  ownerUid,
  name: 'ทดสอบห้อง',
  assignmentPolicy: 'REQUIRE_ACCEPTANCE',
  defaultVisibility: 'PRIVATE',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});
const ownerData = (uid, extra = {}) => ({
  uid, role: 'owner', membershipState: 'active',
  joinedAt: serverTimestamp(),
  ...extra,
});
function ownerDb(uid) { return environment.authenticatedContext(uid).firestore(); }
function refs(db, roomId, uid) {
  return {
    room: doc(db, 'rooms', roomId),
    member: doc(db, 'rooms', roomId, 'members', uid),
  };
}
async function createRoom(uid, roomId) {
  const db = ownerDb(uid);
  const { room, member } = refs(db, roomId, uid);
  const batch = writeBatch(db);
  await includeQuota(batch, db, uid, 'rooms', roomId);
  batch.set(room, roomData(uid));
  batch.set(member, ownerData(uid));
  await assertSucceeds(batch.commit());
  return { db, room, member };
}

describe('M2.1 room owner-only authorization', () => {

  it('blocks missing quota step, tampered resets and quota deletion', async () => {
    const db = ownerDb('room-quota-attacker');
    const roomId = 'room-unmetered';
    const batch = writeBatch(db);
    batch.set(doc(db, 'rooms', roomId), roomData('room-quota-attacker'));
    batch.set(doc(db, 'rooms', roomId, 'members', 'room-quota-attacker'), ownerData('room-quota-attacker'));
    await assertFails(batch.commit());
    await createRoom('room-quota-attacker', 'room-metered');
    const counter = doc(db, 'users', 'room-quota-attacker', 'quotas', 'rooms');
    await assertFails(updateDoc(counter, {
      count: 0, updatedAt: serverTimestamp(), lastResourceId: 'room-bypass',
    }));
    await assertFails(updateDoc(counter, {
      count: 1, windowStart: serverTimestamp(), updatedAt: serverTimestamp(), lastResourceId: 'room-reset',
    }));
    await assertFails(deleteDoc(counter));
  });

  it('does not allow one quota increment to pay for two room creates', async () => {
    const uid = 'room-multicreate';
    const db = ownerDb(uid);
    const batch = writeBatch(db);
    await includeQuota(batch, db, uid, 'rooms', 'room-one');
    for (const id of ['room-one', 'room-two']) {
      batch.set(doc(db, 'rooms', id), roomData(uid));
      batch.set(doc(db, 'rooms', id, 'members', uid), ownerData(uid));
    }
    await assertFails(batch.commit());
  });

  it('enforces a rolling three-room cap even with a direct Firestore write', async () => {
    const uid = 'room-daily-cap';
    for (const id of ['room-quota-1', 'room-quota-2', 'room-quota-3']) {
      await createRoom(uid, id);
    }
    const db = ownerDb(uid);
    const batch = writeBatch(db);
    await includeQuota(batch, db, uid, 'rooms', 'room-quota-4');
    batch.set(doc(db, 'rooms', 'room-quota-4'), roomData(uid));
    batch.set(doc(db, 'rooms', 'room-quota-4', 'members', uid), ownerData(uid));
    await assertFails(batch.commit());
  });

  it('atomically creates a room and matching immutable owner membership', async () => {
    const { db, room, member } = await createRoom('room-creator', 'room-atomic');
    const roomSnapshot = await assertSucceeds(getDoc(room));
    const memberSnapshot = await assertSucceeds(getDoc(member));
    if (roomSnapshot.data()?.ownerUid !== 'room-creator' || memberSnapshot.data()?.role !== 'owner')
      throw new Error('Owner/room atomic mapping was not created');
    const own = query(collection(db, 'rooms'), where('ownerUid', '==', 'room-creator'), limit(20));
    const results = await assertSucceeds(getDocs(own));
    if (results.empty) throw new Error('Owner room listing omitted created room');
  });

  it('rejects orphan room creation without owner membership in the same batch', async () => {
    const db = ownerDb('room-orphan');
    await assertFails(setDoc(doc(db, 'rooms', 'room-orphan-single'), roomData('room-orphan')));
    await assertFails(setDoc(doc(db, 'rooms', 'room-orphan-single', 'members', 'room-orphan'), ownerData('room-orphan')));
  });

  it('denies a forged owner or mismatched membership', async () => {
    const db = ownerDb('room-forger');
    const { room, member } = refs(db, 'room-forged', 'room-forger');
    const batch = writeBatch(db);
    batch.set(room, roomData('other-uid'));
    batch.set(member, ownerData('room-forger'));
    await assertFails(batch.commit());
    const mismatched = writeBatch(db);
    mismatched.set(doc(db, 'rooms', 'room-forged-member'), roomData('room-forger'));
    mismatched.set(doc(db, 'rooms', 'room-forged-member', 'members', 'victim'), ownerData('victim'));
    await assertFails(mismatched.commit());
  });

  it('permits only owner-approved metadata edits', async () => {
    const { room } = await createRoom('room-editor', 'room-editable');
    await assertSucceeds(updateDoc(room, {
      name: 'ชื่อใหม่',
      assignmentPolicy: 'AUTO_ASSIGN',
      defaultVisibility: 'BUSY_ONLY',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(room, { ownerUid: 'attacker', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(room, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(room, { role: 'admin', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(room, { name: '', updatedAt: serverTimestamp() }));
  });

  it('denies anonymous and unauthorized users reading or changing another room', async () => {
    await createRoom('room-private-owner', 'room-private');
    const intruder = ownerDb('room-intruder');
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(intruder, 'rooms', 'room-private')));
    await assertFails(getDoc(doc(anonymous, 'rooms', 'room-private')));
    await assertFails(updateDoc(doc(intruder, 'rooms', 'room-private'), {
      name: 'attack', updatedAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(intruder, 'rooms', 'room-private', 'members', 'room-private-owner')));
  });

  it('refuses global, excessive, and other-owner room listing', async () => {
    await createRoom('list-private', 'list-private-room');
    const owner = ownerDb('list-private');
    await assertFails(getDocs(collection(owner, 'rooms')));
    await assertFails(getDocs(query(collection(owner, 'rooms'), limit(21))));
    const intruder = ownerDb('list-intruder');
    await assertFails(getDocs(query(collection(intruder, 'rooms'), where('ownerUid', '==', 'list-private'), limit(20))));
    await assertFails(getDocs(query(collection(owner, 'rooms'), where('ownerUid', '==', 'list-private'), limit(21))));
  });

  it('prevents deleting the last owner, changing owner role, and adding unaudited members', async () => {
    const { room, member } = await createRoom('room-last-owner', 'room-undeletable');
    await assertFails(deleteDoc(member));
    await assertFails(updateDoc(member, { role: 'member' }));
    await assertFails(deleteDoc(room));
    const owner = ownerDb('room-last-owner');
    await assertFails(setDoc(doc(owner, 'rooms', 'room-undeletable', 'members', 'new-person'), ownerData('new-person')));
    const outsider = ownerDb('new-person');
    await assertFails(setDoc(doc(outsider, 'rooms', 'room-undeletable', 'members', 'new-person'), ownerData('new-person')));
    await assertFails(getDocs(collection(owner, 'rooms', 'room-undeletable', 'members')));
    await assertSucceeds(getDocs(query(collection(owner, 'rooms', 'room-undeletable', 'members'), limit(20))));
    await assertFails(getDocs(query(collection(owner, 'rooms', 'room-undeletable', 'members'), limit(21))));
  });

  it('keeps all nested events, details, projections, and invitations denied', async () => {
    const { db } = await createRoom('room-events-owner', 'room-no-events');
    for (const path of [
      'rooms/room-no-events/events/e1',
      'rooms/room-no-events/events/e1/details/main',
      'rooms/room-no-events/calendarProjections/c1',
      'roomInvites/invite1',
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { title: 'should never save' }));
    }
  });

  it('rejects malformed policy values and injected privileged fields at creation', async () => {
    const db = ownerDb('bad-policy');
    for (const [roomId, extras] of [
      ['room-invalid-policy', { assignmentPolicy: 'ALLOW_ALL' }],
      ['room-extra-admin', { adminUid: 'attacker' }],
      ['room-invalid-owner', { ownerUid: 42 }],
    ]) {
      const roomRef = doc(db, 'rooms', roomId);
      const memberRef = doc(db, 'rooms', roomId, 'members', 'bad-policy');
      const batch = writeBatch(db);
      batch.set(roomRef, roomData('bad-policy', extras));
      batch.set(memberRef, ownerData('bad-policy'));
      await assertFails(batch.commit());
    }
  });
});
