# M4a — Unified calendar for owned/accepted PRIVATE room assignments

## Scope and limits

This is the *first* M4 increment: the signed-in user's personal PRIVATE
activities, plus PRIVATE room assignments created by that room's Owner and
**accepted** by the named Member, can appear together in day/month/two-month
views. It does not implement room-wide visibility, ROOM/BUSY_ONLY projections,
multi-recipient assignment, recurring events, persistence of visibility
preferences, or live Firestore listeners.

The UI displays authenticated room memberships, with a checkbox per room.
Unchecked rooms are hidden in calendar rendering; **not** permission grants.
Personal activities always remain visible. Visibility toggles stay in memory
and are associated with the signed-in Firebase UID; switching accounts cannot
reuse cached data from a different UID. The 'โหลดปฏิทินใหม่' button refreshes
assignments after creating rooms, accepting invitations or changing membership.

## Firestore Rules boundaries

No new Rules, IAM permissions, indexes, database migration or profile reads:

- Owner: list only `rooms/{roomId}/events` with `creatorUid == auth.uid`,
  max 20 documents per room; currently uses the existing function that
  retrieves the Owner's paired recipient inbox status. Show only active,
  ACCEPTED items when the intended recipient is STILL an active room member;
  PENDING/DECLINED/revoked are not confirmed appointments.
- Member: query **only** `users/{currentUID}/roomActivityInvites`, max 20.
  Require a current active joined-room membership from the bounded
  `collectionGroup(members)` query; for each ACCEPTED in-window item,
  fetch event by **direct document GET**. Server Rules enforce recipient UID,
  membership state, acceptance and non-cancelled status again via
  getDocFromServer, never a potentially stale offline cache. Permission
  denial from revoked membership is intentionally discarded, never rendered.
- Other errors abort the room calendar load rather than reuse previously
  cached private data. The personal calendar still operates independently.
- Never list a Member's room Events collection, another user's inbox,
  another user's PRIVATE personalEvents, or guess event IDs.
- Only first 12 authorized rooms are read to bound queries. Existing limit
  20 on member inbox, creator room Events, room memberships and owned rooms
  may truncate data; the UI displays a warning. Time filtering of owned
  events is client-side because changing the query requires composite indexes
  and a separate Rules review.

## Operational acceptance

PR CI typecheck/lint/unit tests + emulator E2E required. New targeted
Vitest cases cover PENDING, DECLINED, cancelled event exclusion, revoked
Member 403 denial, cross-room membership, bounded reads and per-room hiding.

After a reviewed Hosting-only Staging deployment, test on mobile:
1. Create two rooms with synthetic identities, accept one assignment in each.
2. Calendar day/month should contain the allowed room events alongside
   personal private activities; turn off Room A and verify its entries disappear.
3. Decline or keep PENDING another room assignment; it must not appear.
4. Revoke Member membership, press 'โหลดปฏิทินใหม่'; it must disappear.
5. Switch Google accounts; no previous user's private room event may remain.

This is **not** a proof that ROOM/BUSY_ONLY projections are safe. Those
remain denied by Firestore Security Rules and require a separate ADR/review.
