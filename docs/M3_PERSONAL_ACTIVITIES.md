# M3.1 — Private personal activity foundation (Staging gate)

## Scope
M3 is intentionally split into privacy-safe slices. **M3.1 implements user-only personal events** with create, edit, one-way cancel, selected-day agenda and month/multi-month markers. No room events, room assignment, accept/reject, public/busy calendar projections or shared private details are enabled in this PR. Those need independent M3.2+ data-model review, transactions and security tests.

## Firestore model

\`users/{uid}/personalEvents/{eventId}\`: ownerUid, creatorUid (both immutable, both equal path UID), title (<=360 UTF-8-ish bytes from client; Rules <=360 characters), notes, startAt/endAt (Firestore timestamps), allDay, timezone='Asia/Bangkok', visibility='PRIVATE', status active/cancelled, createdAt/updatedAt (server timestamps). Status is immutable once cancelled; direct delete denied for auditability.

Security: owner-only document reads and bounded collection queries (limit <=100); no collection-group queries or nested details; room Owner/Admin/Member not authorized. Schema only approved fields, immutable identities/timestamps, valid positive <=24h duration, server-generated update timestamps, no status revert. A cancellation operation changes only status/updatedAt. No offline Firestore persistence.

## Date windows and read limits

Use timezone-aware Bangkok civil time with explicit +07:00, not device timezone. All-day stores 00:00 local to *next* local midnight, with exclusive end. Month queries include 24h prior to start for overnight overlaps; filter result by interval overlap and active status. Query uses startAt range and <=100 documents, requiring Firestore's automatic single-field index. If cap reached, UI warns that the view is incomplete; full cursor pagination and multi-year events belong in M4.

## CI / Staging review gates

- npm ci, runtime/high+ dependency audit, ESLint/TypeScript, unit timezone/date cases, full Firestore Emulator negative/positive tests, production build, all existing M1/M2 regressions.
- Review indexed Rules and changes in data exposure. No mutation of deployed M2 until approval.
- Stage release after review + merge: exact SHA and STAGING \`ourschedule\` Firebase Web App guard, deploy \`--only firestore:rules\` **before** Hosting. Current \`scripts/release-m2-staging.sh\` is M2-specific and not a substitute for M3 deployment review.
- Desktop/iPhone/Android live: Google login; create private event, refresh persistence, edit, one-way cancel, date navigation, all-day and overnight rendering; Firestore separate UID must not read or write event. Recheck M2 room and member permissions after Rules change.
- M3.2 room activity privacy decision: content must be separate from ROOM/BUSY_ONLY projections; no field-level redaction in Firestore, and no client grant for shared/private content before acceptance invariants are tested.
- Remain on staging, keep Anonymous provider **Disabled**, and Production untouched until explicitly approved.
