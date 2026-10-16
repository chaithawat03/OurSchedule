import type { User } from 'firebase/auth';
import { Timestamp, doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { firebaseClient } from './firebaseClient';
import { generateInviteToken, parseInviteToken } from '../lib/invites';

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
  // Less than 48h to account for minor client-server clock skew. Rules enforce <=48h.
  const expiresAt = Timestamp.fromMillis(Date.now() + 47 * 60 * 60 * 1000);
  await writeBatchInvite();
  return token;

  async function writeBatchInvite(): Promise<void> {
    const ref = doc(db, 'roomInvites', token);
    const batch = writeBatch(db);
    batch.set(ref, {
      roomId,
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      expiresAt,
      state: 'pending',
      acceptedByUid: null,
      acceptedAt: null,
    });
    await batch.commit();
  }
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
