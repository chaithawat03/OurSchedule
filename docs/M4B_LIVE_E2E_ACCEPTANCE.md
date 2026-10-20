# M4b — manual-only two-UID live acceptance (prepared, NOT activated)

The existing GitHub Actions job `staging-room-activity-preview` can now,
**only with explicit opt-in**, check ROOM and BUSY_ONLY records against the
dedicated Firebase **named** Firestore database `ourschedule-e2e`.
The browser contexts are bootstrapped from the pinned Phase2b Hosting Preview
origin; REST reads/writes use **Firebase USER ID tokens** and therefore
enforce actual Firestore Security Rules, not an Admin SDK bypass.

## Opt-in and isolation

By default, `STAGING_E2E_M4B_LIVE_APPROVED` is unset and M4b steps do not run.

To enable a **single manual test** after a separately approved Rules release,
a repository administrator must explicitly set BOTH GitHub Actions variables:

- `STAGING_E2E_M4B_LIVE_APPROVED=true`
- `STAGING_E2E_M4B_RULES_RELEASE_VERIFIED=true` — set this only after
  inspecting and independently confirming the exact named-database Rules
  release, never before

Use **Actions → Staging E2E (opt-in) → Run workflow → main**.
A scheduled GitHub event deliberately **skips M4b**, even if both variables
remain true. No pull-request code can run the live test. Before any account
or Firestore cleanup, the runner verifies `GITHUB_WORKFLOW_REF` matches the
canonical `staging-e2e.yml` on main.

Phase2b still requires its original separate opt-ins, preview-refresh job,
WIF synthetic Firebase token signer, and strictly isolated cleanup SA.
The named database preflight inventory must pass before tests begin.

## Acceptance behavior

Using the SAME single synthetic room and two allowlisted identities from
Phase2b:

1. Synthetic Owner creates a new room and synthetic Member joins.
2. Owner commits a **BUSY_ONLY** record in
   `rooms/{syntheticRoomId}/sharedCalendarV1/P2B-M4B-BUSY-1` with the
   atomic `roomEvents` quota transition.
3. Owner commits a **ROOM** record with an explicitly public synthetic title,
   again atomically incrementing the quota.
4. Member's Firebase **ID token** must be authorized to direct-GET both,
   and a bounded `limit(20)` query must return exactly two documents with
   strict public-only field schemas; no notes, recipient UID or source event.
5. Owner withdraws ROOM and the Member's next query contains BUSY_ONLY only.
6. Existing Phase2b PRIVATE activity invitation, acceptance, decline,
   cancellation and member-revocation acceptance run unchanged.
7. After revocation the Member must receive **403** for BUSY_ONLY direct GET
   AND bounded list, while the Owner still reads it.
8. Existing Phase2b finally block inventories the named database, deletes
   only allowlisted synthetic entries, and self-deletes both synthetic Auth
   users. Any unexpected collections/fields/foreign account cause
   **fail closed** and manual reconciliation. No default-database mutation.

Scripts and offline tests:

- `scripts/staging-e2e/m4b/acceptance.mjs`
- `tests/staging/m4b-live.unit.test.mjs`
- `tests/staging/m4b-cleanup.unit.test.mjs`

## Required review BEFORE ANY LIVE TEST

**Do not turn these variables on yet.**

1. Verify PR #34 experimental Rules and PR #36 named-database generation.
   Deploy experimental Rules **only to** `ourschedule-e2e` after explicit
   owner approval and verify the live Rules release identifier. Never
   deploy to `(default)`.
2. Review with the project owner that Admin SDK can bypass client rules.
   The isolated shared collection must be initially empty; do not import
   or seed PRIVATE records. Firestore Rules do not sanitize existing
   administrator-written documents. An accidental admin-seeded record can
   reveal fields through list even when ordinary clients cannot write it.
3. Confirm previous baseline Phase2b E2E passes with its fixed identities,
   Hosting Preview refreshed/pinned source, and cleanup SA's conditional
   `roles/datastore.user` remains named-database-only.
4. No simultaneous Phase2b runs (workflow concurrency already serializes).
5. After a successful one-time manual acceptance, set both additional M4b
   variables back to `false` to prevent accidental repeated live writes.
6. Review audit/results and cleanup. The test covers two synthetic users,
   including member revocation. A third outsider user's denial remains an
   Emulator-only security test and requires separate live acceptance before
   end-user shared calendar rollout.

## Scope and known limitations

The user-facing M4b shared calendar UI remains disabled. This is an opt-in
acceptance harness, **not** authorization to promote experimental Rules to
the Staging default database or deploy to Production.

The quota write uses the Firestore REST `documents:commit` atomic batch and
`REQUEST_TIME` field transforms. An Emulator rules test already verifies
the equivalent quota+entry atomic invariant; the first manual live run must
prove that the REST encoding works against actual named Firestore. Any 403 or
unexpected response must terminate the test and allow scoped teardown.

If a named E2E Rules test fails, revert **only** that named database Rules
release using the previously documented runbook. The Hosting-only
Staging Auto Deploy pipeline must never deploy Firestore Rules.
