import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-ourschedule-ci',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { if (environment) await environment.cleanup(); });

const profile = () => ({
  displayName: 'Demo account',
  avatar: '',
  locale: 'th-TH',
  timezone: 'Asia/Bangkok',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

describe('M1 user profile privacy', () => {
  it('allows a signed-in user to create and get only their own profile', async () => {
    const db = environment.authenticatedContext('profile-owner').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/profile-owner'), profile()));
    const result = await assertSucceeds(getDoc(doc(db, 'users/profile-owner')));
    if (!result.exists()) throw new Error('Own profile was not created');
  });

  it('allows safe profile edits but keeps createdAt immutable', async () => {
    const db = environment.authenticatedContext('profile-editor').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/profile-editor'), profile()));
    await assertSucceeds(updateDoc(doc(db, 'users/profile-editor'), {
      displayName: 'Changed name',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, 'users/profile-editor'), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, 'users/profile-editor'), {
      role: 'admin',
      updatedAt: serverTimestamp(),
    }));
  });

  it('denies anonymous and cross-UID reads and writes even with forged owner claim', async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    const attacker = environment.authenticatedContext('attacker', { role: 'owner' }).firestore();
    await assertFails(getDoc(doc(anonymous, 'users/victim')));
    await assertFails(getDoc(doc(attacker, 'users/victim')));
    await assertFails(setDoc(doc(attacker, 'users/victim'), profile()));
    await assertFails(deleteDoc(doc(attacker, 'users/victim')));
  });

  it('blocks profile schema injection and client-supplied timestamps', async () => {
    const db = environment.authenticatedContext('profile-schema').firestore();
    await assertFails(setDoc(doc(db, 'users/profile-schema'), { ...profile(), role: 'owner' }));
    await assertFails(setDoc(doc(db, 'users/profile-schema'), {
      ...profile(), createdAt: new Date('2026-01-01T00:00:00Z'),
    }));
    await assertFails(setDoc(doc(db, 'users/profile-schema'), {
      ...profile(), displayName: '',
    }));
  });

  it('denies profile listing and deletion', async () => {
    const db = environment.authenticatedContext('list-owner').firestore();
    await assertFails(getDocs(collection(db, 'users')));
    await assertSucceeds(setDoc(doc(db, 'users/list-owner'), profile()));
    await assertFails(deleteDoc(doc(db, 'users/list-owner')));
  });

  it('denies unbounded personal event listing and malformed creation', async () => {
    const db = environment.authenticatedContext('calendar-owner').firestore();
    await assertFails(getDocs(collection(db, 'users/calendar-owner/personalEvents')));
    await assertFails(setDoc(doc(db, 'users/calendar-owner/personalEvents/a'), { title: 'Private' }));
  });
});
