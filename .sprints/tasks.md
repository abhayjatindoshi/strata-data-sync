<!-- No active sprint -->

<!-- Task columns: # | Task | Epic | Assigned | Status | Source | Created | Completed -->
<!-- Status values: not-started, in-progress, done, known-issue, skipped -->
<!-- Source values: plan, review, test-fix, test -->
<!-- Assigned values: developer, unit-tester, integration-tester -->

## Sprint 1 — Foundation Layer (HLC, Adapter, Schema, Reactive)
Started: 2026-03-23T20:30:00Z

Epics: E1 (HLC), E3 (Adapter types), E4 (MemoryAdapter), E2 (Schema), E6 (Reactive event bus)

### E1 — HLC (types, tick, compare)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Define `Hlc` type (`timestamp: number`, `counter: number`, `nodeId: string`) and `createHlc()` factory in `src/hlc/` | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 2 | Implement `tickLocal(hlc)` — advances timestamp to `max(wallClock, hlc.timestamp)`, increments counter if timestamp unchanged, resets counter if timestamp advanced | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 3 | Implement `tickRemote(local, remote)` — merges local HLC with received remote HLC per HLC algorithm | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 4 | Implement `compareHlc(a, b)` — total ordering: compare timestamp first, then counter, then nodeId string comparison as tiebreaker; return -1/0/1 | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 5 | Write unit tests for HLC module — createHlc, tickLocal (timestamp advance, counter increment), tickRemote (merge scenarios), compareHlc (all tiebreaker levels) | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E3 — Adapter types (BlobAdapter interface)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 6 | Define `BlobAdapter` type with 4 async methods (`read`, `write`, `delete`, `list`) accepting `cloudMeta: Readonly<Record<string, unknown>> \| undefined` as first param in `src/adapter/` | E3 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 7 | Define framework blob key constants/helpers — `__tenants`, `__strata`, `__index.{entityName}`, `{entityName}.{partitionKey}` patterns | E3 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E4 — MemoryBlobAdapter

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 8 | Implement `createMemoryBlobAdapter()` — `Map<string, Uint8Array>` backing store with defensive copy on write, null return on missing read, key prefix filtering for list | E4 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 9 | Write unit tests for MemoryBlobAdapter — read/write round-trip, read returns null for missing key, write stores defensive copy (mutation isolation), delete returns true/false, list filters by prefix, list returns empty for no matches | E4 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E2 — Schema (defineEntity, ID gen, key strategies)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 10 | Define `BaseEntity` type (id, createdAt, updatedAt, version, device, hlc) and `EntityDefinition<T>` type in `src/schema/` | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 11 | Implement `generateId()` — 8-char random alphanumeric unique ID, and `formatEntityId(entityName, partitionKey, uniqueId)` to produce `entityName.partitionKey.uniqueId` format | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 12 | Implement key strategy functions — `partitioned(fn)` derives partition key from entity data, `'global'` always returns `'_'`, `'singleton'` returns `'_'` with deterministic ID | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 13 | Implement `defineEntity<T>(name, options?)` — creates `EntityDefinition` with name, key strategy (default global), and optional `deriveId` function; validate deriveId output contains no dots | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 14 | Write unit tests for schema module — defineEntity returns correct definition, generateId format/uniqueness, partitioned/global/singleton key strategies, deriveId validation rejects dots | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E6 — Reactive event bus

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 15 | Define `EntityEvent` type (with entityName field), `EntityEventListener` callback type, and `EntityEventBus` type (on/off/emit) in `src/reactive/` | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 16 | Implement `createEventBus()` — maintains listener array, `on()` registers listener, `off()` removes listener, `emit()` calls all listeners synchronously | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 17 | Write unit tests for event bus — on/emit delivers events, off removes listener, multiple listeners all fire, emit with no listeners is safe, same listener registered twice | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

## Sprint 2 — Transforms, Persistence & Store
Started: 2026-03-23T21:00:00Z

Epics: E5 (Transform pipeline), E9 (Serialization), E10 (FNV-1a hashing), E7 (In-memory store), E11 (Partition index)

### E5 — Adapter Transform Pipeline (Layer 2)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Define `BlobTransform` type with `encode(data: Uint8Array): Promise<Uint8Array>` and `decode(data: Uint8Array): Promise<Uint8Array>` methods in `src/adapter/` | E5 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 2 | Implement `applyTransforms(transforms, data)` — applies transforms in forward order for writes, and `reverseTransforms(transforms, data)` — applies transforms in reverse order for reads | E5 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 3 | Write unit tests for transform pipeline — identity passthrough, chained transforms apply in correct forward order, reverse applies in correct reverse order, empty transform array passthrough | E5 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E9 — JSON Serialization & Type Markers (Layer 2)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 4 | Implement JSON replacer that wraps `Date` values as `{ __t: 'D', v: isoString }` type marker, and JSON reviver that detects `__t` and reconstructs original types, in `src/persistence/` | E9 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 5 | Implement `serialize(data): Uint8Array` — `JSON.stringify` with replacer → `TextEncoder` to bytes, and `deserialize<T>(bytes: Uint8Array): T` — `TextDecoder` → `JSON.parse` with reviver | E9 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 6 | Write unit tests for serialization — Date round-trip preserves value, nested Date fields, no-Date data passthrough, Uint8Array encoding fidelity, type marker `{ __t: 'D', v }` format correctness | E9 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E10 — FNV-1a Hashing (Layer 2)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 7 | Implement FNV-1a 32-bit hash — `FNV_OFFSET` (2166136261), `FNV_PRIME` (16777619), `fnv1a(input: string): number` core function, and `fnv1aAppend(hash, input): number` for incremental hashing in `src/persistence/` | E10 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 8 | Implement `partitionHash(entityMap): number` — sorts entity IDs, hashes `id:hlcTimestamp:hlcCounter:hlcNodeId` per entity, includes tombstone HLCs in hash computation | E10 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 9 | Write unit tests for hashing — known FNV-1a test vectors, deterministic output for same input, hash changes when HLC differs, sort-order independence (same entities in any insertion order produce same hash), empty input | E10 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E7 — In-Memory Store (Layer 3)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 10 | Define `EntityStore` type with nested `Map<string, Map<string, unknown>>` structure and `createStore()` factory in `src/store/` | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 11 | Implement `get(entityKey, id)`, `set(entityKey, id, entity)`, `delete(entityKey, id)` — sync Map operations, `set` auto-creates inner Map if partition missing, `set` and `delete` mark partition dirty | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 12 | Implement `getPartition(entityKey): ReadonlyMap` and `getAllPartitionKeys(entityName): string[]` — partition access and discovery by filtering keys with `entityName.` prefix | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 13 | Implement dirty tracking — `getDirtyKeys(): ReadonlySet<string>`, `clearDirty(entityKey)` to track which partitions have been modified and need flushing | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 14 | Implement lazy loading — `loadPartition(entityKey, loader: () => Promise<Map>)` loads partition data from adapter on first access, subsequent calls return cached partition without re-invoking loader | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 15 | Write unit tests for store — CRUD get/set/delete, auto-creating partitions on set, dirty tracking lifecycle (mark on set/delete, clear resets), getAllPartitionKeys prefix filtering, lazy load executes loader once then caches | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E11 — Partition Index (Layer 3, depends on E10)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 16 | Define `PartitionIndexEntry` type (`hash: number`, `count: number`, `updatedAt: number`) and `PartitionIndex` type (`Record<string, PartitionIndexEntry>`) in `src/persistence/` | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 17 | Implement `loadPartitionIndex(adapter, cloudMeta, entityName): Promise<PartitionIndex>` — reads `__index.{entityName}` blob via adapter, deserializes with `deserialize`, returns `{}` if blob is null | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 18 | Implement `savePartitionIndex(adapter, cloudMeta, entityName, index): Promise<void>` — serializes index with `serialize` and writes to `__index.{entityName}` blob via adapter | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 19 | Implement `updatePartitionIndexEntry(index, partitionKey, hash, count): PartitionIndex` — creates or updates entry for given partition key with hash, count, and current timestamp | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 20 | Write unit tests for partition index — load returns empty object for missing blob, save/load round-trip, updateEntry creates new entry and updates existing, key format uses `__index.{entityName}` | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

## Sprint 3 — Store Flush, Repository CRUD & Tenant Manager
Started: 2026-03-23T21:30:00Z

Epics: E8 (Store — Debounced flush), E12 (Repository — CRUD & query), E16 (Tenant — TenantManager CRUD)

### E8 — Store: Debounced flush to adapter (Layer 4)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Implement `flushPartition(adapter, store, entityKey)` — reads dirty partition from store, serializes entity map to blob format (`{ [entityName]: { ...entities }, deleted: { [entityName]: { ...tombstones } } }`), writes via `adapter.write()` | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 2 | Implement `flushAll(adapter, store, entityNames)` — iterates `store.getDirtyKeys()`, calls `flushPartition` for each dirty key, clears dirty flag per partition after successful write | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 3 | Implement `createFlushScheduler(adapter, store, options)` — returns scheduler object; on `schedule()` call, resets debounce timer and triggers `flushAll` after configurable idle ms (default 2000) | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 4 | Implement `flushScheduler.flush()` — cancels any pending debounce timer and forces immediate `flushAll`, returns promise that resolves when flush completes | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 5 | Implement `flushScheduler.dispose()` — cancels pending timer and forces immediate flush of all dirty data; no-op if no dirty partitions; scheduler rejects further `schedule()` calls after dispose | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |

### E12 — Repository: Repository\<T\> CRUD & query (Layer 4)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 6 | Define `Repository<T>` type (get, query, save, saveMany, delete, deleteMany) and `QueryOptions<T>` type (where, range, orderBy, limit, offset) in `src/repo/` | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 7 | Implement `createRepository<T>(definition, store, hlc, eventBus)` factory — returns `Repository<T>` bound to the entity definition's name and key strategy | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 8 | Implement `Repository.get(id)` — parses entity key from ID format `entityName.partitionKey.uniqueId`, looks up partition in store, returns entity or `undefined` | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 9 | Implement `Repository.save(entity)` — generates ID (random via `generateId` or deterministic via `deriveId`), derives partition key from key strategy, stamps `createdAt`/`updatedAt`/`version`/`hlc` (via `tickLocal`), writes to store, emits entity event, returns ID | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 10 | Implement `Repository.saveMany(entities)` — batch save applying same logic as `save` per entity, returns array of IDs | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 11 | Implement `Repository.delete(id)` — removes entity from store partition, emits entity event, returns `boolean`; and `deleteMany(ids)` — batch delete for multiple IDs | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 12 | Implement query filtering — `applyWhere(entities, where)` filters by shallow partial field match; `applyRange(entities, range)` filters by field `gt`/`gte`/`lt`/`lte` comparisons | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 13 | Implement query sorting and pagination — `applyOrderBy(entities, orderBy)` sorts by multiple fields with `asc`/`desc`; `applyPagination(entities, offset, limit)` slices result array | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 14 | Implement `Repository.query(opts?)` — scans all partitions for entity type (using `store.getAllPartitionKeys`), collects entities, applies pipeline: where → range → orderBy → offset/limit; returns `ReadonlyArray<T>` | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |

### E16 — Tenant: Tenant model & TenantManager CRUD (Layer 4)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 15 | Define `Tenant` type (`id`, `name`, `icon?`, `color?`, `cloudMeta`, `createdAt`, `updatedAt`) and `TenantManager` type (list, create, setup, load, delink, delete, `activeTenant$`) in `src/tenant/` | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 16 | Implement tenant list persistence — `loadTenantList(adapter): Promise<Tenant[]>` reads `__tenants` blob with `cloudMeta = undefined`, deserializes; `saveTenantList(adapter, tenants): Promise<void>` serializes and writes | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 17 | Implement `TenantManager.list()` — returns all tenants from local adapter via `loadTenantList`, cached after first load | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 18 | Implement `TenantManager.create(opts)` — generates or derives tenant ID (via `deriveTenantId` if configured), creates `Tenant` record with timestamps, appends to tenant list, writes `__strata` marker blob at `cloudMeta` location | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 19 | Implement `TenantManager.load(tenantId)` — finds tenant by ID in list, sets as active tenant, updates `activeTenant$` observable; throws if tenant ID not found | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 20 | Implement `TenantManager.setup(opts)` — reads `__strata` marker blob from `cloudMeta` location to detect existing workspace, reads tenant prefs (name/icon/color), derives deterministic tenant ID, adds to local tenant list | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 21 | Implement `TenantManager.delink(tenantId)` — removes tenant from local list only, persists updated list; does NOT delete cloud data | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 22 | Implement `TenantManager.delete(tenantId)` — removes tenant from local list AND deletes all blobs at the tenant's `cloudMeta` location via adapter | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
