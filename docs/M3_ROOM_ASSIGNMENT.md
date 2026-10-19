# M3.2a: Controlled private room activity assignments

## Scope / exclusions

This is a deliberately **limited slice** of M3.2 (#15), not room-wide event sharing.

- Existing Room Owner A can create one PRIVATE event and direct it to one currently active room Member B.
- If the room policy is \`REQUIRE_ACCEPTANCE\`, B gets a PENDING recipient-only invitation. B can accept or decline once. If policy is \`AUTO_ASSIGN\` (previously configured by the Owner), B gets ACCEPTED immediately.
- The event's title/notes remain in \`rooms/{roomId}/events/{eventId}\`. Non-owner members cannot list that collection. An invited recipient can read only that one event **after acceptance** and while eligible membership is active. The invitation teaser (title/times) is disclosed only to that exact recipient. The room Owner can cancel own event, which immediately removes recipient's direct event access.
- B's own invitation inbox is \`users/{uid}/roomActivityInvites/{eventId}\`, bounded to 20 reads. B alone updates PENDING -> ACCEPTED/DECLINED. Owner may get a single inbox to observe its state, never list B's inbox.
- A writes the event + B's inbox + the daily quota transition in one Firestore transaction. Firestore Rules enforce \`getAfter\` invariants and forbid forged/standalone inbox writes. Daily cap **20 new room events per UID**, with \`roomId + '_' + eventId\` preventing cross-room counter reuse.
- All \`ROOM\` or \`BUSY_ONLY\` visibility and \`rooms/{roomId}/calendarProjections\` remain **DENIED**. PRIVATE events do **not** enter a room-wide timeline. These visibility modes, assigning by ordinary Members, group/multiple recipients, edits, reassignment, and pagination beyond 20 belong in M3.2b/M4.

The direct invite teaser contains title/times *only* for the specifically invited user. Neither room owners nor member roles confer unrestricted access to another creator's PRIVATE events. Recipient can read previously delivered teaser after leaving a room (historical invitation), but event content access requires active membership whose \`joinedAt\` precedes the invitation; leaving and rejoining does not resurrect old rights.

## Staging security acceptance

Prior M3.1 owner UI acceptance 8/8 was user-reported, but **M3.2a live two-UID** is pending even if Emulator tests pass. No app release is authorized solely by CI.

1. Verify in Cloud Shell Git HEAD equals the reviewed **merged SHA**, working tree clean, Node 24.12+, \`.env.local\` bound to \`ourschedule\` staging Firebase Web App.
2. Run \`bash scripts/release-m3-2a-staging.sh\` and type \`DEPLOY M3.2A STAGING\`. This re-runs locked install, runtime audit, lint/TS/unit/security tests, build; deploys Firestore Rules FIRST and Hosting SECOND, verifies published asset hash. It does not change Production, indexes or Authentication providers.
3. Owner logins in Desktop Chrome, creates the assignment in an already-owned room with at least one current Member (no extra room needed). Verify selected policy and creation, cancellation behavior.
4. B in another Firebase-authenticated identity (a second Google account or a short-lived supervised Staging Anonymous user) sees *only* B's inbox, can accept or decline. Before acceptance B is forbidden direct room-event \`get\`, after acceptance only the single event detail is readable. Verify B cannot list events/other users' inbox or modify status after a decision, and room member revocation immediately denies direct event access.
5. If temporary Anonymous is used, **disable provider immediately afterwards**, delete test Auth user and clear Member/test assignments as appropriate. The test can leave historical inbox/event records; record cleanup policy. Never share full IDs/tokens.
6. Existing M2 invitation/member security and M3.1 private personal event create/edit/cancel must remain intact on Staging.

### Open gates

M3.2b must separately define safe ROOM vs BUSY_ONLY projection and atomic updates, creator privacy and Member-generated events. No paid Cloud Functions or Cloud Run, no Production or public opening until owner authorizes and App Check/budget/global abuse gates are reviewed. Security Rules tests are not live authentication evidence.
