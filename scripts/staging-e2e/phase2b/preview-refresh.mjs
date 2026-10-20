/**
 * Fail-closed Phase 2b Hosting Preview refresh. NEVER calls firebase deploy
 * or deploys the live channel. The only mutable endpoint is the literal
 * Firebase Hosting preview channel p2b-e2e of site ourschedule.
 *
 * The dedicated Hosting deployer service account has broader project-level
 * Firebase Hosting permissions than this script exercises. Keep its WIF
 * binding restricted to the canonical main workflow and review all changes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE = 'ourschedule';
const CHANNEL = 'p2b-e2e';
const NAME = 'sites/' + SITE + '/channels/' + CHANNEL;
const API = 'https://firebasehosting.googleapis.com/v1beta1/' + NAME;
const COMMIT = /^[a-f0-9]{40}$/;

export function validateRefreshEnvironment(env) {
  assert.equal(env.GITHUB_REPOSITORY, 'chaithawat03/OurSchedule');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.GITHUB_WORKFLOW_REF,
    'chaithawat03/OurSchedule/.github/workflows/staging-e2e.yml@refs/heads/main');
  assert.ok(['workflow_dispatch', 'schedule'].includes(env.GITHUB_EVENT_NAME));
  assert.match(env.GITHUB_SHA ?? '', COMMIT, 'Invalid source commit');
  assert.equal(env.STAGING_E2E_ENABLED, 'true');
  assert.equal(env.STAGING_E2E_APPROVE_PERSISTENT_PROFILES, 'true');
  assert.equal(env.STAGING_E2E_PHASE2B_ENABLED, 'true');
  assert.equal(env.STAGING_E2E_PHASE2B_DELETE_APPROVED, 'true');
  assert.equal(env.STAGING_E2E_PHASE2B_PREVIEW_REFRESH_ENABLED, 'true');
  assert.equal(env.STAGING_E2E_PHASE2B_PREVIEW_DEPLOY_APPROVED, 'true');
  assert.equal(env.STAGING_E2E_PHASE2B_HOSTING_SERVICE_ACCOUNT,
    'e2e-preview-deployer@ourschedule.iam.gserviceaccount.com');
  assert.ok(env.STAGING_E2E_APP_ID?.startsWith('1:400176852634:web:'),
    'Invalid Staging Firebase App ID');
  assert.ok((env.STAGING_E2E_APP_ID ?? '').length > 21);
  assert.match(env.STAGING_E2E_API_KEY ?? '', /^[A-Za-z0-9_-]{15,128}$/);
  const url = new URL(env.STAGING_E2E_PHASE2B_PREVIEW_URL);
  assert.equal(url.protocol,'https:');
  assert.equal(url.username,'');
  assert.equal(url.password,'');
  assert.equal(url.port,'');
  assert.equal(url.pathname,'/');
  assert.equal(url.search,'');
  assert.equal(url.hash,'');
  assert.match(url.hostname, /^ourschedule--p2b-e2e-[a-z0-9-]+\.web\.app$/,
    'Unexpected preview origin');
  return Object.freeze({
    origin:url.origin,
    sha:env.GITHUB_SHA,
  });
}

export function validateRefreshConfig(json) {
  assert.deepEqual(Object.keys(json).sort(), ['firestore','hosting'],
    'Unknown deploy config root keys');
  assert.equal(json.hosting?.site, SITE, 'Must use the fixed Staging Hosting site');
  assert.equal(json.hosting?.public,'dist');
  assert.equal(json.firestore?.database,'ourschedule-e2e');
  assert.equal(json.firestore?.rules,'firestore.rules');
  assert.ok(Array.isArray(json.hosting?.rewrites));
  assert.equal(json.hosting.rewrites.length,1);
  assert.equal(json.hosting.rewrites[0].source,'**');
  assert.equal(json.hosting.rewrites[0].destination,'/index.html');
  assert.equal(json.hosting.rewrites[0].function,undefined);
  assert.equal(json.hosting.rewrites[0].run,undefined);
}

export function validatePreviewChannel(channel, expectedOrigin, now = Date.now(), requireRenewed = false) {
  assert.equal(channel?.name, NAME, 'Hosting channel mismatch');
  assert.equal(channel.url, expectedOrigin, 'Preview URL drift: STOP and review');
  assert.match(channel.release?.version?.name ?? '',
    /^sites\/ourschedule\/versions\/[A-Za-z0-9_-]+$/,
    'Preview has no pinned Hosting version');
  const expiration = Date.parse(channel.expireTime ?? '');
  assert.ok(Number.isFinite(expiration), 'Preview expiration unavailable');
  assert.ok(expiration > now, 'Preview already expired; no implicit channel recreation');
  if(requireRenewed) {
    assert.ok(expiration > now + 20 * 86400_000,
      'Preview refresh did not extend expiration at least twenty days');
  }
  return Object.freeze({ expiresAt:new Date(expiration).toISOString(),
    version:channel.release.version.name });
}

export function validateCliResult(stdout, expectedOrigin) {
  // --json is the Firebase CLI machine-readable API, not human log output.
  const result=JSON.parse(stdout);
  assert.equal(result.status,'success','Firebase preview deploy did not succeed');
  const targets=Object.values(result.result ?? {});
  assert.equal(targets.length,1,'Firebase CLI deployed unexpected Hosting targets');
  const item=targets[0];
  assert.equal(item?.site,SITE,'Firebase CLI selected a different site');
  assert.equal(item?.url,expectedOrigin,'Firebase CLI changed the preview URL');
  assert.ok(Date.parse(item?.expireTime) > Date.now() + 20 * 86400_000,
    'Firebase CLI failed to extend preview lifespan');
}

export async function readPreviewChannel(token, fetchImpl=fetch) {
  assert.ok(typeof token==='string' && token.length>50,
    'Short-lived Hosting token missing');
  const result=await fetchImpl(API,{headers:{
    authorization:'Bearer '+token,
  },signal:AbortSignal.timeout(20000)});
  if(!result.ok)throw Error('Hosting channel GET failed (HTTP '+result.status+')');
  return result.json();
}

async function main(mode) {
  const env=process.env;
  const expected=validateRefreshEnvironment(env);
  const config=JSON.parse(readFileSync('firebase.phase2b.json','utf8'));
  validateRefreshConfig(config);
  if(mode==='validate') {
    console.log('PHASE 2B preview source guard: PASS');
    return;
  }
  assert.equal(mode,'deploy','Unsupported refresh mode');
  const token=env.STAGING_E2E_PHASE2B_HOSTING_ACCESS_TOKEN;
  const existing=await readPreviewChannel(token);
  validatePreviewChannel(existing,expected.origin);
  // Build already occurred without hosting credentials. The CLI receives
  // short-lived ADC via google-github-actions/auth; never accept key JSON.
  assert.ok((env.GOOGLE_APPLICATION_CREDENTIALS ?? '').length>0,
    'WIF application default credentials are required');
  const args=['firebase-tools','hosting:channel:deploy',CHANNEL,
    '--expires','21d','--config','firebase.phase2b.json',
    '--project',SITE,'--json','--non-interactive'];
  const cmd=spawnSync('npx',args,{
    cwd:process.cwd(),env:{...env,FIREBASE_TOKEN:''},
    encoding:'utf8',maxBuffer:4*1024*1024,timeout:160_000,
  });
  if(cmd.status!==0)throw Error('Preview-only Firebase CLI deploy failed (sanitized)');
  validateCliResult(cmd.stdout,expected.origin);
  // REST confirms the actual Firebase channel was refreshed, not merely a
  // local CLI success message.
  const updated=await readPreviewChannel(token);
  validatePreviewChannel(updated,expected.origin,Date.now(),true);
  console.log('PHASE 2B preview refresh PASS: fixed site/channel, URL, expiry and source SHA '+
    expected.sha.slice(0,10));
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(()=>{
    // Error bodies could include access tokens. Deliberately no stack dump.
    console.error('PHASE 2B preview refresh FAILED; inspect channel, WIF and Hosting IAM');
    process.exitCode=1;
  });
}
