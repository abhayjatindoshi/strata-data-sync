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

## Sprint 004 — 2026-03-21

**Goal**: Implement the sync engine with metadata-first diffing, HLC-based conflict resolution, dirty tracking with batched scheduling, and stale write protection.

### Highlights
- Delivered full `sync` module: metadata-first diff, deep diff, conflict resolution, sync apply, stale write protection, dirty tracking, and sync scheduling
- Metadata-first diff compares partition-level timestamps/hashes and categorizes changes into three buckets (a-only, b-only, mismatched)
- Deep diff performs entity-level HLC comparison with one-way-copy optimization for mismatched partitions
- Conflict resolution uses last-writer-wins via HLC with delete-wins-on-equal-HLC rule
- Sync scheduler provides batched, deduplicated queue with coalescing of rapid writes

### Lowlights
- No issues or bugs found this sprint

### Metrics
- Tasks planned: 8
- Tasks completed: 8
- Bugs found: 0 (critical: 0, major: 0, minor: 0)

### Carry Forward
- None

---

## Sprint 005 — 2026-03-21

**Goal**: Build the reactive layer (events + observables) and repository API with lazy loading to provide a unified read/write interface over the store and persistence tiers.

### Highlights
- Delivered `reactive` module: `EntityEventBus` with emit/on/off for entity mutation events, single-entity and collection observables via `BehaviorSubject` with `distinctUntilChanged`
- Wired entity events into `EntityStore` — store `put` and `delete` automatically emit `created`/`updated`/`deleted` events
- Delivered `repository` module: `Repository<T>` with full CRUD (`get`, `getAll`, `save`, `delete`) plus `observe` and `observeAll` methods
- Implemented three-tier lazy loading in repository: in-memory → local adapter → cloud adapter
- All 388 tests pass with zero failures

### Lowlights
- No issues or bugs found this sprint

### Metrics
- Tasks planned: 8
- Tasks completed: 8
- Bugs found: 0 (critical: 0, major: 0, minor: 0)

### Carry Forward
- None

---

## Sprint 006 — 2026-03-21

**Goal**: Add query capabilities to the repository and build the multi-tenancy system (tenant entity, manager, scoped key namespacing).

### Highlights
- Delivered `store/query` module: `QueryOptions<T>` with ID filtering, field matching (`where`), and multi-field sorting (`orderBy`); pure `applyQuery` function
- Integrated query options into repository `getAll` and `observeAll` methods
- Delivered `tenant` module: `BaseTenant` type, `defineTenant` helper, tenant key namespacing (`tenant:{tenantId}:{entityName}:{partitionKey}`), and `TenantManager` with list/create/load/switch and `activeTenant$` observable
- Wired tenant scoping into `EntityStore` and persistence `loadPartition`/`storePartition`
- 503 tests passing (unit + integration)

### Lowlights
- BUG-001 (major): `observeAll` did not react to entity changes in tenant-scoped stores — scoped key extraction produced a prefixed entity name that never matched the observable's unscoped filter; fixed by emitting events with the unscoped entity name

### Metrics
- Tasks planned: 7
- Tasks completed: 7
- Bugs found: 1 (critical: 0, major: 1, minor: 0)

### Carry Forward
- None

---

## Sprint 007 — 2026-03-21

**Goal**: Implement the `createStrata` factory function — the single entry point that wires together all framework modules into a ready-to-use `Strata` instance.

### Highlights
- Delivered `strata` module with `createStrata` factory wiring all framework modules (store, event bus, HLC, dirty tracker, sync scheduler, persistence adapters)
- `repo()` method lazily creates and caches a typed `Repository<TFields>` per entity definition
- Tenant switching via `load(tenantId)` re-scopes store and persistence, clearing stale in-memory data
- `dispose()` tears down RxJS subscriptions, sync scheduler, and adapter references to prevent memory leaks
- All 548 tests pass with zero failures

### Lowlights
- No issues or bugs found this sprint

### Metrics
- Tasks planned: 8
- Tasks completed: 8
- Bugs found: 0 (critical: 0, major: 0, minor: 0)

### Carry Forward
- None

---
