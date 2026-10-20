# M4b proof: independent, owner-published ROOM/BUSY_ONLY appointments

**Current state: Emulator experiment only. NOT enabled in live Staging or Production.**

## Decision proposal

Prefer deliberately authored, first-class room-shared appointments rather than
deriving public projections from existing PRIVATE room assignments. Existing
PRIVATE events stay in `rooms/{roomId}/events` and are never migrated or
linked to shared documents. This avoids the hard-to-verify invariants of
client-generated derivative projections and deletion propagation between
different event documents.

Experimental new namespace:
`rooms/{roomId}/sharedCalendarV1/{entryId}`

- ROOM document: exactly
  `{roomId,visibility:'ROOM',startAt,endAt,allDay,title}`.
- BUSY_ONLY document: exactly
  `{roomId,visibility:'BUSY_ONLY',startAt,endAt,allDay}`.
- No `notes`, recipient, creator, private source ID, direct/private event
  linkage, attendee details, phone, description, arbitrary fields or metadata.
- The owner deliberately creates each new shared appointment. No existing
  event can be automatically published. Creating a shared appointment is
  NOT the same as assigning a private event to a recipient.
- Only the current room Owner can create or remove shared entries. No
  client-side update/visibility switch is allowed; a change requires
  withdrawing the old entry and explicitly publishing a new entry.
- Creation MUST atomically consume the existing `roomEvents` 20-per-24h
  quota with resource ID `shared_<roomId>_<entryId>`.
- Reads require the room Owner or current active room membership. Bounded
  per-room list (limit <= 20), no cross-room query or global collection group.
  Clients should call getDocsFromServer for current authorization and avoid
  displaying stale cached records after a user switch or revocation.
- The last consumed results can be truncated and UI must show an incomplete
  data warning rather than pretending all appointments are loaded.
- Revocation protects new reads; previously downloaded/photographed data
  cannot be retroactively erased.
- Administrative writes bypass Firestore Security Rules: protecting the
  shared collection from a malicious/mistaken server writer is a **separate**
  deployment review item. No Admin SDK writer is included or required for the
  experimental owner-only client publication.

## Security proof scope

`tests/security/fixtures/m4b-owner-published.rules.fragment` is deliberately
**not a Firebase deployable ruleset**. Emulator tests inject it into the
current `firestore.rules` in memory. They verify both the original production
deny policy AND the experiment's owner writes/member reads. Production
`firestore.rules` remains unchanged; `firebase.phase2b.json`,
`firebase.staging.json`, indexes, Hosting and IAM are also unchanged.

The test fixture creates test-only room membership and a quota transaction.
It asserts a seeded owner can publish, active members can read, an outsider
cannot, an owner cannot mutate already-published entries, and a removed
member loses new read permission. Forged ROOM/BUSY_ONLY documents and direct
reads of PRIVATE content remain prohibited.

## Before enabling on named E2E database

1. Address potential Firestore rules query evaluation behavior for bounded
   list queries and explicit membership reads; validate actual Emulator logs.
2. Ensure published records in `sharedCalendarV1` were created only through
   validated owner writes. The new namespace is empty initially; do not seed
   historical data with the Admin SDK without a strict sanitizer.
3. Confirm an explicit owner UI flow and a new `owner-published` form. The
   current M4a room assignments remain PRIVATE.
4. Add two-UID Playwright scenarios, cross-room tests, revocation/rejoin
   tests, quota boundary and cache invalidation.
5. In a separate review, prepare versioned Rules release to
   `ourschedule-e2e` only, and use the Phase2b preview frontend. Hosting-only
   Auto Deploy must NEVER ship Rules.
6. After explicit user acceptance in isolated named E2E database, propose a
   reviewed default-Staging Firestore Rules rollout; NEVER touch Production
   without separate approval.

Until those conditions are met, there is **no shared calendar backend enabled
on live OurSchedule**. This is a safety design and test-driven proof, not a
claim of M4b completion.
