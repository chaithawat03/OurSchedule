import type { User } from 'firebase/auth';
import { listOwnedRooms, listJoinedRooms } from './rooms';
import {
  getAssignedPrivateRoomActivity, listOwnedRoomActivities,
  listRoomActivityInvitations,
} from './roomActivities';
import { monthReadWindow } from '../lib/activityDates';
import { activeCalendarRooms, ROOM_CALENDAR_LIMIT,
  type CalendarRoom, type CalendarEvent } from '../lib/unifiedCalendar';

type RoomCalendarResult = {
  rooms: CalendarRoom[];
  events: CalendarEvent[];
  truncated: boolean;
};

/**
 * M4a private-only unified calendar.
 * - Owner reads ONLY their created private assignments via the existing
 *   creatorUid-bound, 20-limit query (with paired status read).
 * - Recipient lists ONLY their own 20-limit inbox, then does a direct GET
 *   against each ACCEPTED room event. Firestore Rules must re-check active
 *   membership, accepted state and event not cancelled.
 * - NEVER list other users' inboxes, arbitrary room events, or any
 *   ROOM/BUSY_ONLY projection; they are not implemented or authorized.
 */
export async function listPrivateRoomCalendar(
  user: User, year: number, monthIndex: number, multi: boolean,
): Promise<RoomCalendarResult> {
  if (!user.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  const [{ start, end, scanStart }, owned, joined, inbox] = await Promise.all([
    Promise.resolve(monthReadWindow(year, monthIndex, multi)),
    listOwnedRooms(user), listJoinedRooms(user),
    listRoomActivityInvitations(user),
  ]);
  const allRooms = activeCalendarRooms(
    owned.map(room => ({id:room.id,name:room.name,role:'owner' as const})),
    joined.map(room => ({id:room.id,name:room.name,role:'member' as const})),
  );
  const rooms = allRooms.slice(0,ROOM_CALENDAR_LIMIT);
  const allowed = new Map(rooms.map(room=>[room.id,room]));
  const accepted = inbox.filter(item=>
    item.state==='ACCEPTED' &&
    allowed.get(item.roomId)?.role==='member' &&
    item.start < end && item.end > start
  );

  // Owner list is explicitly bound to creator and limited by existing Rules.
  const ownerLists = await Promise.all(rooms.filter(room=>room.role==='owner').map(
    async room=>({room, events:await listOwnedRoomActivities(user,room.id)}),
  ));
  // Accepted private recipient can only fetch by ID; a general room events
  // collection query would fail Rules and leak hidden private existence.
  const recipientEvents = await Promise.all(accepted.map(async (invitation): Promise<CalendarEvent | null> => {
    try {
      const activity = await getAssignedPrivateRoomActivity(
        user, invitation.roomId, invitation.eventId);
      if (activity.status!=='active' || activity.start>=end || activity.end<=start) return null;
      const room=allowed.get(invitation.roomId);
      if (!room || room.role!=='member') return null;
      return {
        id:activity.id, source:'room' as const, roomId:room.id,roomName:room.name,
        title:activity.title,notes:activity.notes,start:activity.start,end:activity.end,
        allDay:false,
      };
    } catch (reason:unknown) {
      // Revoked membership or cancelled events may be denied by Rules between
      // inbox and detail read. Never return private content after that denial.
      // Other failures must abort, rather than report incomplete data as safe.
      if (typeof reason==='object' && reason !== null && 'code' in reason &&
          (reason as {code?:unknown}).code==='permission-denied') return null;
      throw reason;
    }
  }));

  const ownerEvents: CalendarEvent[] = ownerLists.flatMap(({room,events}) =>
    events.filter(event=>
      event.status==='active' &&
      event.assignmentState==='ACCEPTED' &&
      event.start<end && event.end>start &&
      event.start<end && event.end>scanStart
    ).map(event=>({
      id:event.id,source:'room' as const,roomId:room.id,roomName:room.name,
      title:event.title,notes:event.notes,start:event.start,end:event.end,allDay:false,
    })),
  );
  return {
    rooms, events:[...ownerEvents,...recipientEvents.filter((value):value is CalendarEvent=>value!==null)],
    // Existing Firestore Rules cap 20 results per owner room and 20 recent
    // inbox records. Never imply the calendar is complete when at the cap.
    truncated:owned.length===20 || joined.length===20 ||
      allRooms.length>rooms.length || inbox.length===20 ||
      ownerLists.some(item=>item.events.length===20),
  };
}
