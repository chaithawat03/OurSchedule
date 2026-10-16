import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-ourschedule-ci',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { if (environment) await environment.cleanup(); });

const protectedDocuments = [
  'users/alice/personalEvents/event-1',
  'rooms/room-1',
  'rooms/room-1/members/alice',
  'rooms/room-1/events/event-1',
  'rooms/room-1/events/event-1/details/main',
  'rooms/room-1/calendarProjections/projection-1',
  'roomInvites/invite-1',
];

describe('M1 default deny for all non-profile paths', () => {
  for (const path of protectedDocuments) {
    it('denies anonymous and forged privileged identity on ' + path, async () => {
      const anonymous = environment.unauthenticatedContext().firestore();
      const forged = environment.authenticatedContext('alice', { role: 'owner' }).firestore();
      await assertFails(getDoc(doc(anonymous, path)));
      await assertFails(getDoc(doc(forged, path)));
      await assertFails(setDoc(doc(forged, path), { title: 'malicious', ownerUid: 'alice' }));
      await assertFails(deleteDoc(doc(forged, path)));
    });
  }
  it('denies listing rooms', async () => {
    const db = environment.authenticatedContext('alice').firestore();
    await assertFails(getDocs(collection(db, 'rooms')));
  });
});
