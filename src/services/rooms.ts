import type { User } from 'firebase/auth';
import {
  collection, collectionGroup, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, where,
} from 'firebase/firestore';
import { firebaseClient } from './firebaseClient';
import { validateRoomName } from '../lib/roomName';
import { consumeQuota } from './quota';

export interface OwnedRoom {
  id: string;
  name: string;
  assignmentPolicy: 'AUTO_ASSIGN' | 'REQUIRE_ACCEPTANCE';
  defaultVisibility: 'ROOM' | 'BUSY_ONLY' | 'PRIVATE';
}

function dbForUser(user: User) {
  if (!firebaseClient || !user.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  return firebaseClient.db;
}

export async function createOwnedRoom(user: User, nameInput: string): Promise<string> {
  const db = dbForUser(user);
  const name = validateRoomName(nameInput);
  const roomRef = doc(collection(db, 'rooms'));
  const ownerMemberRef = doc(db, 'rooms', roomRef.id, 'members', user.uid);
  await runTransaction(db, async (transaction) => {
    // All reads must happen before any transaction writes.
    const quota = await consumeQuota(transaction, db, user.uid, 'rooms', roomRef.id);
    transaction.set(quota.ref, quota.next);
    transaction.set(roomRef, {
      ownerUid: user.uid,
      name,
      assignmentPolicy: 'REQUIRE_ACCEPTANCE',
      defaultVisibility: 'PRIVATE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(ownerMemberRef, {
      uid: user.uid,
      role: 'owner',
      membershipState: 'active',
      joinedAt: serverTimestamp(),
    });
  });
  return roomRef.id;
}

export async function listOwnedRooms(user: User): Promise<OwnedRoom[]> {
  const db = dbForUser(user);
  const results = await getDocs(query(collection(db, 'rooms'), where('ownerUid', '==', user.uid), limit(20)));
  return results.docs.map((snapshot) => ({
    id: snapshot.id,
    name: String(snapshot.data().name),
    assignmentPolicy: snapshot.data().assignmentPolicy as OwnedRoom['assignmentPolicy'],
    defaultVisibility: snapshot.data().defaultVisibility as OwnedRoom['defaultVisibility'],
  })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
}


export interface JoinedRoom {
  id: string;
  name: string;
}

export async function listJoinedRooms(user: User): Promise<JoinedRoom[]> {
  const db = dbForUser(user);
  // Firestore Rules authorize only the UID's own active membership docs.
  // The composite collection-group index is declared in firestore.indexes.json.
  const memberships = await getDocs(query(
    collectionGroup(db, 'members'),
    where('uid', '==', user.uid),
    where('role', '==', 'member'),
    where('membershipState', '==', 'active'),
    limit(20),
  ));
  const joined = memberships.docs.filter((item) => item.data().role === 'member' && item.data().membershipState === 'active');
  const rooms = await Promise.all(joined.map(async (membership) => {
    const roomRef = membership.ref.parent.parent;
    if (!roomRef || roomRef.parent.id !== 'rooms') return null;
    const result = await getDoc(roomRef);
    return result.exists() ? { id: result.id, name: String(result.data().name) } : null;
  }));
  return rooms.filter((room): room is JoinedRoom => room !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}
