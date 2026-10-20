import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCleanupDocument,validateInventoryDocuments,
} from '../../scripts/staging-e2e/phase2b/cleanup.mjs';

const db='projects/ourschedule/databases/ourschedule-e2e/documents/';
const roomId='synthetic_test_room';
const owner='e2e_staging_owner_v1';
const member='e2e_staging_member_v1';
const roomPath='rooms/'+roomId;
const mk=(path,fields)=>({
  path,document:{name:db+path,fields},
});
const str=v=>({stringValue:v});
const timestamp=v=>({timestampValue:v});
const bool=v=>({booleanValue:v});
const baseRoom=mk(roomPath,{
  ownerUid:str(owner),name:str('P2B-E2E-m4b-fixture'),
});
const baseOwner=mk('users/'+owner,{});
const baseMember=mk('users/'+member,{});
const entryId='P2B-M4B-BUSY-1';
const entryPath=roomPath+'/sharedCalendarV1/'+entryId;
const baseFields={
  roomId:str(roomId),visibility:str('BUSY_ONLY'),
  startAt:timestamp('2026-10-20T02:00:00Z'),
  endAt:timestamp('2026-10-20T03:00:00Z'),allDay:bool(false),
};
const safe=mk(entryPath,baseFields);
const roomNamed=mk(roomPath+'/sharedCalendarV1/P2B-M4B-ROOM-1',{
  ...baseFields,visibility:str('ROOM'),title:str('P2B-M4B-ROOM-demo'),
});
const inventory=(entries)=>[baseOwner,baseMember,baseRoom,...entries];

test('cleanup accepts exactly two allowlisted synthetic entries in isolated named room',()=>{
  const sorted=validateInventoryDocuments(inventory([safe,roomNamed]));
  assert.equal(sorted.length,5);
  assert.equal(sorted[0].path.split('/').length,4);
  assert.ok(sorted.some(x=>x.path===entryPath));
  assert.equal(validateCleanupDocument(safe.path,safe.document,new Set([roomId])),undefined);
});

test('reject all private data and unauthorized M4b entries before deletion',()=>{
  const changes=[
    {...baseFields,title:str('Private')},
    {...baseFields,notes:str('sensitive')},
    {...baseFields,recipientUid:str(member)},
    {...baseFields,sourceEventId:str('event')},
    {...baseFields,creatorUid:str(owner)},
    {...baseFields,visibility:str('PRIVATE')},
    {...baseFields,roomId:str('another-room')},
    {...baseFields,allDay:str('false')},
    {...baseFields,endAt:timestamp('2026-10-19T02:00:00Z')},
    {...baseFields,endAt:timestamp('2026-10-22T02:00:00Z')},
    {...baseFields,startAt:str('2026-10-20')},
    {...baseFields,evil:str('ignored')},
  ];
  for(const fields of changes){
    assert.throws(()=>validateInventoryDocuments(inventory([mk(entryPath,fields)])));
  }
});

test('do not delete forged names, foreign databases, or third shared entry',()=>{
  const malicious=[
    mk(roomPath+'/sharedCalendarV1/normal-user-event',baseFields),
    mk(roomPath+'/sharedCalendarV1/P2B-M4B-BUSY-',baseFields),
    mk('rooms/another-room/sharedCalendarV1/'+entryId,baseFields),
    mk(roomPath+'/calendarProjections/'+entryId,baseFields),
  ];
  for(const item of malicious)
    assert.throws(()=>validateInventoryDocuments(inventory([item])));
  assert.throws(()=>validateInventoryDocuments(inventory([
    safe,roomNamed,
    mk(roomPath+'/sharedCalendarV1/P2B-M4B-BUSY-2',baseFields),
  ])));
  assert.throws(()=>validateInventoryDocuments(inventory([{
    ...safe,document:{...safe.document,name:safe.document.name.replace(
      '/ourschedule-e2e/','/(default)/',
    )},
  }])));
});

test('refuses raw PRIVATE title in ROOM entry, and foreign parent room',()=>{
  const goodRoom=roomNamed;
  assert.doesNotThrow(()=>validateInventoryDocuments(inventory([goodRoom])));
  assert.throws(()=>validateInventoryDocuments(inventory([mk(goodRoom.path,{
    ...goodRoom.document.fields,title:str('Medical appointment'),
  })])));
  assert.throws(()=>validateInventoryDocuments(inventory([mk(goodRoom.path,{
    ...goodRoom.document.fields,notes:str('sensitive'),
  })])));
  assert.throws(()=>validateInventoryDocuments([baseOwner,baseMember,safe]),
    'Shared entry must have an inventoried allowed synthetic room');
});
