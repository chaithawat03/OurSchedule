# Security Model — M0 Threat Baseline

## Authentication

Google Sign-in is the preferred verified identity provider for first functional launch. Firebase does NOT natively implement phone number + password without OTP as a phone verification scheme. An email/password alias using normalized telephone numbers is only a candidate and is not approved here.

A phone number supplied without OTP is UNVERIFIED and cannot establish phone ownership, recover accounts, or authorize invitations addressed to that number. Passwords must be handled only by Firebase Auth, never in Firestore or app logs. Avoid short numeric PINs: use a sufficiently strong password policy; add throttling/account recovery and abuse protections before allowing phone accounts. Avoid automatic linking on matching phone number or display name.

M1 security gate: threat-model registration/enumeration, collisions, credential stuffing, password reset/recovery, MFA migration, account linking and user deletion. Google-only mode is the safe fallback if this gate fails.

## Authorization

Deny by default. All data access requires a validated Firebase Auth principal plus Firestore Rules. Rules must validate both pre-state and new-state on writes, immutable identifiers, data types, membership, role changes and allowed transitions. Disallow cross-room queries. Admin/Owner are not superusers over PRIVATE event details.

## Firestore privacy

Rules are not query filters. There is no field-level redaction of a readable Firestore document. Split private data and safe projections into different documents, guarded by different paths and rules. Storing both private and room fields in a readable document is a release blocker.

## Threat cases

- User guessing a room/event ID: denied.
- Malicious client setting role=owner or replacing creatorUid: denied.
- Cross-room assignee or invitation spoofing: denied.
- Concurrent admin removing the last room owner: denied via transaction-aware design.
- Shared room projection leaking private title or time: denied.
- Public invite redemption or anonymous read without explicit policy: denied.
- Room removal leaving stale access or abandoned projections: handled before M2/M3 release.
- Offline caching private data on shared device: opt-in only after review.
- Unlimited listen/query fan-out costs: bounded reads and subscriptions.

## M0 security acceptance

firestore.rules contains only explicit deny rules, and emulator tests assert unauthenticated AND forged-auth reads and writes fail on critical paths. No direct client writes are enabled before M1/M2 rules and tests are designed and reviewed.

## Operations

Never commit service account JSON, API tokens, phone passwords or real test identities. Browser Firebase configuration is not a private credential but must use the correct project. CI PR jobs have read-only repository permissions; production credentials are absent. Stage and production projects must have different Auth/Firestore datasets.
