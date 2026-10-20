import type { CalendarEvent } from './unifiedCalendar';

/**
 * M4b ROOM / BUSY_ONLY client-side parser. SECURITY BOUNDARY NOTICE:
 * This is only defensive presentation validation. Firestore Rules and
 * trusted projection creation MUST prevent private fields reaching the
 * client at all. Do not query projections until separately authorized.
 *
 * Minimal, no-source-identity projection schema:
 * ROOM: {roomId, visibility:'ROOM', startAt, endAt, allDay, title}
 * BUSY_ONLY: {roomId, visibility:'BUSY_ONLY', startAt, endAt, allDay}
 */
export type RoomProjection =
  | Readonly<{
      roomId: string;
      visibility: 'ROOM';
      start: Date;
      end: Date;
      allDay: boolean;
      title: string;
    }>
  | Readonly<{
      roomId: string;
      visibility: 'BUSY_ONLY';
      start: Date;
      end: Date;
      allDay: boolean;
    }>;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function keysAreExactly(record: UnknownRecord, required: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === required.length &&
    required.every(key => Object.hasOwn(record, key));
}

function timestamp(value: unknown): Date | null {
  // Firestore document fields are Timestamp objects. For offline tests
  // accept a Date as well. Reject strings/numbers and invalid dates.
  let date: unknown = value;
  if (typeof value === 'object' && value !== null &&
      'toDate' in value && typeof value.toDate === 'function') {
    try { date = (value as {toDate(): unknown}).toDate(); }
    catch { return null; }
  }
  return date instanceof Date && Number.isFinite(date.getTime())
    ? new Date(date.getTime())
    : null;
}

export function parseRoomProjection(
  raw: unknown, expectedRoomId: string,
): RoomProjection | null {
  if (!expectedRoomId || expectedRoomId.length > 120) return null;
  const data = asRecord(raw);
  if (!data || data.roomId !== expectedRoomId ||
      (data.visibility !== 'ROOM' && data.visibility !== 'BUSY_ONLY') ||
      typeof data.allDay !== 'boolean') return null;

  const required = ['roomId','visibility','startAt','endAt','allDay'];
  if (data.visibility === 'ROOM') required.push('title');
  // Fail closed if any metadata appears in a shared projection, including
  // PRIVATE notes, source event identifiers or recipient UIDs.
  if (!keysAreExactly(data, required)) return null;

  const start = timestamp(data.startAt);
  const end = timestamp(data.endAt);
  if (!start || !end || end.getTime() <= start.getTime() ||
      end.getTime() - start.getTime() > 86_400_000) return null;

  if (data.visibility === 'ROOM') {
    if (typeof data.title !== 'string' ||
        data.title.trim() !== data.title ||
        data.title.trim().length < 1 ||
        data.title.length > 120) return null;
    return {
      roomId:expectedRoomId, visibility:'ROOM',
      start,end,allDay:data.allDay,title:data.title,
    };
  }

  return {roomId:expectedRoomId,visibility:'BUSY_ONLY',
    start,end,allDay:data.allDay};
}

/** Safe presentation mapping ONLY; never publish or authorize a document. */
export function projectionToCalendarEvent(
  projection: RoomProjection,
  projectionId: string,
  authorizedRoomName: string,
): CalendarEvent | null {
  if (!projectionId || projectionId.length > 120 ||
      !authorizedRoomName || authorizedRoomName.length > 180) return null;
  const label=projection.visibility==='BUSY_ONLY' ? 'ไม่ว่าง' : projection.title;
  return {
    id:projectionId,
    roomId:projection.roomId,
    roomName:authorizedRoomName,
    source:'room',
    title:label,
    notes:'',
    start:new Date(projection.start.getTime()),
    end:new Date(projection.end.getTime()),
    allDay:projection.allDay,
  };
}
