import {describe,expect,it} from 'vitest';
import { bangkokInstant } from './activityDates';
import { mergedCalendarEvents, activeCalendarRooms, ROOM_CALENDAR_LIMIT,
  type CalendarEvent } from './unifiedCalendar';
import type { PersonalActivity } from '../services/personalActivities';

const at = (time:string)=>bangkokInstant('2026-10-20T'+time);
const personal:PersonalActivity={id:'same-id',title:'ส่วนตัว',notes:'PRIVATE',
  start:at('10:00'),end:at('11:00'),allDay:false};
const rooms:CalendarEvent[]=[
  {id:'same-id',roomId:'room-a',roomName:'ทีม A',source:'room',title:'A',
    notes:'SECRET A',start:at('09:00'),end:at('10:00'),allDay:false},
  {id:'room-b-event',roomId:'room-b',roomName:'ทีม B',source:'room',title:'B',
    notes:'SECRET B',start:at('11:00'),end:at('12:00'),allDay:false},
];
describe('M4 private room calendar display filters',()=>{
  it('always includes personal events and filters room data only by full room ID',()=>{
    const entries=mergedCalendarEvents([personal],rooms,new Set(['room-b']));
    expect(entries.map(x=>[x.source,x.title])).toEqual([
      ['room','A'],['personal','ส่วนตัว'],
    ]);
    expect(entries.find(x=>x.source==='personal')?.notes).toBe('PRIVATE');
    expect(entries.some(x=>x.notes==='SECRET B')).toBe(false);
  });
  it('hiding both rooms never hides personal activities and does not mutate inputs',()=>{
    const original=rooms.map(x=>x.title);
    expect(mergedCalendarEvents([personal],rooms,new Set(['room-a','room-b'])))
      .toMatchObject([{id:'same-id',source:'personal'}]);
    expect(rooms.map(x=>x.title)).toEqual(original);
  });
  it('rejects badly shaped room entries and sorts overlapping sources consistently',()=>{
    const forged={...rooms[0],roomId:undefined};
    expect(mergedCalendarEvents([], [forged],new Set())).toEqual([]);
    const result=mergedCalendarEvents([personal],[rooms[1]],new Set());
    expect(result.map(x=>x.title)).toEqual(['ส่วนตัว','B']);
  });
  it('room deduplication prefers own membership and preserves full IDs',()=>{
    const id='actual-room-123456789';
    const roomList=activeCalendarRooms(
      [{id,name:'Owner Room',role:'owner'}],
      [{id,name:'Fake duplicate',role:'member'},{id:'second',name:'Other',role:'member'}],
    );
    expect(roomList.find(x=>x.id===id)?.role).toBe('owner');
    expect(roomList).toHaveLength(2);
    expect(ROOM_CALENDAR_LIMIT).toBeLessThanOrEqual(20);
  });
});
