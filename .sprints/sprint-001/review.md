# Sprint 001 — Review

## Completed
- TASK-001: Define `BaseEntity` interface with required fields (`id`, `partitionKey`, `createdAt`, `updatedAt`)
- TASK-002: Implement entity ID generation — unique ID suffix utility (nano-id based)
- TASK-003: Implement partition key encoding/decoding utilities (`parseEntityId`, `buildEntityId`, `getEntityKey`, `buildEntityKey`)
- TASK-004: Define `EntityDef<T>` type and `defineEntity<T>()` factory function with Zod schema integration
- TASK-005: Define `KeyStrategy` interface for pluggable partition key strategies
- TASK-006: Implement `DateKeyStrategy` — date-based partition key strategy (year/month/day periods)
- TASK-007: Wire entity key composition — strategy + ID generation produce full entity key (`composeEntityId`)
- TASK-008: Create barrel exports (`index.ts`) for `entity`, `schema`, and `key-strategy` modules

## Not Completed
_(none)_

## Bugs Found & Fixed
- **BUG-001: Timezone boundary issue in `DateKeyStrategy`** — `formatPartitionKey` was using local date methods, which caused partition keys to land on the wrong date when local midnight crossed a UTC day boundary. Fixed by switching to UTC methods (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`). Integration tests updated to use mid-day dates to avoid future timezone flakiness.

## Notes
- All 64 tests pass (11 test files: 6 unit, 5 integration).
- Three modules delivered: `entity`, `schema`, `key-strategy`.
- Entity ID format established: `{entityName}.{partitionKey}.{uniqueId}` — this is a foundational convention for the entire framework.
- `KeyStrategy` interface is minimal (two methods) and ready for additional strategy implementations in future sprints.
- `EntityDef` integrates Zod for runtime validation; type inference from schemas works end-to-end.
