# Strata v2 — Design Decisions Tracker

---

## Accepted

| # | Component | Decision | Notes |
|---|-----------|----------|-------|
| S1 | Schema & Identity | Singleton entities (`keyStrategy: 'singleton'`) | Fixed partition `_`, deterministic ID, `get()` takes no args. Framework metadata also uses this. |
| S2 | Schema & Identity | Separate `SingletonRepository<T>` type | See R1. |
| S3 | Schema & Identity | `deriveId` function for computed keys | Deterministic ID from entity fields. Enables implicit upsert, no race conditions. Output must not contain dots. |
| S4 | Schema & Identity | `'global'` strategy (all in one partition) | Sugar for fixed partition key `'_'`. Same code path as partitioned. |
| S7 | Schema & Identity | Three key strategy modes only | `singleton`, `global`, `partitioned(fn)` — nothing else. |
| S8 | Schema & Identity | Dots reserved in ID format | `deriveId` output validated — no dots allowed. Enforced at `save()`. |
| R1 | Repository | Two repository types | `Repository<T>` (partitioned + global) and `SingletonRepository<T>`. Inferred from entity def key strategy. |
| R2 | Repository | `Repository<T>` API surface | `get(id)`, `query(opts)`, `save(entity)`, `saveMany(entities)`, `delete(id)`, `deleteMany(ids)`, `observe(id)`, `observeQuery(opts)` |
| R3 | Repository | `SingletonRepository<T>` API surface | `get()`, `save(entity)`, `delete()`, `observe()` — no IDs, no query, no batch |
| R4 | Repository | Global uses `Repository<T>` | Same type and implementation as partitioned; key strategy just returns `'_'` |
| R5 | Repository | Rename `getAll` → `query`, `observeAll` → `observeQuery` | Clearer intent |
| A1 | Adapter | Single `BlobAdapter` interface for both local and cloud | 4 methods: `read`, `write`, `delete`, `list`. Local stores blobs (IDB/filesystem), cloud stores blobs (Drive/S3). Framework handles serialize/deserialize. |
| A5 | Adapter | Adapter receives `meta` per-call | `meta: Record<string, unknown> \| undefined`. Opaque to framework. Adapter casts internally. |
| A6 | Adapter | No generics on adapter interfaces | No `TTenant`. Adapter casts `meta` internally. Zero generics in app code. |
| A7 | Adapter | `meta = undefined` for unscoped operations | Tenant list in app space, pre-tenant-load operations. |
| A8 | Adapter | Ship `MemoryBlobAdapter` for testing | Simple in-memory Map-backed blob adapter. |
| WB1 | Write Buffer | In-memory store is source of truth for reads | All queries run against in-memory Map. Sync reads, no adapter I/O for queries. |
| WB2 | Write Buffer | Writes are sync to Map, async flush to adapter | `save()` → Map.set (sync, 0.01ms) → emit event (sync) → adapter.write (async, non-blocking). |
| WB3 | Write Buffer | Lazy loading from adapter into memory | Partitions loaded from adapter on first access, then served from memory. |
| WB4 | Write Buffer | All query/filter/sort/paginate in framework (in-memory) | No query delegation to adapters. Framework scans Map, filters, sorts, applies limit/offset. |
| WB5 | Write Buffer | Offset-based pagination | `offset + limit`. Framework applies after sort. |
| RX1 | Reactive | Return `Observable` (not `BehaviorSubject`) | `.getValue()` is redundant — app calls `repo.get()` / `repo.query()` for sync reads. `Observable` with teardown on unsubscribe. |
| RX2 | Reactive | One `Subject<void>` per entity type | Created when repo is created. All observers of that entity type pipe off this subject. No payload — just a change signal. |
| RX3 | Reactive | `observe(id)` pipes off entity type subject | `subject.pipe(startWith, map(() => store.get(id)), distinctUntilChanged)`. Fires on any change to entity type, filters by ID + version. |
| RX4 | Reactive | `observeQuery(opts)` pipes off entity type subject | `subject.pipe(startWith, map(() => query(opts)), distinctUntilChanged)`. Re-scans Map with own filter on each signal. |
| RX5 | Reactive | Change detection via ID + version comparison | No serialization. `prev.length !== next.length \|\| prev[i].id !== next[i].id \|\| prev[i].version !== next[i].version`. |
| RX6 | Reactive | Event bus: simple listener list, one per entity type | `on(listener)`, `off(listener)`. Repo registers one listener that calls `subject.next()`. |
| RX7 | Reactive | `saveMany()` / `deleteMany()` for batch operations | Many Map writes, one `subject.next()` signal. Prevents N emissions for N saves. |
| RX8 | Reactive | No debounce on signals | Single `save()` emits immediately and synchronously. Behavior is explicit. App uses `saveMany` for batches. |
| RX9 | Reactive | `dispose()` completes all subjects and removes listeners | One subject per entity type — trivial cleanup. |
| TN1 | Tenant | `meta` on tenant — opaque bag for adapter | Framework stores, doesn't interpret. Adapter-specific (Drive folder+space, S3 bucket+prefix, etc.) |
| TN2 | Tenant | Tenant ID is short, URL-safe, customizable | App can provide, derive from meta, or let framework generate. |
| TN3 | Tenant | `deriveTenantId(meta)` option | Deterministic ID from cloud location. Enables sharing — same folder = same ID across users. |
| TN4 | Tenant | Tenant prefs (name/icon/color) shareable, stored in tenant data | Synced with tenant. User prefs stored separately (deferred). |
| TN5 | Tenant | App creates tenants, adapter just stores blobs | App coordinates with auth/cloud APIs. Strata manages tenant list and lifecycle. |
| TN6 | Tenant | `setup()` for opening existing shared tenants | Framework reads marker blob to detect existing strata workspace at meta location. |
| TN7 | Tenant | `delink()` vs `delete()` | Delink = remove from list, keep data. Delete = remove from list + destroy data. |
| TN8 | Tenant | Tenant list: local primary, cloud backup, union-merge sync | TenantManager owns storage directly (not via repo). Write local first, sync to cloud in background. |
| TN9 | Tenant | TenantManager bypasses repo — direct adapter I/O | No circular dependency. Tenant list is not an entity. TenantManager reads/writes `__tenants` blob directly. |
| TN10 | Tenant | Cloud adapter may ship optional location helpers | Not part of `BlobAdapter` contract. Separate utility alongside adapter. |
| P1 | Persistence | JSON serialization (no sorted keys needed) | Plain `JSON.stringify` with replacer for type markers. No deep key sorting — hash is decoupled from blob format. |
| P2 | Persistence | Type markers for Date and special types | `{ __t: 'D', v: '2026-03-22T...' }` in JSON. Self-describing, no runtime schema needed. Extensible for future types. |
| P3 | Persistence | FNV-1a hash on sorted entity ID + HLC pairs | `hash(id:timestamp:counter:nodeId)` per entity, sorted by ID. Not on full blob. No key sorting. HLC uniqueness handles version collisions across devices. |
| P4 | Persistence | One combined partition hash in the index | Hash all entity ID+HLC pairs → one hash per partition. Partition index stores `{ hash, count, updatedAt }` per partition key. |
| P5 | Persistence | Partition index blob per entity type | `__index.transaction` lists all partition keys + hashes. Enables partition discovery for cold-start `query()` and sync hash comparison. |
| P6 | Persistence | Debounced flush to adapter (1s idle) + flush on dispose | Reduces I/O for rapid saves. `save()` is sync to Map. Blob serialization + adapter write happens after 1s of no writes. `dispose()` forces immediate flush. |
| P7 | Persistence | One blob per `entityName.partitionKey` | Partition blob contains all entities for that partition. Same structure for local and cloud. |
| P8 | Persistence | Configurable transform pipeline for compression/encryption | `transforms: [gzip(), encrypt(key)]` per adapter. Framework serializes JSON → transforms → adapter writes bytes. Reversed on read. |
| P9 | Persistence | Transforms are per-adapter | Local and cloud can have different transform chains. E.g., encrypt cloud only, or compress cloud + encrypt both. |
| P10 | Persistence | HLC format: `{ timestamp: number, counter: number, nodeId: string }` | Three fields. Stored on each entity. Used for conflict resolution and partition hashing. |
| P11 | Persistence | No Zod runtime schema required | `defineEntity` uses TypeScript generics only. Framework has no runtime field type info. Type markers in JSON handle serialization roundtrip. |
| SY1 | Sync | Three-phase sync model | Hydrate: cloud→local→memory on load. Persist: memory→local (2s), local→cloud (5m) periodic. Manual: memory→local→cloud immediate. |
| SY2 | Sync | All sync intervals configurable by app | Default: memory→local 2s, local→cloud 5m. App passes config to `createStrata`. |
| SY3 | Sync | One sync at a time globally | Across all tenants, all directions. Dedup queue — returns same promise if same operation already queued/running. |
| SY4 | Sync | Bidirectional merge using HLC per-entity resolution | Last-writer-wins via HLC comparison. From v1 SyncHandler pattern — bucket-based diff + apply. |
| SY5 | Sync | Tombstones in partition blob | `deleted: { entityId: { hlc } }` alongside entities. Propagates deletes across devices. |
| SY6 | Sync | Tombstone retention: 90-day default, app-configurable | Tombstones older than retention period purged on flush. |
| SY7 | Sync | `isDirty` / `isDirty$` — tracks data not yet synced to cloud | Covers both memory→local and local→cloud. Clears only after successful cloud sync. |
| SY8 | Sync | Cloud unreachable on load → load succeeds from local, event fires | `strata.load()` never fails due to cloud. Hydrates from local. Fires cloud-unreachable event. App handles UI. |
| SY9 | Sync | Sync failure triggers event, app handles | Framework emits sync events (started, completed, failed, cloud-unreachable). App subscribes and displays status. |
| SY10 | Sync | Graceful shutdown — waits for in-flight sync, forces final memory→local flush | `dispose()` completes running sync, flushes memory to local, then returns. |
| SY11 | Sync | Sync reads from in-memory Map for push direction | Source of truth is Map. No stale local blob risk. |
| SY12 | Sync | Cloud data pulled into Map triggers reactive | After cloud→local→memory merge, entity type subjects fire. Observers re-scan Map. UI updates automatically. |
| SY13 | Sync | Stale detection — re-check metadata after partial apply | If local changed during sync (concurrent save), re-check before applying remaining ops. From v1 SyncHandler pattern. |
| SY14 | Sync | Copy optimization for one-sided partitions | Partition only on one side → full copy, no per-entity diff. From v1 SyncHandler pattern. |

---

## Future

| # | Component | Decision | Notes |
|---|-----------|----------|-------|
| CE1 | Cloud Explorer | `ExplorerDataSource` — common interface for cloud location browsing UI | Shared by file-based and object-based adapters. Capabilities-driven. Not part of core framework. |
| CE2 | Cloud Explorer | `CloudExplorer` — single React component for browsing/picking locations | Works with any `ExplorerDataSource`. Adapts UI based on capabilities. |
| CE3 | Cloud Explorer | Claimed tenant matching via factory param | Factory receives `ClaimedTenant[]`. Adapter matches internally, annotates items with `isClaimed`. |
| CE4 | Cloud Explorer | `CloudFileService` — file-based cloud API abstraction | Internal to file-based adapter packages (Drive, OneDrive, Dropbox). |
| CE5 | Cloud Explorer | `CloudObjectService` — object-based cloud API abstraction | Internal to object-based adapter packages (S3, Azure Blob, GCS). |
| CE6 | Cloud Explorer | Adapter packages ship explorer source factories | e.g., `createDriveExplorerSource(credentials, tenants): ExplorerDataSource` |
| F1 | Query | Cursor-based pagination | `after: lastEntityId` for consistent pagination. |
| F2 | Adapter | Query delegation to adapter (EntityAdapter) | If in-memory scan becomes a bottleneck for very large datasets, re-introduce `EntityAdapter` with `query()` offloaded to IDB/SQLite. |

---

## Rejected

These options were discussed and explicitly rejected. Do not reconsider during implementation.

| # | Component | Rejected Option | Reason |
|---|-----------|-----------------|--------|
| S5 | Schema & Identity | App-defined custom keys (`idField`) | Replaced by `deriveId`. Raw custom keys add CRUD API confusion. |
| S6 | Schema & Identity | App-defined custom partitioning | Complicates API for apps. Framework owns partitioning. |
| S7r | Schema & Identity | Alternative ID separator (e.g., `::` instead of `.`) | Too disruptive, uglier IDs, no clear benefit over enforcing no-dots in `deriveId` output. |
| R1r | Repository | Single generic `Repository<T>` for all strategies | Singleton users would call `get(theOneId)` — awkward. Bad DX. |
| R2r | Repository | Three repository types (separate `GlobalRepository`) | Global is identical to partitioned with fixed key. Third type adds nothing. |
| A1r | Adapter | `EntityAdapter extends BlobAdapter` (query-capable local adapter) | In-memory store is source of truth for reads. Adapter only needs blob I/O for persistence. `EntityAdapter` with `query/get/put/remove/count` is unnecessary — `BlobAdapter` covers everything. |
| A2r | Adapter | Internal `BlobEntityAdapter` fallback wrapper | No longer needed — there is no `EntityAdapter` to fall back from. One `BlobAdapter` for all. |
| A3r | Adapter | `AdapterQuery` (equality + range + orderBy + limit + offset) | All query logic runs in-memory on the Map. No query delegation to adapters. `AdapterQuery` type eliminated. |
| A4r | Adapter | Optional methods on one interface (`query?` on `BlobAdapter`) | No query methods needed at all. Adapter is blob I/O only. |
| A5r | Adapter | Equality-only queries (no range) on adapter | Moot — adapter doesn't query. Framework handles range queries in-memory. |
| A6r | Adapter | `in` / `or` queries in `AdapterQuery` | Moot — adapter doesn't query. |
| Q1r | Query | Adapter applies where + range; framework post-filters | Superseded by in-memory store. All query ops run on Map, no adapter delegation. |
| Q2r | Query | `AdapterQuery` includes all operations | Superseded — `AdapterQuery` type eliminated. |
| Q3r | Query | Framework re-sorts adapter results as safety net | Moot — framework is the only query engine, scans in-memory Map. |
| Q4r | Query | `QueryOptions<T>` maps 1:1 to `AdapterQuery` | Moot — no `AdapterQuery`. `QueryOptions` maps to in-memory scan logic. |
| Q5r | Query | `EntityAdapter.initialize(schemas)` at startup | No `EntityAdapter`. `BlobAdapter` needs no schema initialization — it stores opaque blobs. |
| Q6r | Query | `EntitySchema` with full detail (name, fields, indexes) | No schema passed to adapter. Framework stores/compares schemas internally if needed. |
| Q7r | Query | Optional indexes on entity def | Adapter doesn't query → indexes serve no purpose. All filtering is in-memory Map scan. |
| Q8r | Query | Non-destructive schema migration detection at adapter level | Adapter stores blobs, not structured entities. Schema changes are invisible to the adapter. Framework handles entity shape validation internally. |
| Q9r | Query | Adapter reports which filters it applied (coordination protocol) | No query delegation → no coordination needed. |
| Q10r | Query | Sort and limit handled by adapter only | Adapter doesn't query. |
| Q11r | Query | Auto-indexing from query patterns at runtime | No adapter queries, no indexes. |
| Q12r | Query | Adapter config owns index declarations | No indexes. |
| Q13r | Query | Framework-managed migration runner (SM-2) | Over-engineered. App handles destructive migrations directly. |
| T1r | Tenant | `TTenant` generic on adapter interfaces | Variance issues with shipped adapters. Generics spiral. |
| T2r | Tenant | Infer `TTenant` from adapter types (T-2) | Can't infer when adapter factory has no argument to infer from. |
| T3r | Tenant | Framework-level key prefixing (tenant-unaware adapters) | Doesn't support per-tenant cloud storage locations. |
| T4r | Tenant | Full tenant object passed to adapters per-call | Pollutes tenant type with infrastructure fields. |
| T5r | Tenant | Tenant ID = framework-generated random (v1) | Breaks sharing. |
| T6r | Tenant | Adapter `setTenant()` method (stateful) | Makes adapter mutable. |
| T7r | Tenant | Adapter factory pattern (one adapter instance per tenant) | Unnecessary complexity. |
| T8r | Tenant | Tenant list as singleton entity via repo | Circular dependency. |
| T9r | Tenant | Tenant list stored in cloud only | Can't list tenants offline. |
| T10r | Tenant | Tenant list synced via main sync engine (HLC merge) | Overkill for append-mostly list. |
| CE1r | Cloud Explorer | Unified `CloudLocationService` (CF-2) | S3 "folders" aren't real. Two internal service interfaces are more accurate. |
| WB1r | Write Buffer | Write buffer + adapter query merge (approach B) | Complex merge logic on every read. Race conditions with concurrent observers. Event-driven updates add queue/replay complexity. In-memory store is dramatically simpler. |
| WB2r | Write Buffer | Fire-and-forget writes (approach C) | 2ms stale window where queries miss recent saves. Inconsistent reactive emissions. |
| WB3r | Write Buffer | Direct adapter write with await (WB-2) | Blocks `save()` for ~2ms. App wanted instant sync writes for clean code without loaders. |
| WB4r | Write Buffer | Full entity cache (hybrid H-B) | Unbounded memory growth. Cache invalidation complexity on sync. For working set sizes, in-memory store is simpler and equivalent. |
| WB5r | Write Buffer | Re-query adapter on every event (thundering herd) | N observers × M events = N×M adapter queries. Doesn't scale. Event-driven result set updates (S4) solve this but add complexity. In-memory Map scan is simpler. |
| RX1r | Reactive | Return `BehaviorSubject` | `.getValue()` is redundant with sync Map reads. `Observable` is cleaner, teardown on unsubscribe is automatic. |
| RX2r | Reactive | Per-call subjects (one subject + listener per `observe`/`observeQuery` call) | More listeners, more subjects, no benefit over shared per entity type. All O(observers) instead of O(entity types). |
| RX3r | Reactive | Shared subjects per query shape (keyed by serialized opts) | Requires query key serialization, refcount lifecycle, stale subject cleanup on tenant switch. Complexity for ~0.7ms saving. |
| RX4r | Reactive | Debounce on change signal | Delays single `save()` emission by one microtask. Implicit behavior. `saveMany()` is explicit and predictable. |
| RX5r | Reactive | Serialized JSON comparison for `distinctUntilChanged` | Slower than ID + version comparison. Serialization cost per emission per observer. |
| RX6r | Reactive | Event-driven result set updates (S4 from write buffer discussion) | Each observer maintains and patches its own result set from events. Queue + replay for init race condition. Complex. Unnecessary with in-memory Map — just re-scan. |
| P1r | Persistence | Binary serialization (MessagePack, CBOR) | Still needs key sorting for deterministic hashing. Gzip on JSON achieves similar compression. Loses debuggability. No meaningful benefit. |
| P2r | Persistence | Schema-driven date rehydration (PD-4) | No runtime schema — `defineEntity` uses TypeScript generics only, erased at compile time. Framework can't know which fields are Dates. |
| P3r | Persistence | Hash full sorted-key JSON blob (v1 approach) | Deep key sorting at every depth on every flush. ~1-2ms cost. Unnecessary — ID+HLC hash is cheaper and more correct (catches version collisions). |
| P4r | Persistence | Hash ID + version only (no HLC) | Two devices can both produce same version number for same entity. Hash matches, conflict lost silently. HLC is unique per device. |
| P5r | Persistence | Per-entity hashes stored in metadata (PH-B) | Metadata becomes large (N hashes per partition). Cloud APIs don't support partial file reads. Partition-level hash is sufficient. |
| P6r | Persistence | Immediate flush on every save (PT-1) | N saves = N blob serializations + N adapter writes. Wasteful for rapid edits. Debounced flush batches naturally. |
| P7r | Persistence | Flush only on explicit call (PT-3) | Risk of data loss if app forgets to flush or crashes. |
| P8r | Persistence | Store dates as epoch numbers (PD-3) | Loses timezone info, less readable in JSON, doesn't solve the general type-roundtrip problem. |
| P9r | Persistence | Sorted keys in JSON for deterministic blobs | Unnecessary — hash is decoupled from blob content (uses ID+HLC). Blob key ordering doesn't matter. |
| SY1r | Sync | Manual-only sync | Misses periodic persistence. Memory data lost on crash if no auto-flush. |
| SY2r | Sync | Automatic-only sync (no manual trigger) | App can't force immediate sync (e.g., before critical operation or user-initiated "sync now"). |
| SY3r | Sync | Separate push()/pull() queue items | Bidirectional merge in one cycle is more efficient and simpler (v1 SyncHandler pattern). |
| SY4r | Sync | isDirty tracks memory vs local only | Misleading — user thinks data is safe after local flush, but cloud hasn't received it. isDirty should mean "not yet in cloud." |
| SY5r | Sync | Sync status as detailed progress observable | Over-engineered for initial release. isDirty + events (started/completed/failed/unreachable) is sufficient. |
| SY6r | Sync | Cloud unreachable on load → load fails | Breaks offline-first. App must work from local data when cloud is unavailable. |
| SY7r | Sync | Sync reads from local adapter blob (not Map) | Risk of stale data if user saved during sync. Map is source of truth. |
| SY8r | Sync | Multiple concurrent syncs | Race conditions between syncs. One at a time with dedup queue is simpler and correct. |

---

## Discussion Log

### Schema & Identity (discussed 2026-03-22)

**Context:** The current v1 ID format is `entityName.partitionKey.uniqueId` with dot separators. Partitioning is date-based via key strategy.

**App needs raised:**
1. Singleton/global entities (settings, config) — no partitioning, possibly one instance
2. Entities with app-meaningful keys (e.g., auth tokens keyed by `provider-userId`) — need upsert semantics

**Key decisions:**
- **Singleton mode** — fixed partition `_`, deterministic ID, no-arg `get()`. Also used for framework internal metadata (tenant list, sync metadata, partition index).
- **Global mode** — all entities in one partition `_`, framework generates random IDs. For small collections that don't need date partitioning.
- **`deriveId`** — optional function on entity def that computes a deterministic unique ID from entity fields. Enables implicit upsert (same derived ID = overwrite). Replaces the earlier "custom keys" proposal which was dropped for causing CRUD API confusion.
- **App-defined partitioning dropped** — apps don't choose partitions. Framework owns the partitioning strategy. Eliminates confusion about what to pass to get/save/delete.
- **Dot constraint** — dots are reserved as ID segment separators. `deriveId` output is validated at save time.

### Repository (discussed 2026-03-22)

**Context:** With three key strategy modes decided (singleton, global, partitioned), the question was how many repository types/implementations.

**Key decisions:**
- **Two types** — `Repository<T>` for partitioned and global entities, `SingletonRepository<T>` for singletons. Return type inferred from the entity def's key strategy when calling `strata.repo(def)`.
- **Global = partitioned** — `'global'` uses `Repository<T>` with the same implementation. The key strategy simply always returns `'_'` as partition key. No separate code path.
- **API renames** — `getAll` → `query`, `observeAll` → `observeQuery` for clearer intent.
- **`SingletonRepository` is minimal** — `get()`, `save()`, `delete()`, `observe()` — no IDs, no query. Thin wrapper over internal partitioned implementation with fixed partition + deterministic ID.

### Adapter Layer (discussed 2026-03-22)

**Context:** v1 has a single `BlobAdapter` interface. v2 initially explored query-capable `EntityAdapter`, but ultimately simplified back to one interface.

**Evolution:**
1. Initially proposed `EntityAdapter extends BlobAdapter` with `query/get/put/remove/count` to push queries to IDB/SQLite.
2. Explored query delegation, `AdapterQuery` type, adapter indexes, schema migration detection.
3. Realized in-memory store as source of truth eliminates all query delegation — adapter just stores/loads blobs.
4. `EntityAdapter`, `AdapterQuery`, indexes, `initialize()`, `EntitySchema` all dropped.

**Final decision:** One `BlobAdapter` interface (4 methods) for both local and cloud. Framework serializes/deserializes between blobs and in-memory entities. Adapter is a dumb blob store.

### Tenant (discussed 2026-03-22)

**Context:** Tenants map to cloud storage locations (Drive folders, S3 buckets). Sharing means two users access the same cloud location but have their own preferences.

**Key decisions:**
- **`meta`** — opaque bag on tenant that the adapter needs to locate storage. Framework stores it, passes it to adapter, never inspects it.
- **Tenant ID** — short, URL-safe. Can be app-provided, derived from meta (`deriveTenantId`), or framework-generated. Derived enables sharing (same folder = same ID).
- **Tenant prefs are shareable** — name/icon/color stored in tenant data, synced. User-specific prefs stored separately (deferred).
- **App creates tenants** — app coordinates with auth framework/cloud APIs to create the storage location, then calls `strata.tenants.create()` with meta. Adapter only implements the 4 blob methods.
- **`setup()` for shared tenants** — framework reads a marker blob at the meta location to detect existing strata data. Merges tenant prefs.
- **`delink()` vs `delete()`** — delink removes from list without touching data. Delete removes + destroys all blobs.
- **Tenant list storage** — TenantManager owns storage directly via adapter I/O, not via repo. Write to local first (instant, offline-capable), sync to cloud (app space, `meta = undefined`) in background. Multi-device merge is union-by-tenant-ID. No HLC needed — tenant list is append-mostly, conflicts are set unions.
- **No circular dependency** — TenantManager doesn't use repo (which requires a loaded tenant). It reads/writes `__tenants` blob directly through the adapter.
- **Cloud adapter helpers** — `BlobAdapter` contract stays at 4 methods. Framework-shipped adapters (Google Drive, S3) may additionally expose `createLocation()` / `listLocations()` utilities alongside the adapter, not as part of the `BlobAdapter` interface. Custom adapters don't need to implement these — the app handles cloud location creation directly.

### Cloud Explorer & Location Services (discussed 2026-03-22) — Future

**Context:** Apps need UI for users to browse cloud storage, pick/create locations for tenants. Different cloud providers have different paradigms (file/folder vs object/prefix).

**Key decisions:**
- **Two internal service interfaces** — `CloudFileService` for file-based (Drive, OneDrive, Dropbox) and `CloudObjectService` for object-based (S3, Azure Blob, GCS). Internal to each adapter package, not exposed as core framework contracts.
- **One common explorer interface** — `ExplorerDataSource` with `getSpaces()`, `getItems()`, `createContainer()` + capabilities flags. Each adapter package ships a factory that wraps its internal service into this common interface.
- **One shared UI component** — `CloudExplorer` React component works with any `ExplorerDataSource`. Adapts based on capabilities (hides search for non-searchable, hides create button if not supported, etc.). Handles both "create new" and "open existing" flows.
- **Claimed tenant matching** — Explorer source factory receives `ClaimedTenant[]` (meta + name from `strata.tenants.list()`). Adapter matches internally against its own meta shape. Items annotated with `isClaimed` / `claimedTenantName` for UI display.
- **Package structure** — `@strata/cloud-explorer` ships the UI + `ExplorerDataSource` interface. Each adapter package (`@strata/google-drive-adapter`, `@strata/s3-adapter`) ships `BlobAdapter` impl + internal service + explorer source factory. Core framework (`@strata/core`) has no dependency on any of this.

### Query & Schema → Write Buffer & In-Memory Store (discussed 2026-03-22)

**Context:** Initially designed query delegation to adapters. Through discussion of write buffer approaches, race conditions, and complexity analysis, concluded that in-memory store is the right choice.

**Evolution:**
1. Explored adapter query delegation — `AdapterQuery`, indexes, schema migration.
2. Explored write buffer approaches — full WAL (B), fire-and-forget (C), direct write (WB-2), hybrid cache.
3. Large dataset concern raised — concluded partitioning bounds the working set.
4. Concurrent observer race condition (React strict mode) → event-driven updates (S4) → queued replay (RC-2) → realized complexity was spiraling.
5. Compared in-memory store vs write buffer: in-memory is 100x simpler for negligible performance difference on working-set-sized data.
6. In-memory store eliminates `EntityAdapter`, `AdapterQuery`, indexes, schema migration, query merge logic, event queuing — massive simplification.

**Final decisions:**
- **In-memory Map is source of truth** — all reads are sync Map scans. All query/filter/sort/paginate logic runs in-memory.
- **Writes sync to Map, async flush to adapter** — `save()` is instant. Adapter write is fire-and-forget for persistence.
- **Lazy loading** — partitions loaded from adapter on first access. Subsequent reads served from Map.
- **One `BlobAdapter`** — no `EntityAdapter`. Local adapter stores serialized blobs just like cloud.
- **No `AdapterQuery`, no indexes, no schema migration at adapter level** — all moved to rejected.

### Reactive Layer (discussed 2026-03-22)

**Context:** With in-memory store as source of truth, reactive layer is simpler — all reads are sync Map scans.

**Key decisions:**
- **`Observable` return** — not `BehaviorSubject`. `.getValue()` is redundant with sync `repo.get()`/`repo.query()`. Cleanup on unsubscribe is automatic.
- **One `Subject<void>` per entity type** — shared by all observers of that type. Created with the repo, lives for repo lifetime. No payload — just a "something changed" signal.
- **Observers pipe off the entity subject** — `observe(id)` does `subject.pipe(startWith, map(() => store.get(id)), distinctUntilChanged)`. `observeQuery(opts)` does `subject.pipe(startWith, map(() => query(opts)), distinctUntilChanged)`.
- **Change detection via ID + version** — no serialization. Compare array length, element IDs, and versions. For single entity: compare ID + version.
- **`saveMany()` / `deleteMany()`** — many Map writes, one `subject.next()`. Prevents N emissions for N writes. App uses batch methods for loops, single `save()` for one-off writes.
- **No debounce** — single `save()` emits immediately and synchronously. Behavior is explicit and predictable.
- **`dispose()`** — completes all entity type subjects, removes all event bus listeners.

### Persistence (discussed 2026-03-22)

**Context:** How entities move between in-memory store and blob adapters. Serialization format, hashing for sync, flush timing, compression/encryption.

**Key decisions:**
- **JSON with type markers** — plain `JSON.stringify` with replacer. Dates wrapped as `{ __t: 'D', v: isoString }`. Extensible for other types. No runtime schema (Zod) needed — type markers are self-describing.
- **No sorted keys** — hash is decoupled from blob format. Blob key ordering doesn't matter. Simplifies serializer to plain `JSON.stringify` + replacer.
- **ID+HLC partition hash** — FNV-1a over sorted `id:timestamp:counter:nodeId` pairs. Not over full blob. Catches version collisions across devices (HLC includes nodeId). One combined hash per partition stored in index.
- **Partition index** — `__index.entityName` blob. Maps partition keys to `{ hash, count, updatedAt }`. Enables cold-start partition discovery and sync hash comparison.
- **Debounced flush** — 1 second idle after last write. Reduces I/O for rapid saves. `dispose()` forces immediate flush. `save()` itself is sync (Map only).
- **Configurable transform pipeline** — per-adapter `transforms: [gzip(), encrypt(key)]`. Framework serializes JSON → transforms → adapter writes bytes. Reversed on read. Local and cloud can have different transforms.
- **HLC format** — `{ timestamp: number, counter: number, nodeId: string }`. Stored on each entity. Used for conflict resolution and partition hashing.
- **No Zod dependency** — `defineEntity` stays TypeScript-generic-only. Framework handles type serialization via JSON replacer/reviver, not schema introspection.

### Sync Engine (discussed 2026-03-22)

**Context:** Moving data between in-memory store, local adapter, and cloud adapter. Based on proven patterns from v1 SyncHandler and SyncScheduler.

**Key decisions:**
- **Three-phase model** — (1) Hydrate on load: cloud→local→memory. (2) Periodic: memory→local every 2s, local→cloud every 5m. (3) Manual `sync()`: memory→local→cloud immediate. All intervals app-configurable.
- **One sync at a time globally** — across all tenants, all directions. Dedup queue returns same promise if same operation already queued/running (from v1 SyncScheduler pattern).
- **Bidirectional merge** — single sync cycle computes diff both ways using bucket-based approach (from v1 SyncHandler). Per-entity HLC conflict resolution, last-writer-wins.
- **Tombstones** — deleted entities stored as `deleted: { entityId: { hlc } }` in partition blob. 90-day default retention, app-configurable.
- **isDirty** — tracks data not yet synced to cloud (covers both memory→local and local→cloud gaps). Exposed as `isDirty` (sync read) and `isDirty$` (Observable). Clears only after successful cloud sync.
- **Cloud unreachable on load** — `strata.load()` never fails due to cloud. Hydrates from local only. Fires cloud-unreachable event. App handles UI.
- **Sync events** — framework emits events (started, completed, failed, cloud-unreachable). App subscribes and handles display.
- **Graceful shutdown** — `dispose()` waits for in-flight sync, forces final memory→local flush, then returns.
- **Sync reads from Map** — push direction serializes directly from in-memory Map (source of truth). No stale local blob risk.
- **Cloud pull updates Map** — after cloud→local→memory merge, entity type subjects fire, observers re-scan, UI updates automatically.
- **Stale detection** — re-checks metadata after partial apply. If local changed during sync (concurrent save), skips remaining ops (from v1 SyncHandler pattern).
- **Copy optimization** — partition only on one side → full copy, no per-entity diff (from v1 SyncHandler pattern).
