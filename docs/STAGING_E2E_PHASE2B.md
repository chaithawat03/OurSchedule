# Phase 2b — Isolated live E2E (NOT YET ACTIVATED)

## What the test actually covers

Run the unchanged OurSchedule React UI deployed to a **Firebase Hosting preview channel** in the existing Staging project (ourschedule), with its Firestore SDK explicitly pointed at the separate **named database** (ourschedule-e2e). Firebase Authentication stays in the Staging project and uses only fixed synthetic Owner and Member UIDs. Google OAuth login is not tested.

The Playwright UI suite covers Room creation, one-time Invitation/Join, three PRIVATE assignments (accept / decline / revoke), SweetAlert2 back/cancel, and 403/200 Security Rules assertions. This is a genuine hosted preview + live named Firestore database, **not** the publicly hosted staging site (ourschedule.web.app) or its (default) database. Phase 2a continues to test the public site.

Firestore Rules prohibit deletion of normal rooms/events and quotas do not reset. Therefore the full write suite must NEVER run in the default Staging database. The privileged cleanup actor is a distinct SA with IAM conditional access scoped to the named database only; the existing e2e-runner SA remains a token signer without Firestore IAM access.

The cleanup first inventories every named-db document and verifies a single synthetic Owner room, no foreign users/data, limited events/invites, expected nesting, and at most 100 documents. It fails **before deletion** for any unknown data. It deletes children before parents, verifies the database is empty and self-deletes both synthetic Firebase Auth users.

## One-time operator provisioning (NOT done by this PR)

1. Verify Cloud Shell is operating in the Staging project, and create a new Firestore Native **named** database in region asia-southeast1. Skip creation if already present.

    gcloud config set project ourschedule
    gcloud firestore databases list --project=ourschedule
    gcloud firestore databases create --database=ourschedule-e2e --location=asia-southeast1 --type=firestore-native --project=ourschedule

   This is a billable resource. Do not delete or modify (default).

2. Deploy Rules/indexes to ONLY the named database using the dedicated config. The Firebase CLI may silently do nothing on multi-db configurations when using an unqualified rules filter; explicitly select the named database. Never use an unqualified --only firestore deployment here.

    npm ci
    npx firebase deploy --only "firestore:ourschedule-e2e" --config firebase.phase2b.json --project ourschedule

   Check the CLI output confirms database ourschedule-e2e, otherwise STOP.

3. Create a distinct cleanup SA with WIF. Grant it Firestore datastore.user CONDITIONALLY to the named database ONLY, never project-wide. Do not grant any Firestore access to e2e-runner.

    gcloud iam service-accounts create e2e-cleanup --display-name="OurSchedule Phase2b Named DB Cleanup" --project=ourschedule

    CLEANUP_SA="e2e-cleanup@ourschedule.iam.gserviceaccount.com"

    gcloud iam service-accounts add-iam-policy-binding "$CLEANUP_SA" --project=ourschedule \
      --role=roles/iam.workloadIdentityUser \
      --member="principalSet://iam.googleapis.com/projects/400176852634/locations/global/workloadIdentityPools/ourschedule-e2e/attribute.repository/chaithawat03/OurSchedule"

    gcloud projects add-iam-policy-binding ourschedule \
      --member="serviceAccount:$CLEANUP_SA" \
      --role=roles/datastore.user \
      --condition='expression=resource.name=="projects/ourschedule/databases/ourschedule-e2e",title=Phase2bNamedDatabaseOnly,description=Allow testing cleanup only for the named database'

   Review this IAM binding. An UNCONDITIONAL datastore.user/Owner/Editor role is unacceptable. The existing GitHub WIF provider restricts repository, branch, environment and staging-e2e.yml workflow.

4. Build a preview using the vetted PR commit. Your Cloud Shell should already have Staging Web SDK settings in .env.local or environment variables: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID. Never commit secrets or .env.local.

    VITE_PHASE2B_PREVIEW=1 VITE_PHASE2B_DATABASE_ID=ourschedule-e2e npm run build

    npx firebase hosting:channel:deploy p2b-e2e --expires 7d \
      --config firebase.phase2b.json --project ourschedule

   The returned URL must follow https://ourschedule--p2b-e2e-RANDOM_HASH.web.app. Do NOT deploy this build to the Hosting live channel. Preview URLs are public if shared, so keep synthetic data only. The client refuses to start with Phase2b preview mode on any other origin.

5. Set new GitHub Actions Repository Variables (initially disabled):

   | Variable | Value |
   | --- | --- |
   | STAGING_E2E_PHASE2B_PREVIEW_URL | Full exact preview URL above |
   | STAGING_E2E_PHASE2B_CLEANUP_SERVICE_ACCOUNT | e2e-cleanup@ourschedule.iam.gserviceaccount.com |
   | STAGING_E2E_PHASE2B_ENABLED | false |
   | STAGING_E2E_PHASE2B_DELETE_APPROVED | false |

   Existing Phase2a variables remain unchanged. Do not put OAuth tokens or credentials in GitHub Variables.

6. Review and merge the PR after CI passes. Explicitly verify the preview matches the merged source, scoped IAM does not grant default-db access, and named-db rules were deployed. Then opt in manually by setting the last two variables above to true. Dispatch **Staging E2E (opt-in)** once on main. It runs Phase2a first, then Phase2b to prevent overlapping test UIDs.

7. Require the full UI, named-db cleanup and both synthetic Auth cleanups to PASS. Inspect Firebase Authentication and the named DB for absence of test data. Only then permit the scheduled job. If any check fails, immediately set STAGING_E2E_PHASE2B_ENABLED=false; do not modify Phase2a settings.

8. Preview channels expire. Renew/redeploy this preview and update the URL variable before its expiration, or disable Phase2b when it expires. Scheduled Phase2b is not permanently unattended until the preview lifecycle is automated.

## Safety and limitations

- The only eligible target is the explicitly allowlisted Hosting preview + Firestore named database. The runner has no arbitrary project/database/path parameters. All destructive operations are on the named database only.
- All UI/RULES assertions use two Firebase ID tokens, never OAuth/admin privileges.
- The separate cleanup token is never passed to the browser or used against (default).
- If the process is forcibly killed, the next run can reconcile stale test documents only when their ownership and schema match the allowlisted synthetic data; otherwise it stops.
- This PR makes NO live cloud resource creation, IAM updates, Hosting deployment, default Firestore Rules changes or auto activation.

References:
- https://firebase.google.com/docs/firestore/manage-databases
- https://firebase.google.com/docs/firestore/security/iam
- https://firebase.google.com/docs/hosting/test-preview-deploy


## Automated Preview refresh (new, not enabled yet)

Status: SOURCE IMPLEMENTED. The Cloud Hosting deployer is NOT provisioned or verified.

The workflow now refreshes the existing preview URL on the existing Firebase
Hosting site ourschedule, channel p2b-e2e, from the EXACT CURRENT GitHub main
commit SHA. It extends expiration 21 days and checks the actual channel URL
and expireTime through the Firebase Hosting API. Phase2b browser refuses to
write test rooms if the deployed preview does not embed that SHA.

IMPORTANT IAM LIMITATION: Firebase Hosting does not currently support custom
IAM roles. roles/firebasehosting.admin also grants access to the live Hosting
site; the command's fixed Preview-only target is a defense against coding
mistakes, not an IAM security boundary. If project policy prohibits this
broader access, do not enable automated preview deployment.

### One-time Cloud Shell steps (only after PR review)

1. Switch to ourschedule and create a SEPARATE Service Account, never a JSON key:

    gcloud config set project ourschedule
    SA="e2e-preview-deployer@ourschedule.iam.gserviceaccount.com"
    gcloud iam service-accounts describe "$SA" --project=ourschedule ||
      gcloud iam service-accounts create e2e-preview-deployer \
        --display-name="OurSchedule Phase2b Hosting Preview" --project=ourschedule

2. Reuse the existing restricted WIF identity principal, which must still
   require main, repository ID, staging-e2e environment and the precise
   .github/workflows/staging-e2e.yml workflow ref.

    gcloud iam service-accounts add-iam-policy-binding "$SA" \
      --project=ourschedule --role=roles/iam.workloadIdentityUser \
      --member="principalSet://iam.googleapis.com/projects/400176852634/locations/global/workloadIdentityPools/ourschedule-e2e/attribute.repository/chaithawat03/OurSchedule"

3. Grant Firebase Hosting Admin and API Keys Viewer ONLY to this separate
   deployer, not to Auth signer e2e-runner or Firestore cleanup e2e-cleanup.
   Review that Hosting Admin is a broad privilege over this Hosting project.

    gcloud projects add-iam-policy-binding ourschedule \
      --member="serviceAccount:$SA" \
      --role=roles/firebasehosting.admin

    gcloud projects add-iam-policy-binding ourschedule \
      --member="serviceAccount:$SA" \
      --role=roles/serviceusage.apiKeysViewer

    gcloud projects get-iam-policy ourschedule \
      --flatten="bindings[]" \
      --filter="bindings.members:e2e-preview-deployer@ourschedule.iam.gserviceaccount.com" \
      --format="yaml(bindings.role,bindings.condition,bindings.members)"

4. Set GitHub Actions repository variables:

    STAGING_E2E_PHASE2B_HOSTING_SERVICE_ACCOUNT=e2e-preview-deployer@ourschedule.iam.gserviceaccount.com
    STAGING_E2E_PHASE2B_PREVIEW_REFRESH_ENABLED=false
    STAGING_E2E_PHASE2B_PREVIEW_DEPLOY_APPROVED=false

   Continue using the existing STAGING_E2E_PHASE2B_PREVIEW_URL unchanged.
   Never add user OAuth tokens, long-lived tokens, or service-account JSON keys.

5. After a separate review and merge, switch the last two new flags to true.
   Start a NEW Staging E2E workflow_dispatch on main. No manual Cloud Shell
   preview build is required afterward. The actual job dependency sequence is:

    Phase2a read-isolation
          -> Preview-only refresh/build
          -> Phase2b live hosted UI + named Firestore cleanup

6. Accept only if all jobs are successful and the preview refresh log, Phase2b
   private Rules assertions, named database cleanup, and both synthetic Auth
   reconciliations pass. Validate expiry has moved ~21 days into the future.
   If any step fails, the dependent Phase2b job is skipped, not permitted to
   run against an outdated preview build. Phase2a remains independent.

### Fail-closed details

- The deployer exists only in a canonical main workflow gated by explicit
  opt-in flags; no pull-request workflow can exchange Hosting credentials.
- npm install and Vite build happen BEFORE exchanging Hosting credentials.
- Deployment is literal hosting:channel:deploy p2b-e2e --expires 21d with
  project ourschedule and a config containing hosting.site = ourschedule.
  It never runs generic firebase deploy or targets live.
- Preflight GET refuses missing, expired, moved, or unversioned channels.
  Firebase CLI JSON and postflight GET must confirm the exact expected URL
  and at least 20 days remaining. New channel creation is not allowed.
- The browser checks the deployed SHA equals github.sha before UI writes.
- Disable STAGING_E2E_PHASE2B_PREVIEW_REFRESH_ENABLED and
  STAGING_E2E_PHASE2B_ENABLED if the automation is unhealthy. On an incident,
  revoke the deployer WIF binding or Hosting Admin role.

Sources:
- https://firebase.google.com/docs/hosting/manage-hosting-resources
- https://firebase.google.com/docs/projects/iam/permissions
- https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.channels/get
