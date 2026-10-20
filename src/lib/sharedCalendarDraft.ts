import { Timestamp } from 'firebase/firestore';
import { parseRoomProjection } from './roomProjection';

/**
 * Only used in the isolated Phase2b Preview. This creates NEW room-shared
 * appointments; it never reads, copies or reclassifies PRIVATE assignments.
 */
export type PublishSharedInput = {
  visibility: 'ROOM' | 'BUSY_ONLY';
  start: Date;
  end: Date;
  allDay: boolean;
  title?: string;
};

/** Exact public document schema verified by experimental emulator Rules. */
export function toSharedCalendarDocument(roomId: string, input: PublishSharedInput) {
  if (!roomId || roomId.length > 50) throw new Error('รหัสห้องไม่ถูกต้อง');
  if (input.visibility !== 'ROOM' && input.visibility !== 'BUSY_ONLY') {
    throw new Error('ไม่อนุญาตเผยแพร่ PRIVATE ผ่านปฏิทินห้อง');
  }
  if (typeof input.allDay !== 'boolean') throw new Error('รูปแบบวันที่ไม่ถูกต้อง');
  const title=input.visibility==='ROOM' ? input.title?.trim() : undefined;
  if (input.visibility==='ROOM' && (!title || title.length > 120)) {
    throw new Error('ชื่อกิจกรรมต้องมี 1–120 ตัวอักษร');
  }
  const document = {
    roomId,
    visibility:input.visibility,
    startAt:Timestamp.fromDate(input.start),
    endAt:Timestamp.fromDate(input.end),
    allDay:input.allDay,
    ...(input.visibility==='ROOM' ? {title} : {}),
  };
  // Reuse the read model's strict exact-shape/time constraint before sending
  // anything to Firestore. Server Rules must verify independently.
  if (!parseRoomProjection(document,roomId)) {
    throw new Error('ข้อมูลกิจกรรมที่เผยแพร่ไม่ถูกต้อง');
  }
  return document;
}
