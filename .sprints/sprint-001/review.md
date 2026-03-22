# Sprint 001 — Review

## Goal
Establish zero-dependency foundation modules (entity, schema, key-strategy, hlc, adapter).

## Completed
- TASK-001: Create `BaseEntity` type with fields `id`, `createdAt`, `updatedAt`, `version`, `device`, `hlc`
- TASK-002: Implement entity ID format and `buildEntityId()` — `entityName.partitionKey.uniqueId`
- TASK-003: Implement `parseEntityId()` and `getEntityKey()` — extract components from entity ID strings
- TASK-004: Implement `deriveId` option — deterministic ID from entity fields, dot validation
- TASK-005: Implement `defineEntity<T>(name, opts?)` — TypeScript-generic entity definition
- TASK-006: Implement three key strategies — `singleton`, `global`, `partitioned(fn)`
- TASK-007: Implement date-based key strategy — `monthlyPartition('createdAt')` as a `partitioned(fn)` shorthand
- TASK-008: Implement `Hlc` type with `createHlc`, `tickLocal`, `tickRemote`, `compareHlc`
- TASK-009: Define `BlobAdapter` interface — `read`, `write`, `delete`, `list` with `cloudMeta` first param
- TASK-010: Implement `MemoryBlobAdapter` — in-memory Map-backed adapter for testing

## Not Completed
None — all 10 tasks delivered.

## Deliverables
- **Modules**: entity, schema, key-strategy, hlc, adapter
- **Files created**: 18 source files, 8 unit test files, 1 integration test file
- **Test results**: 47 unit tests passed, 27 integration tests passed, 0 failures

## Notes
- All modules expose public API via `index.ts`; no cross-module internal imports.
- Zero framework dependencies — pure TypeScript modules.
- No bugs, no carry-forward items.
