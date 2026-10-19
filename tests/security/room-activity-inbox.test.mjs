import { readFileSync } from 'node:fs';
import { before, after, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch, deleteDoc,
} from 'firebase/firestore';
import { includeQuota } from './quotaHelpers.mjs';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ourschedule-ci',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { if (env) await env.cleanup(); });

const db = (uid) => env.authenticatedContext(uid).firestore();
const start = Timestamp.fromDate(new Date('2026-10-19T10:00:00+07:00'));
const end = Timestamp.fromDate(new Date('2026-10-19T11:00:00+07:00'));
const membershipStart = Timestamp.fromDate(new Date('2026-10-18T10:00:00+07:00'));

async function seedRoom(roomId, ownerUid, memberUid, policy = 'REQUIRE_ACCEPTANCE') {
  await env.withSecurityRulesDisabled(async (context) => {
    const seed = context.firestore();
    await setDoc(doc(seed, 'rooms', roomId), {
      ownerUid, name: 'Staging room', assignmentPolicy: policy, defaultVisibility: 'PRIVATE',
      createdAt: membershipStart, updatedAt: membershipStart,
    });
    await setDoc(doc(seed, 'rooms', roomId, 'members', ownerUid), {
      uid: ownerUid, role: 'owner', membershipState: 'active', joinedAt: membershipStart,
    });
    if (memberUid) await setDoc(doc(seed, 'rooms', roomId, 'members', memberUid), {
      uid: memberUid, role: 'member', membershipState: 'active', joinedAt: membershipStart,
      inviteId: 'a'.repeat(43),
    });
  });
}

function eventData(roomId, creatorUid, recipientUid, extra = {}) {
  return {
    roomId, creatorUid, recipientUid, title: 'Private appointment', notes: 'Hidden details',
    startAt: start, endAt: end, allDay: false, timezone: 'Asia/Bangkok',
    visibility: 'PRIVATE', status: 'active',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
  };
}
function inboxData(roomId, eventId, creatorUid, recipientUid, policy = 'REQUIRE_ACCEPTANCE', extra = {}) {
  return {
    roomId, eventId, creatorUid, recipientUid, title: 'Private appointment',
    startAt: start, endAt: end,
    state: policy === 'AUTO_ASSIGN' ? 'ACCEPTED' : 'PENDING',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
  };
}
const eventRef = (d, roomId, eventId) => doc(d, 'rooms', roomId, 'events', eventId);
const inboxRef = (d, recipientUid, eventId) => doc(d, 'users', recipientUid, 'roomActivityInvites', eventId);
async function createPair(roomId, owner, recipient, eventId, policy = 'REQUIRE_ACCEPTANCE', overrides = {}) {
  const d = db(owner);
  const batch = writeBatch(d);
  await includeQuota(batch, d, owner, 'roomEvents', roomId + '_' + eventId);
  batch.set(eventRef(d, roomId, eventId), eventData(roomId, owner, recipient, overrides.event));
  batch.set(inboxRef(d, recipient, eventId), inboxData(roomId, eventId, owner, recipient, policy, overrides.inbox));
  return batch.commit();
}

describe('M3.2a per-member PRIVATE room activity offer', () => {
  it('requires atomic event+inbox, owner-only creation and scoped 20-event quota', async () => {
    await seedRoom('r-atomic', 'a-atomic', 'b-atomic');
    const owner = db('a-atomic');
    await assertFails(setDoc(eventRef(owner, 'r-atomic', 'lonely'), eventData('r-atomic', 'a-atomic', 'b-atomic')));
    const forged = writeBatch(owner);
    await includeQuota(forged, owner, 'a-atomic', 'roomEvents', 'r-atomic_wrong');
    forged.set(eventRef(owner, 'r-atomic', 'wrong'), eventData('r-atomic', 'a-atomic', 'b-atomic'));
    await assertFails(forged.commit());
    await assertFails(setDoc(inboxRef(owner, 'b-atomic', 'fake'),
      inboxData('r-atomic', 'fake', 'a-atomic', 'b-atomic')));
    await assertSucceeds(createPair('r-atomic', 'a-atomic', 'b-atomic', 'correct'));
    await assertFails(createPair('r-atomic', 'b-atomic', 'a-atomic', 'unauthorized'));
  });


  it('cannot reuse one daily quota step to create same event ID in two rooms', async () => {
    await seedRoom('r-shared-1', 'a-shared', 'b-shared-1');
    await seedRoom('r-shared-2', 'a-shared', 'b-shared-2');
    const d = db('a-shared');
    const first = writeBatch(d);
    await includeQuota(first, d, 'a-shared', 'roomEvents', 'r-shared-1_same-id');
    first.set(eventRef(d, 'r-shared-1', 'same-id'),
      eventData('r-shared-1', 'a-shared', 'b-shared-1'));
    first.set(inboxRef(d, 'b-shared-1', 'same-id'),
      inboxData('r-shared-1', 'same-id', 'a-shared', 'b-shared-1'));
    first.set(eventRef(d, 'r-shared-2', 'same-id'),
      eventData('r-shared-2', 'a-shared', 'b-shared-2'));
    first.set(inboxRef(d, 'b-shared-2', 'same-id'),
      inboxData('r-shared-2', 'same-id', 'a-shared', 'b-shared-2'));
    await assertFails(first.commit());
  });

  it('recipient sees only direct inbox until accepting; then can read own event but not room-wide list', async () => {
    await seedRoom('r-pending', 'a-pending', 'b-pending');
    await assertSucceeds(createPair('r-pending', 'a-pending', 'b-pending', 'invite-pending'));
    const member = db('b-pending');
    const owner = db('a-pending');
    const entry = inboxRef(member, 'b-pending', 'invite-pending');
    const snap = await assertSucceeds(getDoc(entry));
    if (snap.data()?.state !== 'PENDING' || snap.data()?.title !== 'Private appointment') {
      throw new Error('Recipient did not see own invitation teaser');
    }
    await assertFails(getDoc(eventRef(member, 'r-pending', 'invite-pending')));
    await assertFails(getDocs(query(collection(member, 'rooms/r-pending/events'), limit(20))));
    await assertFails(getDocs(query(collection(member, 'users/a-pending/roomActivityInvites'), limit(20))));
    await assertFails(getDoc(inboxRef(member, 'a-pending', 'invite-pending')));
    await assertSucceeds(updateDoc(entry, { state: 'ACCEPTED', updatedAt: serverTimestamp() }));
    const approved = await assertSucceeds(getDoc(eventRef(member, 'r-pending', 'invite-pending')));
    if (!approved.exists() || approved.data()?.notes !== 'Hidden details')
      throw new Error('Accepted member cannot see explicitly assigned activity');
    const inboxItems = await assertSucceeds(getDocs(query(
      collection(member, 'users/b-pending/roomActivityInvites'), limit(20))));
    if (inboxItems.size !== 1) throw new Error('Recipient inbox query mismatch');
    const ownerReadInbox = await assertSucceeds(getDoc(inboxRef(owner, 'b-pending', 'invite-pending')));
    if (ownerReadInbox.data()?.state !== 'ACCEPTED') throw new Error('Creator not seeing acceptance');
  });

  it('REQUIRE_ACCEPTANCE cannot be bypassed and decisions are one-way', async () => {
    await seedRoom('r-decline', 'a-decline', 'b-decline');
    await assertFails(createPair('r-decline', 'a-decline', 'b-decline', 'forced', 'REQUIRE_ACCEPTANCE', {
      inbox: { state: 'ACCEPTED' },
    }));
    await assertSucceeds(createPair('r-decline', 'a-decline', 'b-decline', 'rejected'));
    const b = db('b-decline');
    const entry = inboxRef(b, 'b-decline', 'rejected');
    await assertFails(updateDoc(entry, { creatorUid: 'b-decline', state: 'ACCEPTED', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(entry, { title: 'tampered', state: 'ACCEPTED', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(entry, { state: 'DECLINED', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(entry, { state: 'ACCEPTED', updatedAt: serverTimestamp() }));
    await assertFails(getDoc(eventRef(b, 'r-decline', 'rejected')));
  });

  it('AUTO_ASSIGN is allowed only when the room Owner configured the policy', async () => {
    await seedRoom('r-auto', 'a-auto', 'b-auto', 'AUTO_ASSIGN');
    await assertSucceeds(createPair('r-auto', 'a-auto', 'b-auto', 'auto', 'AUTO_ASSIGN'));
    const b = db('b-auto');
    await assertSucceeds(getDoc(eventRef(b, 'r-auto', 'auto')));
    await assertFails(createPair('r-auto', 'a-auto', 'b-auto', 'falsePending',
      'REQUIRE_ACCEPTANCE'));
    await assertFails(updateDoc(inboxRef(b, 'b-auto', 'auto'), {
      state: 'DECLINED', updatedAt: serverTimestamp(),
    }));
  });

  it('outsiders/room Owner cannot read unrelated PRIVATE events; forged field injection denied', async () => {
    await seedRoom('r-isolate', 'a-isolate', 'b-isolate');
    await seedRoom('r-other', 'other-owner', 'other-member');
    await assertSucceeds(createPair('r-isolate', 'a-isolate', 'b-isolate', 'secret'));
    const outsider = db('other-owner');
    await assertFails(getDoc(eventRef(outsider, 'r-isolate', 'secret')));
    await assertFails(getDoc(inboxRef(outsider, 'b-isolate', 'secret')));
    await assertFails(setDoc(eventRef(db('b-isolate'), 'r-isolate', 'spoof'),
      eventData('r-isolate','a-isolate','b-isolate')));
    await assertFails(createPair('r-isolate', 'a-isolate', 'b-isolate', 'fake-owner', 'REQUIRE_ACCEPTANCE', {
      event: { creatorUid: 'other-owner' },
    }));
    await assertFails(createPair('r-isolate', 'a-isolate', 'b-isolate', 'public-proj', 'REQUIRE_ACCEPTANCE', {
      event: { visibility: 'ROOM' },
    }));
    await assertFails(createPair('r-isolate', 'a-isolate', 'b-isolate', 'busy-proj', 'REQUIRE_ACCEPTANCE', {
      event: { visibility: 'BUSY_ONLY' },
    }));
    await assertFails(setDoc(doc(db('a-isolate'), 'rooms/r-isolate/calendarProjections/public'), {
      title: 'leak',
    }));
  });

  it('revoked membership and later rejoining cannot resurrect prior accepted inbox access', async () => {
    await seedRoom('r-revoked', 'a-revoked', 'b-revoked', 'AUTO_ASSIGN');
    await assertSucceeds(createPair('r-revoked', 'a-revoked', 'b-revoked', 'sent', 'AUTO_ASSIGN'));
    const member = db('b-revoked');
    await assertSucceeds(getDoc(eventRef(member, 'r-revoked', 'sent')));
    await assertSucceeds(deleteDoc(doc(db('a-revoked'), 'rooms/r-revoked/members/b-revoked')));
    await assertFails(getDoc(eventRef(member, 'r-revoked', 'sent')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rooms/r-revoked/members/b-revoked'), {
        uid: 'b-revoked', role: 'member', membershipState: 'active',
        joinedAt: Timestamp.fromDate(new Date('2030-01-01T00:00:00Z')),
        inviteId: 'b'.repeat(43),
      });
    });
    await assertFails(getDoc(eventRef(member, 'r-revoked', 'sent')));
  });

  it('cancellation immediately revokes accepted recipient event access; no content edits', async () => {
    await seedRoom('r-cancel', 'a-cancel', 'b-cancel', 'AUTO_ASSIGN');
    await assertSucceeds(createPair('r-cancel', 'a-cancel', 'b-cancel', 'cancelled', 'AUTO_ASSIGN'));
    const owner = db('a-cancel');
    const member = db('b-cancel');
    const event = eventRef(owner, 'r-cancel', 'cancelled');
    await assertSucceeds(getDoc(eventRef(member, 'r-cancel', 'cancelled')));
    await assertFails(updateDoc(event, { title: 'changed', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(event));
    await assertSucceeds(updateDoc(event, { status: 'cancelled', updatedAt: serverTimestamp() }));
    await assertFails(getDoc(eventRef(member, 'r-cancel', 'cancelled')));
    await assertFails(updateDoc(event, { status: 'active', updatedAt: serverTimestamp() }));
  });
});
