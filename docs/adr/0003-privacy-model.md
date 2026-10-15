# ADR 0003 — Split private details from shared projections

Status: Proposed / Gate for M3 | Date: 2026-10-15

Decision: Firestore grants operate at DOCUMENT level. Never expect Firestore rules to redact a field or filter unauthorized query results. Split restricted activity details from explicitly shared non-sensitive calendar projections.

Modes:
- ROOM: safe shared metadata + authorized detail path.
- BUSY_ONLY: occupancy/time only, no title/notes/location.
- PRIVATE: no projection visible to other room members.

Risk: client-generated projections can be forged. M3 must prove allowed writes preserve relationship to canonical event and privacy state atomically. If Rules cannot establish the invariant safely, introduce a narrowly-scoped trusted server operation via an approved ADR and budget gate rather than weakening authorization. Identity, ownership, membership and concurrency attacks require emulator tests.
