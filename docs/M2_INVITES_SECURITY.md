# M2.2a: single-use invited Member — source-only proposal

## Scope
No production or staging activation. This PR introduces a **2-day maximum**, single-use room invitation using a 256-bit random bearer capability, restricted to authenticated invite holders, and atomic Member acceptance. Owner issuance/revocation, Member redemption, removal/self-leave and bounded joined-room discovery. **No** Admin assignment, owner transfer, bulk invitations, phone aliases, event sharing or private activity data.

The token is a 43-character Base64URL identifier generated with browser Web Crypto, placed in a URL **fragment** (\`#invite=\`) so it is not sent as a query string or in normal HTTP Referer headers. Anyone who obtains the token can attempt to join, after Firebase sign-in; this is intentional bearer behavior. Sharing or screenshotting the link grants access. The token is displayed only at issuance and should not be copied into analytics, logs or console.

## Model and enforcement
\`roomInvites/{token}\`: roomId, createdByUid, createdAt, expiresAt, state (pending/accepted/revoked), acceptedByUid (null or UID), acceptedAt (null or Timestamp).

- Authenticated Room Owner creates an invite, never another member. Expiry <= request.time + 48h, timestamp server generated for createdAt. **No invite listing**.
- Holder's direct \`get\` of a syntactically valid high-entropy invite ID is allowed only when authenticated. Security Rules cannot prove token randomness, but SDK uses cryptographic RNG.
- The acceptor must update pending→accepted and create \`rooms/{roomId}/members/{uid}\` in **the same batch**. Cross-referenced Firestore \`getAfter\` checks force both sides to agree on token/room/UID/timestamps, and pre-state must be pending and no existing membership. Replay, spoofed role, orphan membership, cross-room redemption and expired/revoked invites must be DENIED.
- New member is role='member' with immutable UID and joinedAt, never Admin/Owner. Member can get own membership and parent room metadata; room listing remains owner-only. Rooms/events private data, other users' profiles and other members' membership still denied.
- Room owner cannot be deleted/demoted and room data immutable ownership remains protected.

## Known risks / release blockers
1. **Per-UID Rules-enforced counters** now limit room and invitation issuance. However neither client Rules nor these UID counters impose robust per-IP/device or global multi-account limits. Prior to public activation, decide whether App Check, trusted server throttling and cost alerts are required. A link can be forwarded, so invite acceptor is not bound to email/phone.
2. Member room list after refresh is implemented using a bounded `members` collection-group UID query and explicit index. The index has **not been deployed** and its readiness must be verified on STAGING. Pagination after the first 20 membership documents is not yet implemented.
3. Room Owner can remove a Member and a Member can leave; **Owner** cannot be deleted. However Admin role changes, owner transfer and both member/room pagination are not yet implemented.
4. M1 live cross-UID **READ isolation passed 6/6** on Staging (using a temporary anonymous identity, since removed and Provider subsequently confirmed Disabled). Live **WRITE** denial and M2 invite/revoke E2E acceptance plus Android/iOS remain pending.
5. Developers must re-check Firestore Security Rules evaluation limits (getAfter/get calls) and transaction concurrency under real conditions before deployment.
6. Prior full npm audit residual development vulnerabilities remain tracked in #5.

**Never deploy these Rules to Staging or Production until CI, security/abuse review and the independent live M1 security gate have been accepted.** This PR is deliberately kept Draft.


## Per-account transactional limits (M2.2a revision)

Rooms are capped at **3 per 24-hour rolling window per Firebase UID**, and invitation issuance at **10 per 24-hour rolling window per UID**. Persist fixed-counter documents `users/{uid}/quotas/{rooms|invites}` with count, windowStart, updatedAt and lastResourceId. A room/invite creation must atomically transition its matching counter using `getAfter`; lastResourceId ties the counter to exactly one new resource per batch, preventing a single increment paying for multiple writes. Counters have strict schema, immutable valid window semantics, are owner-readable only, non-listable, and cannot be deleted. SDK uses `runTransaction` so concurrent attempts retry rather than lose quota updates. Tests assert quota forgery, reuse, cap, expiration and account isolation.

These limits block straightforward per-UID high-rate creation **even from a modified client**. They DO NOT provide IP/device/global limits, nor stop malicious people from creating many Auth accounts; App Check, budget alerting and/or a trusted server are separate release gates for public access. If a device clock is wrong, client creation may be denied by Rules (fail closed). Do not treat this as a complete abuse-control system.


## Member revocation and leave
Owners may list at most 20 Member documents of their own rooms and may delete only role=member records. A Member may delete only their own record; owner can never delete own membership, and member roles remain immutable. Once the Member document is deleted, room metadata access is denied. The UI includes Owner removal and Member self-leave for the current joining session, but joined-room discovery across sessions is still a blocker for complete M2.


## Joined-room discovery after browser reload (collection group)
An authenticated user now lists their own active \`rooms/{roomId}/members/{uid}\` documents through a bounded Firestore \`collectionGroup('members')\` query restricted by \`where('uid','==',auth.uid)\` and \`limit(20)\`. The wildcard group rule permits **list** only if \`resource.data.uid == request.auth.uid\` and active membership; direct member-document \`get\` still follows the room-specific rule. The client filters \`role='member'\` locally, reads each parent room with existing membership authorization, and shows joined rooms after a refresh/re-login. Revoked/left memberships are deleted so they disappear from subsequent queries and parent room reads fail.

This requires the \`members.uid\` single-field index with **COLLECTION_GROUP** scope included in \`firestore.indexes.json\`; the Firebase emulator does not prove index readiness on live STAGING. When a future reviewed merge is staged, deploy **firestore indexes** alongside approved Rules, wait for the index to reach READY, then deploy Hosting. Monitor read costs (bounded to 20 membership docs plus room metadata lookups). Rules are not filters, so never run an unrestricted collection-group query.

### 2026-10-16 hardening: server-side role-filtered room discovery

The group query now requires \`where('uid','==',auth.uid)\`, \`where('role','==','member')\`, \`where('membershipState','==','active')\`, and \`limit(20)\`. Firestore Security Rules checks all three fields rather than relying on the Browser to discard Owner memberships. This prevents an account's owned-room memberships from consuming the first page of joined-room results. Query needs an explicit **composite COLLECTION_GROUP** index for \`members(uid, role, membershipState)\`, committed to \`firestore.indexes.json\`. Index build/READY and live query on Staging remain deployment gates.

There is still no continuation/pagination after twenty joined rooms; it is intentionally a bounded MVP, not an unlimited room browser.
