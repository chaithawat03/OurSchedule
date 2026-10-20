/**
 * OurSchedule Staging Hosting-only release gate.
 *
 * Verify the main commit is a real merged PR whose EXACT head SHA passed both
 * PR CI and Emulator E2E. All cloud credentials are supplied later by GitHub
 * WIF. The only deploy target in code/config is Hosting LIVE of the
 * STAGING project "ourschedule" (never a Production project).
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO='chaithawat03/OurSchedule';
const PROJECT='ourschedule';
const SITE='ourschedule';
const SHA=/^[a-f0-9]{40}$/;
const DEPLOYER='staging-hosting-deployer@ourschedule.iam.gserviceaccount.com';
const PROVIDER='projects/400176852634/locations/global/workloadIdentityPools/ourschedule-e2e/providers/github-staging-deploy';
const ORIGIN='https://ourschedule.web.app';
const VERSION='/deploy-version.json';
const REQUIRED_WORKFLOWS=Object.freeze([
  {filename:'pr-ci.yml', name:'PR CI'},
  {filename:'emulator-e2e.yml',name:'Emulator E2E'},
]);

export function validateEnvironment(env) {
  assert.equal(env.GITHUB_REPOSITORY,REPO,'Unexpected repository');
  assert.equal(env.GITHUB_REF,'refs/heads/main','Staging releases require main');
  assert.ok(['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME),'Unexpected trigger');
  assert.match(env.GITHUB_SHA??'',SHA,'Expected full Git SHA');
  assert.equal(env.STAGING_AUTO_DEPLOY_ENABLED,'true','Staging deploy not enabled');
  assert.equal(env.STAGING_AUTO_DEPLOY_SERVICE_ACCOUNT,DEPLOYER,
    'Staging deployer SA mismatch');
  assert.equal(env.STAGING_AUTO_DEPLOY_WIF_PROVIDER,PROVIDER,
    'Dedicated Staging deploy WIF provider mismatch');
  return Object.freeze({sha:env.GITHUB_SHA});
}

export function assertStagingBuildEnvironment(env) {
  assert.equal(env.VITE_FIREBASE_PROJECT_ID,PROJECT,'Refusing non-Staging project');
  assert.equal(env.VITE_FIREBASE_AUTH_DOMAIN,'ourschedule.firebaseapp.com');
  assert.ok(env.VITE_FIREBASE_APP_ID?.startsWith('1:400176852634:web:'),
    'Unexpected Staging Firebase App ID');
  assert.match(env.VITE_FIREBASE_API_KEY??'',/^[A-Za-z0-9_-]{15,128}$/);
  assert.notEqual(env.VITE_E2E_EMULATORS,'1','Refusing emulator build');
  assert.notEqual(env.VITE_PHASE2B_PREVIEW,'1','Refusing named database preview build');
  assert.ok(!env.VITE_PHASE2B_DATABASE_ID,'Refusing non-default Firestore database');
}

export function validateHostingConfig(config) {
  assert.deepEqual(Object.keys(config).sort(),['hosting'],
    'Deploy config must not contain Firestore or other resources');
  const expected={
    site:SITE,public:'dist',
    ignore:['firebase.json','**/.*','**/node_modules/**'],
    rewrites:[{source:'**',destination:'/index.html'}],
    headers:[
      {source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache'}]},
      {source:VERSION,headers:[{key:'Cache-Control',value:'no-store, max-age=0'}]},
    ],
  };
  assert.deepEqual(config.hosting,expected,'Hosting site/routing config changed');
}

export function parseMergedPr(prs,sha) {
  assert.ok(Array.isArray(prs),'Invalid PR response');
  const matches=prs.filter(pr =>
    pr.merge_commit_sha===sha &&
    pr.merged_at &&
    pr.state==='closed' &&
    pr.base?.ref==='main' &&
    pr.base?.repo?.full_name===REPO &&
    SHA.test(pr.head?.sha??'')
  );
  assert.equal(matches.length,1,'No unique reviewed/merged PR for this main SHA');
  return matches[0];
}

export function verifiedWorkflowRun(runs,workflow,pr) {
  assert.ok(Array.isArray(runs),'Invalid workflow runs response');
  // For pull_request events, Actions run.head_sha points to GitHub's
  // synthetic refs/pull/N/merge commit, not the PR HEAD commit. The exact
  // PR head is instead provided inside run.pull_requests[].head.sha.
  // Do not allow an earlier green run of the same PR to authorize a new head.
  return runs.some(run =>
    run.name===workflow.name &&
    run.path==='.github/workflows/'+workflow.filename &&
    run.event==='pull_request' &&
    run.status==='completed' && run.conclusion==='success' &&
    Array.isArray(run.pull_requests) &&
    run.pull_requests.some(p =>
      p.number===pr.number &&
      p.head?.sha===pr.head.sha &&
      p.base?.ref==='main')
  );
}

export function makeVersion(sha) {
  assert.match(sha,SHA);
  return {sha,project:PROJECT,site:SITE,channel:'live',target:'staging'};
}

export function verifyVersion(doc,sha) {
  assert.deepEqual(doc,makeVersion(sha),
    'Live Hosting version does not match the merged Staging commit');
}

async function apiJson(route,env,fetchImpl=fetch) {
  const token=env.GITHUB_TOKEN;
  assert.ok(typeof token==='string'&&token.length>10,'GitHub Actions token required');
  assert.ok(route.startsWith('/repos/'+REPO+'/'),'Invalid GitHub API request target');
  const response=await fetchImpl('https://api.github.com'+route,{
    headers:{
      authorization:'Bearer '+token,
      accept:'application/vnd.github+json',
      'x-github-api-version':'2022-11-28',
      'user-agent':'ourschedule-staging-deploy-gate',
    },
    signal:AbortSignal.timeout(20000),
  });
  if(!response.ok)throw Error('GitHub CI verification HTTP '+response.status);
  return response.json();
}

export async function assertLatestMain(sha,env=process.env,fetchImpl=fetch) {
  assert.match(sha,SHA);
  const ref=await apiJson('/repos/'+REPO+'/git/ref/heads/main',env,fetchImpl);
  assert.equal(ref.object?.sha,sha,
    'main moved since workflow started; refusing stale Hosting deployment');
}

export async function verifyMergedMainCi(sha,env=process.env,fetchImpl=fetch) {
  await assertLatestMain(sha,env,fetchImpl);
  const commit=await apiJson('/repos/'+REPO+'/commits/'+sha,env,fetchImpl);
  // Deliberately support only the repository's existing "merge commit" model.
  // Squash, rebase and direct pushes must not automatically deploy.
  assert.equal(commit.sha,sha);
  assert.equal(commit.parents?.length,2,'Only reviewed two-parent PR merges may deploy');
  const prs=await apiJson('/repos/'+REPO+'/commits/'+sha+'/pulls?per_page=100',env,fetchImpl);
  const pr=parseMergedPr(prs,sha);
  for(const workflow of REQUIRED_WORKFLOWS){
    const route='/repos/'+REPO+'/actions/workflows/'+workflow.filename+
      '/runs?event=pull_request&head_sha='+encodeURIComponent(pr.head.sha)+'&per_page=100';
    const listing=await apiJson(route,env,fetchImpl);
    assert.ok(verifiedWorkflowRun(listing.workflow_runs,workflow,pr),
      'Missing passed '+workflow.name+' for exact merged PR head commit');
  }
  return pr.number;
}

async function confirmLive(sha,fetchImpl=fetch) {
  for(let attempt=0;attempt<10;attempt++){
    try {
      const response=await fetchImpl(ORIGIN+VERSION+'?v='+sha,{
        cache:'no-store',headers:{'cache-control':'no-cache'},
        signal:AbortSignal.timeout(10000),
      });
      if(response.ok) {
        const data=await response.json();
        verifyVersion(data,sha);
        return;
      }
    }catch {
      // May be a propagation delay; after retry budget always fail closed.
    }
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  throw Error('Live Staging URL did not serve expected commit after deploy');
}

async function run(mode){
  const env=process.env;
  const {sha}=validateEnvironment(env);
  validateHostingConfig(JSON.parse(readFileSync('firebase.staging.json','utf8')));
  if(mode==='verify'){
    const pr=await verifyMergedMainCi(sha);
    console.log('STAGING gate: PASS, merged PR #'+pr+' and BOTH exact-head workflows passed');
    return;
  }
  if(mode==='validate-build'){
    assertStagingBuildEnvironment(env);
    console.log('STAGING build environment: PASS (Hosting only, default Firestore)');
    return;
  }
  if(mode==='stamp'){
    assertStagingBuildEnvironment(env);
    assert.ok(existsSync('dist/index.html'),'Missing completed Staging build');
    mkdirSync('dist',{recursive:true});
    writeFileSync('dist'+VERSION,JSON.stringify(makeVersion(sha))+'\n');
    console.log('STAGING build version: '+sha.slice(0,12));
    return;
  }
  if(mode==='latest'){
    await assertLatestMain(sha);
    console.log('STAGING latest-main check: PASS');
    return;
  }
  assert.equal(mode,'deploy','Unknown Staging release mode');
  assertStagingBuildEnvironment(env);
  assert.ok((env.GOOGLE_APPLICATION_CREDENTIALS??'').length>0,
    'Short-lived WIF ADC credentials required');
  await assertLatestMain(sha);
  verifyVersion(JSON.parse(readFileSync('dist'+VERSION,'utf8')),sha);
  const args=['firebase-tools','deploy','--only','hosting','--config',
    'firebase.staging.json','--project',PROJECT,'--non-interactive','--json'];
  const proc=spawnSync('npx',args,{
    cwd:process.cwd(),
    encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,
    env:{...env,FIREBASE_TOKEN:''},
  });
  if(proc.status!==0)throw Error('Staging Hosting-only Firebase CLI deployment failed');
  const output=JSON.parse(proc.stdout);
  assert.equal(output.status,'success','Firebase CLI returned unsuccessful status');
  await confirmLive(sha);
  console.log('STAGING HOSTING DEPLOY: PASS https://ourschedule.web.app/ sha='+sha.slice(0,12));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  run(process.argv[2]).catch(error=>{
    // Errors above are authored, sanitized messages only; no raw GCP tokens.
    console.error('STAGING HOSTING DEPLOY BLOCKED: '+
      (error instanceof Error?error.message:'Unknown failure'));
    process.exitCode=1;
  });
}
