/**
 * M4b live acceptance on the existing Phase2b PREVIEW/NAMED database ONLY.
 * All writes/reads here use the two synthetic Firebase *user ID tokens*,
 * never IAM OAuth tokens. The separate cleanup SA is confined to the
 * named database and performs teardown after every success/failure.
 *
 * Important: imported code does NOTHING unless explicitly opted-in via
 * manual workflow_dispatch after a separately reviewed named Rules release.
 */
import assert from 'node:assert/strict';
import {OWNER_UID, MEMBER_UID, PROJECT_ID, DATABASE_ID} from '../phase2b/guard.mjs';

const DOCROOT='projects/'+PROJECT_ID+'/databases/'+DATABASE_ID+'/documents';
const ROOT='https://firestore.googleapis.com/v1/'+DOCROOT;
const SEGMENT=/^[a-zA-Z0-9_-]{1,128}$/;
const TEST_ID_PREFIX='P2B-M4B-';
const ENTRY_BUSY=TEST_ID_PREFIX+'BUSY-1';
const ENTRY_ROOM=TEST_ID_PREFIX+'ROOM-1';
const ROOM_TITLE=TEST_ID_PREFIX+'ROOM-explicit-public';
const VALID_SHA=/^[a-f0-9]{40}$/;

export function m4bLiveEnabled(env) {
  // Never run live M4b writes from automatic scheduled workflows.
  if(env.GITHUB_EVENT_NAME!=='workflow_dispatch')return false;
  if(env.STAGING_E2E_M4B_LIVE_APPROVED!=='true')return false;
  assert.equal(env.STAGING_E2E_M4B_RULES_RELEASE_VERIFIED,'true',
    'No separately reviewed named-database Rules release');
  assert.equal(env.GITHUB_REPOSITORY,'chaithawat03/OurSchedule');
  assert.equal(env.GITHUB_REF,'refs/heads/main');
  assert.equal(env.GITHUB_WORKFLOW_REF,
    'chaithawat03/OurSchedule/.github/workflows/staging-e2e.yml@refs/heads/main');
  assert.match(env.GITHUB_SHA??'',VALID_SHA);
  assert.equal(env.STAGING_E2E_PHASE2B_ENABLED,'true');
  assert.equal(env.STAGING_E2E_PHASE2B_DELETE_APPROVED,'true');
  return true;
}

function cleanSegment(value) {
  assert.match(value??'',SEGMENT,'Unsafe synthetic E2E document segment');
  return value;
}
const stamp=date=>({timestampValue:date.toISOString()});
const string=value=>({stringValue:value});

/**
 * An atomic Firestore REST Commit:
 * quota counter and new public event write in the SAME transaction.
 * Exactly mirrors quotaConsumed(..., 'roomEvents', ...,20).
 */
export function makePublishCommit(roomId,visibility,quotaCount,priorWindowStart,startsAt) {
  cleanSegment(roomId);
  assert.ok(visibility==='ROOM'||visibility==='BUSY_ONLY');
  assert.ok(quotaCount===1||quotaCount===2);
  assert.ok(startsAt instanceof Date && Number.isFinite(startsAt.getTime()));
  if(quotaCount===1) assert.equal(priorWindowStart,null);
  else assert.match(priorWindowStart??'',/^\d{4}-\d\d-\d\dT/);
  const entryId=visibility==='ROOM'?ENTRY_ROOM:ENTRY_BUSY;
  const quotaId='shared_'+roomId+'_'+entryId;
  assert.ok(quotaId.length<=120,'Quota reference too long');
  const quotaFields={
    count:{integerValue:String(quotaCount)},
    lastResourceId:string(quotaId),
    ...(priorWindowStart ? {windowStart:{timestampValue:priorWindowStart}} : {}),
  };
  const quotaTransforms=[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}];
  if(!priorWindowStart) quotaTransforms.push({
    fieldPath:'windowStart',setToServerValue:'REQUEST_TIME',
  });
  const entryFields={
    roomId:string(roomId),visibility:string(visibility),
    startAt:stamp(startsAt),
    endAt:stamp(new Date(startsAt.getTime()+3600000)),
    allDay:{booleanValue:false},
    ...(visibility==='ROOM'?{title:string(ROOM_TITLE)}:{}),
  };
  return Object.freeze({
    entryId,
    quotaCount,
    body:{writes:[
      {update:{name:DOCROOT+'/users/'+OWNER_UID+'/quotas/roomEvents',
        fields:quotaFields},updateTransforms:quotaTransforms},
      {update:{name:DOCROOT+'/rooms/'+roomId+'/sharedCalendarV1/'+entryId,
        fields:entryFields},currentDocument:{exists:false}},
    ]},
  });
}

async function userFetch(idToken,url,method='GET',body,fetchImpl=fetch) {
  assert.ok(typeof idToken==='string'&&idToken.length>50);
  assert.ok(url.startsWith(ROOT) && !url.includes('/(default)/'));
  const response=await fetchImpl(url,{
    method,headers:{authorization:'Bearer '+idToken,
      ...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(15000),
  });
  // Do not log raw API bodies: they may contain private user data.
  return response;
}

const docUrl=(roomId,entryId)=>ROOT+'/rooms/'+encodeURIComponent(cleanSegment(roomId))+
  '/sharedCalendarV1/'+encodeURIComponent(cleanSegment(entryId));
async function getStatus(idToken,url,fetchImpl=fetch) {
  return (await userFetch(idToken,url,'GET',undefined,fetchImpl)).status;
}
async function listProjections(idToken,roomId,fetchImpl=fetch) {
  const url=ROOT+'/rooms/'+encodeURIComponent(cleanSegment(roomId))+':runQuery';
  const response=await userFetch(idToken,url,'POST',{structuredQuery:{
    from:[{collectionId:'sharedCalendarV1'}],limit:20,
  }},fetchImpl);
  if(response.status!==200)return {status:response.status};
  const json=await response.json();
  assert.ok(Array.isArray(json)&&json.length<=20,'Unexpected bounded query response');
  const entries=json.filter(item=>item.document).map(item=>item.document);
  // Malformed admin-seeded entries must fail verification, not just be
  // hidden by a client-side projection parser.
  for(const entry of entries) {
    const fields=entry.fields??{};
    const keys=Object.keys(fields).sort();
    const visibility=fields.visibility?.stringValue;
    const expected=visibility==='ROOM'?
      ['roomId','visibility','startAt','endAt','allDay','title']:
      ['roomId','visibility','startAt','endAt','allDay'];
    assert.deepEqual(keys,expected.sort(),'Private fields leaked into shared read');
    assert.equal(fields.roomId?.stringValue,roomId);
    assert.ok(['ROOM','BUSY_ONLY'].includes(visibility));
  }
  return {status:200,entries};
}

/** Call AFTER synthetic Owner & Member join the room, BEFORE assignments. */
export async function runM4bPublishedAcceptance(ownerToken,memberToken,roomId,fetchImpl=fetch) {
  cleanSegment(roomId);
  assert.notEqual(ownerToken,memberToken);
  const quotaUrl=ROOT+'/users/'+OWNER_UID+'/quotas/roomEvents';
  // Existing Phase2b cleanup must leave no quota documents before a run.
  assert.equal(await getStatus(ownerToken,quotaUrl,fetchImpl),404,
    'M4b expected pristine synthetic roomEvents quota');

  const start=new Date(Date.now()+3600000);
  const busy=makePublishCommit(roomId,'BUSY_ONLY',1,null,start);
  const first=await userFetch(ownerToken,ROOT+':commit','POST',busy.body,fetchImpl);
  assert.equal(first.status,200,'Owner BUSY_ONLY+quota atomic commit denied');
  const prior=await userFetch(ownerToken,quotaUrl,'GET',undefined,fetchImpl);
  assert.equal(prior.status,200,'Shared quota not created');
  const priorData=await prior.json();
  assert.equal(priorData.fields?.count?.integerValue,'1');
  assert.equal(priorData.fields?.lastResourceId?.stringValue,
    'shared_'+roomId+'_'+ENTRY_BUSY);
  const window=priorData.fields?.windowStart?.timestampValue;
  assert.ok(window,'Missing server-managed quota windowStart');

  const room=makePublishCommit(roomId,'ROOM',2,window,new Date(start.getTime()+7200000));
  const second=await userFetch(ownerToken,ROOT+':commit','POST',room.body,fetchImpl);
  assert.equal(second.status,200,'Owner ROOM+quota atomic commit denied');

  assert.equal(await getStatus(memberToken,docUrl(roomId,ENTRY_ROOM),fetchImpl),200,
    'Active member cannot read explicitly published ROOM');
  assert.equal(await getStatus(memberToken,docUrl(roomId,ENTRY_BUSY),fetchImpl),200,
    'Active member cannot read BUSY_ONLY');
  const listed=await listProjections(memberToken,roomId,fetchImpl);
  assert.equal(listed.status,200,'Member shared-calendar list denied');
  assert.equal(listed.entries?.length,2,'Expected only two synthetic shared entries');
  assert.equal(listed.entries.filter(e=>e.fields?.visibility?.stringValue==='ROOM').length,1);
  assert.equal(listed.entries.filter(e=>e.fields?.visibility?.stringValue==='BUSY_ONLY').length,1);

  // The owner withdraws ROOM. BUSY remains until AFTER member revocation.
  const removed=await userFetch(ownerToken,docUrl(roomId,ENTRY_ROOM),'DELETE',undefined,fetchImpl);
  assert.ok([200,204].includes(removed.status),'Owner could not withdraw ROOM');
  const after=await listProjections(memberToken,roomId,fetchImpl);
  assert.equal(after.status,200);
  assert.equal(after.entries?.length,1);
  assert.equal(after.entries[0].fields?.visibility?.stringValue,'BUSY_ONLY');
  return {remainingEntryId:ENTRY_BUSY};
}

/** Call AFTER existing Phase2b UI member-revocation assertion. */
export async function assertM4bRevocation(ownerToken,memberToken,roomId,fetchImpl=fetch) {
  assert.equal(await getStatus(memberToken,docUrl(roomId,ENTRY_BUSY),fetchImpl),403,
    'Revoked member still reads a shared appointment');
  const list=await listProjections(memberToken,roomId,fetchImpl);
  assert.equal(list.status,403,'Revoked member can still list shared appointments');
  assert.equal(await getStatus(ownerToken,docUrl(roomId,ENTRY_BUSY),fetchImpl),200,
    'Room owner lost own published appointment');
}
