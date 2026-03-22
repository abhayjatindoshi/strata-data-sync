# Strata v2 — Backlog

## Legend
- **P0** — Must have for first usable release
- **P1** — Important, needed soon after P0
- **P2** — Nice to have, can defer

---

## P0 — Core Framework

### Schema & Identity
- [ ] `defineEntity<T>(name, opts?)` — TypeScript-generic entity definition (no Zod)
- [ ] `BaseEntity` type — `id`, `createdAt`, `updatedAt`, `version`, `device`, `hlc`
- [ ] Entity ID generation — `entityName.partitionKey.uniqueId` format
- [ ] `deriveId` option — deterministic ID from entity fields, dot validation
- [ ] ID parsing — `parseEntityId()`, `getEntityKey()`, `buildEntityId()`
- [ ] Three key strategies — `singleton`, `global`, `partitioned(fn)`
- [ ] Date-based key strategy — `monthlyPartition('createdAt')`

### In-Memory Store
- [ ] `Map<entityKey, Map<entityId, entity>>` structure
- [ ] `save()` / `saveMany()` — sync write to Map
- [ ] `delete()` / `deleteMany()` — sync delete from Map
- [ ] `get(entityKey, id)` — sync point lookup
- [ ] `getAll(entityKey)` — sync partition scan
- [ ] Partition tracking — `listPartitions(entityName)`, `hasPartition(entityKey)`
- [ ] Lazy partition loading from local adapter on first access

### Repository
- [ ] `Repository<T>` — `get`, `query`, `save`, `saveMany`, `delete`, `deleteMany`, `observe`, `observeQuery`
- [ ] `SingletonRepository<T>` — `get`, `save`, `delete`, `observe` (no IDs, no query)
- [ ] `QueryOptions<T>` — `where`, `range`, `orderBy`, `limit`, `offset`
- [ ] In-memory query engine — filter → sort → offset/limit on Map values
- [ ] Return type inference from entity def key strategy

### Reactive Layer
- [ ] `Subject<void>` per entity type — change signal, no payload
- [ ] `observe(id)` — `pipe(startWith, map(() => store.get(id)), distinctUntilChanged)`
- [ ] `observeQuery(opts)` — `pipe(startWith, map(() => query(opts)), distinctUntilChanged)`
- [ ] Change detection — ID + version comparison (no serialization)
- [ ] Event bus — `on(listener)`, `off(listener)`, one listener per entity type
- [ ] `dispose()` — complete all subjects, remove all listeners

### Persistence
- [ ] JSON serializer with type marker replacer (`Date` → `{ __t: 'D', v: iso }`)
- [ ] JSON deserializer with type marker reviver
- [ ] FNV-1a hash function
- [ ] Partition hash — FNV-1a on sorted `id:hlcTimestamp:hlcCounter:hlcNodeId` pairs
- [ ] Partition index — `__index.entityName` blob with `{ hash, count, updatedAt }` per partition
- [ ] Debounced flush — 2s idle default, configurable, flush on dispose
- [ ] Partition blob structure — entities + deleted (tombstones)

### BlobAdapter
- [ ] `BlobAdapter` interface — `read`, `write`, `delete`, `list` with `cloudMeta` first param
- [ ] `MemoryBlobAdapter` — in-memory Map-backed for testing
- [ ] Transform pipeline — `transforms: [gzip(), encrypt(key)]` per adapter
- [ ] `gzip()` transform
- [ ] `encrypt(key)` transform

### HLC
- [ ] `Hlc` type — `{ timestamp, counter, nodeId }`
- [ ] `createHlc(nodeId)` — initialize
- [ ] `tickLocal(hlc)` — increment on local write
- [ ] `tickRemote(local, remote)` — merge on sync
- [ ] `compareHlc(a, b)` — total ordering

### Sync Engine
- [ ] Sync scheduler — one sync at a time globally, dedup queue, returns same promise
- [ ] Memory → local flush (periodic, configurable default 2s)
- [ ] Local ↔ cloud sync (periodic, configurable default 5m)
- [ ] Manual `sync()` — memory → local → cloud immediate
- [ ] Hydrate on load — cloud → local → memory
- [ ] Cloud unreachable on load — load from local, fire event
- [ ] Partition index comparison — hash diff to find changed partitions
- [ ] Bidirectional merge — bucket-based diff, per-entity HLC resolution
- [ ] Copy optimization — one-sided partitions copied without per-entity diff
- [ ] Tombstone support — deleted entities with HLC in partition blob
- [ ] Tombstone retention — 90-day default, configurable, purged on flush
- [ ] Stale detection — re-check metadata after partial apply
- [ ] Dirty tracking — `isDirty` / `isDirty$` (data not yet in cloud)
- [ ] Sync events — started, completed, failed, cloud-unreachable
- [ ] Graceful shutdown — wait for in-flight sync, force flush, complete subjects

### Tenant Manager
- [ ] `Tenant` type — `id`, `name`, `icon?`, `color?`, `cloudMeta`, `createdAt`, `updatedAt`
- [ ] `list()` — read tenant list from local adapter
- [ ] `create({ name, cloudMeta, id? })` — create tenant, write to local + cloud
- [ ] `setup({ cloudMeta })` — open existing shared location, read marker blob
- [ ] `load(tenantId)` — set active tenant, resolve cloudMeta
- [ ] `delink(tenantId)` — remove from list, keep data
- [ ] `delete(tenantId)` — remove from list + destroy all data
- [ ] `activeTenant$` — Observable of current tenant
- [ ] `deriveTenantId(cloudMeta)` — configurable deterministic ID
- [ ] Tenant list storage — `__tenants` blob, local primary, cloud backup, union-merge
- [ ] Marker blob — `__strata` at each tenant cloudMeta location

### Strata Entry Point
- [ ] `createStrata(config)` — validate entity defs, init all components, return API
- [ ] `strata.repo(def)` — return typed `Repository<T>` or `SingletonRepository<T>`
- [ ] `strata.tenants` — TenantManager API
- [ ] `strata.sync()` — manual sync trigger
- [ ] `strata.isDirty` / `strata.isDirty$` — dirty tracking
- [ ] `strata.dispose()` — graceful shutdown

---

## P1 — Post-Core

### React Bindings
- [ ] `StrataProvider` — React context for strata instance
- [ ] `useRepo(def)` — hook returning typed repository
- [ ] `useObserve(repo, id)` — hook subscribing to `observe(id)`
- [ ] `useQuery(repo, opts)` — hook subscribing to `observeQuery(opts)`
- [ ] `useTenant()` — hook for active tenant
- [ ] `useTenantList()` — hook for tenant list
- [ ] `useIsDirty()` — hook for dirty status

### Cloud Explorer (Future)
- [ ] `ExplorerDataSource` interface — `getSpaces`, `getItems`, `createContainer`, `capabilities`
- [ ] `CloudExplorer` React component — browse/pick/create cloud locations
- [ ] Claimed tenant matching via factory param
- [ ] `CloudFileService` interface (internal to file-based adapters)
- [ ] `CloudObjectService` interface (internal to object-based adapters)

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
