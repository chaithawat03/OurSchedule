import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertStagingBuildEnvironment, validateEnvironment, validateHostingConfig,
  parseMergedPr, verifiedWorkflowRun, makeVersion, verifyVersion,
  verifyMergedMainCi, assertLatestMain,
} from '../../scripts/staging-deploy/run.mjs';

const sha='a'.repeat(40), head='b'.repeat(40);
const REPO='chaithawat03/OurSchedule';
const env={
  GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',GITHUB_SHA:sha,
  GITHUB_EVENT_NAME:'push',STAGING_AUTO_DEPLOY_ENABLED:'true',
  STAGING_AUTO_DEPLOY_SERVICE_ACCOUNT:
    'staging-hosting-deployer@ourschedule.iam.gserviceaccount.com',
  STAGING_AUTO_DEPLOY_WIF_PROVIDER:
    'projects/400176852634/locations/global/workloadIdentityPools/ourschedule-e2e/providers/github-staging-deploy',
  GITHUB_TOKEN:'x'.repeat(50),
};
const build={
  VITE_FIREBASE_PROJECT_ID:'ourschedule',
  VITE_FIREBASE_AUTH_DOMAIN:'ourschedule.firebaseapp.com',
  VITE_FIREBASE_APP_ID:'1:400176852634:web:bc5b074931badaca28b923',
  VITE_FIREBASE_API_KEY:'fakePublicWebApiKeyForOfflineUnitTests',
  VITE_PHASE2B_PREVIEW:'0',
  VITE_PHASE2B_DATABASE_ID:'',
};
const pr={
  number:28,merge_commit_sha:sha,merged_at:'2026-10-20T00:00:00Z',
  state:'closed',base:{ref:'main',repo:{full_name:REPO}},
  head:{sha:head,ref:'feature-branch'},
};
const successRun=(name,filename)=>({
  name,path:'.github/workflows/'+filename,
  event:'pull_request',status:'completed',conclusion:'success',
  head_sha:head,pull_requests:[{number:28}],
});
const fakeFetch=(overrides={})=>async (url,init)=>{
  assert.ok(url.startsWith('https://api.github.com/repos/'+REPO+'/'));
  assert.equal(init.headers.authorization,'Bearer '+env.GITHUB_TOKEN);
  const p=new URL(url).pathname;
  const data=p.endsWith('/git/ref/heads/main')?{object:{sha:overrides.latest??sha}}:
    p.endsWith('/commits/'+sha)?{sha,parents:overrides.parents??[{sha:'1'},{sha:'2'}]}:
    p.endsWith('/commits/'+sha+'/pulls')?(overrides.prs??[pr]):
    p.endsWith('/actions/workflows/pr-ci.yml/runs')?
      {workflow_runs:overrides.ci??[successRun('PR CI','pr-ci.yml')]}:
    p.endsWith('/actions/workflows/emulator-e2e.yml/runs')?
      {workflow_runs:overrides.e2e??[successRun('Emulator E2E','emulator-e2e.yml')]}:
      null;
  assert.ok(data,'Unexpected API endpoint: '+p);
  return {ok:true,json:async()=>data};
};

test('staging release is restricted to canonical repository/main/WIF opt-in',()=>{
  assert.equal(validateEnvironment(env).sha,sha);
  for (const [k,value] of [
    ['GITHUB_REPOSITORY','another/repo'],['GITHUB_REF','refs/heads/feature'],
    ['GITHUB_SHA','notsha'],['GITHUB_EVENT_NAME','pull_request'],
    ['STAGING_AUTO_DEPLOY_ENABLED','false'],
    ['STAGING_AUTO_DEPLOY_SERVICE_ACCOUNT',
      'e2e-preview-deployer@ourschedule.iam.gserviceaccount.com'],
    ['STAGING_AUTO_DEPLOY_WIF_PROVIDER',
      'projects/400176852634/locations/global/workloadIdentityPools/ourschedule-e2e/providers/github-main'],
  ]) assert.throws(()=>validateEnvironment({...env,[k]:value}));
});

test('never include production or named-database targets in staging build/deploy',()=>{
  assertStagingBuildEnvironment(build);
  const config=JSON.parse(readFileSync('firebase.staging.json','utf8'));
  validateHostingConfig(config);
  assert.deepEqual(Object.keys(config),['hosting']);
  for(const invalid of [
    {...config,firestore:{database:'(default)',rules:'firestore.rules'}},
    {hosting:{...config.hosting,site:'production'}},
    {hosting:{...config.hosting,rewrites:[{source:'**',function:'sneaky'}]}},
    {hosting:{...config.hosting,headers:[]}},
  ]) assert.throws(()=>validateHostingConfig(invalid));
  for(const [k,value] of [
    ['VITE_FIREBASE_PROJECT_ID','ourschedule-prod'],
    ['VITE_FIREBASE_APP_ID','1:other:web:abc'],
    ['VITE_PHASE2B_PREVIEW','1'],
    ['VITE_E2E_EMULATORS','1'],
    ['VITE_PHASE2B_DATABASE_ID','ourschedule-e2e'],
  ])assert.throws(()=>assertStagingBuildEnvironment({...build,[k]:value}));
});

test('post-deploy SHA proof requires exact public Staging version record',()=>{
  verifyVersion(makeVersion(sha),sha);
  assert.throws(()=>verifyVersion(makeVersion(sha),head));
  assert.throws(()=>verifyVersion({...makeVersion(sha),channel:'preview'},sha));
  assert.throws(()=>verifyVersion({...makeVersion(sha),project:'production'},sha));
});

test('merged pull must correspond to current 2-parent main commit',()=>{
  assert.equal(parseMergedPr([pr],sha).number,28);
  assert.throws(()=>parseMergedPr([] ,sha));
  assert.throws(()=>parseMergedPr([{...pr,base:{ref:'production',repo:{full_name:REPO}}}],sha));
  assert.throws(()=>parseMergedPr([{...pr,merged_at:null}],sha));
  const wf={name:'PR CI',filename:'pr-ci.yml'};
  assert.equal(verifiedWorkflowRun([successRun('PR CI','pr-ci.yml')],wf,pr),true);
  for(const different of [
    {conclusion:'failure'}, {conclusion:'skipped'}, {head_sha:'c'.repeat(40)},
    {event:'push'},{pull_requests:[{number:99}]},
    {path:'.github/workflows/fake-pr-ci.yml'},
  ]) assert.equal(verifiedWorkflowRun([
    {...successRun('PR CI','pr-ci.yml'),...different}],wf,pr),false);
});

test('gate passes only if both real PR workflows succeeded for exact head SHA',async()=>{
  assert.equal(await verifyMergedMainCi(sha,env,fakeFetch()),28);
  await assert.rejects(verifyMergedMainCi(sha,env,fakeFetch({
    ci:[{...successRun('PR CI','pr-ci.yml'),conclusion:'failure'}],
  })),/Missing passed PR CI/);
  await assert.rejects(verifyMergedMainCi(sha,env,fakeFetch({
    e2e:[{...successRun('Emulator E2E','emulator-e2e.yml'),head_sha:sha}],
  })),/Missing passed Emulator E2E/);
  await assert.rejects(verifyMergedMainCi(sha,env,fakeFetch({parents:[{sha:'1'}]})),
    /two-parent/);
  await assert.rejects(verifyMergedMainCi(sha,env,fakeFetch({prs:[]})),
    /merged PR/);
});

test('stale queued pushes cannot deploy after main has moved',async()=>{
  await assertLatestMain(sha,env,fakeFetch());
  await assert.rejects(assertLatestMain(sha,env,fakeFetch({latest:head})),
    /main moved/);
});

test('workflow cannot obtain hosting token before PR gate or build',()=>{
  const workflow=readFileSync('.github/workflows/staging-deploy.yml','utf8');
  const run=readFileSync('scripts/staging-deploy/run.mjs','utf8');
  assert.match(workflow,/on:\s*\n\s*push:/);
  assert.match(workflow,/needs: verify-reviewed-merge/);
  assert.match(workflow,/vars.STAGING_AUTO_DEPLOY_ENABLED == 'true'/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/node scripts\/staging-deploy\/run.mjs verify/);
  assert.ok(workflow.indexOf('run: npm run build') <
    workflow.indexOf('uses: google-github-actions/auth@v2'));
  assert.match(run,/const args=\['firebase-tools','deploy','--only','hosting'/);
  assert.doesNotMatch(run,/firebase-tools','deploy','--only','firestore'/);
  assert.match(workflow,/create_credentials_file: true/);
  assert.match(workflow,/STAGING_AUTO_DEPLOY_WIF_PROVIDER:/);
});
