/**
 * Test-only diagnostics inside a local Vite DEV page pointing to isolated
 * demo Firebase Emulators. Must never be imported from a deployed build.
 */
import { FirebaseError } from 'firebase/app';
import { signInAnonymously } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp,
  updateDoc, where,
} from 'firebase/firestore';
import { firebaseClient } from '../services/firebaseClient';

type ReadOutcome = 'ok' | 'denied' | 'missing';
type WriteOutcome = 'allowed' | 'denied';
interface TestBridge {
  signIn(): Promise<void>;
  uid(): string;
  ownedRoomId(name: string): Promise<string | null>;
  roomEventId(roomId: string, title: string): Promise<string | null>;
  readEvent(roomId: string, eventId: string): Promise<ReadOutcome>;
  readRoom(roomId: string): Promise<ReadOutcome>;
  listEvents(roomId: string): Promise<ReadOutcome>;
  reaccept(eventId: string): Promise<WriteOutcome>;
  joinedRoomCount(): Promise<number>;
}
declare global {
  interface Window { __ourscheduleE2e?: TestBridge }
}
function requireClient() {
  if (!firebaseClient || !firebaseClient.auth.currentUser) {
    throw new Error('Emulator test identity is not signed in');
  }
  return {
    db: firebaseClient.db,
    auth: firebaseClient.auth,
    uid: firebaseClient.auth.currentUser.uid,
  };
}
async function readResult(operation: () => Promise<boolean>): Promise<ReadOutcome> {
  try { return await operation() ? 'ok' : 'missing'; } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') return 'denied';
    throw error;
  }
}
export function installE2eBridge() {
  if (import.meta.env.PROD || import.meta.env.VITE_E2E_EMULATORS !== '1' ||
    import.meta.env.VITE_FIREBASE_PROJECT_ID !== 'demo-ourschedule-e2e' ||
    !firebaseClient) throw new Error('Attempt to install E2E test bridge outside demo emulators');

  window.__ourscheduleE2e = {
    async signIn() {
      await signInAnonymously(firebaseClient.auth);
    },
    uid() { return requireClient().uid; },
    async ownedRoomId(name) {
      const { db, uid } = requireClient();
      const result = await getDocs(query(
        collection(db, 'rooms'), where('ownerUid', '==', uid), limit(20),
      ));
      return result.docs.find((entry) => entry.data().name === name)?.id ?? null;
    },
    async roomEventId(roomId, title) {
      const { db, uid } = requireClient();
      const result = await getDocs(query(
        collection(db, 'rooms', roomId, 'events'),
        where('creatorUid', '==', uid), limit(20),
      ));
      return result.docs.find((entry) => entry.data().title === title)?.id ?? null;
    },
    async readEvent(roomId, eventId) {
      const { db } = requireClient();
      return readResult(async () =>
        (await getDoc(doc(db, 'rooms', roomId, 'events', eventId))).exists());
    },
    async readRoom(roomId) {
      const { db } = requireClient();
      return readResult(async () => (await getDoc(doc(db, 'rooms', roomId))).exists());
    },
    async listEvents(roomId) {
      const { db } = requireClient();
      return readResult(async () => {
        await getDocs(query(collection(db, 'rooms', roomId, 'events'), limit(20)));
        return true;
      });
    },
    async reaccept(eventId) {
      const { db, uid } = requireClient();
      try {
        await updateDoc(doc(db, 'users', uid, 'roomActivityInvites', eventId), {
          state: 'ACCEPTED', updatedAt: serverTimestamp(),
        });
        return 'allowed';
      } catch (error) {
        if (error instanceof FirebaseError && error.code === 'permission-denied') return 'denied';
        throw error;
      }
    },
    async joinedRoomCount() {
      const { db, uid } = requireClient();
      const entries = await getDocs(query(
        collection(db, 'rooms'), where('ownerUid', '==', uid), limit(20),
      ));
      return entries.size; // Used for Owner room creation checks only.
    },
  };
}
