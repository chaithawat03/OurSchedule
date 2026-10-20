import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  buildExperiment,namedDatabaseConfig,assertNamedDatabaseOnly,prepare,
} from '../../scripts/m4b/prepare-named-e2e-rules.mjs';

test('the experimental Rules preserve original production policy and never mutate it',()=>{
  const original=readFileSync('firestore.rules','utf8');
  const fragment=readFileSync(
    'tests/security/fixtures/m4b-owner-published.rules.fragment','utf8');
  const experimental=buildExperiment(original,fragment);
  assert.ok(experimental.includes('match /rooms/{roomId}/sharedCalendarV1/{entryId}'));
  assert.ok(experimental.includes('allow update: if false;'));
  assert.ok(experimental.includes('quotaConsumed(request.auth.uid'));
  assert.ok(experimental.includes('match /{document=**}'));
  assert.equal(readFileSync('firestore.rules','utf8'),original);
  assert.throws(()=>buildExperiment(original,'unsafe'),/manual review/);
  assert.throws(()=>buildExperiment('missing anchor',fragment),/manual review/);
});

test('output config references the named E2E database and NO other cloud targets',()=>{
  const config=namedDatabaseConfig();
  assert.deepEqual(config,{firestore:{
    database:'ourschedule-e2e',rules:'firestore.m4b.named-e2e.rules',
  }});
  assertNamedDatabaseOnly(config);
  for(const invalid of [
    {firestore:{database:'(default)',rules:config.firestore.rules}},
    {firestore:{database:'ourschedule',rules:config.firestore.rules}},
    {...config,hosting:{public:'dist'}},
    {...config,functions:{source:'functions'}},
    {...config,storage:{rules:'storage.rules'}},
    {firestore:{...config.firestore,indexes:'firestore.indexes.json'}},
  ])assert.throws(()=>assertNamedDatabaseOnly(invalid));
});

test('prepare generates a deploy config without deploying or changing current Rules',()=>{
  const path=mkdtempSync(join(tmpdir(),'ourschedule-m4b-'));
  try {
    const before=readFileSync('firestore.rules','utf8');
    const result=prepare(path);
    assert.equal(result.project,'ourschedule');
    assert.equal(result.database,'ourschedule-e2e');
    const config=JSON.parse(readFileSync(result.config,'utf8'));
    assertNamedDatabaseOnly(config);
    assert.ok(readFileSync(result.rules,'utf8').includes('sharedCalendarV1'));
    assert.equal(readFileSync('firestore.rules','utf8'),before);
  }finally{rmSync(path,{recursive:true,force:true});}
});
