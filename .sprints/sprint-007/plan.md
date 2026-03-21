# Sprint 007

## Goal
Implement the `createStrata` factory function — the single entry point that wires together all framework modules into a ready-to-use `Strata` instance.

## Tasks

- [x] TASK-001: Define `Strata` and `StrataConfig` types — `StrataConfig` accepts an array of `EntityDef`s, `localAdapter`, optional `cloudAdapter`, and `deviceId`; `Strata` exposes `repo<TFields>(def)` returning a typed `Repository<TFields>`, and `load(tenantId)` for tenant switching [status: done]
- [x] TASK-002: Implement `createStrata` core wiring — instantiate shared `EntityStore`, `EntityEventBus`, `HLC`, `DirtyTracker`, and `SyncScheduler`; store them as internal singletons scoped to the `Strata` instance [status: done]
- [x] TASK-003: Implement `repo()` method — lazily create and cache a `Repository` per `EntityDef` name, wiring in the shared store, event bus, persistence adapters, key strategy, and HLC; return the fully typed `Repository<TFields>` [status: done]
- [x] TASK-004: Implement `load(tenantId)` method — delegate to `TenantManager.load`/`switch`, re-scope the store and persistence layer for the new tenant, and clear stale in-memory data from the previous tenant [status: done]
- [x] TASK-005: Wire sync scheduling into `createStrata` — connect the `DirtyTracker` to the `SyncScheduler` so that entity saves automatically queue sync tasks; expose `sync()` for manual trigger [status: done]
- [x] TASK-006: Add `dispose()` / teardown — unsubscribe all internal RxJS subscriptions, stop the sync scheduler, and release adapter references to prevent memory leaks [status: done]
- [x] TASK-007: Create `src/strata/index.ts` barrel file and update `src/index.ts` root barrel to export `createStrata`, `Strata`, and `StrataConfig` [status: done]
- [x] TASK-008: Update backlog — strike through `createStrata factory function` item [status: done]

## Bugs Carried Over

_None_

## Dependencies

```
TASK-001 → TASK-002 → TASK-003, TASK-004, TASK-005, TASK-006
TASK-003 + TASK-004 + TASK-005 + TASK-006 → TASK-007 → TASK-008
```

## Notes

- `createStrata` lives in a new `src/strata/` module; it depends on all other modules but nothing depends on it (top of the dependency graph)
- The `repo()` method must cache repositories by entity name to avoid creating duplicates
- `framework.ts` and `app.ts` serve as the type-level design target — the real implementation should match those signatures
- No React dependencies in this sprint; React bindings will follow in Sprint 008
- `dispose()` is critical for server-side or test scenarios where multiple `Strata` instances are created
