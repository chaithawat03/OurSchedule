# Phase 2a — unattended STAGING read-isolation E2E (source-only candidate)

Status: **IMPLEMENTED AS SOURCE; NOT ACTIVATED OR LIVE VERIFIED**. PR review, IAM/WIF provisioning and explicit residual-profile acceptance are separate operator gates.

## Why Phase 2a is intentionally narrower than M3.2a

Phase 1 (#20) uses real Playwright UI flow + synthetic Firebase Emulators. Phase 2a connects the deployed Staging origin only, creates two **fixed synthetic identities** through Firebase Custom Tokens, opens two Playwright Chromium contexts, verifies the signed-in real UI and 200 own/403 other Firestore profile reads under **actual Security Rules**, and deletes both test Auth users with their own Firebase ID tokens. No local emulator, dev-only bridge, Google OAuth test account, Anonymous provider, Production, Admin Firestore bypass, Room creation, activity writes or Firebase deploy.

Firebase Authentication custom-token login works without enabling the Anonymous sign-in provider. This does NOT test Google's OAuth redirect itself, nor M3.2a accept/decline/revoke on Staging.

**Residual data:** Existing Rules prohibit hard deletion of user profiles, rooms and events. This smoke allows only two fixed synthetic UIDs (`e2e_staging_owner_v1` and `e2e_staging_member_v1`). Their matching Firestore profile docs persist between test runs. The Auth user records are self-deleted; if interrupted, cleanup failure must be reconciled in Firebase Console. These profiles are not user-private content, but they are a deliberate Staging write. This is WHY the opt-in is disabled by default. Do not enable write-heavy M3.2a scenarios on a cron until a reviewed, least-privilege cleanup/reconciliation procedure is available.

## Security design

* Workflow runs only from the canonical repository's `main` branch on scheduled or manual events; **never on pull requests**. Repository variables `STAGING_E2E_ENABLED=true` and `STAGING_E2E_APPROVE_PERSISTENT_PROFILES=true` are required in two separate checks. Until set, scheduled jobs skip.
* Dedicated workload identity provider must restrict GitHub OIDC subject/repository/ref to `repo:chaithawat03/OurSchedule:ref:refs/heads/main` (review actual claims if using an environment-scoped subject). No JSON service-account key.
* Dedicated `e2e-runner@ourschedule.iam.gserviceaccount.com` or another dedicated SA in `ourschedule`. Grant it permission to sign blobs for **itself** only, with IAMCredentials API enabled. Do NOT grant project-wide Firestore IAM access; a privileged OAuth token must NEVER be sent to Firestore. Avoid Owner/Editor/Firebase Admin roles.
* The access token from WIF signs two custom JWTs using IAMCredentials `signBlob`. The Auth SDK signs in the two synthetic UIDs on a one-off HTML document fulfilled locally by Playwright, scoped to the real Staging origin. The script is bundled in runner memory and never deployed or added to the public app. Firebase Auth state persists in the origin's own IndexedDB, so a subsequent navigation uses the **deployed app**.
* Firestore assertions use **Firebase user ID tokens** (Rules enforced), NOT IAM OAuth tokens (which would bypass Rules). No JWT, refresh token or bearer link is printed, uploaded or recorded in screenshots/traces. Browser contexts block service workers.
* Real deployment must match the configured Staging Web App ID and Firebase project; Staging origin, project ID, authDomain and fixed UIDs are hardcoded in the runner. Do not run it against another project.
* App Check enforcement, changes to sign-in requirements, or different Firebase user provisioning may require a separate design review. Never work around App Check by bypassing Rules.

## Operator provisioning / activation (not performed in this PR)

1. Review code and test-only profile retention. Confirm `ourschedule.web.app` is Staging, Google sign-in remains enabled and Anonymous remains **Disabled**.
2. Configure a GitHub OIDC workload identity pool/provider in GCP with audience and subject restrictions exclusively for the canonical repository and main. Establish dedicated service account in the Staging project, enable IAMCredentials API, grant only Workload Identity User to permitted principal and Service Account Token Creator on that **one test SA** for signing. Avoid deploying privileged credentials into GitHub secrets or repository files.
3. In GitHub repository Actions variables configure: `STAGING_E2E_WIF_PROVIDER` (provider full resource), `STAGING_E2E_SERVICE_ACCOUNT` (SA email), `STAGING_E2E_API_KEY` (public Firebase web API key), `STAGING_E2E_APP_ID` (Firebase Web App ID). The API key is a client config value, **not a privileged service-account credential**.
4. Create GitHub Environment `staging-e2e`; apply branch deployment restrictions to main. If required reviewers are configured, the run requires a person and is NOT unattended.
5. After approving the two stable residual profile docs, set repository variable `STAGING_E2E_APPROVE_PERSISTENT_PROFILES=true`, then explicitly set `STAGING_E2E_ENABLED=true`. Run the workflow manually once and verify cleanup and denial assertions. Leave both disabled until this review.
6. On failure, leave the automation disabled, inspect the two known test UIDs in Firebase Authentication, and avoid deleting unrelated user data. Account self-deletion and matching two profile paths are the only cleanup scope.

Scheduled cadence, when enabled: weekdays at 21:17 UTC / 04:17 Bangkok the following day. This is a **read-isolation smoke only**. Do not label M3.2a Live security PASS.

## Still outstanding for complete unattended M3.2a LIVE

* A dedicated Room/Event test namespace with safe repeatability and bounded cost, and a reviewed cleanup reconciler. Present Rules intentionally deny hard deletes, so a live write suite cannot honestly claim fully clean teardown.
* Member invite/accept/decline, SweetAlert2 creation/cancellation, member revocation using real UI, duplicate/missing recipient diagnosis from #19, and LIVE 403 after removal.
* One-time staging smoke verification and an explicit separate review before enabling any scheduled mutable live E2E.
* Google OAuth provider sign-in remains a separate real-user acceptance path.
