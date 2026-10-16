# M2.2 live security & abuse acceptance — STAGING ONLY

Status: **PENDING HUMAN LIVE VALIDATION / NOT FOR PUBLIC SHARING** (2026-10-16).

Repository `main` is still at M2.1, and Firebase Staging Hosting/Rules remain M1 until approved deployment. This runbook is for a later, explicit rollout of reviewed/merged M2.2 SHA; **do not deploy this Draft PR directly**. Production is an entirely separate Firebase project, unprovisioned.

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
| M1 live Firestore foreign-UID denial | **PENDING** |
| A/B live invite and revocation security | **PENDING** |
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
