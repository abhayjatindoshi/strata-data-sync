# Getting Started

## Installation

```bash
npm install strata-data-sync
```

## Quick Start

```typescript
import { Strata, MemoryBlobAdapter, defineEntity } from 'strata-data-sync';

// 1. Define your entities
type Task = { title: string; done: boolean };
const taskDef = defineEntity<Task>('task');

// 2. Create a Strata instance
const strata = new Strata({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: new MemoryBlobAdapter(),
  deviceId: 'device-1',
});

// 3. Create and load a tenant
const tenant = await strata.tenants.create({
  name: 'My Workspace',
  meta: {},
});
await strata.loadTenant(tenant.id);

// 4. Use the repository
const tasks = strata.repo(taskDef);
const id = tasks.save({ title: 'Hello Strata', done: false });
console.log(tasks.get(id));       // { title: 'Hello Strata', done: false, id: '...', ... }
console.log(tasks.query().length); // 1

// 5. Clean up
await strata.dispose();
```

## Core Concepts

### Entities

Entities are typed data objects. You define them with `defineEntity<T>(name)`:

```typescript
type Note = { body: string; tags: string[] };
const noteDef = defineEntity<Note>('note');
```

The framework adds metadata fields automatically: `id`, `createdAt`, `updatedAt`, `version`, `device`, and `hlc` (hybrid logical clock for sync).

### Tenants

All data is scoped to a tenant. A tenant represents a workspace, project, or user account. You must create and load a tenant before reading or writing data.

```typescript
const tenant = await strata.tenants.create({ name: 'Work', meta: {} });
await strata.loadTenant(tenant.id);
```

### Repositories

Repositories provide CRUD operations. Get one from `strata.repo(entityDef)`:

```typescript
const repo = strata.repo(taskDef);

// Create
const id = repo.save({ title: 'Buy milk', done: false });

// Read
const task = repo.get(id);

// Update (pass the id to update)
repo.save({ ...task!, done: true });

// Delete
repo.delete(id);

// Query
const open = repo.query({ where: { done: false } });
```

### Adapters

Adapters determine where data is stored. The framework ships two in-memory adapters for development and testing:

- `MemoryBlobAdapter` — stores `PartitionBlob` objects in a `Map`
- `MemoryStorageAdapter` — stores raw `Uint8Array` bytes in a `Map` (use with encryption)

For production, implement `StorageAdapter` to persist to the filesystem, IndexedDB, or any key-value store. See [Storage Adapters](storage-adapters.md).

## StrataConfig

```typescript
const strata = new Strata({
  appId: 'my-app',                    // unique app identifier
  entities: [taskDef, noteDef],       // entity definitions
  localAdapter: myStorageAdapter,     // BlobAdapter or StorageAdapter
  cloudAdapter: myCloudAdapter,       // optional — enables sync
  deviceId: 'device-1',              // unique per device
  migrations: [...],                  // optional — blob migrations
  options: {
    localFlushIntervalMs: 2000,       // memory → local flush interval (default: 2s)
    cloudSyncIntervalMs: 300000,      // local → cloud sync interval (default: 5m)
  },
});
```

## Lifecycle

1. `new Strata(config)` — creates instance, validates entities
2. `strata.loadTenant(tenantId)` — loads tenant, hydrates data from adapters
3. Use repos — save, query, observe
4. `strata.dispose()` — flushes pending data, cleans up

## Next Steps

- [Entities & Repositories](entities-repositories.md) — key strategies, queries, batch ops
- [Reactive Observations](reactive.md) — observe changes with RxJS
- [Multi-Tenancy](multi-tenancy.md) — tenant management and sharing
- [Encryption](encryption.md) — per-tenant encryption
- [Sync & Offline](sync.md) — cloud sync and conflict resolution
- [Storage Adapters](storage-adapters.md) — custom adapter implementation
- [Migrations](migrations.md) — data schema migrations
