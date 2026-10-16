import type { User } from 'firebase/auth';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { firebaseClient } from './firebaseClient';
import { generateInviteToken, parseInviteToken } from '../lib/invites';
import { consumeQuota } from './quota';

function dbFor(user: User) {
  if (!firebaseClient || !user.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  return firebaseClient.db;
}

export interface InviteSummary {
  token: string;
  roomId: string;
  state: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date;
}

export async function createRoomInvite(user: User, roomId: string): Promise<string> {
  const db = dbFor(user);
  const token = generateInviteToken();
  const ref = doc(db, 'roomInvites', token);
  await runTransaction(db, async (transaction) => {
    const quota = await consumeQuota(transaction, db, user.uid, 'invites', token);
    // Server Rules validate expiry, issuer and ownership, not client trust.
    const expiresAt = Timestamp.fromMillis(Date.now() + 47 * 60 * 60 * 1000);
    transaction.set(quota.ref, quota.next);
    transaction.set(ref, {
      roomId,
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      expiresAt,
      state: 'pending',
      acceptedByUid: null,
      acceptedAt: null,
    });
  });
  return token;
}

export async function inspectRoomInvite(user: User, rawToken: string): Promise<InviteSummary> {
  const db = dbFor(user);
  const token = parseInviteToken(rawToken);
  const snapshot = await getDoc(doc(db, 'roomInvites', token));
  if (!snapshot.exists()) throw new Error('ไม่พบคำเชิญนี้');
  const value = snapshot.data();
  if (!['pending', 'accepted', 'revoked'].includes(value.state) || !(value.expiresAt instanceof Timestamp))
    throw new Error('ข้อมูลคำเชิญไม่ถูกต้อง');
  return { token, roomId: String(value.roomId), state: value.state as InviteSummary['state'], expiresAt: value.expiresAt.toDate() };
}

export async function acceptRoomInvite(user: User, rawToken: string): Promise<string> {
  const db = dbFor(user);
  const invite = await inspectRoomInvite(user, rawToken);
  if (invite.state !== 'pending' || invite.expiresAt.getTime() <= Date.now())
    throw new Error('คำเชิญถูกใช้ ยกเลิก หรือหมดอายุแล้ว');
  const batch = writeBatch(db);
  batch.update(doc(db, 'roomInvites', invite.token), {
    state: 'accepted',
    acceptedByUid: user.uid,
    acceptedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'rooms', invite.roomId, 'members', user.uid), {
    uid: user.uid, role: 'member', membershipState: 'active',
    joinedAt: serverTimestamp(), inviteId: invite.token,
  });
  await batch.commit();
  return invite.roomId;
}

export async function revokeRoomInvite(user: User, token: string): Promise<void> {
  const db = dbFor(user);
  await updateDoc(doc(db, 'roomInvites', parseInviteToken(token)), { state: 'revoked' });
}

export interface RoomMember {
  uid: string;
  role: 'owner' | 'member';
}

export async function listRoomMembers(owner: User, roomId: string): Promise<RoomMember[]> {
  const db = dbFor(owner);
  const result = await getDocs(query(collection(db, 'rooms', roomId, 'members'), limit(20)));
  return result.docs.map((item) => ({ uid: item.id, role: item.data().role as RoomMember['role'] }));
}

export async function removeRoomMember(owner: User, roomId: string, memberUid: string): Promise<void> {
  const db = dbFor(owner);
  if (!memberUid || memberUid === owner.uid) throw new Error('ไม่สามารถลบเจ้าของห้องได้');
  await deleteDoc(doc(db, 'rooms', roomId, 'members', memberUid));
}

export async function leaveRoom(member: User, roomId: string): Promise<void> {
  const db = dbFor(member);
  await deleteDoc(doc(db, 'rooms', roomId, 'members', member.uid));
}
