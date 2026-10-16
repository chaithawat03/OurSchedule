# M2.1 Room ownership foundation — review gate

Implements only room creation for the authenticated owner and bounded listing of rooms that UID owns. Membership invitation/join/leave, assigning Admin/Member, cross-room calendar sharing and activities are **not** implemented. The complete M2 gate remains open.

## Firestore document shapes

\`rooms/{roomId}\`: immutable \`ownerUid\`, \`name\`, \`assignmentPolicy\` (AUTO_ASSIGN or REQUIRE_ACCEPTANCE), \`defaultVisibility\` (ROOM/BUSY_ONLY/PRIVATE), immutable \`createdAt\`, and \`updatedAt\`. Initial default \`REQUIRE_ACCEPTANCE\` and \`PRIVATE\`; these values are inert until M3 activities are developed.

\`rooms/{roomId}/members/{ownerUid}\`: immutable \`uid\`, \`role='owner'\`, \`membershipState='active'\`, \`joinedAt\`. Initial creation is atomic using Firestore writeBatch. Rules bind room creation to the owner membership through getAfter; membership creation requires that the room did **not** exist before the batch and that the post-write room owner equals that UID.

## Explicit authorization gates

- Signed-in creator may atomically create their own room and matching Owner membership; owner membership cannot be created separately.
- Only room owner UID can get or query their rooms, with limit <= 20 and ownerUid equality filter. Unauthorized reads/lists fail; no global room list.
- Owner may update approved room metadata only. Room ownerUid and createdAt immutable; room deletion is **denied**.
- Owner membership cannot be updated/deleted, protecting the last owner. No Member/Admin creation or invitation redemption is permitted yet.
- All events, event details, calendar projections, invites and other collections remain denied, as do all nested paths not explicitly allowed.
- The UI only lists the first 20 owned rooms. Before full M2, provide pagination and safe multi-room membership reads.

## Testing and staged rollout

Automated Firestore Emulator positive and negative assertions must pass (batch atomic creation, orphan prevention, owner immutability, other-user isolation, role escalation, deletion, unbounded queries, nested data denial). Run existing 14 M1 security cases as regression, lint/TS/unit/build, npm audits and patched gRPC lock check.

Never deploy unreviewed rules. After PR CI + review + merge: stage operator must check exact SHA/environment, deploy Firestore rules to staging explicitly, verify real own/foreign room access (use 2 separate authorized test Google accounts, no credentials shared), then deploy Hosting and test Android/iOS create/list. Hosting rollback alone does not roll back Firestore Rules/documents. Production remains untouched.
