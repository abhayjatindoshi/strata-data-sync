# Sprint 006 — Bugs

> Bugs discovered during this sprint. Entries added by the Testing Agent.

---

## BUG-001

**Source**: integration
**Severity**: major
**Description**: `observeAll` does not react to entity changes when using a tenant-scoped store. The `onEntitySaved`/`onEntityDeleted` store callbacks extract the entity name from the scoped entity key (e.g., `tenant:t1:Invoice.2026` → entity name `tenant:t1:Invoice`), but `observeCollection` listens for events matching the unscoped entity name (`Invoice`). As a result, entity events emitted through a scoped store never match the observable's filter, and `observeAll` never updates after its initial snapshot.
**Reproduction**: `npx vitest run tests/integration/sprint-006/end-to-end.test.ts` — test "observeAll works with tenant-scoped repository and query filters"
**Expected**: After saving a second pending invoice via the tenant-scoped repository, `pending$.getValue()` should return 2 items.
**Actual**: `pending$.getValue()` returns 1 item (the initial snapshot) because the observable never receives matching entity events from the scoped store.

---
