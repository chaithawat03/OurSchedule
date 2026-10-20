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
