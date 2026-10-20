import {beforeEach,describe,expect,it,vi} from 'vitest';
import {bangkokInstant} from '../lib/activityDates';
import { listPrivateRoomCalendar } from './roomCalendar';

const mocks=vi.hoisted(()=>({
  owned:vi.fn(),joined:vi.fn(),inbox:vi.fn(),ownerEvents:vi.fn(),assigned:vi.fn(),
}));
vi.mock('./rooms',()=>({
  listOwnedRooms:mocks.owned,listJoinedRooms:mocks.joined,
}));
vi.mock('./roomActivities',()=>({
  listOwnedRoomActivities:mocks.ownerEvents,
  listRoomActivityInvitations:mocks.inbox,
  getAssignedPrivateRoomActivity:mocks.assigned,
}));
const time=(v:string)=>bangkokInstant(v);
const user={uid:'synthetic-current-user'} as import('firebase/auth').User;
const own=(id:string)=>({id,name:'Owner '+id,assignmentPolicy:'REQUIRE_ACCEPTANCE',defaultVisibility:'PRIVATE'});
const accepted=(roomId:string,eventId:string,state:'PENDING'|'ACCEPTED'|'DECLINED'='ACCEPTED')=>({
  roomId,eventId,creatorUid:'owner-other',title:eventId,
  start:time('2026-10-20T09:00'),end:time('2026-10-20T10:00'),state,
});
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.owned.mockResolvedValue([]);
  mocks.joined.mockResolvedValue([]);
  mocks.inbox.mockResolvedValue([]);
  mocks.ownerEvents.mockResolvedValue([]);
  mocks.assigned.mockResolvedValue({
    id:'accepted-id',roomId:'member-room',title:'Allowed only',
    notes:'restricted',status:'active',start:time('2026-10-20T09:00'),
    end:time('2026-10-20T10:00'),recipientUid:user.uid,assignmentState:'ACCEPTED',
  });
});
describe('M4 calendar authorized private data loader',()=>{
  it('includes only accepted active owner assignments, never pending or declined',async()=>{
    mocks.owned.mockResolvedValue([own('owner-room')]);
    mocks.ownerEvents.mockResolvedValue([
      {id:'a',title:'ACCEPTED',status:'active',assignmentState:'ACCEPTED',
        notes:'owner-data',start:time('2026-10-20T12:00'),end:time('2026-10-20T13:00')},
      {id:'b',title:'PENDING',status:'active',assignmentState:'PENDING',
        start:time('2026-10-20T12:00'),end:time('2026-10-20T13:00')},
      {id:'c',title:'CANCELLED',status:'cancelled',assignmentState:'ACCEPTED',
        start:time('2026-10-20T12:00'),end:time('2026-10-20T13:00')},
      {id:'d',title:'OLDER',status:'active',assignmentState:'ACCEPTED',
        start:time('2026-09-20T12:00'),end:time('2026-09-20T13:00')},
    ]);
    const result=await listPrivateRoomCalendar(user,2026,9,false);
    expect(result.events.map(x=>x.title)).toEqual(['ACCEPTED']);
    expect(result.events[0]).toMatchObject({roomId:'owner-room',source:'room',
      notes:'owner-data'});
    expect(mocks.assigned).not.toHaveBeenCalled();
  });
  it('reads accepted inbox ONLY if membership is still active and selected',async()=>{
    mocks.joined.mockResolvedValue([{id:'member-room',name:'My second room'}]);
    mocks.inbox.mockResolvedValue([
      accepted('member-room','accepted-id'),
      accepted('member-room','pending-id','PENDING'),
      accepted('revoked-room','revoked-id'),
      accepted('member-room','declined-id','DECLINED'),
    ]);
    const result=await listPrivateRoomCalendar(user,2026,9,false);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({title:'Allowed only',roomId:'member-room'});
    expect(mocks.assigned).toHaveBeenCalledTimes(1);
    expect(mocks.assigned).toHaveBeenCalledWith(user,'member-room','accepted-id');
  });
  it('skips access-denied private recipient items after membership revocation',async()=>{
    mocks.joined.mockResolvedValue([{id:'member-room',name:'Joined'}]);
    mocks.inbox.mockResolvedValue([accepted('member-room','accepted-id')]);
    mocks.assigned.mockRejectedValue({code:'permission-denied'});
    const result=await listPrivateRoomCalendar(user,2026,9,false);
    expect(result.events).toEqual([]);
  });
  it('fails closed on network failures rather than showing stale private data',async()=>{
    mocks.joined.mockResolvedValue([{id:'member-room',name:'Joined'}]);
    mocks.inbox.mockResolvedValue([accepted('member-room','accepted-id')]);
    mocks.assigned.mockRejectedValue(new Error('network unavailable'));
    await expect(listPrivateRoomCalendar(user,2026,9,false)).rejects.toThrow();
  });
  it('caps room enumeration to 12 and reports partial results',async()=>{
    mocks.owned.mockResolvedValue(Array.from({length:15},(_,i)=>own('room-'+i)));
    const result=await listPrivateRoomCalendar(user,2026,9,false);
    expect(result.rooms).toHaveLength(12);
    expect(result.truncated).toBe(true);
    expect(mocks.ownerEvents).toHaveBeenCalledTimes(12);
  });
  it('does not ask member for details of old-window accepted events',async()=>{
    mocks.joined.mockResolvedValue([{id:'member-room',name:'Joined'}]);
    mocks.inbox.mockResolvedValue([{...accepted('member-room','accepted-id'),
      start:time('2026-08-20T09:00'),end:time('2026-08-20T10:00')}]);
    const result=await listPrivateRoomCalendar(user,2026,9,false);
    expect(result.events).toHaveLength(0);
    expect(mocks.assigned).not.toHaveBeenCalled();
  });
});
