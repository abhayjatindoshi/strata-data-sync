# Strata

[![CI](https://github.com/abhayjatindoshi/strata-data-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/abhayjatindoshi/strata-data-sync/actions/workflows/ci.yml)
[![Publish](https://github.com/abhayjatindoshi/strata-data-sync/actions/workflows/publish.yml/badge.svg)](https://github.com/abhayjatindoshi/strata-data-sync/actions/workflows/publish.yml)
[![codecov](https://codecov.io/gh/abhayjatindoshi/strata-data-sync/branch/main/graph/badge.svg)](https://codecov.io/gh/abhayjatindoshi/strata-data-sync)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

An offline-first, reactive data framework for TypeScript/JavaScript. Strata handles entity storage, multi-device sync via cloud blob storage, HLC-based conflict resolution, multi-tenancy, encryption, and reactive UI bindings.

## Install

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
const tenant = await strata.tenants.create({ name: 'My Workspace', meta: {} });
await strata.loadTenant(tenant.id);

// 4. Use the repository
const tasks = strata.repo(taskDef);
const id = tasks.save({ title: 'Hello Strata', done: false });
console.log(tasks.get(id));        // { title: 'Hello Strata', done: false, id: '...', ... }
console.log(tasks.query().length); // 1

// 5. Clean up
await strata.dispose();
```

## Features

| Feature | Description |
|---|---|
| **Offline-first** | In-memory Map is the source of truth. All reads are synchronous. |
| **Multi-device sync** | Three-phase sync: hydrate on load, periodic persist, manual full sync via any blob storage. |
| **Conflict resolution** | HLC-based (Hybrid Logical Clock) last-writer-wins with tombstone support. |
| **Reactive** | RxJS Observables for entity changes, queries, and dirty state. |
| **Multi-tenancy** | Isolated workspaces with metadata-based storage routing and tenant sharing. |
| **Encryption** | Per-tenant password-protected encryption with automatic detection. |
| **Migrations** | Lazy blob migrations that transform stored data to new formats on read. |
| **Pluggable storage** | One `StorageAdapter` interface — implement for IndexedDB, filesystem, S3, or any backend. |

## Configuration

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

```
new Strata(config) → loadTenant(id) → use repos → dispose()
```

1. **`new Strata(config)`** — creates instance, validates entity definitions
2. **`strata.loadTenant(tenantId)`** — loads tenant, hydrates data from local/cloud adapters
3. **Use repos** — `strata.repo(entityDef)` for CRUD, queries, and reactive observations
4. **`strata.dispose()`** — flushes pending data to storage, stops sync, cleans up

## Guides

| Guide | Description |
|---|---|
| [Getting Started](docs/guides/getting-started.md) | Installation, first entity, and basic usage |
| [Entities & Repositories](docs/guides/entities-repositories.md) | Key strategies, queries, CRUD operations |
| [Reactive Observations](docs/guides/reactive.md) | Observe entity changes with RxJS |
| [Storage Adapters](docs/guides/storage-adapters.md) | Implement custom persistence backends |
| [Sync & Offline](docs/guides/sync.md) | Cloud sync and conflict resolution |
| [Encryption](docs/guides/encryption.md) | Per-tenant encryption setup |
| [Multi-Tenancy](docs/guides/multi-tenancy.md) | Tenant management and sharing |
| [Migrations](docs/guides/migrations.md) | Data schema evolution |

## Design Documents

| Document | Description |
|---|---|
| [Architecture Overview](docs/design/architecture.md) | High-level component diagram, design principles, data flow summary |
| [Schema & Repository](docs/design/schema-repository.md) | Entity definitions, ID generation, key strategies, repository API surface |
| [Adapter Contract](docs/design/adapter.md) | `BlobAdapter` interface, `meta` per-call, transform pipeline |
| [Tenant System](docs/design/tenant.md) | Multi-tenancy, `meta`, tenant lifecycle, sharing, tenant list storage |
| [Persistence & Sync](docs/design/persistence-sync.md) | Serialization, hashing, flush timing, sync phases, conflict resolution, tombstones |
| [Reactive Layer](docs/design/reactive.md) | Event bus, shared subjects, observables, change detection, batch writes |
| [App Lifecycle](docs/design/lifecycle.md) | Full lifecycle sequence diagram (init → tenant → query → save → sync → dispose) |
| [Decisions Tracker](docs/design/decisions.md) | All accepted, rejected, and future decisions with rationale |

## License

MIT
