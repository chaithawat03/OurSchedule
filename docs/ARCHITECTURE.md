# Architecture

## Stack

- React, TypeScript strict mode, Vite, responsive CSS, Firebase Hosting
- Firebase Auth with a provider-neutral identity service
- Cloud Firestore guarded by Security Rules
- Firebase Local Emulator Suite and GitHub Actions
- FullCalendar Standard for day/week/month/multi-month in later milestone

Do not introduce Cloud Run, Cloud Functions or App Hosting as a prerequisite for M0. Production server features are a later ADR, with cost and operational review.

## Architecture boundaries

1. Presentation: app shell, pages, calendar.
2. Features: auth, rooms, activity, calendar.
3. Application services: identity, room membership, assignments, calendar projection.
4. Data access: typed repositories and Firebase adapters; never scatter SDK calls across UI.
5. Authorization: Firestore rules and transaction design, never trust UI checks alone.

## Data flows (planned)

Google Auth / approved password scheme → Firebase UID → user profile.
Room membership → authorization scope → date-window calendar query.
Private event detail and room-visible projections are separate documents.

## Client query principles

Only read date ranges visible in the current view, plus small bounded margins. Unsubscribe when switching rooms. Limit live listeners. Count reads during performance testing. Firestore rules are NOT filters; queries must be provably authorized.

## Time representation

Store start/end as Firestore Timestamp instants and IANA timezone ID. All-day calendar end is exclusive; avoid serializing local-midnight dates as arbitrary UTC instants without a domain conversion layer.

## Deployment

Local and CI use demo projects/emulators. Staging and production are separate Firebase projects with independent Auth/Firestore data. All deploy actions must explicitly specify project and immutable commit SHA. CI must not be able to deploy production using PR credentials.

## Backups

Firestore managed backup is not treated as a free Spark capability. A tested export/restore and retention procedure is a pre-production release gate, not assumed in M0.
