import { describe,expect,it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { toSharedCalendarDocument } from './sharedCalendarDraft';
import { parseRoomProjection } from './roomProjection';

const start=new Date('2026-10-20T02:00:00.000Z');
const end=new Date('2026-10-20T03:00:00.000Z');
const base={start,end,allDay:false};

describe('M4b owner-published document creation is opt-in and precisely sanitized',()=>{
  it('ROOM contains title/time only and parses with existing exact projection shape',()=>{
    const data=toSharedCalendarDocument('room-a',{
      ...base,visibility:'ROOM',title:'  ประชุมทีม  ',
    });
    expect(data).toEqual({
      roomId:'room-a',visibility:'ROOM',allDay:false,
      title:'ประชุมทีม',
      startAt:Timestamp.fromDate(start),endAt:Timestamp.fromDate(end),
    });
    expect(parseRoomProjection(data,'room-a')?.visibility).toBe('ROOM');
  });
  it('BUSY_ONLY never carries a title, even if caller accidentally supplied one',()=>{
    const data=toSharedCalendarDocument('room-a',{
      ...base,visibility:'BUSY_ONLY',title:'medical appointment',
    });
    expect(Object.hasOwn(data,'title')).toBe(false);
    expect(Object.hasOwn(data,'notes')).toBe(false);
    expect(parseRoomProjection(data,'room-a')).toMatchObject({visibility:'BUSY_ONLY'});
  });
  it('refuses PRIVATE, missing ROOM titles, invalid room ID and forged visibility',()=>{
    expect(()=>toSharedCalendarDocument('room-a',{
      ...base,visibility:'PRIVATE' as 'ROOM',
    })).toThrow(/PRIVATE/);
    expect(()=>toSharedCalendarDocument('room-a',{
      ...base,visibility:'ROOM',
    })).toThrow();
    expect(()=>toSharedCalendarDocument('',{
      ...base,visibility:'BUSY_ONLY',
    })).toThrow();
    expect(()=>toSharedCalendarDocument('x'.repeat(51),{
      ...base,visibility:'BUSY_ONLY',
    })).toThrow();
    expect(()=>toSharedCalendarDocument('room-a',{
      ...base,visibility:'ROOM',title:'x'.repeat(121),
    })).toThrow();
  });
  it('refuses malformed dates and durations longer than 24 hours',()=>{
    expect(()=>toSharedCalendarDocument('room-a',{
      visibility:'BUSY_ONLY',start:end,end:start,allDay:false,
    })).toThrow();
    expect(()=>toSharedCalendarDocument('room-a',{
      visibility:'ROOM',start,end:new Date(start.getTime()+86_400_001),
      allDay:false,title:'meeting',
    })).toThrow();
  });
});
