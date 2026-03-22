# Sprint 001

## Goal
Establish the zero-dependency foundation modules (entity, schema, key-strategy, HLC, adapter) that all other modules depend on.

## Tasks

- [x] TASK-001: Create `BaseEntity` type with fields `id`, `createdAt`, `updatedAt`, `version`, `device`, `hlc` [backlog: BaseEntity type] [status: done]
- [x] TASK-002: Implement entity ID format and `buildEntityId()` — `entityName.partitionKey.uniqueId` [backlog: Entity ID generation] [status: done]
- [x] TASK-003: Implement `parseEntityId()` and `getEntityKey()` — extract components from entity ID strings [backlog: ID parsing] [status: done]
- [x] TASK-004: Implement `deriveId` option — deterministic ID from entity fields, dot validation [backlog: deriveId option] [status: done]
- [x] TASK-005: Implement `defineEntity<T>(name, opts?)` — TypeScript-generic entity definition, returns entity definition object [backlog: defineEntity] [status: done]
- [x] TASK-006: Implement three key strategies — `singleton`, `global`, `partitioned(fn)` [backlog: Three key strategies] [status: done]
- [x] TASK-007: Implement date-based key strategy — `monthlyPartition('createdAt')` as a `partitioned(fn)` shorthand [backlog: Date-based key strategy] [status: done]
- [x] TASK-008: Implement `Hlc` type with `createHlc`, `tickLocal`, `tickRemote`, `compareHlc` [backlog: HLC type + all HLC functions] [status: done]
- [x] TASK-009: Define `BlobAdapter` interface — `read`, `write`, `delete`, `list` with `cloudMeta` first param [backlog: BlobAdapter interface] [status: done]
- [x] TASK-010: Implement `MemoryBlobAdapter` — in-memory Map-backed adapter for testing [backlog: MemoryBlobAdapter] [status: done]

## Dependency Order
```
TASK-001 (BaseEntity type)
  → TASK-002 (buildEntityId)
  → TASK-003 (parseEntityId, getEntityKey)
  → TASK-004 (deriveId)
  → TASK-005 (defineEntity — depends on BaseEntity + ID types)
    → TASK-006 (key strategies — referenced by defineEntity)
    → TASK-007 (date-based key strategy — extends partitioned)

TASK-008 (HLC — independent, no deps)

TASK-009 (BlobAdapter interface — independent, no deps)
  → TASK-010 (MemoryBlobAdapter — implements BlobAdapter)
```

## Module Structure
| Module | Directory | Public API |
|--------|-----------|------------|
| entity | `src/entity/` | `BaseEntity`, `buildEntityId`, `parseEntityId`, `getEntityKey`, `deriveId` |
| schema | `src/schema/` | `defineEntity`, `EntityDefinition` type |
| key-strategy | `src/key-strategy/` | `singleton`, `global`, `partitioned`, `monthlyPartition` |
| hlc | `src/hlc/` | `Hlc`, `createHlc`, `tickLocal`, `tickRemote`, `compareHlc` |
| adapter | `src/adapter/` | `BlobAdapter`, `MemoryBlobAdapter` |

## Bugs Carried Over
None — this is the first sprint.

## Notes
- Each module exposes its public API via `index.ts`. Internal files must not be imported across module boundaries.
- All tasks include corresponding unit tests (co-located as `foo.test.ts`).
- No framework dependencies — these are pure TypeScript modules.
