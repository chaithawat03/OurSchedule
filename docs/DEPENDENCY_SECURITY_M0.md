# M0 Dependency Security Remediation — 2026-10-16

## Purpose

Address audit findings identified against foundation commit `e9e46be8016c1ab379d036d5f5ad56da457eb680` without deploying to staging/production or changing `main` outside PR review.

## Baseline from user-provided Cloud Shell audit

- `npm audit --omit=dev`: **4 high** findings in Firebase / Firestore / `@grpc/grpc-js` chain, **0 critical**.
- `npm audit`: **10 moderate, 12 high, 3 critical**, mostly dependency/tooling chains.
- Current M0 browser entrypoint `src/main.tsx` imports React and CSS; its component does not use Firebase SDK. The Firestore rules test does import Firebase SDK. Classify Firebase as a **development dependency for M0 only**. Move it back to runtime when M1 first adds Firebase client access, with a new security review.

## Changes in this branch

- `firebase`: upgrade to major 13, dev-only (for security rules test harness).
- `@firebase/rules-unit-testing`: upgrade to major 6, matching Firebase 13 peer dependency.
- `firebase-tools`: upgrade to major 15, applying later CLI fixes.
- `vitest`: upgrade to major 5, applying later test-tool fixes.
- Node.js engine: 22.12+ on Node.js 22 LTS line; CI runs Node 22 and Java 21.
- CI uses a checked-in lockfile with `npm ci`. Both production and full-dependency `npm audit --audit-level=high` are required checks. Remaining high/critical findings are **not silently waived**.

## Security guardrails

- Do not use `npm audit fix --force`. The baseline output would downgrade Firebase to v9.14.0 and bring unrelated major migrations.
- Do not add a global `@grpc/grpc-js` override to superficially flatten dependency findings; Firestore's transitive range can leave a vulnerable nested copy. Inspect `npm ls @grpc/grpc-js --all` after resolution.
- Dev tools are not browser bundle assets, but can still affect CI and deployment hosts; treat residual critical/high findings as review blockers until mitigated and explicitly accepted.
- Keep all Firebase services and environment credentials unchanged; no production deployment in this PR.

## Verification commands

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run test:unit
npm run test:rules
npm run build
```

Merge gate: reproducible lockfile, clean required checks, code diff review, test evidence. After merge: redeploy the newly approved SHA to staging and verify before production. **This PR does not auto-deploy.**

## Source references

- GitHub Issue #5: https://github.com/chaithawat03/OurSchedule/issues/5
- Firebase JS SDK gRPC dependency investigation: https://github.com/firebase/firebase-js-sdk/issues/10400
- Vitest 5 migration requirements: https://vitest.dev/guide/migration/
