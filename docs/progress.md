# Progress Log

> This file is **append-only**. Old entries must never be modified.
> New sprint summaries are appended at the bottom by the Documentator agent.

---

## Sprint 001 — 2026-03-21

**Goal**: Establish the foundational entity type system, ID/key generation, and pluggable key strategy infrastructure.

### Highlights
- Delivered three modules: `entity`, `schema`, `key-strategy` with barrel exports
- Entity ID format established: `{entityName}.{partitionKey}.{uniqueId}`
- `EntityDef` integrates Zod for runtime validation with end-to-end type inference
- `KeyStrategy` interface defined and `DateKeyStrategy` implemented (year/month/day periods)
- All 64 tests pass across 11 test files (6 unit, 5 integration)

### Lowlights
- BUG-001 (major): `DateKeyStrategy` used local-time methods instead of UTC, producing non-deterministic partition keys across timezones — fixed during sprint

### Metrics
- Tasks planned: 8
- Tasks completed: 8
- Bugs found: 1 (critical: 0, major: 1, minor: 0)

### Carry Forward
- None

---

## Sprint 002 — 2026-03-21

**Goal**: Build the in-memory entity store with partitioned CRUD and deterministic blob serialization for the persistence layer.

### Highlights
- Delivered `store` module with full partitioned CRUD (`get`, `getAll`, `save`, `delete`) and cross-partition entity lookup
- Delivered `persistence` module with deterministic sorted-key JSON serialization and schema-validated deserialization
- All 130 tests pass with zero failures
- BUG-001 from Sprint 001 confirmed resolved; no regressions

### Lowlights
- No issues or shortcomings identified this sprint
- No bugs found

### Metrics
- Tasks planned: 8
- Tasks completed: 8
- Bugs found: 0 (critical: 0, major: 0, minor: 0)

### Carry Forward
- None

---

## Sprint 003 — 2026-03-21

**Goal**: Establish the persistence adapter contract, partition-level load/store operations, HLC-based timestamps, and partition metadata hashing to prepare for sync.

### Highlights
- Defined `BlobAdapter` interface (read, write, delete, list) and created `MemoryBlobAdapter` reference implementation
- Implemented `loadPartition` and `storePartition` for blob-backed persistence round-trips
- Introduced `hlc` module with `createHlc`, `tickLocal`, `tickRemote`, and `compareHlc` — full HLC clock with total ordering
- Implemented partition metadata with FNV-1a content hashing and HLC timestamp per partition
- All 193 tests pass with zero failures

### Lowlights
- No issues or bugs found this sprint

### Metrics
- Tasks planned: 8
- Tasks completed: 8
- Bugs found: 0 (critical: 0, major: 0, minor: 0)

### Carry Forward
- None

---
