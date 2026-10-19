// Stateless builders for attended M3.2a live STAGING API requests.
// Pure functions: never contact external hosts or read credentials.
import { DOC_ROOT, pathOf, UID_PATTERN } from './m2-live-payloads.mjs';

export const LABEL_ACCEPT = 'M32A-ACCEPT';
export const LABEL_DECLINE = 'M32A-DECLINE';
export const LABEL_REVOKE = 'M32A-REVOKE';
export const STAGES = [LABEL_ACCEPT, LABEL_DECLINE, LABEL_REVOKE];

export function inboxQuery(uid) {
  if (!UID_PATTERN.test(uid)) throw new Error('Invalid recipient UID');
  return {
    parent: DOC_ROOT + '/users/' + uid,
    body: {
      structuredQuery: {
        from: [{ collectionId: 'roomActivityInvites' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 20,
      },
    },
  };
}
export function roomEventsListQuery(roomId) {
  pathOf('rooms', roomId);
  return {
    parent: DOC_ROOT + '/rooms/' + roomId,
    body: { structuredQuery: { from: [{ collectionId: 'events' }], limit: 20 } },
  };
}

export function decideInvitation(uid, id, decision) {
  if (!['ACCEPTED','DECLINED'].includes(decision)) {
    throw new Error('Decision must be ACCEPTED or DECLINED');
  }
  return [{
    update: {
      name: pathOf('users', uid, 'roomActivityInvites', id),
      fields: { state: { stringValue: decision } },
    },
    updateMask: { fieldPaths: ['state'] },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: true },
  }];
}

export function parseInboxDocument(document, uid, roomId, ownerUid) {
  const fullName = document?.name || '';
  const prefix = pathOf('users', uid, 'roomActivityInvites') + '/';
  if (!fullName.startsWith(prefix)) throw new Error('Unexpected private inbox parent');
  const eventId = fullName.slice(prefix.length);
  pathOf('rooms', roomId, 'events', eventId);
  const f = document.fields ?? {};
  if (f.eventId?.stringValue !== eventId ||
      f.roomId?.stringValue !== roomId ||
      f.recipientUid?.stringValue !== uid ||
      f.creatorUid?.stringValue !== ownerUid ||
      !STAGES.includes(f.title?.stringValue) ||
      !['PENDING','ACCEPTED','DECLINED'].includes(f.state?.stringValue)) {
    throw new Error('Unexpected recipient inbox payload; stop safely');
  }
  return { eventId, title: f.title.stringValue, state: f.state.stringValue };
}

export function findNewAssignment(rows, label, previousCount) {
  if (!STAGES.includes(label)) throw new Error('Unknown acceptance phase');
  const expected = previousCount + 1;
  const matches = rows.filter((x) => x.title === label);
  // Never print UIDs, document paths, invite contents, or sensitive event notes.
  // Distinguish recipient mismatch (no new item) from duplicate submissions.
  if (rows.length !== expected) {
    throw new Error(
      'Recipient inbox count mismatch for ' + label +
      ': expected ' + expected + ', found ' + rows.length +
      ', matching title ' + matches.length +
      '. Inspect correct room/member and duplicate sends; do not retry blindly.',
    );
  }
  if (matches.length !== 1 || matches[0].state !== 'PENDING') {
    throw new Error(
      'Recipient inbox stage mismatch for ' + label +
      ': matching title ' + matches.length +
      ', pending ' + matches.filter((x) => x.state === 'PENDING').length +
      '. Verify correct recipient and room.',
    );
  }
  return matches[0];
}
