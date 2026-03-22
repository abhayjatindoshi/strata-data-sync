# Sprint 005 — Review

## Goal
Strata entry point — final P0 sprint

## Completed
- TASK-001: `StrataConfig` type & validation — config type with entity defs, adapters, HLC node ID, sync intervals, tenant config; validation for duplicate names and key strategies
- TASK-002: `createStrata(config)` — bootstrap function wiring store, HLC, persistence, sync engine, tenant manager; returns `Strata` API object
- TASK-003: `strata.repo(def)` — cached typed `Repository<T>` / `SingletonRepository<T>` lookup by entity def
- TASK-004: `strata.tenants` — `TenantManager` API exposed on strata instance
- TASK-005: `strata.sync()` — manual sync trigger flushing memory → local → cloud
- TASK-006: `strata.isDirty` / `strata.isDirty$` — dirty tracking surfaced from sync engine
- TASK-007: `strata.dispose()` — graceful shutdown (stop scheduler, wait for in-flight sync, force flush, dispose repos/subjects)
- TASK-008: Public API barrel — `src/index.ts` re-exports all module public APIs

## Not Completed
_(none)_

## Bugs
- BUG-001: Dirty tracking wiring — found and fixed during sprint

## Test Summary
- 386 unit tests, 42 integration tests (428 total)
- All passing, 0 remaining bugs

## Notes
- This completes the final P0 sprint. The core framework is now feature-complete.
- All modules delivered: schema, entity, store, persistence, sync, hlc, reactive, repository, tenant, adapter, key-strategy, strata.
