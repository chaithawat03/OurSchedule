# OurSchedule

Mobile-first shared personal calendar and room scheduling, designed for Google Cloud Firebase Spark.

**Status:** M0 foundation deployed to staging; M1 Google Identity is being implemented on a review branch. Production services are not deployed.

## Goal

One user may belong to many rooms, see a consolidated calendar, assign activities to room members under room policy, and control the visibility of personal data.

## Engineering contract

Plan → implement/test → review → PR/CI → merge → staging/live verification.

Production changes must use a reviewed, merged commit SHA. Never include service account keys or passwords in Git.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Test strategy](docs/TEST_STRATEGY.md)
- [Environment setup](docs/ENVIRONMENTS.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/adr/0001-technology-stack.md)

## Local development

M0 UI deploys to staging. M1 introduces optional Google Auth when configured with an ignored `.env.local` and approved Firestore profile rules. See [M1 staging runbook](docs/M1_IDENTITY_STAGING.md). Local CI tests use demo emulators only; never connect tests to production.

## Release status

M0 staging hosting and responsive screenshots are recorded; live PWA install and Firestore security checks remain part of release acceptance. M1 is not verified until its PR, emulator tests and live staging checks pass.
