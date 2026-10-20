import { readFileSync } from 'node:fs';
import { before, after, describe, it } from 'node:test';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query,
  setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';

// M4b pre-implementation release gate. These are NEGATIVE tests and must
// keep passing until new projection rules, indexes and dual-UID acceptance
// tests have been reviewed separately. They do not activate sharing.
let environment;
const roomId = 'm4b-projection-denied';
const ownerUid = 'm4b-owner';
const memberUid = 'm4b-member';
const otherUid = 'm4b-outsider';
const time = Timestamp.fromDate(new Date('2026-10-20T09:00:00+07:00'));

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-ourschedule-ci',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await environment.withSecurityRulesDisabled(async ({ firestore }) => {
    await setDoc(doc(firestore, 'rooms', roomId), {
      ownerUid, name: 'Privacy Boundary', assignmentPolicy: 'REQUIRE_ACCEPTANCE',
      defaultVisibility: 'PRIVATE', createdAt: time, updatedAt: time,
    });
    await setDoc(doc(firestore, 'rooms', roomId, 'members', ownerUid), {
      uid:ownerUid,role:'owner',membershipState:'active',joinedAt:time,
    });
    await setDoc(doc(firestore, 'rooms', roomId, 'members', memberUid), {
      uid:memberUid,role:'member',membershipState:'active',joinedAt:time,
      inviteId:'a'.repeat(43),
    });
    // A privileged process may have created this document in a future
    // migration. An EXISTING document must not become readable merely
    // because it lives under an active member's room.
    await setDoc(doc(firestore, 'rooms', roomId, 'calendarProjections', 'existing-busy'), {
      roomId, visibility:'BUSY_ONLY',
      startAt:time,
      endAt:Timestamp.fromDate(new Date('2026-10-20T10:00:00+07:00')),
      title:'Private diagnosis',
      notes:'Extremely sensitive',
    });
  });
});
after(async () => { if (environment) await environment.cleanup(); });

const projectionPath = 'rooms/' + roomId + '/calendarProjections/existing-busy';

describe('M4b projection sharing remains denied until a dedicated Rules release', () => {
  it('denies GET of even seeded projection documents to Owner, Member, outsider and anonymous', async () => {
    for (const uid of [ownerUid, memberUid, otherUid]) {
      const client = environment.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(client, projectionPath)));
    }
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, projectionPath)));
  });

  it('denies list/query of projection collections even to active room Owner and Member', async () => {
    for (const uid of [ownerUid, memberUid, otherUid]) {
      const client = environment.authenticatedContext(uid).firestore();
      await assertFails(getDocs(query(
        collection(client, 'rooms', roomId, 'calendarProjections'),
        limit(20),
      )));
    }
  });

  it('denies forged projection writes, updates and deletion for all active room identities', async () => {
    const forged = {
      roomId, creatorUid:ownerUid, visibility:'ROOM',
      title:'Forged event', notes:'Private metadata leak', startAt:time,
    };
    for (const uid of [ownerUid, memberUid, otherUid]) {
      const client = environment.authenticatedContext(uid).firestore();
      await assertFails(setDoc(doc(client, 'rooms', roomId, 'calendarProjections', 'forged-'+uid), forged));
      await assertFails(updateDoc(doc(client, projectionPath), {visibility:'ROOM'}));
      await assertFails(deleteDoc(doc(client, projectionPath)));
    }
  });

  it('never exposes PRIVATE room activity details to a different active member', async () => {
    await environment.withSecurityRulesDisabled(async ({ firestore }) => {
      await setDoc(doc(firestore, 'rooms', roomId, 'members', 'm4b-recipient'), {
        uid:'m4b-recipient',role:'member',membershipState:'active',
        joinedAt:time,inviteId:'b'.repeat(43),
      });
      await setDoc(doc(firestore, 'rooms', roomId, 'events', 'private-for-recipient'), {
        roomId,creatorUid:ownerUid,recipientUid:'m4b-recipient',
        title:'Recipient-only medical visit',notes:'Medical record',
        startAt:time,endAt:Timestamp.fromDate(new Date('2026-10-20T10:00:00+07:00')),
        allDay:false,timezone:'Asia/Bangkok',visibility:'PRIVATE',
        status:'active',createdAt:time,updatedAt:time,
      });
    });
    const otherMember = environment.authenticatedContext(memberUid).firestore();
    await assertFails(getDoc(doc(otherMember, 'rooms', roomId, 'events', 'private-for-recipient')));
    await assertFails(getDocs(query(collection(otherMember, 'rooms', roomId, 'events'), limit(20))));
  });
});
