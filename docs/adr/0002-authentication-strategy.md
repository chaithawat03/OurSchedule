# ADR 0002 — Identity abstraction and phone auth gate

Status: Proposed / Blocked for phone-password production | Date: 2026-10-15

Decision: Use Firebase UID as immutable application identity with provider-neutral AuthService. Google Sign-in is the initial verified provider. Phone + password without OTP must not be implemented as Firebase phone verification; a phone-derived email alias is only a candidate pending assessment and is not verification of number possession.

Security requirements before accepting candidate: password length policy, collision normalization (E.164), no PIN-only login, no implicit linking, enumeration resistance, rate limits, reset/recovery, secure migration to verified phone and tests. Unverified phone may never authorize a phone-addressed invitation or account recovery.

Fallback: launch Google-only MVP until secure phone route is proven. No secret password values are stored in Firestore. No backend custom-token flow is accepted without dedicated security review and budget.
