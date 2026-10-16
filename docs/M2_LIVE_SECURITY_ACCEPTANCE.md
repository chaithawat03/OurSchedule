# M2.2 live security & abuse acceptance — STAGING ONLY

Status: **M1 LIVE READ ISOLATION PASS; M2 LIVE ACCEPTANCE PENDING / NOT FOR PUBLIC SHARING** (2026-10-16).

**Current stage:** M2 source `85433cd13f24f64ffd7e542b4382bb94689c03a0` was deployed to Firebase STAGING with the required composite index READY, Rules and Hosting released. The owner reported M2 owner-flow live smoke 7/7 PASS on Desktop, Android Chrome and iPhone Safari (Google login, persistent room, invite creation/revoke). These facts are STAGING acceptance only. Production is a separate unprovisioned project.

## Automated acceptance (GitHub PR CI)

- Positive and adversarial Firestore emulator tests, including M1 cross-profile denial, M2.1 immutable last Owner, M2.2 single-use invite/replay/expiry/concurrency, per-UID quota transitions, member removal and self-leave.
- Strict locked dependencies; `npm audit --omit=dev --audit-level=high` 0; patched grpc lock check; ESLint, TypeScript, unit tests and build PASS.
- Full development audit findings tracked in #5 separately; green CI is not a production security sign-off.

## Staging live negative checks (two distinct Firebase-authenticated UIDs; no shared passwords/tokens)

For end-to-end Google provider acceptance, use **Test Account A** and **Test Account B** in separate clean browser profiles. For the UID Rules read-isolation subset, use the temporary Anonymous Auth approach documented below. Never put Auth ID tokens or private emails in a GitHub comment or screenshot. Preserve just PASS/FAIL and redacted timestamps.

1. M1 baseline: A and B sign in. Check each has exactly one `users/{uid}` profile in the staging Firestore Console. A must not read or alter B's profile, and vice versa. Anonymous profile reads, `users` collection query and access to `users/{uid}/personalEvents` must be rejected. Emulator PASS does not establish this live check.
2. Only after rules security review and staging rules deployment, A creates one room and sees its Owner membership; B cannot directly get that room or enumerate A's rooms without an invite.
3. A issues an invite; link must not be posted publicly or logged. B redeems it once, receives role `member` and can read only the associated room metadata + B membership, not unrelated rooms, profiles or events.
4. Reopening/replaying same invite from B or a third account must fail. A can revoke an unused invite; revoked/expired links must fail. A cannot delete/demote their Owner membership. B cannot promote role to `admin` or create a forged membership.
5. A removes B; B's live Firestore room `get` must then fail. With a new valid invite, B may join and voluntarily leave; after leaving, room `get` must fail again. Verify the Owner account remains.
6. Creation quotas: 3 rooms and 10 invitations per real UID per 24-hour rolling window. Try one extra with the authorized test UID: server must reject, even when a modified client directly writes Firestore. Do not hammer Firebase API; use the local emulator for attack permutations.
7. Test Android Chrome and iPhone Safari Google login, token fragment handling, member join, owner removal, refresh/logout and in-app navigation. Inspect browser logs without sharing tokens.
8. Record **exact merged SHA**, Firebase CLI deployment release IDs, deployed Rules release date, auth provider settings, HTTP 200 root/manifest/SW, screenshots with redacted identifiers and account A/B signed-off tests. No password, private link, provider secret or real names in logs.

## Cost and abuse gates still requiring administrative action

- Before any public/open-beta enabling, decide **App Check** posture for Firebase Web App: register authorized web hostname and site key, integrate provider, run controlled staging smoke then enable Firestore enforcement. Do not enable enforcement prematurely because it can block all current M1 traffic. App Check alone does not stop a real browser with valid attestations, credential farming or account-level fraud.
- Verify daily usage limits, monitor Firestore read/write/denied counts and Auth sign-ups. Configure Google Cloud **Budget Alerts** (suggest THB 50/80/100 of a THB 100 monthly budget for staging, only as a monitoring reference). Budgets are alerts, **not** automatic hard spend caps. Approval required before provisioning any priced server product.
- CI only enforces **per-UID** 3 rooms/24h and 10 invites/24h. This is no IP/global limit and cannot eliminate multi-account abuse. Public-release decision requires explicit risk acceptance or a server-side issuance/throttling design.
- Decide whether a trusted endpoint is necessary for audit logs, central throttling and delegated Admin role operations. No new Cloud Functions/Cloud Run billing without owner authorization.

## Release gate decision

| Gate | Current evidence |
| --- | --- |
| Per-UID quota + atomic invite + replay/last-Owner/security regression | CI: PASS |
| Member removal/self-leave and revocation | Emulator: PASS |
| M1 live Firestore foreign-UID **READ** denial | **PASS** — user-reported staging REST 2026-10-16: 6/6; Anonymous B deleted |
| M1 live foreign-UID **WRITE** denial | **PENDING** — emulator tested; no live write attempts |
| A/B live invite, revocation and self-leave security | **PENDING** — live harness prepared, operator must execute with temporary Anonymous Auth B |
| Joined-room discovery authorization (Emulator) | **PASS** — own UID-scoped group query, foreign/global denied, revoke disappears; live index not deployed |
| Member collection-group index on Staging | **READY / DEPLOYED** — Cloud Shell staging release log on commit 85433cd |
| App Check + spending monitoring or approved equivalent abuse plan | **PENDING** |
| Public share approval | **BLOCKED** |
| Production deployment | **NOT AUTHORIZED** |


## App Check staged enablement procedure (no enforcement by default)

Code supports an optional Vite environment variable \`VITE_RECAPTCHA_V3_SITE_KEY\`, which registers Firebase App Check (reCAPTCHA v3) **before Auth/Firestore client initialization** if provided. If unset, app behavior stays unchanged. The reCAPTCHA **site key** is public. Never put the **secret key** into source, Vite build or a GitHub issue.

1. Configure reCAPTCHA v3 on the Staging hostname \`ourschedule.web.app\`. Register the Web App in Firebase Console > App Check. Review current quotas and provider costs; do not create any paid service without explicit budget review.
2. Put the issued *site key* in the ignored Cloud Shell \`.env.local\`. Run staging build and verify Google Auth and Firestore reads on both desktop and mobile.
3. Deploy only a reviewed merged SHA to STAGING. Inspect Firebase App Check request metrics first (verified/unverified ratios, errors), and keep Enforcement **OFF** while validating traffic.
4. Only after real-client validation and a rollback plan, enable Firestore App Check Enforcement via Console. Verify sign-in, profile transactions, room and invitation writes and a rejected unsigned direct API request. Be ready to disable Enforcement immediately if legitimate requests are blocked.
5. App Check does not replace User Auth, Firestore Rules, per-UID quotas or global/budget monitoring. It does not prevent all device farms or multi-account abuse.

Official Firebase guidance: https://firebase.google.com/docs/app-check/web/recaptcha-provider

## Alternative when there is only one Google account

**No second Google account is needed for the LIVE UID-isolation READ gate.** Use Google Account A (existing profile in Staging Firestore) and a temporary **Firebase Anonymous Auth** identity B. Anonymous B has a distinct authenticated Firebase UID. This is a real Firestore Rules request, not a Rules Playground simulation. It tests authorization for principal B to get A's profile, read A's private events and list protected collections. It does **not** test B's Google provider flow and does not replace the full M2 room invitation, Member, revoke or WRITE tests.

Before starting: only on the *current M1 staging rules* and during an attended test window, enable **Anonymous** in Firebase Console > Authentication > Sign-in method for staging \`ourschedule\`. **Temporarily enabling this provider increases public sign-up exposure**. Anonymous users are authenticated, and any rule permitting \`request.auth != null\` may also permit their actions. Do not enable this on Production or for an unattended period. M2 Rooms/Invites must NOT be publicly enabled at the time of this test.

From Google Cloud Shell (keeping \`.env.local\` and other local working files intact), execute this signed-in-user **read-only** script from PR #10 without deploying that PR:

\`\`\`bash
cd ~/OurSchedule
git fetch origin feature/m2-invites-single-use

# Inspect the current reviewed script revision first:
git show FETCH_HEAD:scripts/staging-auth-isolation.mjs | less

# Export into a temporary file to avoid checking out draft Firestore Rules.
git show FETCH_HEAD:scripts/staging-auth-isolation.mjs > /tmp/ourschedule-staging-isolation.mjs

read -r -p "Existing Google user's UID from STAGING Firestore > users: " OWNER_UID
export OWNER_UID
node --env-file=.env.local /tmp/ourschedule-staging-isolation.mjs
unset OWNER_UID
rm -f /tmp/ourschedule-staging-isolation.mjs
\`\`\`

Do **not** paste the Google user's UID, Web API key, private tokens or personal profile document into a chat or GitHub issue. Script checks project \`ourschedule\` and Staging Firebase App ID, uses Identity Toolkit REST to create an anonymous test user, confirms the new identity, and sends Firestore REST **Firebase ID token** requests (unlike privileged Cloud Shell Admin SDK operations). It checks own missing profile returns 404 and protected read operations return 403. It does **no Firestore writes** and attempts to delete the test Auth user automatically. A FAIL is a real security stop. If cleanup fails, remove the anonymous user manually in Firebase Console > Authentication > Users.

**Immediately disable Anonymous Provider after completion**, even if the test fails, and verify no unwanted anonymous users were created during the enablement window. Live cross-UID **write** denial still relies on Emulator tests until a separate, explicit non-destructive live write test is designed. This temporary-identity test should not be mistaken for a complete M2 release sign-off.

Official: https://firebase.google.com/docs/auth/web/anonymous-auth and https://firebase.google.com/docs/firestore/use-rest-api .

## Executed live READ check evidence — 2026-10-16

The staging operator reports all 6 checks of `scripts/staging-auth-isolation.mjs` passed with HTTP status results: temporary Anonymous B own missing profile **404**; B get Google A profile **403**; unsigned get A profile **403**; B users collection listing **403**; B read A private events **403**; B global rooms listing **403**. Script reports test Anonymous Firebase Auth user **deleted successfully**. These results are evidence of actual staging Firestore Rules enforcement for those read cases, not just Emulator execution. No private UIDs/API keys or ID tokens were retained in the issue or runbook.

**Operator action remains:** Anonymous Sign-in Provider should be **disabled immediately** and verified in staging Authentication Console (this setting is not toggled by the script). Temporary B being deleted does **not** establish Anonymous Provider is off. M1 live **write** denial and M2 invite/join/revoke end-to-end acceptance are **not established** by this read-only test. Do not describe M2 as Staging Verified or deploy PR #10 solely because this subset passed.

## 2026-10-16 — Operator provider-disable confirmation

Owner provided a Firebase Authentication > Sign-in method screenshot from Staging `ourschedule` with **Google: Enabled** and **Anonymous: Disabled**. This confirms the temporary Anonymous Sign-in provider is now off after the 6/6 live cross-UID read check. The read-only test reported successful deletion of its temporary anonymous Auth user; the screenshot of provider status does not independently verify the Users list or account-deletion completion.

## M2.2 joined-room discovery review

Draft PR #10 adds a `members` collection-group query constrained by `where('uid','==', auth.uid)` and `limit(20)`, plus a Rules `allow list` check binding `resource.data.uid` to the requesting UID. Emulator positive + adversarial tests verify matching memberships are returned, global/foreign/unbounded queries denied, and revoked memberships disappear. The group-scope composite `members(uid, role, membershipState)` index is declared in `firestore.indexes.json`. **Before a future approved Staging release** deploy `firestore:indexes`, wait until the index reports READY, and only then deploy the reviewed Rules and Hosting and smoke test real re-login / member leave. Do not deploy PR Draft index/rules to the live project merely because Emulator tests are green.


## Staging release script (requires a merged main commit, authenticated Cloud Shell)

This repository contains \`scripts/release-m2-staging.sh\` as a guarded, explicit staging-only release process. It will refuse to run if: working tree dirty, HEAD is not latest \`origin/main\`, Node is not 24.12+, or the ignored \`.env.local\` does not contain the existing Staging Firebase Web App \`ourschedule\` configuration. Operator must type **DEPLOY STAGING** explicitly.

The script executes locked installation, production audit, lint/typecheck/unit/emulator security tests, and Vite build. It deploys **Firestore indexes first**, polls the required \`members(uid,role,membershipState)\` composite COLLECTION_GROUP index for **READY** through \`gcloud\`, then deploys reviewed Rules and finally Hosting. It checks the published JS asset hash and PWA static endpoints. A failed index readiness check stops **before** Rules/Hosting deployment. If Rules succeed but Hosting fails, this can produce a mixed rollout; do not claim success, investigate and roll back explicitly.

Once PR #10 has been reviewed/merged and staging exposure approval given:

\`\`\`bash
cd ~/OurSchedule
git status --short    # Must be clean; .env.local ignored
git fetch origin main
git checkout --detach <EXACT_MERGED_SHA>
bash scripts/release-m2-staging.sh
\`\`\`

**No deployment can be performed by merely merging this PR**, and CI never receives staging credentials. A completed script and live verification on real devices remain necessary. All M2 Room/Invite writes become eligible for any Google-authenticated UID under the staged Rules, constrained by per-UID quotas but **not** by per-IP or global throttling; staging owner must approve this exposure and continue to monitor costs. This remains **not** a production authorization.


## M2 live WRITE + Member acceptance with only one Google Account

**This section supersedes the two-real-Google-accounts requirement for Firestore UID access-control testing.** The existing Google user acts as Owner A, and one fresh temporary Firebase Anonymous Auth UID acts as Member B. The test is a **controlled staging exercise**, NOT production/public opening and NOT a second Google provider verification.

A source-only test harness \`scripts/staging-m2-live-acceptance.mjs\` exercises (a) A-vs-B forbidden reads, (b) four non-destructive denied writes, (c) two proper atomic invite redemptions, (d) re-query of joined rooms through the real composite index, (e) Owner removing B and immediate rights revocation, (f) replay rejection, (g) B rejoining with a separate fresh invite, and (h) B leaving. It deletes B's Auth user and checks residual Member access. All Firestore calls use a real B Firebase **ID token**; Cloud Shell's GCP credentials are deliberately not used for application authorization.

**Safety:** Forbidden writes use impossible document-existence preconditions so that even wrongly permissive rules cannot mutate A's profile or create an unauthorized Member/Event. The expected rejection is HTTP 403; an API error/precondition code other than 403 is marked *inconclusive*, not PASS. Valid accepted invites are intentional writes; the two accepted invitation records remain in Staging as audit data even after B's Member record and Auth account are removed. If a test fails partway, the script attempts Member self-leave and deletes B; if cleanup cannot be verified, the Owner must remove the temporary member manually. This test creates **no new room** and uses two of the Owner's 10 daily invitation quota slots.

### Operator-controlled test window

1. In \`https://ourschedule.web.app\`, log in as the existing Google Owner A. Select **the same existing test room** with no other test Members. Generate **two different** one-time invitation links for that room. Store the links *locally* in a temporary password manager note or terminal prompt; do not send them in chat, a URL query, GitHub, Slack or screenshots. The UI may show only the last issued link; copy the first BEFORE creating the second. Make sure both are still pending. Do not log out.
2. Ensure Firebase Staging \`ourschedule\` > Authentication > Sign-in method has **Google Enabled**. Once the links and Cloud Shell are ready, temporarily set **Anonymous Enabled** for the shortest attended time possible. This increases public anonymous signup access: NEVER do this in Production.
3. From Google Cloud Shell, using a **reviewed merged commit that only adds the acceptance script and tests**, run:
   \`\`\`bash
   cd ~/OurSchedule
   git status --short                # Must be clean
   git fetch origin main
   git checkout --detach <MERGED_ACCEPTANCE_SCRIPT_SHA>
   # .env.local must be present and contain VITE_FIREBASE_PROJECT_ID=ourschedule
   read -r -s -p "First invite (Owner removal): " INVITE_TOKEN_REMOVE; echo
   read -r -s -p "Second invite (Member leave): " INVITE_TOKEN_LEAVE; echo
   export INVITE_TOKEN_REMOVE INVITE_TOKEN_LEAVE
   node --env-file=.env.local scripts/staging-m2-live-acceptance.mjs
   result=$?
   unset INVITE_TOKEN_REMOVE INVITE_TOKEN_LEAVE
   echo "M2 live test exit code: $result"
   \`\`\`
   Never paste invite links/tokens, API keys, full UIDs, personal names or ID tokens into GitHub or chat.
4. The script asks the operator to type \`LIVE M2 STAGING\` before creating test B. After B's first successful join, it prints only the first **8** characters of temporary B's UID (matching the masked row displayed in OurSchedule). In **Room Owner > จัดการสมาชิก**, find this exact temporary Member in the correct room, click **ลบสมาชิก**, then return to Cloud Shell and press Enter. Do not remove any other Member. The script automatically tests B's access denial, invite replay, second legitimate join, B self-leave and query disappearance.
5. If the script reports **LIVE M2 WRITE/INVITE/MEMBER ACCEPTANCE: PASS** and confirms **Temporary Anonymous Firebase Auth user deleted**, then go to Firebase Console and **disable Anonymous Provider immediately**, regardless of PASS/FAIL. Review Authentication > Users for unwanted test Anonymous accounts. If cleanup was incomplete, remove the one test Member through Owner UI and investigate before disabling/closing the acceptance gate.
6. Send only PASS/FAIL summary and whether **Anonymous Disabled** is visible in the Console. Existing UI on desktop/iOS/Android remains relevant; staging integration test supplements, not replaces, browser live smoke.

### Explicit boundaries

This script uses two *real* state-changing invite redemptions. They are intentional with Owner-generated fresh invites and an explicit CLI confirmation; it does not update or remove A's profile or room. **It is not a routine read-only script**. Admin/Auth service-account operations and any Production endpoint are out of scope. If reCAPTCHA/App Check enforcement is turned on for Firestore, this direct REST test must be revisited to use proper attestation; the script refuses when the Vite App Check site key is present. Per-UID 3 rooms/24h and 10 invites/24h quotas remain separate from public anti-abuse measures. Completion of this live test does **not** authorize Production, paid backend setup, or public room sharing.
