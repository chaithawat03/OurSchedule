import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const spec = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
const matching = spec.indexes.filter((index) =>
  index.collectionGroup === 'members' &&
  index.queryScope === 'COLLECTION_GROUP' &&
  ['uid', 'role', 'membershipState'].every((fieldPath, position) =>
    index.fields[position]?.fieldPath === fieldPath &&
    index.fields[position]?.order === 'ASCENDING'));
assert.equal(matching.length, 1,
  'The joined-room query requires exactly one members(uid,role,membershipState) composite COLLECTION_GROUP index');
console.log('Joined-room composite index config: valid.');
