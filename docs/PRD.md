# OurSchedule Product Requirements

Version: 0.1.0 | Status: APPROVED BASELINE for scope; security design remains gated

## Product

Mobile-first PWA for private personal schedules and schedules shared through rooms. One identity may join many rooms, filter a unified calendar by room, and own activities independently of any room.

## P0 functional scope

| ID | Requirement |
| --- | --- |
| FR-001 | Sign in with Google |
| FR-002 | Offer phone-number + password sign-in only after security acceptance; no OTP in MVP |
| FR-003 | User profile and preferences |
| FR-004 | Create and administer multiple rooms |
| FR-005 | Invite, join, leave rooms and control role changes |
| FR-006 | Create, edit, and cancel personal activities |
| FR-007 | Create and assign room activities to members |
| FR-008 | Room policy: AUTO_ASSIGN or REQUIRE_ACCEPTANCE |
| FR-009 | Per-recipient assignment acceptance/rejection |
| FR-010 | Event owner controls ROOM, BUSY_ONLY, PRIVATE visibility |
| FR-011 | Day, week, month and multi-month calendar |
| FR-012 | Unified calendar filtering, room toggles and personal-only view |
| FR-013 | Responsive installable PWA |
| FR-014 | Thai-first UI with English-ready locale structure |
| FR-015 | Privacy-preserving cross-room access controls |

## P1 and P2

P1: recurrence, conflict hints, reminders, audit history, advanced pagination.
P2: Google Calendar integration, verified phone/OTP support.

## Roles

Owner, Admin and Member. Owner is not allowed to silently access a private activity. Admin cannot promote self; a room must retain at least one Owner. Changes of membership must not expose private documents.

## Assignment

Room default AUTO_ASSIGN or REQUIRE_ACCEPTANCE. For multiple recipients store individual acceptance states. Creator, event owner, recipient and participants are distinct concepts. Reassignment and deletion must handle concurrent clients.

## Privacy

ROOM shares approved room fields with eligible room members.
BUSY_ONLY may share time occupancy with eligible members but never title, notes, location or other sensitive fields.
PRIVATE reveals neither private content nor occupancy to other room members.
Recipients granted direct participation rights may receive content under explicitly defined policy. No document-level partial reads are assumed.

## Calendar

Date-range queries, all-day event handling using exclusive end boundary, timezone-aware instants, local timezone preference initially Asia/Bangkok, filters and color-coded rooms. Avoid global subscriptions.

## PWA

Android Chrome and iOS Safari supported. The app shell may work offline, but offline writes and persistence of private activities are disabled until reviewed.

## MVP release acceptance

- Authentication approach reviewed and recovery path documented.
- Room membership, least-privilege and role protection proven in emulator.
- Assignee acceptance and room policies proven by tests.
- Private data not queryable by unauthorized users.
- Multi-room calendar returns only authorized events within requested range.
- Android/iOS browser smoke tests, accessibility checks, CI and staging/live evidence pass.

## Out of scope for MVP

Chat, media/file storage, payment, deep analytics, two-way Google Calendar sync, booking infrastructure.

## Decisions still gated

Password-only telephone alias, identity recovery/linking, invitation abuse controls, event projection consistency, backup and restore procedures, release project creation.
