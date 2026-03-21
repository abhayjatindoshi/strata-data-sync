# Sprint 005

## Goal
Build the reactive layer (events + observables) and repository API with lazy loading to provide a unified read/write interface over the store and persistence tiers.

## Tasks

- [x] TASK-001: Implement reactive event system — `EntityEventBus` with `emit`/`on`/`off` for entity mutation events (`created`, `updated`, `deleted`); events carry entity name, partition key, entity ID, and the entity snapshot [status: done]
- [x] TASK-002: Wire entity events into `EntityStore` — emit `created`/`updated`/`deleted` events from store `put` and `delete` operations [status: done]
- [x] TASK-003: Implement `observe<T>(entityName, id)` — returns `BehaviorSubject<T | undefined>` for a single entity, driven by event bus, with `distinctUntilChanged` by serialized snapshot [status: done]
- [x] TASK-004: Implement `observeAll<T>(entityName, partitionKey?)` — returns `BehaviorSubject<ReadonlyArray<T>>` for a collection, driven by event bus, with `distinctUntilChanged` by shallow array reference [status: done]
- [x] TASK-005: Define `Repository<T>` interface and implement core CRUD — `get`, `getAll`, `save`, `delete` delegating to `EntityStore`, emitting events on mutation [status: done]
- [x] TASK-006: Add `observe` and `observeAll` methods to `Repository<T>` — delegate to the observable layer from TASK-003/004 [status: done]
- [x] TASK-007: Implement lazy loading in repository `get`/`getAll` — on store miss, attempt `loadPartition` from local adapter, then cloud adapter; populate store on hit [status: done]
- [x] TASK-008: Create `src/reactive/index.ts` and `src/repository/index.ts` barrel files exposing public API [status: done]

## Bugs Carried Over

_None_

## Dependencies

```
TASK-001 → TASK-002 → TASK-003, TASK-004
                        ↓          ↓
                     TASK-005 → TASK-006
                        ↓
                     TASK-007
                     TASK-008 (after all above)
```

## Notes

- `reactive` module: zero framework dependencies, uses RxJS only
- `repository` module: depends on `store`, `reactive`, `persistence`, `entity`
- Lazy loading follows the three-tier pattern: in-memory → local → cloud
- All public types should use `Readonly<T>` / `ReadonlyArray<T>`
