import type { User } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocFromServer, getDocs, limit, orderBy, query, runTransaction,
  serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { firebaseClient } from './firebaseClient';
import { validateActivity } from '../lib/activityDates';
import { consumeQuota } from './quota';

export type AssignmentState = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export interface RoomActivityInput {
  title: string;
  notes: string;
  start: Date;
  end: Date;
  allDay: boolean;
}
export interface RoomActivity {
  id: string;
  roomId: string;
  title: string;
  notes: string;
  start: Date;
  end: Date;
  recipientUid: string;
  status: 'active' | 'cancelled';
  assignmentState: AssignmentState | null;
}
export interface RoomActivityInvitation {
  eventId: string;
  roomId: string;
  creatorUid: string;
  title: string;
  start: Date;
  end: Date;
  state: AssignmentState;
}

function dbFor(user: User) {
  if (!firebaseClient || !user.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  return firebaseClient.db;
}

export async function createPrivateRoomAssignment(
  creator: User, roomId: string, recipientUid: string, input: RoomActivityInput,
): Promise<string> {
  const db = dbFor(creator);
  if (!roomId || !recipientUid || creator.uid === recipientUid) {
    throw new Error('ต้องเลือกสมาชิกคนอื่นที่อยู่ในห้องเดียวกัน');
  }
  const { title, notes } = validateActivity(input);
  const eventRef = doc(collection(db, 'rooms', roomId, 'events'));
  const inboxRef = doc(db, 'users', recipientUid, 'roomActivityInvites', eventRef.id);
  await runTransaction(db, async (transaction) => {
    // All reads (quota/room) occur before transaction writes.
    const room = await transaction.get(doc(db, 'rooms', roomId));
    if (!room.exists() || room.data().ownerUid !== creator.uid) {
      throw new Error('เฉพาะ Owner ของห้องที่สร้างคำเชิญกิจกรรมได้ในระยะนี้');
    }
    const initialState: AssignmentState =
      room.data().assignmentPolicy === 'AUTO_ASSIGN' ? 'ACCEPTED' : 'PENDING';
    const quota = await consumeQuota(transaction, db, creator.uid, 'roomEvents', roomId + '_' + eventRef.id);
    const startAt = Timestamp.fromDate(input.start);
    const endAt = Timestamp.fromDate(input.end);
    transaction.set(quota.ref, quota.next);
    transaction.set(eventRef, {
      roomId, creatorUid: creator.uid, recipientUid, title, notes,
      startAt, endAt, allDay: input.allDay,
      timezone: 'Asia/Bangkok', visibility: 'PRIVATE', status: 'active',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    transaction.set(inboxRef, {
      roomId, eventId: eventRef.id, creatorUid: creator.uid, recipientUid,
      title, startAt, endAt, state: initialState,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
  return eventRef.id;
}

export async function listOwnedRoomActivities(creator: User, roomId: string): Promise<RoomActivity[]> {
  const db = dbFor(creator);
  const result = await getDocs(query(
    collection(db, 'rooms', roomId, 'events'),
    where('creatorUid', '==', creator.uid),
    limit(20),
  ));
  const events = await Promise.all(result.docs.map(async (entry) => {
    const item = entry.data();
    if (!(item.startAt instanceof Timestamp) || !(item.endAt instanceof Timestamp)) return null;
    const recipientUid = String(item.recipientUid);
    // Creator may read just the paired inbox to show assignment status.
    const inbox = await getDoc(doc(db, 'users', recipientUid, 'roomActivityInvites', entry.id));
    return {
      id: entry.id, roomId,
      title: String(item.title), notes: String(item.notes),
      start: item.startAt.toDate(), end: item.endAt.toDate(),
      recipientUid,
      status: item.status as RoomActivity['status'],
      assignmentState: inbox.exists() ? inbox.data().state as AssignmentState : null,
    };
  }));
  return events.filter((event): event is RoomActivity => event !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function listRoomActivityInvitations(recipient: User): Promise<RoomActivityInvitation[]> {
  const db = dbFor(recipient);
  const result = await getDocs(query(
    collection(db, 'users', recipient.uid, 'roomActivityInvites'),
    orderBy('createdAt', 'desc'), limit(20),
  ));
  return result.docs.flatMap((entry) => {
    const item = entry.data();
    if (!(item.startAt instanceof Timestamp) || !(item.endAt instanceof Timestamp)) return [];
    return [{
      eventId: entry.id,
      roomId: String(item.roomId), creatorUid: String(item.creatorUid),
      title: String(item.title), start: item.startAt.toDate(), end: item.endAt.toDate(),
      state: item.state as AssignmentState,
    }];
  }).sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function decideRoomActivityInvitation(
  recipient: User, eventId: string, state: 'ACCEPTED' | 'DECLINED',
) {
  const db = dbFor(recipient);
  await updateDoc(doc(db, 'users', recipient.uid, 'roomActivityInvites', eventId), {
    state, updatedAt: serverTimestamp(),
  });
}

export async function getAssignedPrivateRoomActivity(
  recipient: User, roomId: string, eventId: string,
): Promise<RoomActivity> {
  const db = dbFor(recipient);
  const result = await getDoc(doc(db, 'rooms', roomId, 'events', eventId));
  if (!result.exists()) throw new Error('กิจกรรมถูกยกเลิกหรือไม่มีสิทธิ์เข้าถึง');
  const item = result.data();
  if (!(item.startAt instanceof Timestamp) || !(item.endAt instanceof Timestamp)) {
    throw new Error('ข้อมูลวันเวลาไม่ถูกต้อง');
  }
  return {
    id: result.id, roomId,
    title: String(item.title), notes: String(item.notes),
    start: item.startAt.toDate(), end: item.endAt.toDate(),
    recipientUid: String(item.recipientUid),
    status: item.status as RoomActivity['status'],
    assignmentState: 'ACCEPTED',
  };
}

export async function cancelRoomActivity(creator: User, roomId: string, eventId: string) {
  const db = dbFor(creator);
  await updateDoc(doc(db, 'rooms', roomId, 'events', eventId), {
    status: 'cancelled', updatedAt: serverTimestamp(),
  });
}
