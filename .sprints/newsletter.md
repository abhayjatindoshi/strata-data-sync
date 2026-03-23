# Strata Sprint Newsletter

Append-only log of sprint outcomes. Most recent entry at the bottom.

---

## Sprint 1 — Foundation Layer (HLC, Adapter, Schema, Reactive) — 2026-03-23T20:30:00Z

### What's New
- **HLC module** (`src/hlc/`): `Hlc` type, `createHlc()`, `tickLocal()`, `tickRemote()`, `compareHlc()` — full Hybrid Logical Clock implementation with total ordering
- **Adapter module** (`src/adapter/`): `BlobAdapter` interface with `read`/`write`/`delete`/`list` async methods, `cloudMeta` parameter support, blob key constants/helpers, and `createMemoryBlobAdapter()` with defensive-copy semantics
- **Schema module** (`src/schema/`): `BaseEntity` type, `EntityDefinition<T>`, `generateId()` (8-char alphanumeric), `formatEntityId()`, key strategies (`partitioned`, `global`, `singleton`), `defineEntity<T>()` with `deriveId` validation
- **Reactive module** (`src/reactive/`): `EntityEvent` type, `EntityEventListener` callback, `EntityEventBus` (on/off/emit), `createEventBus()` with synchronous listener dispatch

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications

### Quality
- Unit tests: 39 passing
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- HLC: createHlc, tickLocal (timestamp advance + counter increment), tickRemote (merge scenarios), compareHlc (all tiebreaker levels)
- MemoryBlobAdapter: read/write round-trip, missing key, defensive copy isolation, delete true/false, list prefix filtering
- Schema: defineEntity definition shape, generateId format/uniqueness, all key strategies, deriveId dot rejection
- Event bus: on/emit delivery, off removal, multiple listeners, no-listener safety, duplicate registration

---

## Sprint 2 — Transforms, Persistence & Store — 2026-03-23T21:00:00Z

### What's New
- **Transform pipeline** (`src/adapter/`): `BlobTransform` type with `encode`/`decode`, `applyTransforms()` for forward-order writes, `reverseTransforms()` for reverse-order reads
- **JSON serialization** (`src/persistence/`): `serialize`/`deserialize` with type marker support — `Date` values round-trip via `{ __t: 'D', v: isoString }` markers, `TextEncoder`/`TextDecoder` byte conversion
- **FNV-1a hashing** (`src/persistence/`): `fnv1a()` 32-bit hash, `fnv1aAppend()` for incremental hashing, `partitionHash()` for deterministic partition content hashing with sorted IDs and tombstone support
- **In-memory store** (`src/store/`): `createStore()` with nested `Map<string, Map<string, unknown>>`, CRUD operations (`get`/`set`/`delete`), dirty tracking (`getDirtyKeys`/`clearDirty`), lazy loading via `loadPartition()`, partition discovery with `getAllPartitionKeys()`
- **Partition index** (`src/persistence/`): `PartitionIndexEntry` and `PartitionIndex` types, `loadPartitionIndex()`/`savePartitionIndex()` for adapter-backed persistence, `updatePartitionIndexEntry()` for hash/count/timestamp updates

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata

### Quality
- Unit tests: 85 passing (45 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- Transforms: identity passthrough, chained forward/reverse order, empty transform array
- Serialization: Date round-trip, nested Date fields, no-Date passthrough, Uint8Array fidelity, type marker format
- Hashing: known FNV-1a test vectors, deterministic output, HLC sensitivity, sort-order independence, empty input
- Store: CRUD get/set/delete, auto-creating partitions, dirty tracking lifecycle, partition key prefix filtering, lazy load caching
- Partition index: missing blob returns empty, save/load round-trip, create/update entries, key format validation
