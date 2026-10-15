# Environments and Firebase Setup Runbook

## Planned environments

- Local: Firebase Emulator Suite (Firestore 8080, Auth 9099) and Vite.
- CI: emulated project demo-ourschedule-ci. Never use real Firebase credentials.
- Staging: a new separate Firebase project, proposed ID ourschedule-stg (availability not checked).
- Production: a new separate Firebase project, proposed ID ourschedule-prod (availability not checked).

Project creation and registration have NOT been performed. These are proposed IDs, not deployable targets.

## Before staging deployment

1. Log in with an authorized Firebase account on a trusted execution environment.
2. Create/configure staging Firebase project on Spark (no billing).
3. Register Web App and enable Hosting, Firestore as appropriate, and later Auth.
4. Record project ID, app configuration and security settings via approved configuration mechanism.
5. Keep real credentials out of repository; use least-privileged deploy identity with short-lived identity when feasible.
6. Verify Firebase Security Rules in Emulator first. Default-deny Rules may be deployed safely but no functional data flows will work.
7. Run Hosting deploy to staging only with an explicit --project selection.
8. Capture URL, project ID, commit, smoke result.
9. Do not create or deploy production until release acceptance.

## Cost guardrails

Stay on Spark. Static Firebase Hosting and Firestore have no-cost quotas, not unlimited resources. Firebase App Hosting, paid function usage, scheduled server features, Phone SMS auth and managed backups may require Blaze/billing. Any upgrade needs explicit budget approval.

## Emergency response

In case of accidental public Firestore rules, revert to default deny, rotate exposed secrets when relevant and review access. Hosting rollback must reference a previously validated release. Recovering Firestore content needs an explicitly tested procedure: Hosting rollback alone does not restore database state.

## Acceptance gate

Stage verified only when project exists and is confirmed distinct from production, deployment completed and smoke evidence recorded. Until then status is IMPLEMENTED_NOT_VERIFIED.
