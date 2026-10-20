import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  m4bLiveEnabled,makePublishCommit,runM4bPublishedAcceptance,
  assertM4bRevocation,
} from '../../scripts/staging-e2e/m4b/acceptance.mjs';

const roomId='m4b-synthetic-room';
const ownerToken='O'.repeat(80);
const memberToken='M'.repeat(80);
const env={
  GITHUB_REPOSITORY:'chaithawat03/OurSchedule',
  GITHUB_REF:'refs/heads/main',
  GITHUB_WORKFLOW_REF:'chaithawat03/OurSchedule/.github/workflows/staging-e2e.yml@refs/heads/main',
  GITHUB_SHA:'a'.repeat(40),
  GITHUB_EVENT_NAME:'workflow_dispatch',
  STAGING_E2E_PHASE2B_ENABLED:'true',
  STAGING_E2E_PHASE2B_DELETE_APPROVED:'true',
  STAGING_E2E_M4B_LIVE_APPROVED:'true',
  STAGING_E2E_M4B_RULES_RELEASE_VERIFIED:'true',
};
const urlRoot='https://firestore.googleapis.com/v1/projects/ourschedule/databases/ourschedule-e2e/documents';
const docRoot='projects/ourschedule/databases/ourschedule-e2e/documents';
const entry=(kind)=>({
  name:docRoot+'/rooms/'+roomId+'/sharedCalendarV1/P2B-M4B-'+kind+'-1',
  fields:{
    roomId:{stringValue:roomId},
    visibility:{stringValue:kind==='ROOM'?'ROOM':'BUSY_ONLY'},
    startAt:{timestampValue:'2026-10-20T02:00:00Z'},
    endAt:{timestampValue:'2026-10-20T03:00:00Z'},
    allDay:{booleanValue:false},
    ...(kind==='ROOM'?{title:{stringValue:'P2B-M4B-ROOM-explicit-public'}}:{}),
  },
});
const json=(status,value)=>({status,ok:status>=200&&status<300,json:async()=>value});

test('M4b live writes are opt-in only, manual and exact canonical workflow',()=>{
  assert.equal(m4bLiveEnabled({...env,STAGING_E2E_M4B_LIVE_APPROVED:'false'}),false);
  assert.equal(m4bLiveEnabled({...env,GITHUB_EVENT_NAME:'schedule'}),false);
  assert.equal(m4bLiveEnabled({...env,GITHUB_EVENT_NAME:'push'}),false);
  assert.equal(m4bLiveEnabled(env),true);
  for(const [key,value] of [
    ['GITHUB_REPOSITORY','attacker/repo'],
    ['GITHUB_REF','refs/heads/feature'],
    ['GITHUB_WORKFLOW_REF','attacker/wrong.yml@refs/heads/main'],
    ['STAGING_E2E_PHASE2B_ENABLED','false'],
    ['STAGING_E2E_PHASE2B_DELETE_APPROVED','false'],
    ['STAGING_E2E_M4B_RULES_RELEASE_VERIFIED','false'],
    ['GITHUB_SHA','not-sha'],
  ]) assert.throws(()=>m4bLiveEnabled({...env,[key]:value}));
});

test('atomic write uses Firebase user Rules and never default/prod DB',()=>{
  const start=new Date('2026-10-20T02:00:00.000Z');
  const first=makePublishCommit(roomId,'BUSY_ONLY',1,null,start);
  assert.equal(first.entryId,'P2B-M4B-BUSY-1');
  assert.equal(first.body.writes.length,2);
  assert.equal(first.body.writes[0].update.name,
    docRoot+'/users/e2e_staging_owner_v1/quotas/roomEvents');
  assert.deepEqual(first.body.writes[0].updateTransforms,[
    {fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'},
    {fieldPath:'windowStart',setToServerValue:'REQUEST_TIME'},
  ]);
  assert.equal(first.body.writes[0].update.fields.count.integerValue,'1');
  assert.equal(first.body.writes[0].update.fields.lastResourceId.stringValue,
    'shared_'+roomId+'_P2B-M4B-BUSY-1');
  assert.deepEqual(Object.keys(first.body.writes[1].update.fields).sort(),
    ['roomId','visibility','startAt','endAt','allDay'].sort());
  assert.deepEqual(first.body.writes[1].currentDocument,{exists:false});
  const second=makePublishCommit(roomId,'ROOM',2,'2026-10-20T02:00:00Z',start);
  assert.equal(second.entryId,'P2B-M4B-ROOM-1');
  assert.equal(second.body.writes[0].update.fields.windowStart.timestampValue,
    '2026-10-20T02:00:00Z');
  assert.deepEqual(Object.keys(second.body.writes[1].update.fields).sort(),
    ['roomId','visibility','startAt','endAt','allDay','title'].sort());
  for(const jsonText of [JSON.stringify(first),JSON.stringify(second)]){
    for(const forbidden of ['notes','recipientUid','sourceEventId','PRIVATE','(default)'])
      assert.ok(!jsonText.includes(forbidden),'Unsafe field in shared commit');
  }
  for(const args of [
    [roomId,'PRIVATE',1,null,start],
    [roomId,'ROOM',3,null,start],
    [roomId,'ROOM',2,null,start],
    ['rooms/foreign','ROOM',1,null,start],
    [roomId,'BUSY_ONLY',1,null,new Date('invalid')],
  ])assert.throws(()=>makePublishCommit(...args));
});

test('synthetic owner/member acceptance checks two shared entries, withdrawal and revocation',async()=>{
  const seen=[];
  let count=0, revoked=false,roomWithdrawn=false;
  const fake=async (url,req)=>{
    assert.ok(url.startsWith(urlRoot),'Never touch default or other projects');
    assert.ok(!url.includes('/(default)/'));
    assert.equal(req.headers.authorization,
      'Bearer '+(req.headers.authorization.includes('O')?ownerToken:memberToken));
    seen.push(req.method+' '+url);
    const user=req.headers.authorization==='Bearer '+ownerToken?'owner':'member';
    const shared=url.includes('/sharedCalendarV1/');
    if(url.endsWith('/quotas/roomEvents')&&req.method==='GET') {
      return count===0?json(404,{}):json(200,{
        fields:{count:{integerValue:String(count)},
          lastResourceId:{stringValue:'shared_'+roomId+'_P2B-M4B-BUSY-1'},
          windowStart:{timestampValue:'2026-10-20T01:00:00Z'}},
      });
    }
    if(url.endsWith(':commit')){
      assert.equal(user,'owner','Only user token, no admin token');
      const body=JSON.parse(req.body);
      assert.equal(body.writes.length,2);
      assert.equal(body.writes[1].update.name.startsWith(docRoot),true);
      count++;
      return json(200,{});
    }
    if(url.endsWith(':runQuery')) {
      if(revoked&&user==='member')return json(403,{});
      const docs=[entry('BUSY'),...(!roomWithdrawn?[entry('ROOM')]:[])];
      return json(200,docs.map(document=>({document})));
    }
    if(shared&&req.method==='DELETE') {
      assert.equal(user,'owner');roomWithdrawn=true;
      return json(200,{});
    }
    if(shared&&req.method==='GET') {
      if(revoked&&user==='member')return json(403,{});
      return json(200,{});
    }
    throw Error('Unexpected fake request '+req.method+' '+url);
  };
  await runM4bPublishedAcceptance(ownerToken,memberToken,roomId,fake);
  assert.equal(count,2);
  assert.equal(roomWithdrawn,true);
  revoked=true;
  await assertM4bRevocation(ownerToken,memberToken,roomId,fake);
  assert.ok(seen.some(x=>x.includes(':commit')));
  assert.equal(seen.filter(x=>x.includes('/(default)/')).length,0);
});

test('guard failures and live approval are not bypassable from schedule or PRs',()=>{
  const workflow=readFileSync('.github/workflows/staging-e2e.yml','utf8');
  const runner=readFileSync('scripts/staging-e2e/phase2b/run.mjs','utf8');
  const cleanup=readFileSync('scripts/staging-e2e/phase2b/cleanup.mjs','utf8');
  assert.match(workflow,/STAGING_E2E_M4B_LIVE_APPROVED:/);
  assert.match(workflow,/STAGING_E2E_M4B_RULES_RELEASE_VERIFIED:/);
  assert.match(runner,/const m4b=m4bLiveEnabled\(process\.env\)/);
  assert.match(runner,/runM4bPublishedAcceptance\(owner\.idToken,member\.idToken,roomId\)/);
  assert.match(runner,/assertM4bRevocation\(owner\.idToken,member\.idToken,roomId\)/);
  assert.match(cleanup,/sharedCalendarV1/);
});
