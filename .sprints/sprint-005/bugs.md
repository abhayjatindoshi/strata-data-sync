# Sprint 005 — Bugs

> Bugs discovered during this sprint. Entries added by the Testing Agent.

---

## BUG-001 ✅ FIXED

**Source**: integration
**Severity**: critical
**Status**: Fixed — verified 2026-03-22 (all 428 tests pass, including 42 Sprint 005 integration tests)
**Description**: `createStrata` does not connect repository writes to the sync engine's dirty tracking. When an entity is saved via `strata.repo(def).save(entity)`, the store is updated in memory, but the sync engine's internal `markDirty()` is never called. As a result, `strata.sync()` calls `flushToLocal()` which iterates over an empty `dirtyKeys` set and writes nothing to the local adapter. Data saved through repos is never persisted to blob adapters, making sync non-functional for normal writes. Additionally, `strata.isDirty` always returns `false` even after writes.

The root cause is that `markDirty` is a private function in `createSyncEngine` and is not exposed in the `SyncEngine` public API. `createStrata` has no way to inform the sync engine that entity keys have been modified.

**Reproduction**: `tests/integration/sprint-005/strata-entry-point.test.ts` — test "sync persists data to adapter and can be re-loaded"
```bash
npx vitest run tests/integration/sprint-005/strata-entry-point.test.ts
```

**Expected**: After `repo.save()` + `strata.sync()`, data should be flushed to the local adapter and synced to cloud. A second Strata instance using the same adapters should be able to hydrate that data.

**Actual**: `sync()` flushes nothing because `dirtyKeys` is empty. The second instance's `repo.get()` returns `undefined`.

---
