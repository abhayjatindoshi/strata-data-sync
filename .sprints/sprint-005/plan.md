# Sprint 005

## Goal
Implement the `createStrata` entry point that wires all modules together, and re-export the full public API from `src/index.ts`.

## Tasks

- [x] TASK-001: `StrataConfig` type & validation — define the configuration type accepted by `createStrata` (entity defs, adapters, HLC node ID, sync intervals, tenant config); validate entity defs (no duplicate names, valid key strategies) [status: done]
- [x] TASK-002: `createStrata(config)` — bootstrap function that initializes store, HLC, persistence (debounced flush), sync engine, tenant manager; returns the `Strata` API object [status: done]
- [x] TASK-003: `strata.repo(def)` — return a cached typed `Repository<T>` or `SingletonRepository<T>` based on the entity def's key strategy; error if def was not registered in config [status: done]
- [x] TASK-004: `strata.tenants` — expose the `TenantManager` API on the strata instance [status: done]
- [x] TASK-005: `strata.sync()` — manual sync trigger that flushes memory → local → cloud immediately; delegates to the sync engine [status: done]
- [x] TASK-006: `strata.isDirty` / `strata.isDirty$` — dirty tracking surfaced from the sync engine onto the top-level API [status: done]
- [x] TASK-007: `strata.dispose()` — graceful shutdown: stop scheduler, wait for in-flight sync, force flush, dispose all repos/subjects, complete observables [status: done]
- [x] TASK-008: Public API barrel — update `src/index.ts` to re-export public APIs from all modules (schema, entity, store, persistence, sync, hlc, reactive, repository, tenant, adapter, key-strategy, strata) [status: done]

## Bugs Carried Over

_(none)_

## Notes

- TASK-001 (config type & validation) must be completed before TASK-002 (createStrata).
- TASK-002 (createStrata) must be completed before TASK-003 through TASK-007 since they build on the returned API.
- TASK-008 (barrel exports) can be worked independently at any time.
- This is the final P0 sprint — after completion, the core framework is feature-complete.
