# App Lifecycle & Data Flow

## Lifecycle Sequence

```mermaid
sequenceDiagram
    actor User
    participant App as App / UI
    participant Strata as createStrata()
    participant Tenant as Tenant Manager
    participant Repo as Repository
    participant Store as In-Memory Store
    participant Signal as Entity Subject
    participant Local as Local BlobAdapter
    participant Cloud as Cloud BlobAdapter
    participant Sync as Sync Engine

    Note over App,Sync: ═══ PHASE 1: INITIALIZATION ═══

    App->>Strata: createStrata({ entities, adapters, deviceId })
    Strata->>Strata: validate entity defs, init HLC
    Strata->>Signal: create Subject<void> per entity type
    Strata->>Sync: create sync scheduler (idle)
    Strata-->>App: strata instance

    Note over App,Sync: ═══ PHASE 2: TENANT LOAD ═══

    App->>Tenant: strata.tenants.list()
    Tenant->>Local: read(undefined, '__tenants')
    Local-->>Tenant: tenant list blob (or null)
    Tenant-->>App: tenants[]

    App->>Tenant: strata.tenants.load(tenantId)
    Tenant->>Tenant: set active tenant, resolve meta

    Note over App,Sync: ═══ PHASE 3: HYDRATE (cloud → local → memory) ═══

    Sync->>Cloud: read(meta, '__index.transaction')
    Cloud-->>Sync: cloud partition index (or null if unreachable)

    alt Cloud reachable
        Sync->>Sync: compare cloud index vs local index
        loop For each changed/new partition
            Sync->>Cloud: read(meta, partition blob)
            Cloud-->>Sync: blob
            Sync->>Sync: deserialize + merge with local
            Sync->>Local: write(meta, merged blob)
            Sync->>Store: upsert merged entities into Map
            Store->>Signal: subject.next()
        end
    else Cloud unreachable
        Sync->>App: emit cloud-unreachable event
    end

    Sync->>Local: read partition blobs for loaded entity types
    Local-->>Sync: blobs
    Sync->>Store: deserialize + load into Map

    Note over App,Sync: ═══ PHASE 4: FIRST QUERY ═══

    App->>Repo: repo.query({ where: { status: 'pending' } })
    Repo->>Store: scan Map (sync), filter, sort, paginate
    Store-->>Repo: results
    Repo-->>App: transactions[]

    Note over App,Sync: ═══ PHASE 5: MUTATION ═══

    User->>App: creates new transaction
    App->>Repo: repo.save({ amount: 50, date: new Date() })
    Repo->>Repo: assign ID, set createdAt/updatedAt/version/hlc
    Repo->>Store: Map.set(entityKey, id, entity) [sync]
    Store->>Signal: subject.next() [sync]
    Repo-->>App: entity ID (immediate, sync)

    Note right of Signal: All observers pipe fires:<br/>map(() => readFromMap)<br/>distinctUntilChanged<br/>emit only if changed

    par Async Flush (periodic 2s interval)
        Store->>Store: mark partition dirty
        Store->>Local: serialize + write blob (at next interval tick)
        Store->>Store: update partition index
    end

    Note over App,Sync: ═══ PHASE 6: REACTIVE OBSERVATION ═══

    App->>Repo: repo.observeQuery({ where: { status: 'pending' } })
    Repo->>Signal: pipe(startWith, map(() => query(opts)), distinctUntilChanged)
    Signal-->>App: Observable emits initial results

    User->>App: saves another transaction
    App->>Repo: repo.save(entity)
    Repo->>Store: Map.set [sync]
    Store->>Signal: subject.next() [sync]
    Signal-->>App: Observer re-scans Map, emits updated results

    Note over App,Sync: ═══ PHASE 7: PERIODIC SYNC (background) ═══

    Note right of Sync: Every 2s: memory → local flush<br/>Every 5m: local → cloud sync

    Sync->>Store: read dirty partitions from Map
    Sync->>Sync: serialize entities from Map
    Sync->>Local: write partition blobs
    Sync->>Sync: compute partition hashes (ID+HLC)

    Sync->>Cloud: read cloud partition index
    Cloud-->>Sync: cloud index
    Sync->>Sync: compare hashes
    loop For each dirty partition
        Sync->>Cloud: read cloud blob (if hash mismatch)
        Sync->>Sync: merge (HLC conflict resolution)
        Sync->>Cloud: write merged blob
        Sync->>Local: write merged blob
        Sync->>Store: upsert if cloud had newer data
        Store->>Signal: subject.next() (if Map changed)
    end

    Note over App,Sync: ═══ PHASE 8: MANUAL SYNC ═══

    App->>Strata: strata.sync()
    Strata->>Sync: enqueue memory→local→cloud (immediate)
    Sync->>Store: flush all dirty partitions to local
    Sync->>Sync: local↔cloud bidirectional merge
    Sync-->>App: Promise<SyncResult>

    Note over App,Sync: ═══ PHASE 9: DISPOSE ═══

    App->>Strata: strata.dispose()
    Strata->>Sync: wait for in-flight sync
    Strata->>Store: force flush all dirty to local (bypass interval)
    Store->>Local: write remaining blobs
    Strata->>Signal: complete all subjects
    Strata->>Strata: remove all event bus listeners
```

## Phase Summary

| Phase | What happens | Blocking? |
|---|---|---|
| 1. Init | Create strata, validate schemas, init HLC | Sync — instant |
| 2. Tenant | Load tenant list from local, set active | Async — local adapter read |
| 3. Hydrate | Cloud → local → memory. Cloud unreachable = load from local only | Async — adapter I/O |
| 4. First Query | Scan in-memory Map | Sync — instant |
| 5. Mutation | Map.set + emit signal | Sync — instant. Flush is async background. |
| 6. Observe | Pipe off entity subject, re-scan Map on signal | Sync — no adapter I/O |
| 7. Periodic Sync | memory→local (2s), local→cloud (5m) | Async — background, one at a time |
| 8. Manual Sync | memory→local→cloud, immediate | Async — returns Promise |
| 9. Dispose | Wait for sync, flush, complete subjects | Async — waits for completion |

## `StrataConfig`

```typescript
type StrataConfig = {
  readonly appId: string;
  readonly entities: ReadonlyArray<EntityDefinition<any>>;
  readonly localAdapter: BlobAdapter | StorageAdapter;
  readonly cloudAdapter?: BlobAdapter;
  readonly deviceId: string;
  readonly encryption?: { readonly password: string };
  readonly deriveTenantId?: (meta: Record<string, unknown>) => string;
  readonly options?: StrataOptions;
};
```

- **`appId`** — unique app identifier, used for key namespacing in `AdapterBridge`
- **`localAdapter`** — accepts either `BlobAdapter` or `StorageAdapter`. If a `StorageAdapter` is passed, the framework auto-wraps it with `AdapterBridge`.
- **`encryption`** — when provided with a `StorageAdapter`, `createStrataAsync` initializes encryption automatically
- **`deriveTenantId`** — optional function to derive deterministic tenant IDs from `meta`. Useful for sharing (same cloud folder → same tenant ID across users). Adapter packages can ship helpers.

## Sync Events

Subscribe to sync lifecycle events:

```typescript
strata.onSyncEvent((event) => {
  switch (event.type) {
    case 'sync-started': /* ... */ break;
    case 'sync-completed': /* event.result */ break;
    case 'sync-failed': /* event.error */ break;
    case 'cloud-unreachable': /* ... */ break;
  }
});

strata.offSyncEvent(listener);  // unsubscribe
```

## Dirty Tracking

```typescript
// Sync check
if (strata.isDirty) { /* data not yet synced to cloud */ }

// Reactive observable
strata.isDirty$.subscribe((dirty) => {
  showUnsavedIndicator(dirty);
});
```

Tracks whether any data has not yet reached the cloud. Clears after successful cloud sync.

## Encryption Methods

The `Strata` class exposes three methods for managing at-rest encryption. All three require `localAdapter` to be a `StorageAdapter` (not a raw `BlobAdapter`).

```typescript
// Enable encryption on an unencrypted instance.
// Generates DEK + salt, derives KEK, wraps DEK, stores salt + DEK blobs,
// and re-encrypts all existing data blobs via StorageAdapter.
await strata.enableEncryption(password);

// Disable encryption on an encrypted instance.
// Derives KEK, unwraps DEK, decrypts all existing data blobs,
// and removes __strata_salt and __strata_dek blobs.
await strata.disableEncryption(password);

// Change the encryption password.
// Derives old KEK, unwraps DEK, derives new KEK with same salt,
// re-wraps DEK, and overwrites __strata_dek blob.
await strata.changePassword(oldPassword, newPassword);
```

Throws `Error` if `localAdapter` is not a `StorageAdapter`.

## `createStrataAsync` Factory

Async version of `createStrata` that handles `StorageAdapter` wrapping and encryption initialization in one step.

```typescript
const strata = await createStrataAsync({
  appId: 'my-app',
  entities: [taskDef, accountDef],
  localAdapter: myStorageAdapter,   // StorageAdapter (not BlobAdapter)
  cloudAdapter: myCloudAdapter,
  deviceId: 'device-1',
  encryption: { password: 'user-secret' },
});
```

When `localAdapter` is a `StorageAdapter` and `encryption` config is provided, `createStrataAsync`:

1. Calls `initEncryption(storageAdapter, appId, password)` to bootstrap or load the DEK
2. Wraps the `StorageAdapter` with `AdapterBridge`, passing `encryptionTransform(encCtx)` as a transform
3. Constructs the `Strata` instance with the wrapped adapter

If `localAdapter` is a `BlobAdapter` or no `encryption` config is provided, it behaves identically to `createStrata`.
