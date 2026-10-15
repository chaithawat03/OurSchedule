# Roadmap and Milestone Gates

## M0 Foundation

M0.1 documents: PRD, architecture, data model, privacy/security, ADRs.
M0.2 code: TypeScript React/Vite scaffold, Firebase config, default-deny rules, emulator tests, CI.
M0.3 environment: demo emulator configured; stage and prod are explicit human-authorized provisioning steps; stage smoke validation.
Gate: npm ci, lint/typecheck, unit/rules tests, build, PR review/merge, staging smoke. Status is not VERIFIED without evidence.

## M1 Identity

Google Auth, UID mapping, profile and session. Phone + Password is gated on a security-approved password scheme with recovery, enumeration resistance and future verification migration. If not approved, use Google only. Never treat unverified phone as proof of number ownership.

## M2 Rooms

Create/join/invite/leave, membership roles, assignment defaults, last-owner invariant, security rules, abuse and concurrency tests.

## M3 Activity

Personal and room events, per-user assignments, privacy projection, accept/reject, edit authorization, calendar range schema, transactional invariants and rules tests.

## M4 Calendar/PWA

Day/week/month/multi-month, merged date-window calendar, room toggles, mobile touch, installable PWA, iOS Safari/Android Chrome tests, Firestore read-budget profiling.

## M5 Release

Production gated by explicit approval, security review, backup recovery procedure, deploy audit, smoke tests and rollback drill.

## Standard workflow

Plan -> Implement/Test -> Review -> PR/CI -> Merge -> Staging/Live Verify.

Do not merge failed CI; do not claim deployment success from code merge. Codex Cloud may deploy only an approved merged SHA with explicit environment identity.
