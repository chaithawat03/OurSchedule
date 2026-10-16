# M1 Google Identity — staging gate

Scope: Google Sign-in, UID-based profile provisioning, browser session, sign-out. Room access, activity CRUD, phone/password and private calendar data are NOT introduced in this milestone.

## Security design

- Firebase Auth is the authoritative principal; the frontend cannot create arbitrary UIDs.
- Profiles at `users/{uid}` are private to their UID, with strict field allowlist and timestamp guards.
- Profile creation is transactional and idempotent across repeated Google sign-ins.
- `users` collection listings, deletion, all personalEvents, rooms, invitations and other collections remain denied by rules.
- No passwords, phone numbers, raw tokens or credential recovery information are kept in Firestore.
- No persistent offline Firestore cache or offline writes are enabled.
- A Firebase project must be configured via ignored local `.env.local`; no CI/live credentials.

## Manual staging setup (AFTER PR, CI, review and merge)

1. Firebase Console > Authentication > Sign-in method: enable Google provider for **staging project `ourschedule`**. Set provider support email. Keep Phone provider disabled.
2. Verify authorized domains include `ourschedule.web.app` and `ourschedule.firebaseapp.com` as needed by your Auth configuration. Browser popup / mobile Safari flow must be smoke tested on real devices.
3. From the exact **approved merged SHA**, create `.env.local` with Web App values from `firebase apps:sdkconfig WEB --project ourschedule`, mapping `apiKey`, `authDomain`, `projectId`, `appId` to `VITE_FIREBASE_*`. Ensure `VITE_FIREBASE_PROJECT_ID=ourschedule`. Firebase web configuration is not a secret but is never committed to avoid accidentally targeting another environment.
4. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:rules`, `npm run build`. Audits must be reviewed.
5. Explicitly deploy vetted Security Rules to staging: `firebase deploy --only firestore:rules --project ourschedule`. **Do this before deploying a UI that writes profiles.** Validate live own-profile create/get, cross-UID read/write and collection-list denial; note that test-only Emulator evidence alone does not prove deployed rules.
6. Deploy `firebase deploy --only hosting --project ourschedule`. Browser smoke: Google popup, first sign-in, repeated sign-in idempotency, refresh persistence, sign-out, unauthorized UID denial, Android Chrome and iOS Safari.
7. Verify Firebase Console Authentication user mapping and own Firestore profile; avoid publishing email/UID or personal info in logs/screenshots.
8. Revert/rollback: Hosting rollback does NOT rollback Firestore Rules or remove profile data. Rules rollback to deny-all disables M1 profile access: plan rollback together.

## Acceptance

GitHub PR CI, Firebase Emulator positive/negative rules tests, no active production credentials, audited staging activation, real browser checks. **Do not enable phone/password, merge, or deploy production from this PR.**

## Risk

Firebase JS SDK runtime reclassification may surface High-severity transitive `@grpc/grpc-js` in `npm audit --omit=dev`; do NOT suppress these findings without tracing browser vs Node exposure and explicit review in Issue #5.
