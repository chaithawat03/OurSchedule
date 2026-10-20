# M4b — Isolated named Firestore E2E Rules preparation

Status: **reviewable deployment artifacts only; no Rules have been deployed**.

This procedure generates a temporary Rules file that combines existing
`firestore.rules` with the OWNER-PUBLISHED shared calendar experiment
`tests/security/fixtures/m4b-owner-published.rules.fragment`. The result
may be deployed only to Firestore database **ourschedule-e2e**, not to
`(default)`, and only after a separate review and explicit authorization.

## Source preparation

Run from the repository root:

```bash
npm ci --no-audit --no-fund
node --test tests/tools/m4b-named-rules.test.mjs
node scripts/m4b/prepare-named-e2e-rules.mjs
```

Output files (both ignored by Git):

- `.firebase-m4b-generated/firestore.m4b.named-e2e.rules`
- `.firebase-m4b-generated/firebase.m4b.named-e2e.json`

Generated configuration contains **one** resource only:

```json
{"firestore":{"database":"ourschedule-e2e","rules":"firestore.m4b.named-e2e.rules"}}
```

The config cannot deploy Firebase Hosting, Functions, Storage, Firestore
Indexes, any Production project or the default Firestore database.
Never use an unscoped `firebase deploy` for this experiment.

## Named E2E-only release — requires human review

Only AFTER the approved PR is merged, Emulator Rules tests pass, and the
project owner explicitly approves an isolated Rules release:

```bash
gcloud config set project ourschedule
gcloud firestore databases describe --database=ourschedule-e2e \
  --project=ourschedule --format='value(name)'
node scripts/m4b/prepare-named-e2e-rules.mjs
cat .firebase-m4b-generated/firebase.m4b.named-e2e.json
npx firebase-tools deploy --only 'firestore:ourschedule-e2e' \
  --config .firebase-m4b-generated/firebase.m4b.named-e2e.json \
  --project ourschedule
```

STOP if the database name is not
`projects/ourschedule/databases/ourschedule-e2e`. Do not run the deploy
command with another project, database or config file.

Deployment is *not* needed for ordinary work on the preview-only TypeScript
service. It will be required for the later two-UID live acceptance using a
dedicated named-database Hosting Preview.

## Unresolved blockers before live E2E acceptance

- Review Firestore Rules member reads vs. bounded collection queries and
  Admin SDK bypass risk; do not seed any raw private records in
  `sharedCalendarV1` through an administrative context.
- Register a separate opt-in Phase2b Hosting Preview build with
  `VITE_M4B_SHARED_PREVIEW=1`, never the default live Staging Hosting site.
- Run synthetic Owner/Member Playwright acceptance for deliberately shared
  ROOM and BUSY_ONLY data, current membership checks, cross-room denial,
  quota, owner withdrawal and no stale cached data after revocation.
- Confirm an explicit owner-consent UI and distinction from private
  one-recipient assignments.
- The existing Hosting-only Auto Deploy never publishes these Firestore Rules.

Rollback named E2E Rules to the preceding baseline Rules after a failed
preview acceptance, targeting **only** `ourschedule-e2e`. There is no automatic
rollback of Rules or user-generated data; use isolated test identities and
scoped cleanup.

Production and Staging default Firestore Rules must remain unchanged.
