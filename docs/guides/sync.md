# Sync & Offline

## Overview

Strata syncs data between three layers: **memory** (in-app), **local** (on-device persistent storage), and **cloud** (remote shared storage). Sync is bidirectional, conflict-free, and works offline.

## Enabling Cloud Sync

Pass a `cloudAdapter` to enable sync:

```typescript
const strata = new Strata({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: myLocalStorage,
  cloudAdapter: myCloudAdapter,   // enables cloud sync
  deviceId: 'device-1',
});
```

Without a `cloudAdapter`, data is persisted locally only.

## Sync Phases

### 1. Hydrate (on tenant load)

```
cloud ↔ local → local ↔ memory
```

When you call `strata.loadTenant(id)`, the framework:
1. Syncs cloud with local (if cloud adapter configured)
2. Loads local data into memory
3. If cloud is unreachable, loads from local only and emits a `cloud-unreachable` event

### 2. Periodic (background)

```
memory ↔ local   every 2s
local  ↔ cloud   every 5m
```

Automatic background sync runs while a tenant is loaded. Intervals are configurable:

```typescript
const strata = new Strata({
  // ...
  options: {
    localFlushIntervalMs: 2000,    // default: 2s
    cloudSyncIntervalMs: 300000,   // default: 5m
  },
});
```

### 3. Manual

```typescript
const result = await strata.sync();
// result: { entitiesUpdated, conflictsResolved, partitionsSynced }
```

Forces immediate `memory → local → cloud` sync. Returns a `SyncResult` with partition-level change counts.

## Conflict Resolution

When two devices edit the same entity, the framework resolves conflicts automatically using **last-writer-wins** via the Hybrid Logical Clock (HLC):

```
Device A saves entity X at HLC { timestamp: 1000, counter: 1, nodeId: 'phoneA' }
Device B saves entity X at HLC { timestamp: 1001, counter: 0, nodeId: 'phoneB' }

→ Device B wins (higher timestamp)
→ Both sides updated to Device B's version
```

Tie-breaking: timestamp → counter → nodeId (string comparison). Always deterministic — every device reaches the same result.

## Sync Events

Subscribe to sync lifecycle events:

```typescript
strata.onSyncEvent((event) => {
  switch (event.type) {
    case 'sync-started':
      console.log(`Syncing ${event.source} → ${event.target}`);
      break;
    case 'sync-completed':
      console.log(`Synced: ${event.result.partitionsSynced} partitions`);
      break;
    case 'sync-failed':
      console.error('Sync failed:', event.error);
      break;
    case 'cloud-unreachable':
      showOfflineBanner();
      break;
  }
});

// Unsubscribe
strata.offSyncEvent(listener);
```

## Dirty Tracking

Track whether data has been synced to the cloud:

```typescript
// Sync check
if (strata.isDirty) {
  showUnsavedIndicator();
}

// Reactive observable
strata.isDirty$.subscribe((dirty) => {
  setUnsavedBadge(dirty);
});
```

`isDirty` is `true` when data exists in memory or local that hasn't reached the cloud. Clears after a successful cloud sync.

## Tombstones

When you delete an entity, a tombstone (deletion marker with HLC) is stored instead of removing the data immediately. This ensures deletes propagate correctly across devices during sync.

Without tombstones: Device A deletes entity → syncs → cloud removes it. Device B syncs → doesn't see it in cloud → has it locally → re-uploads it. Delete is lost.

With tombstones: the delete propagates via HLC comparison, just like any other change.

## Offline

When the cloud adapter is unreachable:
- Data is persisted locally
- `cloud-unreachable` event fires
- Background sync retries at the configured interval
- When connectivity returns, the next sync merges all changes

No data loss — local storage is the fallback.

## How Sync Works Internally

The `syncBetween(adapterA, adapterB)` function handles all sync directions:

1. Load partition indexes from both sides
2. Compare hashes per partition
3. Partitions only on one side → copy to the other
4. Partitions with different hashes → bidirectional merge (per-entity HLC resolution)
5. Write merged results to both sides
6. Update partition indexes
