import { describe,expect,it } from 'vitest';
import { parseRoomProjection,projectionToCalendarEvent } from './roomProjection';

const start = new Date('2026-10-20T02:00:00.000Z');
const end = new Date('2026-10-20T03:00:00.000Z');
const room = 'room-primary';
const busy = () => ({
  roomId:room,visibility:'BUSY_ONLY' as const,
  startAt:new Date(start),endAt:new Date(end),allDay:false,
});
const detailed = () => ({...busy(),visibility:'ROOM' as const,title:'ประชุมทีม'});

describe('M4b minimal calendar projection contract (disabled until Rules rollout)',()=>{
  it('converts valid BUSY_ONLY to a generic label without owner/recipient or notes',()=>{
    const value=parseRoomProjection(busy(),room);
    expect(value?.visibility).toBe('BUSY_ONLY');
    expect(value && projectionToCalendarEvent(value,'opaque-id','ห้องส่วนตัว')).toMatchObject({
      source:'room',roomId:room,roomName:'ห้องส่วนตัว',title:'ไม่ว่าง',
      notes:'',start,end,allDay:false,
    });
  });

  it('ROOM carries only explicitly published title and time',()=>{
    const value=parseRoomProjection(detailed(),room);
    expect(value?.visibility).toBe('ROOM');
    if(!value) throw new Error('ROOM rejected unexpectedly');
    const event=projectionToCalendarEvent(value,'opaque','ห้องหลัก');
    expect(event?.title).toBe('ประชุมทีม');
    expect(event?.notes).toBe('');
  });

  it('rejects PRIVATE and all unspecified fields even on otherwise valid ROOM and BUSY_ONLY',()=>{
    const privateProjection={...busy(),visibility:'PRIVATE'};
    expect(parseRoomProjection(privateProjection,room)).toBeNull();
    for(const leaked of [
      {notes:'sensitive'}, {recipientUid:'other'}, {sourceEventId:'event-secret'},
      {creatorUid:'owner'}, {email:'someone@example.test'}, {title:'secret'},
      {status:'cancelled'}, {ownerUid:'owner'}, {metadata:{title:'secret'}},
    ]) expect(parseRoomProjection({...busy(),...leaked},room)).toBeNull();
    for(const leaked of [
      {notes:'medical note'}, {recipientUid:'someone'}, {sourceEventId:'event-id'},
      {creatorUid:'someone'}, {status:'cancelled'}, {location:'home'},
    ]) expect(parseRoomProjection({...detailed(),...leaked},room)).toBeNull();
  });

  it('rejects cross-room data and forged object shapes',()=>{
    for(const item of [
      null,undefined,[],42,'BUSY_ONLY',{},
      {...busy(),roomId:'different-room'}, {...busy(),allDay:'false'},
      {...busy(),visibility:'BOTH'},
      {...detailed(),title:''},{...detailed(),title:'  meeting'},
      {...detailed(),title:'x'.repeat(121)},
    ]) expect(parseRoomProjection(item,room)).toBeNull();
    expect(parseRoomProjection(busy(),'')).toBeNull();
  });

  it('enforces exclusive times, bounded duration, and valid Firestore Timestamps',()=>{
    for(const pair of [
      [end,start],[start,start],
      [new Date('invalid'),end],
      [start,new Date(start.getTime()+86_400_001)],
      ['2026-10-20',end],[1,end],
    ]) expect(parseRoomProjection({...busy(),startAt:pair[0],endAt:pair[1]},room)).toBeNull();

    const timeStamp={toDate:()=>new Date(start.getTime())};
    const untilStamp={toDate:()=>new Date(end.getTime())};
    const data=parseRoomProjection({...busy(),startAt:timeStamp,endAt:untilStamp},room);
    expect(data?.start).toEqual(start);
    expect(data?.end).toEqual(end);
    expect(parseRoomProjection({...busy(),startAt:{toDate:()=>{throw Error('invalid');}}},room)).toBeNull();
  });

  it('does not return references to mutable Date instances',()=>{
    const input=busy();
    const data=parseRoomProjection(input,room);
    expect(data).not.toBeNull();
    input.startAt.setUTCFullYear(2040);
    expect(data?.start).toEqual(start);
    if(data){
      const displayed=projectionToCalendarEvent(data,'opaque','room');
      data.start.setUTCFullYear(2030);
      expect(displayed?.start).toEqual(start);
    }
  });

  it('rejects missing/oversized projection identifiers and room labels',()=>{
    const value=parseRoomProjection(busy(),room);
    if(!value)throw new Error('Missing projection');
    expect(projectionToCalendarEvent(value,'','room')).toBeNull();
    expect(projectionToCalendarEvent(value,'id','')).toBeNull();
    expect(projectionToCalendarEvent(value,'x'.repeat(121),'room')).toBeNull();
    expect(projectionToCalendarEvent(value,'id','x'.repeat(181))).toBeNull();
  });
});
