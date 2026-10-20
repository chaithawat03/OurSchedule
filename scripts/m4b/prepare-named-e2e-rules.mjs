#!/usr/bin/env node
/**
 * Prepare, DO NOT DEPLOY, a single-NAMED-DATABASE M4b rules experiment.
 *
 * Output cannot contain Hosting, Functions, default Firestore or Production.
 * The test fragment is injected only into a copy of the existing rules.
 * An authorized human must review and explicitly run the separate firebase
 * deploy command for the named `ourschedule-e2e` database.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PROJECT='ourschedule';
const DATABASE='ourschedule-e2e';
const OUTPUT_DIR='.firebase-m4b-generated';
const RULES_FILENAME='firestore.m4b.named-e2e.rules';
const CONFIG_FILENAME='firebase.m4b.named-e2e.json';
const ANCHOR='    // Room-wide calendar projections remain closed until M3.2b.';

export function buildExperiment(base,fragment){
  if(base.split(ANCHOR).length!==2 || !fragment.includes('sharedCalendarV1') ||
      base.includes('sharedCalendarV1')) {
    throw Error('M4b rules anchor/fragment changed: manual review required');
  }
  return base.replace(ANCHOR,fragment+'\n'+ANCHOR);
}

export function namedDatabaseConfig(){
  return {firestore:{database:DATABASE,rules:RULES_FILENAME}};
}

export function assertNamedDatabaseOnly(config) {
  const expected=namedDatabaseConfig();
  if(JSON.stringify(config)!==JSON.stringify(expected) ||
     JSON.stringify(config).includes('"(default)"') ||
     'hosting' in config || 'functions' in config || 'storage' in config) {
    throw Error('Refusing config with resource other than named E2E Firestore Rules');
  }
}

export function prepare(outDir=OUTPUT_DIR){
  const base=readFileSync('firestore.rules','utf8');
  const fragment=readFileSync(
    'tests/security/fixtures/m4b-owner-published.rules.fragment','utf8');
  const experiment=buildExperiment(base,fragment);
  const config=namedDatabaseConfig();
  assertNamedDatabaseOnly(config);
  mkdirSync(outDir,{recursive:true});
  writeFileSync(resolve(outDir,RULES_FILENAME),experiment);
  writeFileSync(resolve(outDir,CONFIG_FILENAME),
    JSON.stringify(config,null,2)+'\n');
  return {project:PROJECT,database:DATABASE,
    rules:resolve(outDir,RULES_FILENAME),
    config:resolve(outDir,CONFIG_FILENAME)};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try {
    const result=prepare();
    console.log('M4B E2E RULES PREPARED: project='+result.project+
      ' database='+result.database);
    console.log('Generated config: '+result.config);
    console.log('No Firebase deploy was attempted.');
  } catch(error) {
    console.error('M4B PREPARE FAILED: '+
      (error instanceof Error?error.message:'unknown'));
    process.exitCode=1;
  }
}
