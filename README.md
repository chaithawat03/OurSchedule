# OurSchedule

Mobile-first shared personal calendar and room scheduling, designed for Google Cloud Firebase Spark.

**Status:** Milestone 0 foundation (work in progress). No authentication or production service is enabled by this repository.

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

The app scaffold and verification commands are delivered as part of M0. Live Firebase projects are **not** created by source control. Never connect local tests to production.

## Release status

M0 is **not verified** until CI, emulator and staging evidence are recorded. M1 starts only after the M0 gate is accepted.
