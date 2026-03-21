# Sprint 006

## Goal
Add query capabilities to the repository and build the multi-tenancy system (tenant entity, manager, scoped key namespacing).

## Tasks

- [x] TASK-001: Implement query options types and engine — define `QueryOptions<T>` supporting ID filtering (`ids?: string[]`), field matching (`where?: Partial<T>`), and multi-field sorting (`orderBy?: Array<{ field: keyof T; direction: 'asc' | 'desc' }>`); implement `applyQuery<T>(entities, options)` pure function [status: done]
- [x] TASK-002: Integrate query options into repository — add optional `QueryOptions<T>` parameter to `getAll` and `observeAll`; apply filtering/sorting after entity retrieval [status: done]
- [x] TASK-003: Define tenant entity — `BaseTenant` type with `id`, `name`, `createdAt`, `updatedAt`; `defineTenant<T>` helper that extends `BaseTenant` with custom fields via `defineEntity` [status: done]
- [x] TASK-004: Implement tenant key namespacing — utility that constructs scoped partition keys and blob paths by prepending `tenant:{tenantId}:` to entity keys; all store/persistence operations route through scoped keys when a tenant is active [status: done]
- [x] TASK-005: Implement `TenantManager` — `list`, `create`, `load`, `switch` operations; holds active tenant reference; `switch` re-scopes the key namespace and clears in-memory store for the previous tenant [status: done]
- [x] TASK-006: Wire tenant scoping into store and persistence — `EntityStore` and persistence `loadPartition`/`storePartition` accept an optional tenant scope; when present, keys are namespaced via TASK-004 [status: done]
- [x] TASK-007: Create `src/store/query.ts`, `src/tenant/index.ts` barrel files exposing public API [status: done]

## Bugs Carried Over

_None_

## Dependencies

```
TASK-001 → TASK-002
TASK-003 → TASK-004 → TASK-005 → TASK-006
TASK-007 (after all above)
```

## Notes

- `store/query.ts`: pure functions, zero dependencies beyond entity types
- `tenant` module: depends on `entity`, `store`, `persistence`; zero framework dependencies
- Tenant key format: `tenant:{tenantId}:{entityName}:{partitionKey}`
- `TenantManager` should be observable — expose `activeTenant$` as a `BehaviorSubject`
- Query filtering runs in-memory after retrieval; no index structures needed yet
