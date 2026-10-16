# M1 Firebase gRPC dependency remediation (2026-10-16)

## Problem
Runtime Firebase JS SDK 13 adds `@firebase/firestore`, which declares `@grpc/grpc-js: ~1.9.0`. This resolves to `1.9.16`, flagged by GHSA-m9gg-hp2v-232j and GHSA-f596-whhp-79r4. CI correctly blocked the M1 PR with 4 High findings in the runtime graph.

Upstream: https://github.com/firebase/firebase-js-sdk/issues/10400 (open as of 2026-10-16). The upstream report documents that this dependency is only used by Firestore's Node gRPC transport, not the browser WebChannel transport. Browser Vite bundle risk is consequently lower but **package and Node Emulator usage still deserve remediation**.

## Scoped remediation
Root `package.json` override:
```json
{
  "overrides": {
    "@firebase/firestore": {
      "@grpc/grpc-js": "^1.14.6"
    }
  }
}
```
The override is strictly scoped to the Firestore subtree. It forces a patched gRPC release **outside the declared Firebase semver range**, so it is a deliberate compatibility exception rather than an officially guaranteed supported combination. Regenerate `package-lock.json` using npm 11 / Node 24, review the resolved nested tree, and verify that no `1.9.16` copy remains. Do not use an unrelated global override or `npm audit fix --force`.

The `scripts/check-grpc-lock.mjs` and CI `npm audit --omit=dev --audit-level=high` provide independent gates. Test both the browser Vite build and Node-based Firestore Emulator rules tests (14 tests). Confirm the final CI result before merge. If CI cannot validate, revert the override and keep PR blocked. Revisit/remove this override when Firebase officially widens its Firestore dependency range.

## Remaining risks and release gates
- Full-development audit findings in `firebase-tools` and its dependencies are tracked in Issue #5; no implied waiver.
- Root dependency `overrides` can be fragile across future Firebase major updates. Review after each lockfile update.
- Authentication feature is unverified on live staging. Provider enablement, authorized domain, profile rules, Android and iOS interactive smoke testing still require explicit acceptance.
- Only STAGING project `ourschedule` may be used for initial M1 live verification. Production remains separate and unprovisioned.
