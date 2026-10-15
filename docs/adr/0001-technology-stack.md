# ADR 0001 — React / Firebase Spark first

Status: Accepted for M0 | Date: 2026-10-15

Decision: React + TypeScript strict + Vite SPA on Firebase Hosting, Firebase Auth, Cloud Firestore, Firestore Security Rules, Emulator Suite, GitHub Actions. Use FullCalendar Standard in M4.

Rationale: mobile-first UI, low operating cost, minimal permanent backend, predictable CI and available Firebase Spark free quotas.

Consequences: complex invariants and secure calendar projections require careful Rules/atomic data design; Firestore reads are chargeable beyond quota. Add server functionality only behind an explicit ADR and budget/security review.

Alternatives: persistent ASP.NET Core API on Cloud Run, Firebase App Hosting, conventional SQL DB. Revisit when true privileged server operations or cost/performance prove necessary.
