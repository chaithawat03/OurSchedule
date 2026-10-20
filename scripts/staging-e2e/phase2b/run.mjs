/**
 * Phase 2b: real Hosting preview + live named Firestore database.
 * All browser assertions use Firebase USER ID tokens (Security Rules apply).
 * Only the separate scoped cleanup service account touches Firestore with IAM.
 * The normal Staging default database is never referenced by this runner.
 */
import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium, expect } from '@playwright/test';
import { validatePhase2bEnvironment, OWNER_UID, MEMBER_UID, PROJECT_ID, DATABASE_ID } from './guard.mjs';
import { cleanIsolatedDatabase } from './cleanup.mjs';
import { mintFirebaseCustomToken, reconcileSyntheticAuthUser } from '../identity.mjs';

const BOOTSTRAP_PATH = '/__phase2b_auth_bootstrap__';
const DB_ROOT = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
  '/databases/' + DATABASE_ID + '/documents';

async function bootstrapBundle() {
  const result = await build({
    configFile: false, publicDir: false, logLevel:'error',
    build: {write:false,sourcemap:false,minify:true,rollupOptions:{
      input:'tests/staging/phase2b-auth-bootstrap.js',
      output:{inlineDynamicImports:true,format:'es'},
    }},
  });
  const entry=result.output.find(x=>x.type==='chunk' && x.isEntry);
  assert.ok(entry?.code && !entry.imports.length, 'Browser auth seed must be bundled in memory');
  return entry.code;
}

async function createSession(browser, opts, code, uid, contexts) {
  const context=await browser.newContext({serviceWorkers:'block'});
  contexts.push(context);
  const page=await context.newPage();
  const token=await mintFirebaseCustomToken({
    uid,serviceAccount:opts.signingServiceAccount,oauthToken:opts.signingToken,
  });
  await page.route(opts.origin+BOOTSTRAP_PATH, async route=>route.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
  }));
  await page.goto(opts.origin+BOOTSTRAP_PATH,{waitUntil:'domcontentloaded'});
  await page.addScriptTag({type:'module',content:code});
  await page.waitForFunction(()=>typeof window.__seedPhase2bAuth==='function');
  const session=await page.evaluate(
    async ([config,jwt])=>window.__seedPhase2bAuth(config,jwt),
    [opts.firebaseConfig,token],
  );
  assert.equal(session.uid,uid,'Wrong test identity');
  await page.goto(opts.origin+'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveAttribute('data-phase2b-database',DATABASE_ID);
  await expect(page.getByText(/เชื่อมต่อบัญชีแล้ว:/)).toBeVisible({timeout:30000});
  return {page,context,idToken:session.idToken,uid};
}

async function firestoreGet(idToken,path) {
  assert.ok(path.every(part=>/^[A-Za-z0-9_-]{1,128}$/.test(part)));
  const res=await fetch(DB_ROOT+'/'+path.map(encodeURIComponent).join('/'),{
    headers:{authorization:'Bearer '+idToken},signal:AbortSignal.timeout(15000),
  });
  return res.status; // Do not print or parse private document contents.
}

async function findOwnedEventId(token,roomId,title) {
  assert.match(roomId,/^[A-Za-z0-9_-]{1,128}$/);
  const url=DB_ROOT+'/rooms/'+encodeURIComponent(roomId)+':runQuery';
  const res=await fetch(url,{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({structuredQuery:{
      from:[{collectionId:'events'}],
      where:{fieldFilter:{field:{fieldPath:'creatorUid'},op:'EQUAL',
        value:{stringValue:OWNER_UID}}},
      limit:20,
    }}),
    signal:AbortSignal.timeout(15000),
  });
  assert.equal(res.status,200,'Owner room event query failed');
  const list=await res.json();
  const matches=list.filter(v=>v.document?.fields?.title?.stringValue===title);
  assert.equal(matches.length,1,'Expected exactly one event for title');
  const id=matches[0].document.name.split('/').at(-1);
  assert.match(id,/^[A-Za-z0-9_-]{1,128}$/);
  return id;
}

const roomPanel=page=>page.getByRole('region',{name:'กิจกรรมที่มอบหมายในห้อง'});
const inbox=page=>roomPanel(page).locator('.room-activity-list').last();
function localBangkok(d) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    hourCycle:'h23'}).format(d).replace(' ','T');
}

async function assignment(owner,member,roomId,title,decision,checkpoint) {
  checkpoint('assignment-submit');
  const panel=roomPanel(owner.page);
  await panel.getByRole('button',{name:'โหลดใหม่',exact:true}).click();
  await panel.getByLabel('ห้องที่ต้องการมอบหมาย').selectOption(roomId);
  const receiver=panel.getByLabel('สมาชิกผู้รับกิจกรรม');
  await expect(receiver.locator('option[value="'+MEMBER_UID+'"]')).toHaveCount(1);
  await receiver.selectOption(MEMBER_UID);
  await panel.getByLabel('ชื่อกิจกรรม').fill(title);
  await panel.getByLabel('รายละเอียด').fill('P2B isolated synthetic activity');
  const start=new Date(Date.now()+60*60*1000);
  const end=new Date(start.getTime()+60*60*1000);
  await panel.getByLabel('เริ่ม').fill(localBangkok(start));
  await panel.getByLabel('สิ้นสุด').fill(localBangkok(end));
  await panel.getByRole('button',{name:'ส่งกิจกรรม'}).click();
  await expect(owner.page.getByText('ส่งกิจกรรมไปยังสมาชิกแล้ว')).toBeVisible();
  const eventId=await findOwnedEventId(owner.idToken,roomId,title);
  checkpoint('assignment-rules-before-decision');
  assert.equal(await firestoreGet(member.idToken,['rooms',roomId,'events',eventId]),403,
    'PENDING private event became visible');
  assert.equal(await firestoreGet(owner.idToken,['rooms',roomId,'events',eventId]),200);
  checkpoint('assignment-recipient-decision');
  await roomPanel(member.page).getByRole('button',{name:'โหลดคำเชิญใหม่'}).click();
  const row=inbox(member.page).locator('li').filter({hasText:title});
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('PENDING');
  await row.getByRole('button',{name:decision}).click();
  await expect(member.page.getByText(decision==='ยอมรับ'?'ยอมรับกิจกรรมแล้ว':'ปฏิเสธกิจกรรมแล้ว'))
    .toBeVisible();
  assert.equal(await firestoreGet(member.idToken,['rooms',roomId,'events',eventId]),
    decision==='ยอมรับ'?200:403,'Recipient private read was not gated by decision');
  return eventId;
}

async function acceptTestFlow(owner,member,checkpoint) {
  checkpoint('room-create');
  const tag='P2B-E2E-'+Date.now().toString(36);
  await owner.page.getByRole('textbox',{name:'ชื่อห้องใหม่'}).fill(tag);
  await owner.page.getByRole('button',{name:'สร้างห้อง',exact:true}).click();
  await expect(owner.page.getByText('สร้างห้องเรียบร้อยแล้ว')).toBeVisible();
  const chooser=owner.page.getByRole('combobox',{name:'เลือกห้องเพื่อเชิญ'});
  const option=chooser.locator('option').filter({hasText:tag});
  await expect(option).toHaveCount(1);
  const roomId=await option.getAttribute('value');
  assert.match(roomId,/^[A-Za-z0-9_-]{1,128}$/);
  checkpoint('room-invite-and-join');
  await chooser.selectOption(roomId);
  await owner.page.getByRole('button',{name:'สร้างลิงก์เชิญ'}).click();
  await expect(owner.page.getByText('สร้างคำเชิญแล้ว · ใช้ได้ครั้งเดียวภายใน 48 ชั่วโมง')).toBeVisible();
  const inviteLink=(await owner.page.locator('.invite-link').textContent()).trim();
  const inviteToken=new URLSearchParams(new URL(inviteLink).hash.slice(1)).get('invite');
  assert.match(inviteToken,/^[A-Za-z0-9_-]{43}$/);
  await member.page.getByRole('textbox',{name:'ลิงก์หรือรหัสคำเชิญ'}).fill(inviteToken);
  await member.page.getByRole('button',{name:'เข้าร่วมห้อง'}).click();
  await expect(member.page.getByText('เข้าร่วมห้องสำเร็จ')).toBeVisible();
  await expect(member.page.getByText('คุณเข้าร่วม: '+tag)).toBeVisible();

  const prefix='P2B-E2E-'+Date.now().toString(36);
  checkpoint('accept-private-activity');
  const accepted=await assignment(owner,member,roomId,prefix+'-ACCEPT','ยอมรับ',checkpoint);
  assert.equal(await firestoreGet(member.idToken,['rooms',roomId,'events',accepted]),200);
  checkpoint('sweetalert-cancel-and-rollback');
  // SweetAlert2: Back must never change accepted event.
  const acceptedRow=roomPanel(owner.page).locator('.room-activity-list').first()
    .locator('li').filter({hasText:prefix+'-ACCEPT'});
  await acceptedRow.getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await owner.page.getByRole('button',{name:'กลับ',exact:true}).click();
  assert.equal(await firestoreGet(member.idToken,['rooms',roomId,'events',accepted]),200);
  await acceptedRow.getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await owner.page.getByRole('button',{name:'ยกเลิกกิจกรรม'}).click();
  await expect(owner.page.getByText('ยกเลิกกิจกรรมแล้ว')).toBeVisible();
  await expect.poll(()=>firestoreGet(member.idToken,['rooms',roomId,'events',accepted]))
    .toBe(403);

  checkpoint('decline-private-activity');
  const declined=await assignment(owner,member,roomId,prefix+'-DECLINE','ปฏิเสธ',checkpoint);
  assert.equal(await firestoreGet(member.idToken,['rooms',roomId,'events',declined]),403);
  checkpoint('prepare-revocation');
  const revoked=await assignment(owner,member,roomId,prefix+'-REVOKE','ยอมรับ',checkpoint);
  assert.equal(await firestoreGet(member.idToken,['rooms',roomId,'events',revoked]),200);
  checkpoint('member-revocation');
  await owner.page.getByRole('combobox',{name:'เลือกห้องเพื่อจัดการสมาชิก'}).selectOption(roomId);
  // Owner/Member synthetic UIDs share the same first eight characters.
  // Match the sole removable MEMBER row, never the truncated UID text.
  const row=owner.page.locator('.room-members li').filter({
    has: owner.page.getByRole('button',{name:'ลบสมาชิก',exact:true}),
  });
  await expect(row).toHaveCount(1);
  await row.getByRole('button',{name:'ลบสมาชิก'}).click();
  await owner.page.getByRole('button',{name:'ลบสมาชิก',exact:true}).last().click();
  await expect(owner.page.getByText('เพิกถอนสิทธิ์สมาชิกแล้ว')).toBeVisible();
  checkpoint('revocation-rules-denials');
  await expect.poll(()=>firestoreGet(member.idToken,['rooms',roomId,'events',revoked]))
    .toBe(403);
  assert.equal(await firestoreGet(member.idToken,['rooms',roomId]),403);
}

async function main() {
  const opts=validatePhase2bEnvironment(process.env);
  // Fail before creating even ONE test account if cleanup IAM/inventory unsafe.
  const stale=await cleanIsolatedDatabase(opts.cleanupToken);
  console.log('PHASE 2B: named database preflight cleanup PASS (count='+stale+')');
  const code=await bootstrapBundle();
  const browser=await chromium.launch({headless:true});
  const contexts=[];
  let testFailure=false,cleanupFailure=false;
  let stage='owner-browser-bootstrap';
  const checkpoint=(nextStage)=>{stage=nextStage;console.log('PHASE 2B: checkpoint '+nextStage);};
  try {
    const owner=await createSession(browser,opts,code,OWNER_UID,contexts);
    checkpoint('member-browser-bootstrap');
    const member=await createSession(browser,opts,code,MEMBER_UID,contexts);
    await acceptTestFlow(owner,member,checkpoint);
    console.log('PHASE 2B: live preview Owner/Member Room/Invite/Activity/Revocation PASS');
  } catch {
    testFailure=true;
    // Deliberately print only the static test stage; never raw Firebase
    // errors, invitation URLs, Auth tokens, document contents or stack traces.
    console.error('PHASE 2B: live test FAILED at '+stage+' (sanitized)');
  } finally {
    try {
      const count=await cleanIsolatedDatabase(opts.cleanupToken);
      console.log('PHASE 2B: named database cleanup PASS (count='+count+')');
    } catch {
      cleanupFailure=true;
      console.error('PHASE 2B: named database cleanup FAILED; manual reconciliation required');
    }
    // Phase 2b is dependent on Phase 2a; reuse its allowlisted Auth UID cleanup.
    for(const uid of [MEMBER_UID,OWNER_UID]) {
      try {
        await reconcileSyntheticAuthUser({
          uid,apiKey:opts.apiKey,oauthToken:opts.signingToken,
          serviceAccount:opts.signingServiceAccount,
        });
        console.log('PHASE 2B: synthetic Auth cleanup '+(uid===OWNER_UID?'owner':'member')+': PASS');
      } catch {
        cleanupFailure=true;
        console.error('PHASE 2B: synthetic Auth cleanup FAILED');
      }
    }
    for(const ctx of contexts.reverse()) {
      try { await ctx.close(); } catch {cleanupFailure=true;}
    }
    try {await browser.close();}catch{cleanupFailure=true;}
  }
  if(testFailure||cleanupFailure)throw new Error('PHASE 2B FAILED: isolated live test or cleanup');
}

main().catch(error=>{console.error(error instanceof Error?error.message:'PHASE 2B FAILED');process.exitCode=1;});
