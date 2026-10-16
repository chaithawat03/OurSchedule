# Firebase Environments — current state (2026-10-16)

| Environment | Project | Notes |
| --- | --- | --- |
| Local / CI | `demo-ourschedule-ci` | Firebase Auth/Firestore emulators; no real project or credentials |
| STAGING | `ourschedule` | Existing Google Cloud/Firebase Blaze project, Hosting at https://ourschedule.web.app; Web App registered; Firestore STANDARD Native `(default)` at `asia-southeast1` |
| PRODUCTION | separate project, proposed `ourschedule-prod` | Not provisioned or deployed; ID availability not established |

The staging project `ourschedule` is **not Production**. This replaces obsolete suggestions to create `ourschedule-stg`.

## Current staging evidence

- M0 Hosting was deployed and tested from approved commit `803ac7ff33bfc08f01889b61886b20be634526a8`, with HTTP 200 on root, PWA Manifest and Service Worker.
- Initial Firestore rules were deployed as DENY ALL in staging. They MUST be updated as an explicit reviewed M1 release gate before enabling live M1 profile writes.
- Firebase Google Auth provider is not yet verified enabled. Enable it manually only for staging following `docs/M1_IDENTITY_STAGING.md`.
- Staging is on Blaze with billing enabled; free tier quotas still apply. Budget notifications are not a spending hard limit.

## Deployment guardrails

- PR CI may only use `demo-ourschedule-ci`; **no production credentials in PR**.
- Build only at approved merged commit with verified `.env.local` mapping to staging Web App. Never commit tokens, passwords or service-account keys. Web App configuration values are public but environment-sensitive.
- Always include `--project ourschedule` for staging operations. Do not infer target from `.firebaserc`.
- Explicitly review and deploy Firestore rules before M1 UI Hosting; deploy `--only hosting` separately.
- Keep staging and production Auth and Firestore entirely isolated.

## Production release gates

Separate project provisioning, backup/deletion-protection plan, critical/high dependency security decisions, manual mobile and live rules verification, rollback steps, documented release SHA and separate explicit authorization. Hosting rollback does not roll back Firestore documents or Rules.
