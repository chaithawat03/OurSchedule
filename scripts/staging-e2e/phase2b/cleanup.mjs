/**
 * Privileged cleanup is permitted only on the dedicated NAMED E2E database.
 * IAM role for the cleanup SA MUST be conditional on exactly that database.
 * This module never invokes the default database or accepts caller-supplied
 * project/database/doc-path targets. A failed inventory means NO deletions.
 */
import assert from 'node:assert/strict';
import {
  DATABASE_ID, PROJECT_ID, OWNER_UID, MEMBER_UID, MAX_CLEANUP_DOCS,
} from './guard.mjs';

const ROOT = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
  '/databases/' + DATABASE_ID + '/documents';

const FIELD = (doc, name) => doc.fields?.[name]?.stringValue;
const VALID_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const ALLOWED_ROOT = new Set(['users', 'rooms', 'roomInvites']);
const CHILD_COLLECTIONS = Object.freeze({
  users: new Set(['quotas', 'roomActivityInvites']),
  rooms: new Set(['members', 'events']),
});

export function validateCleanupDocument(path, doc, roomIds = new Set()) {
  assert.ok(typeof path === 'string' && path.split('/').every(p => VALID_SEGMENT.test(p)),
    'Unsafe cleanup path');
  assert.equal(doc.name, ROOT.replace('https://firestore.googleapis.com/v1/', '') + '/' + path,
    'Firestore document name does not match isolated database and path');
  const parts = path.split('/');
  assert.ok(parts.length === 2 || parts.length === 4, 'Unexpected document depth');
  const [group, id, child, childId] = parts;
  if (group === 'users') {
    assert.ok([OWNER_UID, MEMBER_UID].includes(id), 'Refusing non-synthetic profile');
    if (child === undefined) return;
    if (child === 'quotas') {
      assert.ok(['rooms','invites','roomEvents','personalEvents'].includes(childId),
        'Unexpected test quota');
      return;
    }
    assert.equal(child, 'roomActivityInvites', 'Unexpected user subcollection');
    assert.equal(FIELD(doc, 'recipientUid'), MEMBER_UID, 'Inbox belongs to another member');
    assert.equal(FIELD(doc, 'creatorUid'), OWNER_UID, 'Inbox created by another owner');
    assert.ok(roomIds.has(FIELD(doc, 'roomId')), 'Inbox linked to unknown room');
    return;
  }
  if (group === 'rooms') {
    assert.ok(roomIds.has(id), 'Unexpected room ID');
    if (child === undefined) {
      assert.equal(FIELD(doc, 'ownerUid'), OWNER_UID);
      assert.match(FIELD(doc, 'name') ?? '', /^P2B-E2E-[A-Za-z0-9-]{1,45}$/);
      return;
    }
    if (child === 'members') {
      assert.ok([OWNER_UID,MEMBER_UID].includes(childId));
      assert.equal(FIELD(doc, 'uid'), childId);
      return;
    }
    assert.equal(child, 'events', 'Unexpected room subcollection');
    assert.equal(FIELD(doc, 'creatorUid'), OWNER_UID);
    assert.equal(FIELD(doc, 'recipientUid'), MEMBER_UID);
    assert.equal(FIELD(doc, 'visibility'), 'PRIVATE');
    assert.match(FIELD(doc, 'title') ?? '', /^P2B-E2E-/);
    return;
  }
  assert.equal(group, 'roomInvites', 'Refusing unknown collection');
  assert.equal(parts.length, 2);
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(FIELD(doc, 'createdByUid'), OWNER_UID);
  assert.ok(roomIds.has(FIELD(doc, 'roomId')), 'Invite targets unknown room');
}

export function validateInventoryDocuments(items) {
  assert.ok(Array.isArray(items) && items.length <= MAX_CLEANUP_DOCS,
    'E2E inventory exceeded safety cap');
  const roomDocs = items.filter(({ path }) => /^rooms\/[^/]+$/.test(path));
  assert.ok(roomDocs.length <= 1, 'More than one live test room: fail closed');
  const roomIds = new Set(roomDocs.map(({ path }) => path.split('/')[1]));
  for (const {path, document} of items) validateCleanupDocument(path, document, roomIds);
  const counts = new Map();
  for (const {path} of items) {
    const collection = path.split('/').length === 2
      ? path.split('/')[0] : path.split('/')[2];
    counts.set(collection,(counts.get(collection) ?? 0)+1);
  }
  assert.ok((counts.get('roomInvites') ?? 0) <= 1, 'Unexpected invite count');
  assert.ok((counts.get('events') ?? 0) <= 3, 'Unexpected event count');
  assert.ok((counts.get('roomActivityInvites') ?? 0) <= 3, 'Unexpected inbox count');
  assert.ok((counts.get('members') ?? 0) <= 2, 'Unexpected membership count');
  return [...items].sort((a,b) =>
    b.path.split('/').length - a.path.split('/').length ||
    a.path.localeCompare(b.path));
}

async function googleFetch(url, accessToken, { method = 'GET', body, fetchImpl = fetch } = {}) {
  assert.ok(url.startsWith(ROOT), 'Refusing Firestore access beyond E2E named database');
  const response = await fetchImpl(url, {
    method,
    headers: {
      authorization: 'Bearer ' + accessToken,
      ...(body ? {'content-type': 'application/json'} : {}),
    },
    ...(body ? {body:JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error('Isolated Firestore cleanup API returned HTTP ' + response.status);
  }
  return response.status === 204 ? {} : response.json();
}
const apiPath = (path) =>
  path.split('/').map(part => {
    assert.match(part,VALID_SEGMENT);
    return encodeURIComponent(part);
  }).join('/');

async function listCollectionIds(parent, token, fetchImpl) {
  const url = parent ? ROOT + '/' + apiPath(parent) + ':listCollectionIds'
    : ROOT + ':listCollectionIds';
  const result = await googleFetch(url,token,{method:'POST',body:{pageSize:100},fetchImpl});
  assert.ok(!result.nextPageToken, 'Refusing paginated collection inventory');
  const names = result.collectionIds ?? [];
  assert.ok(Array.isArray(names) && names.length <= 5);
  return names;
}

async function listDocs(path, token, fetchImpl) {
  const response = await googleFetch(ROOT+'/'+apiPath(path)+'?pageSize=100',token,{fetchImpl});
  assert.ok(!response.nextPageToken, 'Refusing paginated document inventory');
  const docs = response.documents ?? [];
  assert.ok(Array.isArray(docs) && docs.length <= MAX_CLEANUP_DOCS);
  return docs.map(document => {
    const prefix=ROOT.replace('https://firestore.googleapis.com/v1/','')+'/';
    assert.ok(document.name?.startsWith(prefix), 'Document from another database');
    const documentPath=document.name.slice(prefix.length);
    assert.ok(documentPath.startsWith(path+'/') &&
      documentPath.split('/').length===path.split('/').length+1,
      'Unexpected Firestore collection listing');
    return {path:documentPath,document};
  });
}

export async function inventoryIsolatedDatabase(token, fetchImpl=fetch) {
  assert.ok(typeof token === 'string' && token.length>50);
  const roots=await listCollectionIds('',token,fetchImpl);
  assert.ok(roots.every(name=>ALLOWED_ROOT.has(name)), 'Unknown E2E root collection');
  const inventory=[];
  // Discover all docs/descendants BEFORE deleting even a single document.
  async function walkCollection(path) {
    const docs=await listDocs(path,token,fetchImpl);
    for (const item of docs) {
      inventory.push(item);
      assert.ok(inventory.length<=MAX_CLEANUP_DOCS, 'Document cap exceeded');
      const nested=await listCollectionIds(item.path,token,fetchImpl);
      const [root]=item.path.split('/');
      const permitted=CHILD_COLLECTIONS[root] ?? new Set();
      assert.ok(nested.every(name=>permitted.has(name)),
        'Unexpected nested collection, refusing cleanup');
      // Prevent nested nesting deeper than the known schema.
      assert.ok(!nested.length || item.path.split('/').length===2);
      for (const name of nested) await walkCollection(item.path+'/'+name);
    }
  }
  for(const name of roots) await walkCollection(name);
  return validateInventoryDocuments(inventory);
}

export async function cleanIsolatedDatabase(token, fetchImpl=fetch) {
  const inventory=await inventoryIsolatedDatabase(token,fetchImpl);
  for(const {path} of inventory) {
    await googleFetch(ROOT+'/'+apiPath(path),token,{method:'DELETE',fetchImpl});
  }
  const after=await inventoryIsolatedDatabase(token,fetchImpl);
  assert.equal(after.length,0,'Isolated named E2E database not empty after cleanup');
  return inventory.length;
}
