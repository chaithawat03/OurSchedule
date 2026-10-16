import type { User } from 'firebase/auth';
import {
  collection, doc, getDocs, limit, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { firebaseClient } from './firebaseClient';
import { validateRoomName } from '../lib/roomName';

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
  const batch = writeBatch(db);
  batch.set(roomRef, {
    ownerUid: user.uid,
    name,
    assignmentPolicy: 'REQUIRE_ACCEPTANCE',
    defaultVisibility: 'PRIVATE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(ownerMemberRef, {
    uid: user.uid,
    role: 'owner',
    membershipState: 'active',
    joinedAt: serverTimestamp(),
  });
  await batch.commit();
  return roomRef.id;
}

export async function listOwnedRooms(user: User): Promise<OwnedRoom[]> {
  const db = dbForUser(user);
  // No unbounded or global room query. Pagination must precede lifting this cap.
  const results = await getDocs(query(collection(db, 'rooms'), where('ownerUid', '==', user.uid), limit(20)));
  return results.docs.map((snapshot) => ({
    id: snapshot.id,
    name: String(snapshot.data().name),
    assignmentPolicy: snapshot.data().assignmentPolicy as OwnedRoom['assignmentPolicy'],
    defaultVisibility: snapshot.data().defaultVisibility as OwnedRoom['defaultVisibility'],
  })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
}
