# Sprint 002

## Goal
Build the in-memory entity store with partitioned CRUD and deterministic blob serialization for the persistence layer.

## Tasks

### Module: `store` (depends on entity, schema)
- [x] TASK-001: Define `EntityStore` interface and core types (`PartitionMap`, `StoreOptions`, `StoreEntry`) [status: done]
- [x] TASK-002: Implement in-memory partition management — create, list, get, delete partitions per entity type [status: done]
- [x] TASK-003: Implement per-partition entity CRUD — `get`, `getAll`, `save`, `delete` within a single partition [status: done]
- [x] TASK-004: Implement cross-partition entity lookup — resolve an entity by full composite ID across all partitions [status: done]
- [x] TASK-005: Create barrel exports (`index.ts`) for `store` module [status: done]

### Module: `persistence` (depends on entity, schema)
- [x] TASK-006: Implement deterministic sorted-key JSON serialization utility (`serialize`) [status: done]
- [x] TASK-007: Implement blob deserialization with schema validation (`deserialize`) [status: done]
- [x] TASK-008: Create barrel exports (`index.ts`) for `persistence` module [status: done]

## Bugs Carried Over

_None — BUG-001 from Sprint 001 was resolved._
