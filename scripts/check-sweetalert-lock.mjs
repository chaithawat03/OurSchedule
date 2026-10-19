import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const meta = lock.packages?.['node_modules/sweetalert2'];

assert.equal(pkg.dependencies?.sweetalert2, '11.26.25');
assert.equal(lock.packages?.['']?.dependencies?.sweetalert2, pkg.dependencies.sweetalert2);
assert.equal(meta?.version, pkg.dependencies.sweetalert2);
assert.equal(meta?.resolved,
  'https://registry.npmjs.org/sweetalert2/-/sweetalert2-11.26.25.tgz');
assert.equal(meta?.integrity,
  'sha512-+hunCOJdJ6FLj04T9YSLvvZXRjsvIkTeTKP2e4VF8CaBias961BTnWiSFAy7F/CM5eq3QK2Rraoc5Gzftslvkg==');
console.log('SweetAlert2 dependency is pinned and integrity-locked.');
