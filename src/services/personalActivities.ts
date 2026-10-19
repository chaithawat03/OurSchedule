import type { User } from 'firebase/auth';
import {
  addDoc, collection, doc, getDocs, limit, query, serverTimestamp,
  Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { firebaseClient } from './firebaseClient';
import { monthReadWindow, validateActivity } from '../lib/activityDates';

export interface PersonalActivity {
  id: string;
  title: string;
  notes: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

export interface PersonalActivityInput {
  title: string;
  notes: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

function personalCollection(user: User) {
  if (!firebaseClient || !user.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  return collection(firebaseClient.db, 'users', user.uid, 'personalEvents');
}

export async function listPersonalActivities(
  user: User, year: number, monthIndex: number, multi: boolean,
): Promise<{ events: PersonalActivity[]; truncated: boolean }> {
  const { start, end, scanStart } = monthReadWindow(year, monthIndex, multi);
  const result = await getDocs(query(
    personalCollection(user),
    where('startAt', '>=', Timestamp.fromDate(scanStart)),
    where('startAt', '<', Timestamp.fromDate(end)),
    limit(100),
  ));
  const events = result.docs.flatMap((item) => {
    const data = item.data();
    if (data.status !== 'active' ||
        !(data.startAt instanceof Timestamp) || !(data.endAt instanceof Timestamp)) return [];
    const begins = data.startAt.toDate();
    const ends = data.endAt.toDate();
    if (begins >= end || ends <= start) return [];
    return [{
      id: item.id,
      title: String(data.title),
      notes: String(data.notes),
      start: begins,
      end: ends,
      allDay: data.allDay === true,
    }];
  }).sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, truncated: result.size === 100 };
}

export async function savePersonalActivity(user: User, input: PersonalActivityInput, id?: string) {
  const { title, notes } = validateActivity(input);
  const base = {
    title, notes,
    startAt: Timestamp.fromDate(input.start),
    endAt: Timestamp.fromDate(input.end),
    allDay: input.allDay,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    if (!firebaseClient) throw new Error('Firebase ยังไม่พร้อม');
    await updateDoc(doc(firebaseClient.db, 'users', user.uid, 'personalEvents', id), base);
  } else {
    await addDoc(personalCollection(user), {
      ...base, ownerUid: user.uid, creatorUid: user.uid,
      timezone: 'Asia/Bangkok', visibility: 'PRIVATE', status: 'active',
      createdAt: serverTimestamp(),
    });
  }
}

export async function cancelPersonalActivity(user: User, id: string) {
  if (!firebaseClient) throw new Error('Firebase ยังไม่พร้อม');
  await updateDoc(doc(firebaseClient.db, 'users', user.uid, 'personalEvents', id), {
    status: 'cancelled', updatedAt: serverTimestamp(),
  });
}
