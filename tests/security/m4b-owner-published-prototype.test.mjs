import { readFileSync } from 'node:fs';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query,
  setDoc, Timestamp, writeBatch, updateDoc,
} from 'firebase/firestore';
import { includeQuota } from './quotaHelpers.mjs';

const oldRules=readFileSync('firestore.rules','utf8');
const fragment=readFileSync('tests/security/fixtures/m4b-owner-published.rules.fragment','utf8');
const anchor='    // Room-wide calendar projections remain closed until M3.2b.';
if(oldRules.split(anchor).length!==2) throw Error('Unexpected production Rules anchor; review fixture insertion');
const draftRules=oldRules.replace(anchor,fragment+'\n'+anchor);
const a='m4b-owner',b='m4b-member',c='m4b-stranger';
const room='m4b-room',otherRoom='m4b-other-room';
const started=Timestamp.fromDate(new Date('2026-10-18T08:00:00+07:00'));
const start=Timestamp.fromDate(new Date('2026-10-20T09:00:00+07:00'));
const end=Timestamp.fromDate(new Date('2026-10-20T10:00:00+07:00'));
const busy=(roomId=room,extra={})=>({
  roomId,visibility:'BUSY_ONLY',startAt:start,endAt:end,allDay:false,...extra,
});
const named=(roomId=room,extra={})=>({
  ...busy(roomId),visibility:'ROOM',title:'กิจกรรมที่ตั้งใจเผยแพร่',...extra,
});
const path=(roomId,id)=>'rooms/'+roomId+'/sharedCalendarV1/'+id;

let draft,production;
before(async()=>{
  draft=await initializeTestEnvironment({
    projectId:'demo-ourschedule-m4b-draft',
    firestore:{rules:draftRules},
  });
  production=await initializeTestEnvironment({
    projectId:'demo-ourschedule-m4b-production',
    firestore:{rules:oldRules},
  });
  const seed=async(db)=>{
    for(const [id,owner] of [[room,a],[otherRoom,c]]){
      await setDoc(doc(db,'rooms',id),{
        ownerUid:owner,name:'Isolated Test Room',assignmentPolicy:'REQUIRE_ACCEPTANCE',
        defaultVisibility:'PRIVATE',createdAt:started,updatedAt:started,
      });
      await setDoc(doc(db,'rooms',id,'members',owner),{
        uid:owner,role:'owner',membershipState:'active',joinedAt:started,
      });
    }
    await setDoc(doc(db,'rooms',room,'members',b),{
      uid:b,role:'member',membershipState:'active',
      joinedAt:started,inviteId:'a'.repeat(43),
    });
  };
  await draft.withSecurityRulesDisabled(async(ctx)=>seed(ctx.firestore()));
  await production.withSecurityRulesDisabled(async(ctx)=>seed(ctx.firestore()));
});
after(async()=>{
  if(draft)await draft.cleanup();
  if(production)await production.cleanup();
});
const db=uid=>draft.authenticatedContext(uid).firestore();
async function publish(id,data=busy(),roomId=room,owner=a){
  const d=db(owner);
  const batch=writeBatch(d);
  await includeQuota(batch,d,owner,'roomEvents','shared_'+roomId+'_'+id);
  batch.set(doc(d,path(roomId,id)),data);
  return batch.commit();
}

describe('M4b owner-published shared calendar: isolated emulator prototype only',()=>{
  it('production Firestore Rules remain unchanged and deny the new namespace',async()=>{
    assert.equal(oldRules.includes('sharedCalendarV1'),false);
    const prodMember=production.authenticatedContext(b).firestore();
    await assertFails(getDocs(query(collection(prodMember,'rooms',room,'sharedCalendarV1'),limit(20))));
    await assertFails(getDoc(doc(prodMember,path(room,'new-event'))));
    await assertFails(setDoc(doc(production.authenticatedContext(a).firestore(),
      path(room,'unauthorized')),named()));
  });

  it('requires atomic owner quota and rejects forged owner/recipient creation',async()=>{
    await assertFails(setDoc(doc(db(a),path(room,'no-quota')),busy()));
    const wrong=writeBatch(db(a));
    await includeQuota(wrong,db(a),a,'roomEvents','another-resource');
    wrong.set(doc(db(a),path(room,'wrong-quota')),busy());
    await assertFails(wrong.commit());
    await assertFails(setDoc(doc(db(b),path(room,'by-member')),named()));
    await assertFails(setDoc(doc(db(c),path(room,'by-stranger')),busy()));
    await assertFails(publish('other-owner-path',busy(otherRoom),otherRoom,a));
    await assertSucceeds(publish('owner-created-busy'));
  });

  it('BUSY_ONLY does not carry a title and ROOM contains title without PRIVATE notes',async()=>{
    const owner=db(a),member=db(b);
    await assertSucceeds(publish('explicit-room-entry',named()));
    const busySnap=await assertSucceeds(getDoc(doc(member,path(room,'owner-created-busy'))));
    assert.equal(busySnap.data()?.visibility,'BUSY_ONLY');
    assert.deepEqual(Object.keys(busySnap.data()).sort(),
      ['roomId','visibility','startAt','endAt','allDay'].sort());
    const namedSnap=await assertSucceeds(getDoc(doc(member,path(room,'explicit-room-entry'))));
    assert.equal(namedSnap.data()?.title,'กิจกรรมที่ตั้งใจเผยแพร่');
    assert.equal(namedSnap.data()?.notes,undefined);
    const list=await assertSucceeds(getDocs(query(
      collection(member,'rooms',room,'sharedCalendarV1'),limit(20))));
    assert.ok(list.size>=2);
    await assertSucceeds(getDocs(query(collection(owner,'rooms',room,'sharedCalendarV1'),limit(20))));
    await assertFails(getDocs(collection(member,'rooms',room,'sharedCalendarV1')));
    await assertFails(getDocs(query(collection(member,'rooms',room,'sharedCalendarV1'),limit(21))));
  });

  it('PRIVATE and any field that could expose notes, member UID or private source is rejected',async()=>{
    const variants=[
      {...busy(),visibility:'PRIVATE'}, {...busy(),title:'secret'},
      {...busy(),notes:'medical'}, {...busy(),recipientUid:b},
      {...busy(),sourceEventId:'private'}, {...busy(),creatorUid:a},
      {...busy(),email:'mail@example.test'},
      {...named(),notes:'medical'}, {...named(),sourceEventId:'existing'},
      {...named(),recipientUid:b},{...named(),title:'x'.repeat(121)},
      {...named(),title:''},{...busy(),roomId:'foreign'},
      {...busy(),allDay:'false'}, {...busy(),startAt:end,endAt:start},
      {...busy(),endAt:Timestamp.fromDate(new Date('2026-10-22T10:00:00+07:00'))},
    ];
    for(let i=0;i<variants.length;i++){
      await assertFails(publish('bad-'+i,variants[i]));
    }
  });

  it('a current member may read only their room; outsider/anonymous/forged privileged claims denied',async()=>{
    await assertFails(getDoc(doc(db(c),path(room,'explicit-room-entry'))));
    await assertFails(getDocs(query(collection(db(c),'rooms',room,'sharedCalendarV1'),limit(20))));
    await assertFails(getDoc(doc(db(b),path(otherRoom,'any-id'))));
    await assertFails(getDoc(doc(draft.unauthenticatedContext().firestore(),
      path(room,'explicit-room-entry'))));
    const forged=draft.authenticatedContext(c,{role:'owner',admin:true}).firestore();
    await assertFails(getDoc(doc(forged,path(room,'explicit-room-entry'))));
    await assertFails(getDocs(query(collection(forged,'rooms',room,'sharedCalendarV1'),limit(20))));
    await assertFails(setDoc(doc(forged,path(room,'fake-admin')),busy()));
  });

  it('owner can withdraw entry by delete, but members cannot edit/delete and no one can mutate publication',async()=>{
    const entry=doc(db(a),path(room,'explicit-room-entry'));
    await assertFails(updateDoc(entry,{visibility:'BUSY_ONLY'}));
    await assertFails(updateDoc(entry,{title:'silently changed'}));
    await assertFails(updateDoc(doc(db(b),path(room,'explicit-room-entry')),{title:'forge'}));
    await assertFails(deleteDoc(doc(db(b),path(room,'explicit-room-entry'))));
    await assertSucceeds(deleteDoc(entry));
    const afterDelete=await assertSucceeds(getDocs(query(
      collection(db(b),'rooms',room,'sharedCalendarV1'),limit(20))));
    assert.equal(afterDelete.docs.some(item=>item.id==='explicit-room-entry'),false);
  });

  it('member revocation prevents new reads regardless of knowledge of document IDs',async()=>{
    const privateRoom=room;
    await assertSucceeds(getDoc(doc(db(b),path(privateRoom,'owner-created-busy'))));
    await assertSucceeds(deleteDoc(doc(db(a),'rooms',room,'members',b)));
    await assertFails(getDoc(doc(db(b),path(room,'owner-created-busy'))));
    await assertFails(getDocs(query(collection(db(b),'rooms',room,'sharedCalendarV1'),limit(20))));
  });

  it('never grants access to existing PRIVATE events or legacy calendarProjections',async()=>{
    // Original production rule namespaces are unchanged in prototype.
    const client=db(b);
    await assertFails(getDocs(query(collection(client,'rooms',room,'events'),limit(20))));
    await assertFails(getDocs(query(collection(client,'rooms',room,'calendarProjections'),limit(20))));
    await assertFails(getDoc(doc(client,'rooms',room,'calendarProjections','legacy')));
  });
});

