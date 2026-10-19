import { readFileSync } from 'node:fs';
import { before, after, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-ourschedule-ci',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { if (environment) await environment.cleanup(); });

const userDb = (uid) => environment.authenticatedContext(uid).firestore();
const from = Timestamp.fromDate(new Date('2026-10-19T09:00:00+07:00'));
const until = Timestamp.fromDate(new Date('2026-10-19T10:00:00+07:00'));
const event = (uid, extra = {}) => ({
  ownerUid: uid, creatorUid: uid, title: 'Personal meeting', notes: '',
  startAt: from, endAt: until, allDay: false, timezone: 'Asia/Bangkok',
  visibility: 'PRIVATE', status: 'active',
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  ...extra,
});
const path = (uid, id) => 'users/' + uid + '/personalEvents/' + id;

describe('M3.1 personal private activity Security Rules', () => {
  it('allows owner to create/read only own scoped events', async () => {
    const db = userDb('activity-owner');
    await assertSucceeds(setDoc(doc(db, path('activity-owner', 'activity-1')), event('activity-owner')));
    const snapshot = await assertSucceeds(getDoc(doc(db, path('activity-owner', 'activity-1'))));
    if (snapshot.data()?.visibility !== 'PRIVATE') throw new Error('Private event missing');
    const result = await assertSucceeds(getDocs(query(collection(db, 'users/activity-owner/personalEvents'),
      where('startAt', '>=', from), limit(100))));
    if (result.size !== 1) throw new Error('Owner calendar query mismatch');
  });

  it('denies anonymous, cross-UID, and forged Admin/Owner access', async () => {
    const uid = 'activity-protected';
    await assertSucceeds(setDoc(doc(userDb(uid), path(uid, 'a')), event(uid)));
    const attacker = environment.authenticatedContext('evil', { role: 'owner', admin: true }).firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    for (const bad of [attacker, anonymous]) {
      await assertFails(getDoc(doc(bad, path(uid, 'a'))));
      await assertFails(getDocs(query(collection(bad, 'users/' + uid + '/personalEvents'), limit(2))));
      await assertFails(setDoc(doc(bad, path(uid, 'b')), event(uid)));
      await assertFails(updateDoc(doc(bad, path(uid, 'a')), { title: 'stolen', updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(doc(bad, path(uid, 'a'))));
    }
  });

  it('blocks unbounded scans, oversized queries and collection-group discovery', async () => {
    const db = userDb('activity-queries');
    await assertFails(getDocs(collection(db, 'users/activity-queries/personalEvents')));
    await assertFails(getDocs(query(collection(db, 'users/activity-queries/personalEvents'), limit(101))));
    await assertSucceeds(getDocs(query(collection(db, 'users/activity-queries/personalEvents'), limit(100))));
    await assertFails(getDocs(query(collection(db, 'users/other/personalEvents'), limit(1))));
  });

  it('rejects role injection, forged ownership, visibility sharing and unsafe data', async () => {
    const db = userDb('activity-validation');
    for (const change of [
      { ownerUid: 'someone-else' }, { creatorUid: 'someone-else' },
      { visibility: 'ROOM' }, { visibility: 'BUSY_ONLY' },
      { role: 'admin' }, { title: '' }, { notes: 'N'.repeat(2001) },
      { timezone: 'UTC' }, { allDay: 'yes' },
      { status: 'cancelled' },
      { startAt: until, endAt: from },
      { endAt: Timestamp.fromDate(new Date('2026-10-21T10:00:00+07:00')) },
      { createdAt: Timestamp.fromMillis(1234) },
    ]) {
      await assertFails(setDoc(doc(db, path('activity-validation', 'bad')), event('activity-validation', change)));
    }
  });

  it('allows own edits but makes immutable identity/timestamps unchangeable', async () => {
    const uid = 'activity-editor';
    const db = userDb(uid);
    const ref = doc(db, path(uid, 'edit'));
    await assertSucceeds(setDoc(ref, event(uid)));
    await assertSucceeds(updateDoc(ref, { title: 'Edited', notes: 'Private notes', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { creatorUid: 'other', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { ownerUid: 'other', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { visibility: 'ROOM', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { updatedAt: Timestamp.fromMillis(100) }));
    await assertFails(deleteDoc(ref));
  });

  it('cancel transition is one-way, no content edits in cancellation batch', async () => {
    const uid = 'activity-cancelled';
    const db = userDb(uid);
    const ref = doc(db, path(uid, 'cancel'));
    await assertSucceeds(setDoc(ref, event(uid)));
    await assertFails(updateDoc(ref, {
      status: 'cancelled', title: 'sneaky edit', updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(ref, { status: 'cancelled', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'active', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { title: 'edit after cancelled', updatedAt: serverTimestamp() }));
  });

  it('protects nested personal event details and room shared paths', async () => {
    const db = userDb('activity-private');
    await assertFails(setDoc(doc(db, 'users/activity-private/personalEvents/x/details/main'), { title: 'leak' }));
    await assertFails(getDoc(doc(db, 'users/activity-private/personalEvents/x/details/main')));
    await assertFails(setDoc(doc(db, 'rooms/any-room/events/any-event'), { title: 'leak' }));
    await assertFails(getDoc(doc(db, 'rooms/any-room/calendarProjections/any')));
  });
});
