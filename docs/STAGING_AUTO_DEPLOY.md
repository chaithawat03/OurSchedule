# OurSchedule — STAGING Auto Deploy through GitHub WIF

Status: source proposal. It must be activated only after CI review, IAM setup and a successful controlled run.

## Scope

Deploys Firebase Hosting LIVE for the existing **Staging** Google Cloud project and site **ourschedule** at https://ourschedule.web.app. It never deploys a Production project, Firestore Rules, indexes, Authentication, Functions, or the named E2E database. The dedicated deployment config is firebase.staging.json and contains ONLY Hosting.

GitHub Actions triggers on a push to main after merging a PR or an explicitly dispatched run from main. BEFORE acquiring any cloud credentials, the gate requires:
- Current main equals the workflow commit.
- A two-parent merge commit associated with precisely one merged PR targeting main.
- Both **PR CI** and **Emulator E2E** workflows succeeded against the exact original PR head SHA and that specific PR, not an older revision.
- Repo-specific opt-in STAGING_AUTO_DEPLOY_ENABLED=true.

The release then builds with Node 24, normal Staging Firebase public Web SDK variables (no Phase2b preview mode), stamps the merged SHA in dist/deploy-version.json, obtains short-lived OIDC credentials, performs firebase deploy --only hosting --config firebase.staging.json --project ourschedule, and checks that https://ourschedule.web.app/deploy-version.json serves the intended commit.

## Cloud Shell: one-time setup

Select project ourschedule and verify its number is 400176852634.

First **inspect** whether the new provider exists:

    gcloud config set project ourschedule
    gcloud projects describe ourschedule --format='value(projectNumber)'
    gcloud iam workload-identity-pools providers describe github-staging-deploy --location=global --workload-identity-pool=ourschedule-e2e --project=ourschedule --format='yaml(name,state,attributeMapping,attributeCondition)'

If the provider does not exist, create a **new independent provider** within the existing pool:

    gcloud iam workload-identity-pools providers create-oidc github-staging-deploy       --project=ourschedule --location=global       --workload-identity-pool=ourschedule-e2e       --display-name="OurSchedule Staging Hosting Deploy"       --issuer-uri="https://token.actions.githubusercontent.com"       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"       --attribute-condition="assertion.repository=='chaithawat03/OurSchedule' && assertion.repository_id=='1420461055' && assertion.ref=='refs/heads/main' && assertion.environment=='staging-deploy' && assertion.workflow_ref=='chaithawat03/OurSchedule/.github/workflows/staging-deploy.yml@refs/heads/main'"

The provider's IAM condition requires the immutable GitHub repository ID, main branch, environment, and canonical workflow path. Never relax it to accept PR branches.

Create a separate Hosting deploy Service Account. **Do not reuse** e2e-runner, e2e-cleanup or e2e-preview-deployer:

    SA="staging-hosting-deployer@ourschedule.iam.gserviceaccount.com"
    gcloud iam service-accounts describe "$SA" --project=ourschedule ||
      gcloud iam service-accounts create staging-hosting-deployer         --display-name="OurSchedule Staging Hosting Deployer" --project=ourschedule
    gcloud iam service-accounts add-iam-policy-binding "$SA"       --project=ourschedule --role=roles/iam.workloadIdentityUser       --member="principalSet://iam.googleapis.com/projects/400176852634/locations/global/workloadIdentityPools/ourschedule-e2e/attribute.repository/chaithawat03/OurSchedule"

Grant ONLY the separate Staging Hosting roles; because the project already has an unrelated conditional Firestore IAM binding, specify --condition=None explicitly:

    gcloud projects add-iam-policy-binding ourschedule       --member="serviceAccount:$SA"       --role=roles/firebasehosting.admin --condition=None
    gcloud projects add-iam-policy-binding ourschedule       --member="serviceAccount:$SA"       --role=roles/serviceusage.apiKeysViewer --condition=None

**Warning:** roles/firebasehosting.admin allows project-level Hosting operations (including live). The script restricts its commands and the dedicated WIF identity to the reviewed main workflow, but it is not a per-channel IAM restriction. Production must remain a separate Google Cloud project. Never grant this account Firestore, Auth Admin, Owner, Editor or Production privileges.

Verify policy and provider BEFORE turning on the workflow:

    gcloud iam service-accounts get-iam-policy "$SA" --project=ourschedule --format='yaml(bindings)'
    gcloud iam workload-identity-pools providers describe github-staging-deploy --location=global --workload-identity-pool=ourschedule-e2e --project=ourschedule --format='yaml(name,state,attributeMapping,attributeCondition)'
    gcloud projects get-iam-policy ourschedule --flatten='bindings[]' --filter='bindings.members:staging-hosting-deployer@ourschedule.iam.gserviceaccount.com' --format='table(bindings.role,bindings.condition.title,bindings.members)'

## GitHub Actions configuration

Create **Environment staging-deploy** in GitHub Settings > Environments and restrict allowed deployment branch to main. A deployment approval is not required for this approved automatic STAGING workflow. Do not provide Production secrets to this environment.

Add Repository Variables:

| Name | Value |
| --- | --- |
| STAGING_AUTO_DEPLOY_ENABLED | false initially |
| STAGING_AUTO_DEPLOY_SERVICE_ACCOUNT | staging-hosting-deployer@ourschedule.iam.gserviceaccount.com |
| STAGING_AUTO_DEPLOY_WIF_PROVIDER | projects/400176852634/locations/global/workloadIdentityPools/ourschedule-e2e/providers/github-staging-deploy |

The workflow reuses existing **STAGING_E2E_API_KEY** and **STAGING_E2E_APP_ID**, which are Firebase *public Web App* configuration values. Optionally set STAGING_RECAPTCHA_V3_SITE_KEY if App Check is enabled; only the public site key, never a reCAPTCHA secret.

After Merge/CI, change STAGING_AUTO_DEPLOY_ENABLED to true and manually invoke **Staging Hosting Auto Deploy** on main for the FIRST controlled release. The workflow runs verified-merge gate, Hosting build, WIF, Hosting-only deploy, then reads the live deploy-version.json SHA. After the first successful run, subsequent merges can deploy automatically.

Emergency stop: change STAGING_AUTO_DEPLOY_ENABLED=false. Rollback requires a separate reviewed Firebase Hosting version restore; this workflow never deploys Production and does not modify Firestore Rules.

## Known boundaries

- Only normal two-parent merge commits are supported. Squash, rebase or direct main pushes deliberately FAIL CLOSED.
- GitHub REST metadata must identify the exact PR HEAD and both successful workflow runs for that SHA. Incomplete metadata fails closed, never bypasses approval.
- Repository administrators should configure main branch protection, required checks and PR reviews. This script is a defense-in-depth check and does not itself enforce repository review policy.
- The optional high-severity audit warnings tracked elsewhere remain visible; CI's production dependency audit is a hard gate.

**Codex Cloud** can work on source code and PRs without storing Google Cloud credentials. GitHub Actions alone performs Staging deployment with WIF.
