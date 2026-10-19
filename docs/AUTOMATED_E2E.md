# Unattended local E2E (M2/M3.1/M3.2a)

This pipeline creates **two independent Firebase Auth Emulator anonymous users** in separate Chromium browser contexts, runs UI transactions against the local Firestore Emulator with the project's actual Firestore Security Rules, then terminates both emulators on completion. It uses a **demo-** project ID and a synthetic API key. It never uses the staging Firebase configuration. Live Staging's **Anonymous Provider remains DISABLED**; test-only anonymous accounts cannot enter the live Firebase Auth user list.

\`\`\`bash
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
\`\`\`

On each pull request, GitHub Actions separately runs this same command automatically (under CI). Playwright creates an owner and member, one fresh room, an invitation, PRIVATE assignments and a SweetAlert2 flow. It tests PENDING cannot view detail; ACCEPT permits direct event read; CANCEL revokes it; DECLINE cannot read and cannot be changed to ACCEPT; a third ACCEPT followed by Owner removing the member immediately forbids room/private event reads and member discovery. No operator login, cloud key, token or manual browser actions are needed.

This is a **real two-UID emulator acceptance**, not live Firebase Staging acceptance and not actual Google OAuth acceptance. The browser dev-only test bridge is allowed only for \`demo-ourschedule-e2e\` on Vite DEV with \`VITE_E2E_EMULATORS=1\`. Production bundles will not import it; the Firebase client rejects the emulator flag if project/authDomain/key are not exactly synthetic.

## Rollout sequence

1. Phase 1 (**this PR**): repeatable GitHub Actions Playwright+Auth+Firestore Emulator smoke/security checks. No Firebase Console change, no IAM service account, no credentials and no live deployment.
2. Phase 2 (separate review/approval): if tests need to hit remote Firebase Staging automatically, provision narrow-scope workload identity federation for a dedicated test runner and a synthetic identity lifecycle, use dedicated test-only room namespace and short-lived created resources, implement cleanup reconciler that fails closed, and publish non-secret test reports. Keep real Google sign-in as a separately reviewed flow. Avoid enabling the actual Staging Anonymous provider.
3. Production is out of scope. Room-wide ROOM/BUSY_ONLY sharing and AUTO_ASSIGN live acceptance remain gated separately.

Do not convert passing emulator tests into a claim that Staging live Owner/Member acceptance is complete. The original attended retry in Issue #15 is still incomplete. Neither CI nor this PR touches production or the existing staging database.
