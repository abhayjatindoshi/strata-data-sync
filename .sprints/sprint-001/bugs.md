# Sprint 001 — Bugs

> Bugs discovered during this sprint. Entries added by the Testing Agent.

---

## BUG-001

**Source**: integration
**Severity**: major
**Description**: `dateKeyStrategy` uses local-time `Date` methods (`getFullYear`, `getMonth`, `getDate`) instead of UTC methods (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`). This means the same entity with the same `createdAt` timestamp will produce different partition keys on machines in different timezones. For an offline-first sync framework, partition keys must be deterministic across devices.
**Reproduction**: `tests/integration/sprint-001/full-workflow.test.ts` — create a `Date` near a UTC day boundary (e.g., `new Date('2025-12-31T23:59:59Z')`) and call `composeEntityId` with a day strategy. On UTC+ machines, the partition key becomes `2026-01-01` instead of `2025-12-31`.
**Expected**: Partition key should be `2025-12-31` (based on UTC) regardless of the local timezone.
**Actual**: Partition key is `2026-01-01` on machines in UTC+ timezones (e.g., UTC+5:30).

---
