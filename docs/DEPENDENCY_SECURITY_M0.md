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
- Node.js engine: **24.12+ on Node.js 24 LTS line**. Firebase SDK 13 / Rules Unit Testing 6 require Node.js >=24.12; Node 22 previously passed some tests but emitted EBADENGINE warnings and is not accepted. CI runs Node 24 and Java 21. Developers using Cloud Shell must switch to Node 24 before reinstalling and testing.
- CI uses a checked-in lockfile with `npm ci`. The **production** High/Critical audit is a hard CI gate. The **full development** audit runs as a visibly failing advisory step while regression tests continue; this does NOT waive the findings or imply security sign-off. PR remains DRAFT pending security review.

## Initial CI result (2026-10-16)

The first regenerated-lockfile run resolved and installed successfully. Production dependency audit passed at High+ threshold (no high/critical findings in `--omit=dev`). Full audit still reported **12 findings: 4 moderate, 8 high, 0 critical**, and initially stopped CI before tests; the workflow now surfaces the audit failure clearly and continues functional tests. Remaining High paths include `@firebase/firestore -> @grpc/grpc-js` under the dev-only test SDK and `firebase-tools -> chokidar/braces` in CLI tooling. This is a partial remediation, not a clean full audit.

Do not merge until residual High findings are resolved or a documented, authorized security risk acceptance is recorded. Do not treat `continue-on-error` in the full-audit step as evidence that all packages are safe.

## Security guardrails

- Do not use `npm audit fix --force`. The baseline output would downgrade Firebase to v9.14.0 and bring unrelated major migrations.
- Do not add a global `@grpc/grpc-js` override to superficially flatten dependency findings; Firestore's transitive range can leave a vulnerable nested copy. Inspect `npm ls @grpc/grpc-js --all` after resolution.
- Dev tools are not browser bundle assets, but can still affect CI and deployment hosts; treat residual critical/high findings as review blockers until mitigated and explicitly accepted.
- Keep all Firebase services and environment credentials unchanged; no production deployment in this PR.

## Verification commands

```bash
node --version   # must be >=24.12 and <25
npm ci
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run test:unit
npm run test:rules
npm run build
```

Merge gate: reproducible lockfile, clean production audit and regression checks, code diff review, test evidence **and explicit resolution or security acceptance of outstanding development High findings**. After merge: redeploy the newly approved SHA to staging and verify before production. **This PR does not auto-deploy.**

## Source references

- GitHub Issue #5: https://github.com/chaithawat03/OurSchedule/issues/5
- Firebase JS SDK gRPC dependency investigation: https://github.com/firebase/firebase-js-sdk/issues/10400
- Vitest 5 migration requirements: https://vitest.dev/guide/migration/
