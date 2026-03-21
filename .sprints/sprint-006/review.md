# Sprint 006 — Review

## Completed
- TASK-001: Implement query options types and engine (`QueryOptions<T>`, `applyQuery`)
- TASK-002: Integrate query options into repository (`getAll`, `observeAll`)
- TASK-003: Define tenant entity (`BaseTenant`, `defineTenant`)
- TASK-004: Implement tenant key namespacing (`tenant:{tenantId}:` prefix utilities)
- TASK-005: Implement `TenantManager` (list, create, load, switch, `activeTenant$`)
- TASK-006: Wire tenant scoping into store and persistence
- TASK-007: Create barrel files for `store/query` and `tenant/index`

## Not Completed
_(none)_

## Bugs
- **BUG-001** (major, fixed): `observeAll` did not react to entity changes in tenant-scoped stores. The scoped entity key (`tenant:t1:Invoice.2026`) caused event entity-name extraction to include the tenant prefix, while `observeCollection` listened for the unscoped name (`Invoice`). Events never matched, so the observable never updated after its initial snapshot. Fix: ensure store callbacks emit events using the unscoped entity name regardless of key namespacing.

## Notes
- 503 tests passing (unit + integration)
- Query engine is pure in-memory filtering/sorting; no index structures yet
- Tenant module depends on entity, store, persistence — zero framework dependencies
