# M4b — room-wide calendar projection security design (proposal, not enabled)

Status: **design + negative tests only**. This document is a review contract,
not permission to deploy new Firestore Rules. PR implementing it MUST include
its own emulator tests, synthetic two-user acceptance and rollback strategy.

## Purpose

M4a already combines a user's own PRIVATE activities with explicitly accepted,
single-recipient PRIVATE room assignments. M4b adds optional **room-wide**
calendar visibility to active members, without making other users' PRIVATE
items discoverable. A room-wide schedule must NOT be produced by widening
read access to `rooms/{roomId}/events` (those records contain PRIVATE titles,
notes and recipient identifiers).

## Proposed visibility contract

| User-selected event visibility | Owner / creator | Explicit recipient | Other active room members | Former member / outsider |
|---|---|---|---|---|
| PRIVATE | Full event | Full details **after acceptance** and while membership remains eligible | No existence, time, title, or notes | Denied |
| ROOM | Full event | Assignment decision still governed by room policy | Explicitly published title and time only; no notes or recipient UID | Denied |
| BUSY_ONLY | Full event | Assignment decision still governed by room policy | Time slot only; title and notes never included | Denied |

Room `defaultVisibility` is only a UI default. Each event's final
visibility MUST be chosen or confirmed by its creator before publishing.
No automatic promotion of historical PRIVATE events. Assignment acceptance
must never silently turn PRIVATE into ROOM or BUSY_ONLY.

### Proposal: distinct projection collection

The only member-readable surface should eventually be
`rooms/{roomId}/calendarProjections/{projectionId}`, with a strict
visibility-specific schema. Examples of allowed fields:

- Common: `roomId`, `sourceEventId`, `creatorUid`, `visibility`,
  `startAt`, `endAt`, `allDay`, `status`, `createdAt`, `updatedAt`.
- ROOM only: `title` (bounded string); **no notes**, attendee identities,
  invitations, phone numbers, room secrets or user profiles.
- BUSY_ONLY: only the common fields; UI label is generated locally as
  `ไม่ว่าง` without retrieving event title.
- PRIVATE: **no projection document whatsoever**.

Before adopting this schema, review whether `creatorUid` and
`sourceEventId` should be removed or replaced by opaque values, because
their presence reveals extra metadata to other members even for BUSY_ONLY.
A simpler privacy-preserving variant uses only the roomId, dates, visibility,
status and opaque projection ID. It may require backend attestation.

## Trust and lifecycle requirements

1. **Server-side Rules, never just checkbox filtering.** A member's
   `GET` and bounded `LIST` must be protected by current active membership
   in the same room, and must never expose parent event details. Query
   constraints/indexes must be compatible with Rules; Rules are not filters.
2. **Owner/creator write proof.** A client must not forge another event's
   times, ROOM title, visibility or another owner's projection. If using a
   transaction or batch, validate the corresponding event document with
   `getAfter` and ensure the same room and creator, consistency of times,
   immutable links, allowed status transition, rate limit and one-to-one ID.
   If these invariants cannot be proven with Firestore Rules, use a
   restricted server-side projection writer (e.g. Cloud Functions) rather
   than accepting client-attested projection writes.
3. **No PRIVATE migration.** Existing M3.2a `PRIVATE` event schema remains
   unchanged. On cancellation or allowed visibility change, projectors must
   withdraw shared information atomically or via a sufficiently secure,
   reconciled server-side process. No "stale ROOM" ghost slot may outlive
   cancellation or an event becoming PRIVATE.
4. **Revocation.** A removed member is denied new projection reads
   immediately by Firestore Rules. Offline/cached data already seen or
   copied cannot be technically retracted; communicate this limitation.
   M4a's `getDocFromServer` rule for PRIVATE details remains mandatory.
5. **Bound reads / cost.** Define limits, indexes, time-window filters,
   retention and truncation behavior before shipping UI queries.
   Keep costs in the project's free/controlled budget. Prefer date-scoped
   queries and documented batch size.
6. **No global feed.** Collection group scans, unbounded room listing and
   cross-room projection IDs are denied. Owner/Member must not see another
   room's data solely because they know its document path.
7. **Atomicity vs derived data.** A client-written projection that becomes
   stale following an offline update is a disclosure risk. If business
   requirements cannot tolerate this, require trusted backend and
   reconciliation before enabling ROOM/BUSY_ONLY.
8. **Consent.** Existing M4a room toggles control display, not publication
   consent or access permissions. Publication decisions and assignment
   acceptance are separate operations.

## Required tests before implementation

- Active Owner/Member allowed only the intended field subset;
  outsiders, anonymous users and revoked members denied.
- A seeded PRIVATE event, including time, is undiscoverable by unrelated
  members through direct get, list, index, collection-group or projection.
- BUSY_ONLY never returns title, notes, recipients or private metadata.
- ROOM title visible only when creator explicitly chose ROOM; validation
  rejects spoofed titles and unexpected properties.
- Forge checks: non-owner write, cross-room reference, guessed sourceEventId,
  mismatched timestamps, deleted/cancelled source, duplicate projection,
  stale version, visibility downgrade/upgrade, quota bypass.
- Revocation followed by rejoining cannot resurrect a previously forbidden
  PRIVATE event; current membership is never sufficient to read history.
- Two-user live E2E against isolated named database / Hosting Preview,
  with scoped teardown and no persistent synthetic Auth users.

## Current release posture

The negative security tests in
`tests/security/m4b-projection-boundary.test.mjs` intentionally assert
that ROOM and BUSY_ONLY projections are **denied for everyone** under
current Rules, even if a privileged seed created the document.
The PR adding these tests is ALSO a safe, non-product change to exercise
the Staging Auto Deploy trigger on a newly merged, green PR.

**Do not** enable ROOM/BUSY_ONLY data reads or client writes as part of that
Auto Deploy smoke test. This feature requires a separate reviewed PR and
a Firestore Rules release gate, because Hosting-only Auto Deploy cannot
deploy Firestore Rules.

## M4b initial code artifact: safe read model (not enabled)

`src/lib/roomProjection.ts` now implements a strict, *pure* defensive parser
for the proposed **minimal** projection contract, with unit tests:

- ROOM: exactly `{roomId,visibility,startAt,endAt,allDay,title}`.
- BUSY_ONLY: exactly `{roomId,visibility,startAt,endAt,allDay}`.
- PRIVATE: no projection, always rejected.
- No `creatorUid`, `sourceEventId`, `notes`, `recipientUid`, profile
  data, arbitrary metadata, or hidden source identifiers are accepted.
- Shared ROOM titles are bounded to 120 characters. BUSY_ONLY becomes
  the generic Thai label `ไม่ว่าง` in the UI view model.
- Inputs must be valid, ordered timestamps no more than 24 hours apart
  and refer to the exact authorized room ID.

**These checks do not prevent data leakage if server-side Firestore Rules
allow a document containing sensitive fields to be fetched.** The query and
new Rules are deliberately absent; the parser is currently not wired to
any Firestore reads or UI components. Separate implementation and security
approval are required before shared calendar data is accessible.

