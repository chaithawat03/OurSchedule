import type { User } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDocsFromServer, limit, query,
  runTransaction,
} from 'firebase/firestore';
import { firebaseClient } from './firebaseClient';
import { consumeQuota } from './quota';
import { toSharedCalendarDocument, type PublishSharedInput } from '../lib/sharedCalendarDraft';
import { parseRoomProjection, type RoomProjection } from '../lib/roomProjection';

// Strict feature boundary: LIVE Staging Hosting builds and regular App builds
// cannot call this API. Backend read/write grants do not exist on live Rules.
function previewDb(user: User) {
  if (!user?.uid || !firebaseClient) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  if (import.meta.env.VITE_PHASE2B_PREVIEW !== '1' ||
      import.meta.env.VITE_M4B_SHARED_PREVIEW !== '1' ||
      typeof document==='undefined' ||
      document.documentElement.dataset.phase2bDatabase!=='ourschedule-e2e') {
    throw new Error('M4b ใช้งานได้เฉพาะ E2E Preview ที่แยกฐานข้อมูล');
  }
  return firebaseClient.db;
}

const NS='sharedCalendarV1';
const MAX_LIST=20;

export async function publishRoomCalendarEntry(
  owner: User, roomId: string, input: PublishSharedInput,
): Promise<string> {
  const db=previewDb(owner);
  // Only a newly CREATED, independently public record. Never accept an
  // existing PRIVATE event ID or invitation as the source of publication.
  const data=toSharedCalendarDocument(roomId,input);
  const entry=doc(collection(db,'rooms',roomId,NS));
  await runTransaction(db,async transaction=>{
    const room=await transaction.get(doc(db,'rooms',roomId));
    if(!room.exists() || room.data().ownerUid!==owner.uid) {
      throw new Error('เฉพาะเจ้าของห้องที่เผยแพร่กิจกรรมระดับห้องได้');
    }
    // All transaction reads (room and quota) precede both writes.
    const quota=await consumeQuota(
      transaction,db,owner.uid,'roomEvents','shared_'+roomId+'_'+entry.id);
    transaction.set(quota.ref,quota.next);
    transaction.set(entry,data);
  });
  return entry.id;
}

export async function listPublishedRoomCalendar(
  user: User, roomId: string,
): Promise<{entries: Array<{id:string;projection:RoomProjection}>;truncated:boolean}> {
  const db=previewDb(user);
  if (!roomId || roomId.length > 50) throw new Error('รหัสห้องไม่ถูกต้อง');
  // Mandatory server round-trip: a revoked Member cannot rely on stale
  // offline query results after their membership was deleted.
  const snapshot=await getDocsFromServer(query(
    collection(db,'rooms',roomId,NS),limit(MAX_LIST),
  ));
  const entries=snapshot.docs.map(item=>{
    const projection=parseRoomProjection(item.data(),roomId);
    if(!projection) throw new Error('ตรวจพบข้อมูลปฏิทินห้องที่ไม่ปลอดภัย');
    return {id:item.id,projection};
  });
  return {entries,truncated:snapshot.size===MAX_LIST};
}

export async function withdrawPublishedRoomEntry(
  owner: User,roomId: string,entryId:string,
): Promise<void> {
  const db=previewDb(owner);
  if(!roomId || roomId.length>50 || !entryId || entryId.length>60) {
    throw new Error('รหัสกิจกรรมไม่ถูกต้อง');
  }
  // Emulator-only Rules allow delete by current Owner; not by other Members.
  await deleteDoc(doc(db,'rooms',roomId,NS,entryId));
}
