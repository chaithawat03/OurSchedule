# Logical Firestore Data Model (design, NOT yet provisioned)

users/{uid}: displayName, avatar, locale, timezone, createdAt.
users/{uid}/personalEvents/{eventId}: ownerUid and private detail.
rooms/{roomId}: ownerUid, name, assignmentPolicy, defaultVisibility, createdAt.
rooms/{roomId}/members/{uid}: role, membershipState, joinedAt.
rooms/{roomId}/events/{eventId}: immutable creatorUid, ownerUid, timestamps, status and minimal scheduling metadata with controlled access.
rooms/{roomId}/events/{eventId}/details/main: restricted title, description, location, participants and sensitive fields.
rooms/{roomId}/calendarProjections/{projectionId}: non-sensitive ROOM/BUSY_ONLY projection.
roomInvites/{inviteId}: roomId, expiry, usage constraints, hashed or unguessable secret design.
assignments/{assignmentId} or event-scoped assignments: one assignee, one state, conflict-resistant transitions (decision deferred).

## Security invariants

1. Reading a shared projection MUST NOT implicitly grant reading event details.
2. PRIVATE events MUST NOT leak existence or occupied time to unrelated members.
3. BUSY_ONLY may expose only scheduling slots to eligible members, without private metadata.
4. Write rights for projections must not permit arbitrary forged occupancy, impersonation, or cross-room references.
5. Owner/admin/membership privileges must be checked with a deterministic invariant that prevents last-owner deletion and self-promotion.
6. Do not copy phone numbers into searchable shared room documents.
7. Default collection-group queries and recursive wildcard grants are denied.

## Open design choices for M2/M3

- Exact document placement to avoid storing sensitive metadata in readable envelopes.
- How to materialize projections without privileged backend and keep atomic writes secure.
- Accept/reject transaction design for concurrent participants.
- Invitation redemption lifecycle and rate limiting without server functions.
- Calendar overlap queries and index cost within Spark.

These decisions require an explicit Rules test proving invariants before any corresponding read/write grants are shipped. Until then, firestore.rules must deny all client access.
