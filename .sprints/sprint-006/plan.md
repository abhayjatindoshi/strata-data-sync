# Sprint 006

## Goal
Implement all P1 items: React bindings (`src/react/`) and Cloud Explorer interfaces/component.

## Tasks

- [x] TASK-001: `StrataProvider` — React context provider exposing the strata instance to the component tree (`src/react/`) [status: done]
- [x] TASK-002: `useRepo(def)` — hook that retrieves a typed `Repository<T>` or `SingletonRepository<T>` from the strata context [status: done]
- [x] TASK-003: `useObserve(repo, id)` and `useQuery(repo, opts)` — hooks subscribing to `observe(id)` and `observeQuery(opts)` with proper RxJS-to-React lifecycle management [status: done]
- [x] TASK-004: `useTenant()`, `useTenantList()`, `useIsDirty()` — remaining React hooks for active tenant, tenant list observable, and dirty status [status: done]
- [x] TASK-005: `ExplorerDataSource` interface — defines `getSpaces`, `getItems`, `createContainer`, `capabilities` for cloud storage browsing [status: done]
- [x] TASK-006: `CloudFileService` and `CloudObjectService` interfaces — internal adapter service contracts for file-based and object-based cloud storage [status: done]
- [x] TASK-007: `CloudExplorer` React component — browse, pick, and create cloud storage locations using an `ExplorerDataSource` [status: done]
- [x] TASK-008: Claimed tenant matching via factory param — `ExplorerDataSource` factory receives tenant list to mark already-claimed locations [status: done]

## Dependencies
- TASK-001 is the foundation; TASK-002, TASK-003, TASK-004 depend on it
- TASK-005 and TASK-006 are standalone interface definitions (no React dependency)
- TASK-007 depends on TASK-005 (renders data from `ExplorerDataSource`)
- TASK-008 depends on TASK-005 (extends factory signature)

## Notes
- `src/react/` is the only module that may depend on React. All other modules remain framework-agnostic.
- Observable hooks must unsubscribe on unmount and use `useSyncExternalStore` or `useEffect`+`useState` pattern.
- Cloud Explorer interfaces define contracts only — adapter implementations are P2 scope.

## Bugs Carried Over

_(none)_
