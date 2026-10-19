# M3.2a Staging Live Member/Privacy Acceptance — ONE Google owner

## Gate and evidence

After operator-reported M3.1 LIVE 8/8 and M3.2a+SweetAlert2 owner UI LIVE 7/7 at deployed SHA b6551a8359b5de0c8042e048343791067e1106fe, the **cross-UID M3.2a acceptance remains UNVERIFIED**. Source code and Firestore Emulator tests do not prove the live environment grants/denials. This document describes an attended STAGING-only acceptance. Production is never involved.

Use only \`https://ourschedule.web.app\`, Firebase project \`ourschedule\` (GCP project number 400176852634), an already-owned room with policy \`REQUIRE_ACCEPTANCE\` and no other experimental recipients. A is the existing Google Owner. B is one fresh temporary Firebase Anonymous Auth user, created via the publicly documented Firebase Auth REST API *during a supervised test window*. Every Firestore request uses B's ID token and the **deployed Staging Firestore Rules**; there is no Admin SDK or server-account bypass.

Important security caveat: enabling Anonymous Auth temporarily makes anonymous signup accessible to anyone who knows the Web App config, not just the test operator. Keep the window attended and brief, check Firebase Authentication Users afterward, and **disable Anonymous immediately** even if tests fail. This acceptance tool does not enable, disable or modify any Auth provider.

## Preparation — before enabling Anonymous

1. In the Owner's Google session on https://ourschedule.web.app, select the existing M2 test room in **ห้องของฉัน**. Verify it is the same room in the **M3.2a กิจกรรมที่มอบหมาย** UI. The initial room policy is \`REQUIRE_ACCEPTANCE\` by default; the test refuses any other policy. Avoid changing a live family/team room.
2. In the invitation panel create **ONE fresh, unused room-invite link** for that room. Copy it safely. Do not paste it into ChatGPT, GitHub, tickets, screenshots or logs (the link is a bearer capability). Only one invitation is needed; it consumes 1 of the Owner's daily limit of 10.
3. Open authenticated Google Cloud Shell, ensure Node v24.12+, and fetch the **reviewed merged script commit**. This is source/test only; the deployed app stays at b6551a8. Cloud Shell must retain the existing ignored \`.env.local\` tied to \`ourschedule\`.

\`\`\`bash
cd ~/OurSchedule
git status --short
git fetch origin main
git checkout --detach <MERGED_TEST_HARNESS_SHA>

read -r -s -p "ONE unused staging room invite: " INVITE_TOKEN_M3
echo
export INVITE_TOKEN_M3

# Only after the owner enables Anonymous for the short attended test window:
node --env-file=.env.local scripts/staging-m3-2a-live-acceptance.mjs
result=$?
unset INVITE_TOKEN_M3
echo "M3.2a live exit code: $result"
\`\`\`

If the local working tree is not clean, investigate rather than discarding changes. **Don't run on CI**, don't share the invite token or UID, and do not close Cloud Shell during cleanup.

## Attended operations after enabling Anonymous STAGING only

4. In Firebase Console project \`ourschedule\` > Authentication > Sign-in method, temporarily set **Anonymous = Enabled**. Keep Google Enabled. Return to Cloud Shell, type exactly \`LIVE M3.2A STAGING\`. The tool creates B, validates the invitation and redeems it as a distinct UID. Only the first eight characters of B's UID are displayed.
5. In the **Owner browser session**, select the exact room and click **โหลดใหม่** in M3.2a until the newly joined Member with the matching masked UID is in the recipient list. Create a PRIVATE assignment with the *exact* title **M32A-ACCEPT** for B. After the SweetAlert2 success toast, press Enter in the script. B must see the pending recipient inbox teaser but not private event details. The tool accepts once and verifies content access while membership active and private collection listing denied.
6. Owner cancels the activity **M32A-ACCEPT** through UI, verifies SweetAlert2 success; press Enter. The script checks B loses private event content access immediately.
7. Owner creates second assigned activity titled **M32A-DECLINE** for B, press Enter. B declines it through REST; direct private details must remain inaccessible and replay of decision must be denied. The activity stays active until cleanup.
8. Owner creates third assigned activity titled **M32A-REVOKE** for B, press Enter. B accepts and can read its private details. Then Owner opens **จัดการสมาชิก (Owner)**, removes ONLY B with the exact UID prefix from the same room, and presses Enter in Cloud Shell. B must immediately be denied the accepted event, room and joined-room membership discovery; the old private inbox teaser may remain only as inaccessible history after B Auth is deleted.

After the checks the tool deletes the temporary Anonymous Auth account and verifies B no longer has an active room membership. If an intermediate step fails, it attempts B self-leave and Auth deletion; if Member cleanup cannot be confirmed, Owner must manually remove that Member. **Do not close Cloud Shell or press Ctrl+C during cleanup.**

9. **Immediately set Anonymous Provider to Disabled again**, regardless of test outcome. Review Firebase Authentication > Users for unexpected anonymous accounts; investigate/remove leftover test identities. Owner should soft-cancel the remaining **M32A-DECLINE** and **M32A-REVOKE** activities. The room invite and the three event/inbox documents can remain as intentional STAGING audit history (Security Rules intentionally deny hard deletion).
10. Report only the final PASS/FAIL, exit code, and whether **Anonymous Disabled** has been confirmed. Do not share full IDs, invite URLs/tokens, Auth ID tokens, personal names or API keys.

## Explicit scope

The test validates real \`REQUIRE_ACCEPTANCE\` path only: M3.2a PRIVATE *single-recipient* Owner-to-Member assignment, B's one-way decisions, denial of unrelated Owner data, cancellation and Member revocation. **AUTO_ASSIGN is covered in Emulator tests, not by this live harness.** Room-wide \`ROOM\`/\`BUSY_ONLY\` visibility, group assignments, event ownership delegation, globally secure quotas/App Check, and Production deployment remain out of scope. Only a separate security-reviewed phase may open those gates.

The Owner's active room quota is unaffected; **one invitation and three assigned events** count against their rolling quotas. Stop early if those limits may be exceeded. Do not run in a real production room.
