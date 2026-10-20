import type { PersonalActivity } from '../services/personalActivities';

export interface CalendarEvent extends PersonalActivity {
  source: 'personal' | 'room';
  roomId?: string;
  roomName?: string;
}

/**
 * Pure presentation layer. Firestore permissions MUST be enforced by the data
 * loader using owner-only list or member-only accepted event direct get.
 * Hidden room IDs affect presentation only, not Firestore authorization.
 */
export function mergedCalendarEvents(
  personal: PersonalActivity[],
  roomEvents: CalendarEvent[],
  hiddenRoomIds: ReadonlySet<string>,
): CalendarEvent[] {
  const entries: CalendarEvent[] = personal.map((activity) => ({
    ...activity, source: 'personal',
  }));
  for (const event of roomEvents) {
    if (event.source !== 'room' || !event.roomId || !event.roomName ||
        hiddenRoomIds.has(event.roomId)) continue;
    entries.push(event);
  }
  return entries.sort((a,b) =>
    a.start.getTime()-b.start.getTime() ||
    a.end.getTime()-b.end.getTime() ||
    a.source.localeCompare(b.source) ||
    a.id.localeCompare(b.id)
  );
}

export type CalendarRoom = { id: string; name: string; role: 'owner' | 'member' };
export const ROOM_CALENDAR_LIMIT = 12;

/** A room whose membership is no longer active must never remain selectable. */
export function activeCalendarRooms(owned: CalendarRoom[], joined: CalendarRoom[]): CalendarRoom[] {
  const map = new Map<string,CalendarRoom>();
  for (const room of [...owned,...joined]) {
    if (!room.id || !room.name || map.has(room.id)) continue;
    map.set(room.id,room);
  }
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'th') ||
    a.id.localeCompare(b.id));
}
