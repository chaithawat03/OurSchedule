import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DOC_ROOT } from '../../scripts/lib/m2-live-payloads.mjs';
import { LABEL_ACCEPT, LABEL_DECLINE, LABEL_REVOKE,
  inboxQuery, roomEventsListQuery, decideInvitation, parseInboxDocument,
  findNewAssignment } from '../../scripts/lib/m3-room-live-payloads.mjs';

const uid = 'ephemeralB123';
const owner = 'googleOwner456';
const room = 'roomStaging789';

function document(id, title, state = 'PENDING') {
  return {
    name: DOC_ROOT + '/users/' + uid + '/roomActivityInvites/' + id,
    fields: {
      eventId: { stringValue: id },
      roomId: { stringValue: room },
      recipientUid: { stringValue: uid },
      creatorUid: { stringValue: owner },
      title: { stringValue: title },
      state: { stringValue: state },
    },
  };
}

describe('M3.2a attended live harness builders (offline)', () => {
  it('queries only a named recipient, sorted descending, and limited to 20', () => {
    const q = inboxQuery(uid);
    assert.equal(q.parent, DOC_ROOT + '/users/' + uid);
    assert.equal(q.body.structuredQuery.limit, 20);
    assert.equal(q.body.structuredQuery.orderBy[0].field.fieldPath, 'createdAt');
    assert.equal(q.body.structuredQuery.from[0].collectionId, 'roomActivityInvites');
    assert.throws(() => inboxQuery('../owner'));
    const roomQ = roomEventsListQuery(room);
    assert.equal(roomQ.parent, DOC_ROOT + '/rooms/' + room);
    assert.equal(roomQ.body.structuredQuery.from[0].collectionId, 'events');
  });

  it('writes only one directional decision with a server timestamp and existing-document precondition', () => {
    for (const state of ['ACCEPTED', 'DECLINED']) {
      const writes = decideInvitation(uid, 'test-123', state);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].update.fields.state.stringValue, state);
      assert.deepEqual(writes[0].updateMask.fieldPaths, ['state']);
      assert.equal(writes[0].currentDocument.exists, true);
      assert.deepEqual(writes[0].updateTransforms, [{
        fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME',
      }]);
    }
    assert.throws(() => decideInvitation(uid, 'test-123', 'PENDING'));
  });

  it('inspects exact recipient/room/creator without accepting stray inbox', () => {
    assert.deepEqual(parseInboxDocument(document('event-1', LABEL_ACCEPT), uid, room, owner),
      { eventId: 'event-1', title: LABEL_ACCEPT, state: 'PENDING' });
    assert.throws(() => parseInboxDocument(document('event-1', LABEL_ACCEPT), 'otherUid', room, owner));
    assert.throws(() => parseInboxDocument(document('event-1', LABEL_ACCEPT), uid, room, 'otherUid'));
    assert.throws(() => parseInboxDocument(document('event-1', 'OTHER'), uid, room, owner));
    assert.throws(() => parseInboxDocument(document('event-1', LABEL_ACCEPT, 'IMPERSONATED'), uid, room, owner));
  });

  it('requires exactly one new assignment with the expected title and pending state', () => {
    const first = parseInboxDocument(document('one', LABEL_ACCEPT), uid, room, owner);
    const second = parseInboxDocument(document('two', LABEL_DECLINE), uid, room, owner);
    const third = parseInboxDocument(document('three', LABEL_REVOKE), uid, room, owner);
    assert.deepEqual(findNewAssignment([first], LABEL_ACCEPT, 0), first);
    assert.deepEqual(findNewAssignment([first, second], LABEL_DECLINE, 1), second);
    assert.deepEqual(findNewAssignment([first, second, third], LABEL_REVOKE, 2), third);
    assert.throws(() => findNewAssignment([first, second], LABEL_ACCEPT, 0));
    assert.throws(() => findNewAssignment([{ ...first, state: 'ACCEPTED' }], LABEL_ACCEPT, 0));
    assert.throws(() => findNewAssignment([], LABEL_REVOKE, 0),
      /expected 1, found 0, matching title 0/);
    assert.throws(() => findNewAssignment([first, { ...first, eventId: 'another' }], LABEL_REVOKE, 0),
      /expected 1, found 2, matching title 0/);
    assert.throws(() => findNewAssignment([first], LABEL_REVOKE, 0),
      /matching title 0, pending 0/);
  });
});
