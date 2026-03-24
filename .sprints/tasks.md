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

## Sprint 4 — Reactive Observe, SingletonRepository & Tenant Sync
Started: 2026-03-23T22:00:00Z

Epics: E14 (Reactive — observe, observeQuery, distinctUntilChanged), E13 (SingletonRepository), E17 (Tenant list storage & sync)

### E14 — Reactive: observe, observeQuery, distinctUntilChanged (Layer 5)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Create per-entity-type `Subject<void>` (changeSignal) during repository creation; register event bus listener that calls `changeSignal.next()` when event's `entityName` matches the repo's entity definition name | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 2 | Implement single-entity `distinctUntilChanged` comparator — returns equality `true` when both `a?.id === b?.id` and `a?.version === b?.version`; handles `undefined` values | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 3 | Implement `Repository.observe(id)` — returns `Observable<T \| undefined>` via `changeSignal.pipe(startWith(undefined), map(() => store.get(entityKey, id)), distinctUntilChanged(entityComparator))` | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 4 | Implement `resultsChanged` comparator for query results — returns `true` (changed) if array lengths differ or any element-wise `id`/`version` mismatch; `false` if all elements match | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 5 | Implement `Repository.observeQuery(opts?)` — returns `Observable<ReadonlyArray<T>>` via `changeSignal.pipe(startWith(undefined), map(() => query(opts)), distinctUntilChanged(resultsChanged))` | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |

### E13 — SingletonRepository\<T\> (Layer 5)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 6 | Define `SingletonRepository<T>` type with `get(): T \| undefined`, `save(entity: T): void`, `delete(): boolean`, and `observe(): Observable<T \| undefined>` method signatures in `src/repo/` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 7 | Implement `createSingletonRepository<T>(definition, store, hlc, eventBus)` factory — creates internal Repository using the singleton key strategy, computes deterministic entity ID (`entityName._.entityName`), returns `SingletonRepository<T>` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 8 | Implement `SingletonRepository.get()` — delegates to internal `Repository.get(deterministicId)`, returns entity or `undefined` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 9 | Implement `SingletonRepository.save(entity)` — delegates to internal `Repository.save()` with the deterministic singleton ID, stamps `createdAt`/`updatedAt`/`version`/`hlc` via `tickLocal`, emits entity event | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 10 | Implement `SingletonRepository.delete()` — delegates to internal `Repository.delete(deterministicId)`, returns `boolean` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 11 | Implement `SingletonRepository.observe()` — returns `Observable<T \| undefined>` via changeSignal pipe using the singleton's deterministic ID, same `startWith → map → distinctUntilChanged` pattern as `Repository.observe` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |

### E17 — Tenant list storage & sync (Layer 5)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 12 | Implement `mergeTenantLists(local, remote)` — produces union by tenant ID; for matching IDs keeps entry with latest `updatedAt`; returns merged `Tenant[]` array | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 13 | Implement `pushTenantList(localAdapter, cloudAdapter)` — reads local `__tenants` blob (`cloudMeta = undefined`), writes to cloud adapter at `__tenants` key | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 14 | Implement `pullTenantList(localAdapter, cloudAdapter)` — reads cloud `__tenants` blob, merges with local list via `mergeTenantLists`, writes merged result back to local adapter | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 15 | Implement `saveTenantPrefs(adapter, cloudMeta, prefs)` — serializes tenant preferences (`name`, `icon?`, `color?`) to a prefs blob at the tenant's `cloudMeta` location for cross-device sharing | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 16 | Implement `loadTenantPrefs(adapter, cloudMeta)` — reads tenant preferences blob from `cloudMeta` location, deserializes, returns `{ name, icon?, color? }` or `undefined` if blob not found | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |

## Sprint 5 — Reactive Batch/Dispose & Tenant Sharing
Started: 2026-03-23T22:30:00Z

Epics: E15 (Reactive — Batch writes & dispose), E18 (Tenant — Sharing, setup, marker blob)

### E15 — Reactive: Batch writes & dispose (Layer 6)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Refactor `saveMany()` to batch all Map writes without per-entity signal emission, then emit a single `changeSignal.next()` after all writes complete — 100 saves → 1 signal → 1 observer re-scan | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 2 | Refactor `deleteMany()` to batch all Map deletes without per-entity signal emission, then emit a single `changeSignal.next()` after all deletes complete | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 3 | Implement `dispose()` on Repository — calls `changeSignal.complete()` so active observers receive completion signal, removes entity event bus listener via `eventBus.off(listener)`, rejects further save/delete/observe operations after dispose | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 4 | Implement `dispose()` on SingletonRepository — delegates to internal Repository's `dispose()` method, completing singleton changeSignal and removing event bus listener | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 5 | Write unit tests for batch writes — verify `saveMany` emits exactly one signal (not N), `deleteMany` emits exactly one signal, observers re-scan once per batch, individual `save`/`delete` still emit immediately | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |
| 6 | Write unit tests for dispose — `dispose()` completes active Observable subscriptions, disposed Repository rejects further operations, event bus listener is removed after dispose, SingletonRepository dispose delegates correctly | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |

### E18 — Tenant: Sharing, setup, marker blob (Layer 6)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 7 | Define `MarkerBlob` type (`version: number`, `createdAt: Date`, `entityTypes: readonly string[]`) in `src/tenant/` | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 8 | Implement `writeMarkerBlob(adapter, cloudMeta, entityTypes)` — creates `MarkerBlob` with `version: 1`, current timestamp, and entity type names; serializes via `serialize()` and writes to `__strata` blob key | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 9 | Implement `readMarkerBlob(adapter, cloudMeta)` — reads `__strata` blob via adapter, deserializes via `deserialize()`, returns `MarkerBlob | undefined` if blob not found | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 10 | Implement `validateMarkerBlob(blob)` — checks `version` field is supported (currently version 1), returns boolean; used by `setup()` to reject incompatible strata workspaces | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 11 | Update `TenantManager.create()` to call `writeMarkerBlob` with registered entity type names when creating marker blob at the tenant's `cloudMeta` location | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 12 | Update `TenantManager.setup()` to call `readMarkerBlob` and `validateMarkerBlob`; read tenant prefs from shared `cloudMeta` location via `loadTenantPrefs`; derive deterministic tenant ID via `deriveTenantId(cloudMeta)` | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 13 | Write unit tests for marker blob — `writeMarkerBlob`/`readMarkerBlob` round-trip, `readMarkerBlob` returns `undefined` for missing blob, `validateMarkerBlob` accepts version 1 and rejects unsupported versions, entity types array persisted correctly | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |
| 14 | Write unit tests for sharing flow — `setup()` reads marker blob from shared location and detects existing workspace, derives same tenant ID as creator via `deriveTenantId`, merges tenant prefs into local list, rejects location without valid marker blob | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |

## Sprint 6 — Sync Engine: Diff, Copy & Merge
Started: 2026-03-23T23:00:00Z

Epics: E19 (Sync — Partition diff & copy optimization), E20 (Sync — Bidirectional merge & HLC conflict resolution)

### E19 — Sync: Partition diff & copy optimization (Layer 7)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Create `src/sync/` module — define core sync types: `PartitionDiffResult` with `localOnly: string[]`, `cloudOnly: string[]`, `diverged: string[]`, `unchanged: string[]` arrays; set up barrel `index.ts` with exports | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 2 | Implement `loadIndexPair(localAdapter, cloudAdapter, cloudMeta, entityName)` — calls `loadPartitionIndex` for both local (`cloudMeta = undefined`) and cloud adapters; returns `{ localIndex, cloudIndex }` | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 3 | Implement `diffPartitions(localIndex, cloudIndex)` — iterates union of all partition keys; categorizes: key only in local → `localOnly`, key only in cloud → `cloudOnly`, both with matching hash → `unchanged`, both with different hash → `diverged`; returns `PartitionDiffResult` | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 4 | Implement `copyPartitionToCloud(localAdapter, cloudAdapter, cloudMeta, entityName, partitionKey)` — reads partition blob from local adapter (`cloudMeta = undefined`) using `partitionBlobKey(entityName, partitionKey)`, writes to cloud adapter with `cloudMeta`; no-op if local blob is null | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 5 | Implement `copyPartitionToLocal(localAdapter, cloudAdapter, cloudMeta, entityName, partitionKey)` — reads partition blob from cloud adapter with `cloudMeta`, writes to local adapter (`cloudMeta = undefined`); no-op if cloud blob is null | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 6 | Implement `syncCopyPhase(localAdapter, cloudAdapter, cloudMeta, entityName, diff)` — iterates `diff.localOnly` calling `copyPartitionToCloud` for each, iterates `diff.cloudOnly` calling `copyPartitionToLocal` for each; returns list of copied partition keys | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 7 | Write unit tests for `diffPartitions` — all partitions unchanged, all local-only, all cloud-only, mixed categories, empty indexes on both sides, single diverged partition with hash mismatch | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 8 | Write unit tests for copy operations — `copyPartitionToCloud` transfers blob correctly, `copyPartitionToLocal` transfers blob correctly, no-op when source blob is null, `syncCopyPhase` processes all localOnly and cloudOnly partitions | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |

### E20 — Sync: Bidirectional merge & HLC conflict resolution (Layer 7, depends on E19)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 9 | Implement `resolveConflict(localEntity, cloudEntity)` — compares HLC via `compareHlc(local.hlc, cloud.hlc)`; returns entity with higher HLC (last-writer-wins); deterministic ordering: timestamp → counter → nodeId tiebreaker | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 10 | Implement `resolveEntityTombstone(entityHlc, tombstoneHlc)` — compares entity HLC with tombstone HLC via `compareHlc`; returns `'entity'` if entity HLC is higher, `'tombstone'` if delete wins | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 11 | Implement `diffEntityMaps(localEntities, localTombstones, cloudEntities, cloudTombstones)` — categorizes entity IDs across local and cloud: `localOnly`, `cloudOnly`, `both` (present on both sides); accounts for tombstone presence on either side | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 12 | Implement `mergePartition(localBlob, cloudBlob)` — deserializes both blobs into entity maps and tombstone maps, runs `diffEntityMaps`, resolves each conflict via `resolveConflict` and `resolveEntityTombstone`, produces merged entity map and merged tombstone map | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 13 | Implement `syncMergePhase(localAdapter, cloudAdapter, cloudMeta, entityName, divergedKeys)` — for each diverged partition key: reads both blobs from local and cloud, calls `mergePartition`, serializes merged result, writes merged blob to both adapters | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 14 | Implement `updateIndexesAfterSync(localAdapter, cloudAdapter, cloudMeta, entityName, localIndex, cloudIndex, syncedPartitions)` — recomputes hashes for all synced partitions via `partitionHash`, updates entries via `updatePartitionIndexEntry`, saves both indexes via `savePartitionIndex` | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 15 | Implement `applyMergedToStore(store, entityName, mergedResults, eventBus)` — upserts merged entities into in-memory store, removes entities that lost to tombstones, emits entity events via event bus to trigger reactive observer updates | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 16 | Write unit tests for conflict resolution — `resolveConflict` picks higher timestamp, counter breaks tie when timestamps equal, nodeId string comparison breaks final tie; `resolveEntityTombstone` picks correct winner in both directions | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 17 | Write unit tests for partition merge — `mergePartition` includes local-only entities, cloud-only entities, conflicting entities resolved by HLC, tombstone vs entity resolution in both directions, both sides produce identical merged result | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 18 | Write unit tests for full sync integration — `syncMergePhase` processes all diverged keys, `updateIndexesAfterSync` recomputes correct hashes and persists both indexes, `applyMergedToStore` upserts correctly and emits entity events | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |

## Sprint 7 — Sync: Tombstones, Scheduler & Dirty Tracking
Started: 2026-03-23T23:30:00Z

Epics: E21 (Tombstones & retention), E22 (Three-phase model, scheduler & global lock), E23 (Dirty tracking & sync events)

### E21 — Sync: Tombstones & retention (Layer 8)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Add tombstone storage to `EntityStore` — implement `setTombstone(entityKey, entityId, hlc)` to record a deleted entity's HLC in a parallel `Map<string, Map<string, Hlc>>` tombstone structure; implement `getTombstones(entityKey): ReadonlyMap<string, Hlc>` to retrieve tombstones for a partition | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 2 | Update `Repository.delete(id)` to call `store.setTombstone(entityKey, entityId, entity.hlc)` before removing entity from store partition — preserving the entity's HLC as a tombstone; update `deleteMany(ids)` similarly | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 3 | Implement `purgeStaleTombstones(tombstones, retentionMs, now)` in `src/sync/` — iterates tombstone entries, removes those whose `hlc.timestamp` is older than `now - retentionMs`; default retention `90 * 24 * 60 * 60 * 1000` ms (90 days); returns count of purged entries | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 4 | Integrate tombstone purging into `flushPartition` — call `purgeStaleTombstones` on the partition's tombstones using configured retention period before serializing the blob to adapter | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 5 | Update `loadPartition` to restore tombstones from blob's `deleted` section into the store's tombstone map alongside entity data when hydrating from adapter | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |

### E22 — Sync: Three-phase model, scheduler & global lock (Layer 8)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 6 | Define sync types in `src/sync/` — `SyncDirection` (`'memory-to-local' \| 'local-to-cloud' \| 'cloud-to-local' \| 'cloud-to-memory'`), `SyncQueueItem` (source, target, promise, resolve, reject), `SyncLock` type with `enqueue()`, `isRunning()`, `drain()`, `dispose()` | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 7 | Implement `createSyncLock()` — global lock allowing one sync operation at a time; `enqueue(source, target, fn)` returns existing promise if duplicate already queued or running, otherwise queues and returns new promise; executes queued items sequentially | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 8 | Implement Phase 1 hydrate — `hydrateFromCloud(cloudAdapter, localAdapter, store, entityNames, cloudMeta)` loads cloud partition indexes per entity type, downloads partition blobs, writes to local adapter, loads entities into memory store; returns list of hydrated entity types | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 9 | Implement Phase 1 local-only fallback — `hydrateFromLocal(localAdapter, store, entityNames)` loads all partition indexes from local adapter per entity type, loads partition blobs into memory store; used when cloud is unreachable during initial hydrate | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 10 | Implement Phase 2 periodic scheduler — `createSyncScheduler(options)` with configurable `localFlushIntervalMs` (default 2000) and `cloudSyncIntervalMs` (default 300000); `start()` begins interval timers that enqueue sync operations via sync lock; `stop()` clears all timers | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 11 | Implement Phase 3 manual sync — `syncNow(syncLock, localAdapter, cloudAdapter, store, entityNames, cloudMeta)` enqueues immediate memory→local flush then local↔cloud full sync cycle sequentially through the sync lock; returns promise resolving when both complete | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 12 | Implement scheduler lifecycle — `SyncScheduler.dispose()` stops periodic timers, drains sync lock queue (waits for in-flight operation), rejects further enqueue calls; integrate with `createSyncScheduler` | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |

### E23 — Sync: Dirty tracking & sync events (Layer 8, depends on E22)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 13 | Define `SyncEvent` type union (`{ type: 'sync-started' }`, `{ type: 'sync-completed', result: SyncResult }`, `{ type: 'sync-failed', error: Error }`, `{ type: 'cloud-unreachable' }`) and `SyncResult` type (`entitiesUpdated: number`, `conflictsResolved: number`, `partitionsSynced: number`) in `src/sync/` | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 14 | Implement `createSyncEventEmitter()` — manages sync event listeners via `on(listener)`, `off(listener)`, `emit(event)` methods; typed to `SyncEvent` union | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 15 | Integrate sync events with sync lock — fire `sync-started` before each sync operation begins, `sync-completed` with `SyncResult` on success, `sync-failed` with error on failure, `cloud-unreachable` when cloud adapter throws connectivity error during hydrate or periodic sync | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 16 | Implement `createDirtyTracker()` — `isDirty: boolean` getter tracks whether any data hasn't reached cloud; `isDirty$: Observable<boolean>` emits reactive dirty-state changes via `distinctUntilChanged`; set dirty on any store write, clear only after successful local→cloud sync | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 17 | Integrate dirty tracker with store and sync — mark dirty on every `Repository.save`/`saveMany`/`delete`/`deleteMany` operation; clear dirty flag when local→cloud sync completes successfully; expose `isDirty` and `isDirty$` from sync module | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
