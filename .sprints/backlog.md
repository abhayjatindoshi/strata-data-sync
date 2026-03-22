# Strata v2 — Backlog

## Legend
- **P0** — Must have for first usable release
- **P1** — Important, needed soon after P0
- **P2** — Nice to have, can defer

---

## P0 — Core Framework

### Schema & Identity
- [x] `defineEntity<T>(name, opts?)` — TypeScript-generic entity definition (no Zod)
- [x] `BaseEntity` type — `id`, `createdAt`, `updatedAt`, `version`, `device`, `hlc`
- [x] Entity ID generation — `entityName.partitionKey.uniqueId` format
- [x] `deriveId` option — deterministic ID from entity fields, dot validation
- [x] ID parsing — `parseEntityId()`, `getEntityKey()`, `buildEntityId()`
- [x] Three key strategies — `singleton`, `global`, `partitioned(fn)`
- [x] Date-based key strategy — `monthlyPartition('createdAt')`

### In-Memory Store
- [x] `Map<entityKey, Map<entityId, entity>>` structure
- [x] `save()` / `saveMany()` — sync write to Map
- [x] `delete()` / `deleteMany()` — sync delete from Map
- [x] `get(entityKey, id)` — sync point lookup
- [x] `getAll(entityKey)` — sync partition scan
- [x] Partition tracking — `listPartitions(entityName)`, `hasPartition(entityKey)`
- [x] Lazy partition loading from local adapter on first access

### Repository
- [x] `Repository<T>` — `get`, `query`, `save`, `saveMany`, `delete`, `deleteMany`, `observe`, `observeQuery`
- [x] `SingletonRepository<T>` — `get`, `save`, `delete`, `observe` (no IDs, no query)
- [x] `QueryOptions<T>` — `where`, `range`, `orderBy`, `limit`, `offset`
- [x] In-memory query engine — filter → sort → offset/limit on Map values
- [x] Return type inference from entity def key strategy

### Reactive Layer
- [x] `Subject<void>` per entity type — change signal, no payload
- [x] `observe(id)` — `pipe(startWith, map(() => store.get(id)), distinctUntilChanged)`
- [x] `observeQuery(opts)` — `pipe(startWith, map(() => query(opts)), distinctUntilChanged)`
- [x] Change detection — ID + version comparison (no serialization)
- [x] Event bus — `on(listener)`, `off(listener)`, one listener per entity type
- [x] `dispose()` — complete all subjects, remove all listeners

### Persistence
- [x] JSON serializer with type marker replacer (`Date` → `{ __t: 'D', v: iso }`)
- [x] JSON deserializer with type marker reviver
- [x] FNV-1a hash function
- [x] Partition hash — FNV-1a on sorted `id:hlcTimestamp:hlcCounter:hlcNodeId` pairs
- [x] Partition index — `__index.entityName` blob with `{ hash, count, updatedAt }` per partition
- [x] Debounced flush — 2s idle default, configurable, flush on dispose
- [x] Partition blob structure — entities + deleted (tombstones)

### BlobAdapter
- [x] `BlobAdapter` interface — `read`, `write`, `delete`, `list` with `cloudMeta` first param
- [x] `MemoryBlobAdapter` — in-memory Map-backed for testing
- [x] Transform pipeline — `transforms: [gzip(), encrypt(key)]` per adapter
- [x] `gzip()` transform
- [x] `encrypt(key)` transform

### HLC
- [x] `Hlc` type — `{ timestamp, counter, nodeId }`
- [x] `createHlc(nodeId)` — initialize
- [x] `tickLocal(hlc)` — increment on local write
- [x] `tickRemote(local, remote)` — merge on sync
- [x] `compareHlc(a, b)` — total ordering

### Sync Engine
- [x] Sync scheduler — one sync at a time globally, dedup queue, returns same promise
- [x] Memory → local flush (periodic, configurable default 2s)
- [x] Local ↔ cloud sync (periodic, configurable default 5m)
- [x] Manual `sync()` — memory → local → cloud immediate
- [x] Hydrate on load — cloud → local → memory
- [x] Cloud unreachable on load — load from local, fire event
- [x] Partition index comparison — hash diff to find changed partitions
- [x] Bidirectional merge — bucket-based diff, per-entity HLC resolution
- [x] Copy optimization — one-sided partitions copied without per-entity diff
- [x] Tombstone support — deleted entities with HLC in partition blob
- [x] Tombstone retention — 90-day default, configurable, purged on flush
- [x] Stale detection — re-check metadata after partial apply
- [x] Dirty tracking — `isDirty` / `isDirty$` (data not yet in cloud)
- [x] Sync events — started, completed, failed, cloud-unreachable
- [x] Graceful shutdown — wait for in-flight sync, force flush, complete subjects

### Tenant Manager
- [x] `Tenant` type — `id`, `name`, `icon?`, `color?`, `cloudMeta`, `createdAt`, `updatedAt`
- [x] `list()` — read tenant list from local adapter
- [x] `create({ name, cloudMeta, id? })` — create tenant, write to local + cloud
- [x] `setup({ cloudMeta })` — open existing shared location, read marker blob
- [x] `load(tenantId)` — set active tenant, resolve cloudMeta
- [x] `delink(tenantId)` — remove from list, keep data
- [x] `delete(tenantId)` — remove from list + destroy all data
- [x] `activeTenant$` — Observable of current tenant
- [x] `deriveTenantId(cloudMeta)` — configurable deterministic ID
- [x] Tenant list storage — `__tenants` blob, local primary, cloud backup, union-merge
- [x] Marker blob — `__strata` at each tenant cloudMeta location

### Strata Entry Point
- [x] `createStrata(config)` — validate entity defs, init all components, return API
- [x] `strata.repo(def)` — return typed `Repository<T>` or `SingletonRepository<T>`
- [x] `strata.tenants` — TenantManager API
- [x] `strata.sync()` — manual sync trigger
- [x] `strata.isDirty` / `strata.isDirty$` — dirty tracking
- [x] `strata.dispose()` — graceful shutdown

---

## P1 — Post-Core

### React Bindings
- [x] `StrataProvider` — React context for strata instance
- [x] `useRepo(def)` — hook returning typed repository
- [x] `useObserve(repo, id)` — hook subscribing to `observe(id)`
- [x] `useQuery(repo, opts)` — hook subscribing to `observeQuery(opts)`
- [x] `useTenant()` — hook for active tenant
- [x] `useTenantList()` — hook for tenant list
- [x] `useIsDirty()` — hook for dirty status

### Cloud Explorer
- [x] `ExplorerDataSource` interface — `getSpaces`, `getItems`, `createContainer`, `capabilities`
- [x] `CloudExplorer` React component — browse/pick/create cloud locations
- [x] Claimed tenant matching via factory param
- [x] `CloudFileService` interface (internal to file-based adapters)
- [x] `CloudObjectService` interface (internal to object-based adapters)

---

## P2 — Adapter Packages (Future)

### Google Drive Adapter
- [ ] `BlobAdapter` implementation for Google Drive
- [ ] `CloudFileService` implementation
- [ ] `ExplorerDataSource` factory — `createDriveExplorerSource(credentials, tenants)`
- [ ] `GoogleDriveCloudMeta` type

### S3 Adapter
- [ ] `BlobAdapter` implementation for S3
- [ ] `CloudObjectService` implementation
- [ ] `ExplorerDataSource` factory — `createS3ExplorerSource(credentials, tenants)`
- [ ] `S3CloudMeta` type

### IndexedDB Adapter
- [ ] `BlobAdapter` implementation for IndexedDB
- [ ] Blob storage in IDB object store

---

## P2 — Performance Optimizations (Future)

- [ ] Cursor-based pagination (`after: lastEntityId`)
- [ ] Query delegation to adapter (`EntityAdapter` with `query()`) for very large datasets
- [ ] SQLite adapter (schemaless JSON column)
- [ ] SQLite adapter (mapped columns with `ALTER TABLE` migrations)
