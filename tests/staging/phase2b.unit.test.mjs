import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePhase2bEnvironment,validatePreviewUrl,OWNER_UID,MEMBER_UID} from
  '../../scripts/staging-e2e/phase2b/guard.mjs';
import {cleanIsolatedDatabase,validateCleanupDocument,validateInventoryDocuments} from
  '../../scripts/staging-e2e/phase2b/cleanup.mjs';

const prefix='projects/ourschedule/databases/ourschedule-e2e/documents/';
const doc=(path,fields={})=>({
  name:prefix+path,
  fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{stringValue:v}])),
});
const owner={path:'users/'+OWNER_UID,document:doc('users/'+OWNER_UID)};
const member={path:'users/'+MEMBER_UID,document:doc('users/'+MEMBER_UID)};
const roomId='synthetic_test_room';
const room={path:'rooms/'+roomId,document:doc('rooms/'+roomId,{
  ownerUid:OWNER_UID,name:'P2B-E2E-c1',
})};
const event={path:'rooms/'+roomId+'/events/event_1',document:doc(
  'rooms/'+roomId+'/events/event_1',{
    creatorUid:OWNER_UID,recipientUid:MEMBER_UID,visibility:'PRIVATE',title:'P2B-E2E-ACCEPT',
  }),
};
const inbox={path:'users/'+MEMBER_UID+'/roomActivityInvites/event_1',document:doc(
  'users/'+MEMBER_UID+'/roomActivityInvites/event_1',{
    creatorUid:OWNER_UID,recipientUid:MEMBER_UID,roomId,
  }),
};
const validVars=Object.freeze({
  GITHUB_REPOSITORY:'chaithawat03/OurSchedule',GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',
  STAGING_E2E_ENABLED:'true',STAGING_E2E_APPROVE_PERSISTENT_PROFILES:'true',
  STAGING_E2E_PHASE2B_ENABLED:'true',STAGING_E2E_PHASE2B_DELETE_APPROVED:'true',
  STAGING_E2E_SERVICE_ACCOUNT:'e2e-runner@ourschedule.iam.gserviceaccount.com',
  STAGING_E2E_PHASE2B_CLEANUP_SERVICE_ACCOUNT:'e2e-cleanup@ourschedule.iam.gserviceaccount.com',
  STAGING_E2E_APP_ID:'1:400176852634:web:abcdef123456',
  STAGING_E2E_API_KEY:'syntheticFakeE2eWebKeyA123456789',
  GOOGLE_OAUTH_ACCESS_TOKEN:'x'.repeat(90),
  STAGING_E2E_PHASE2B_CLEANUP_TOKEN:'y'.repeat(90),
  STAGING_E2E_PHASE2B_PREVIEW_URL:'https://ourschedule--p2b-e2e-a1b2c.web.app',
});
test('only dedicated Firebase Hosting preview hostname and origin allowed',()=>{
  assert.equal(validatePreviewUrl(validVars.STAGING_E2E_PHASE2B_PREVIEW_URL),
    validVars.STAGING_E2E_PHASE2B_PREVIEW_URL);
  for(const url of [
    'https://ourschedule.web.app','https://ourschedule--prod-123.web.app',
    'http://ourschedule--p2b-e2e-a1b2c.web.app',
    'https://ourschedule--p2b-e2e-a1b2c.web.app/other',
    'https://ourschedule--p2b-e2e-a1b2c.web.app/?db=(default)',
    'https://evil.example.com',
  ]) assert.throws(()=>validatePreviewUrl(url));
});
test('phase2b requires distinct cleanup SA and explicit double opt-in',()=>{
  assert.equal(validatePhase2bEnvironment(validVars).databaseId,'ourschedule-e2e');
  for(const [key,value] of [
    ['GITHUB_REF','refs/heads/feature'],
    ['GITHUB_EVENT_NAME','pull_request'],
    ['STAGING_E2E_PHASE2B_ENABLED','false'],
    ['STAGING_E2E_PHASE2B_DELETE_APPROVED','false'],
    ['STAGING_E2E_PHASE2B_CLEANUP_TOKEN',''],
    ['STAGING_E2E_PHASE2B_CLEANUP_SERVICE_ACCOUNT','e2e-runner@ourschedule.iam.gserviceaccount.com'],
  ]) assert.throws(()=>validatePhase2bEnvironment({...validVars,[key]:value}));
});
test('rehearsed entire synthetic tree gives child-first bounded cleanup',()=>{
  const plan=validateInventoryDocuments([owner,member,room,event,inbox]);
  assert.equal(plan.length,5);
  assert.equal(plan.at(-1).path.split('/').length,2);
  assert.equal(plan[0].path.split('/').length,4);
});
test('never delete default-database or foreign-owned data',()=>{
  assert.throws(()=>validateCleanupDocument(room.path,{
    ...room.document,name:room.document.name.replace('/ourschedule-e2e/','/(default)/'),
  },new Set([roomId])));
  assert.throws(()=>validateInventoryDocuments([owner,member,{
    ...room,document:doc(room.path,{name:'P2B-E2E-c1',ownerUid:'real-owner'}),
  }]));
  assert.throws(()=>validateInventoryDocuments([owner,member,room,{
    ...event,document:doc(event.path,{
      creatorUid:OWNER_UID,recipientUid:'real-user',visibility:'PRIVATE',title:'P2B-E2E-ACCEPT',
    }),
  }]));
});
test('never silently clear unrelated collection or unbounded documents',()=>{
  assert.throws(()=>validateInventoryDocuments([{path:'rooms/unknown',document:room.document}]));
  assert.throws(()=>validateInventoryDocuments(Array.from({length:101},()=>owner)));
});
test('Firebase code routes named DB only for specially marked preview builds',()=>{
  const src=readFileSync('src/services/firebaseClient.ts','utf8');
  assert.match(src,/p2bRequested && !p2bAllowed/);
  assert.match(src,/VITE_PHASE2B_DATABASE_ID === 'ourschedule-e2e'/);
  assert.match(src,/getFirestore\(app, 'ourschedule-e2e'\)/);
  assert.match(src,/config\.projectId === 'ourschedule'/);
  assert.match(src,/window\.location\.hostname/);
  assert.match(src,/dataset\.phase2bDatabase = 'ourschedule-e2e'/);
  const cfg=JSON.parse(readFileSync('firebase.phase2b.json','utf8'));
  assert.equal(cfg.firestore.database,'ourschedule-e2e');
  assert.equal(cfg.hosting.public,'dist');
  assert.equal(cfg.firestore.rules,'firestore.rules');
});


test('scoped cleanup inventories before deleting; empty HTTP 200 DELETE body is fine',async()=>{
  const root='https://firestore.googleapis.com/v1/projects/ourschedule/databases/ourschedule-e2e/documents';
  const db=new Map([[owner.path,owner.document],[member.path,member.document],[room.path,room.document]]);
  const seen=[];
  const fetchImpl=async (url,request)=>{
    assert.ok(url.startsWith(root),'Never send admin request outside named E2E DB');
    assert.equal(request.headers.authorization,'Bearer '+'T'.repeat(75));
    const path=url.slice(root.length);
    seen.push(request.method+':'+path);
    if(path===':listCollectionIds') {
      return {ok:true,status:200,json:async()=>({
        collectionIds:[...new Set([...db.keys()].map(p=>p.split('/')[0]))],
      })};
    }
    if(path.endsWith(':listCollectionIds')) {
      return {ok:true,status:200,json:async()=>({collectionIds:[]})};
    }
    if(request.method==='DELETE'){
      db.delete(path.slice(1));
      return {ok:true,status:200,json:async()=>{throw Error('Must not parse empty DELETE body')}};
    }
    const group=path.split('?')[0].slice(1);
    const matches=[...db.entries()].filter(([k])=>k.split('/').length===2 && k.startsWith(group+'/'));
    return {ok:true,status:200,json:async()=>({documents:matches.map(([,v])=>v)})};
  };
  const deleted=await cleanIsolatedDatabase('T'.repeat(75),fetchImpl);
  assert.equal(deleted,3);
  assert.equal(db.size,0);
  assert.ok(seen.indexOf('DELETE:/users/'+OWNER_UID)>seen.indexOf('POST::listCollectionIds'));
});

test('unknown user aborts BEFORE all deletes',async()=>{
  const root='https://firestore.googleapis.com/v1/projects/ourschedule/databases/ourschedule-e2e/documents';
  let deletes=0;
  const foreign=doc('users/foreign_user');
  const fetchImpl=async (url,request)=>{
    assert.ok(url.startsWith(root));
    if(request.method==='DELETE')deletes++;
    if(url.endsWith(':listCollectionIds')) return {ok:true,status:200,
      json:async()=>({collectionIds:url===root+':listCollectionIds'?['users']:[]})};
    return {ok:true,status:200,json:async()=>({documents:[foreign]})};
  };
  await assert.rejects(cleanIsolatedDatabase('T'.repeat(75),fetchImpl));
  assert.equal(deletes,0);
});


test('live test selects removable member, not ambiguous shared UID prefix',()=>{
  // Both real synthetic test users display as e2e_stag… in MemberManager.
  assert.equal(OWNER_UID.slice(0,8),MEMBER_UID.slice(0,8));
  const src=readFileSync('scripts/staging-e2e/phase2b/run.mjs','utf8');
  assert.doesNotMatch(src,/filter\(\{hasText:MEMBER_UID\.slice\(0,8\)\}\)/);
  assert.match(src,/\.room-members li'\)\.filter\(\{\s*has:\s*owner\.page\.getByRole\('button',\{name:'ลบสมาชิก',exact:true\}\)/);
  assert.match(src,/expect\(row\)\.toHaveCount\(1\)/);
  // A failure records only an allowlisted stage, never an arbitrary Auth error.
  assert.match(src,/console\.error\('PHASE 2B: live test FAILED at '\+stage\+' \(sanitized\)'\)/);
  for(const stage of ['room-create','room-invite-and-join','accept-private-activity',
    'sweetalert-cancel-and-rollback','decline-private-activity',
    'prepare-revocation','member-revocation','revocation-rules-denials']) {
    assert.ok(src.includes("checkpoint('"+stage+"')"),'Missing checkpoint: '+stage);
  }
});
