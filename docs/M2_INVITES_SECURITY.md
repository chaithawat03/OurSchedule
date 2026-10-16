# M2.2a: single-use invited Member — source-only proposal

## Scope
No production or staging activation. This PR introduces a **2-day maximum**, single-use room invitation using a 256-bit random bearer capability, restricted to authenticated invite holders, and atomic Member acceptance. Owner issuance/revocation and Member redemption only. **No** Admin assignment, owner transfer, member removal, room discovery, bulk invitations, phone aliases, event sharing or private activity data.

The token is a 43-character Base64URL identifier generated with browser Web Crypto, placed in a URL **fragment** (\`#invite=\`) so it is not sent as a query string or in normal HTTP Referer headers. Anyone who obtains the token can attempt to join, after Firebase sign-in; this is intentional bearer behavior. Sharing or screenshotting the link grants access. The token is displayed only at issuance and should not be copied into analytics, logs or console.

## Model and enforcement
\`roomInvites/{token}\`: roomId, createdByUid, createdAt, expiresAt, state (pending/accepted/revoked), acceptedByUid (null or UID), acceptedAt (null or Timestamp).

- Authenticated Room Owner creates an invite, never another member. Expiry <= request.time + 48h, timestamp server generated for createdAt. **No invite listing**.
- Holder's direct \`get\` of a syntactically valid high-entropy invite ID is allowed only when authenticated. Security Rules cannot prove token randomness, but SDK uses cryptographic RNG.
- The acceptor must update pending→accepted and create \`rooms/{roomId}/members/{uid}\` in **the same batch**. Cross-referenced Firestore \`getAfter\` checks force both sides to agree on token/room/UID/timestamps, and pre-state must be pending and no existing membership. Replay, spoofed role, orphan membership, cross-room redemption and expired/revoked invites must be DENIED.
- New member is role='member' with immutable UID and joinedAt, never Admin/Owner. Member can get own membership and parent room metadata; room listing remains owner-only. Rooms/events private data, other users' profiles and other members' membership still denied.
- Room owner cannot be deleted/demoted and room data immutable ownership remains protected.

## Known risks / release blockers
1. **Client-only Rules cannot impose robust per-user rate limits** on issuing invites, making rooms or repeated reads. Prior to Staging activation on a public site, decide whether an App Check, trusted server, explicit quota and monitoring are necessary. A link can be forwarded, so invite acceptor is not bound to email/phone.
2. Member room list across sessions is not implemented: joining a room shows the newly joined room in the current app session, but this phase does not yet provide an indexed per-user membership projection.
3. Room Owner cannot remove an accepted Member in this slice. This is **not yet a complete permission-management product**. Add revocation, leave, role changes and safe last-owner invariants in M2.2b.
4. Android/iOS sign-in and live cross-UID Firestore access tests are required. M1 live Cross-UID proof remains outstanding.
5. Developers must re-check Firestore Security Rules evaluation limits (getAfter/get calls) and transaction concurrency under real conditions before deployment.
6. Prior full npm audit residual development vulnerabilities remain tracked in #5.

**Never deploy these Rules to Staging or Production until CI, security/abuse review and the independent live M1 security gate have been accepted.** This PR is deliberately kept Draft.


## Per-account transactional limits (M2.2a revision)

Rooms are capped at **3 per 24-hour rolling window per Firebase UID**, and invitation issuance at **10 per 24-hour rolling window per UID**. Persist fixed-counter documents `users/{uid}/quotas/{rooms|invites}` with count, windowStart, updatedAt and lastResourceId. A room/invite creation must atomically transition its matching counter using `getAfter`; lastResourceId ties the counter to exactly one new resource per batch, preventing a single increment paying for multiple writes. Counters have strict schema, immutable valid window semantics, are owner-readable only, non-listable, and cannot be deleted. SDK uses `runTransaction` so concurrent attempts retry rather than lose quota updates. Tests assert quota forgery, reuse, cap, expiration and account isolation.

These limits block straightforward per-UID high-rate creation **even from a modified client**. They DO NOT provide IP/device/global limits, nor stop malicious people from creating many Auth accounts; App Check, budget alerting and/or a trusted server are separate release gates for public access. If a device clock is wrong, client creation may be denied by Rules (fail closed). Do not treat this as a complete abuse-control system.
