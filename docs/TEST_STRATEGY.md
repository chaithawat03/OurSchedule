# Test and Release Strategy

## Test pyramid

M0: static type checking, lint, pure unit tests, emulator deny-all rules tests, build, shell smoke tests.
M1: authentication logic, session handling, identity migration, login abuse/recovery criteria.
M2: room CRUD, invitations, role change, owner retention, cross-room isolation.
M3: activity CRUD, per-user acceptance, visibility and authorized projections.
M4: date-window query correctness, calendar timezone, PWA devices, query cost.
M5: deployment audit, performance, backup/restore and rollback.

## CI acceptance

Every PR must complete:
- dependency install from committed lockfile (after bootstrapping)
- lint and TypeScript checks
- unit tests
- Firestore Rules emulator tests
- production build

Each test must run without production credentials or Firebase project IDs. Test against demo-ourschedule-ci only.

## Security matrix

| Scenario | Expected |
| --- | --- |
| unauthenticated document read | DENY |
| authenticated forged UID reading unrelated user | DENY |
| unauthenticated write | DENY |
| privileged field injection | DENY |
| cross-room user read | DENY |
| readable private event payload | DENY |
| room owner self-demotion when last owner | DENY |

M0 proves default-deny only. The later cases must receive dedicated positive and negative tests when permissions are introduced.

## Evidence

Every milestone records PR URL, final commit SHA, CI run and result, emulator tests, staging hostname if deployed, manual device checks, defects and accepted risks.

Status names:
PLANNED, IMPLEMENTING, TESTED, REVIEWED, MERGED, VERIFIED, IMPLEMENTED_NOT_VERIFIED, BLOCKED.

No deployment or CI status is inferred from a successful API request; inspect actual GitHub checks and deployment result.
