# Persistence & Sync

## Serialization

### Format

Plain JSON via `JSON.stringify` with a custom replacer. No sorted keys — hash is decoupled from blob format.

### Type Markers

Types that don't survive JSON round-trip are wrapped with markers:

```json
{ "__t": "D", "v": "2026-03-22T10:30:00.000Z" }
```

| Type | Marker | Serialized as |
|---|---|---|
| `Date` | `__t: 'D'` | ISO 8601 string |

Extensible — future types can add new `__t` values. Deserialization uses a JSON reviver that detects `__t` and reconstructs the original type.

No runtime schema needed. Type markers are self-describing.

### Blob Structure

One blob per `entityName.partitionKey`:

```json
{
  "__v": 1,
  "transaction": {
    "transaction.2026-03.Xk9mB2qR": { "id": "...", "amount": 50, "hlc": { "timestamp": 1711100000, "counter": 0, "nodeId": "phone1" } },
    "transaction.2026-03.A1bC3dEf": { "id": "...", "amount": 100, "hlc": { ... } }
  },
  "deleted": {
    "transaction": {
      "transaction.2026-03.OldId123": { "timestamp": 1711000000, "counter": 0, "nodeId": "phone1" }
    }
  }
}
```

`__v` is an optional blob version number used for migration tracking. See `BlobMigration` in [schema-repository.md](schema-repository.md).
```

### Transform Pipeline

Per-adapter composable transforms applied between serialization and storage I/O via `AdapterBridge`:

```
Write: PartitionBlob → serialize → transform[0].encode → transform[1].encode → StorageAdapter.write(bytes)
Read:  StorageAdapter.read() → transform[1].decode → transform[0].decode → deserialize → PartitionBlob
```

Transforms implement `BlobTransform` (`encode`/`decode`). Framework ships `encryptionTransform()`. Apps can provide custom transforms (e.g., compression).

## Hashing

### Algorithm

FNV-1a (32-bit, non-cryptographic). Fast, deterministic, cross-platform.

### Input

Sorted entity `id:hlcTimestamp:hlcCounter:hlcNodeId` pairs — NOT the full blob:

```typescript
function partitionHash(entityMap: ReadonlyMap<string, Hlc>): number {
  const ids = [...entityMap.keys()].sort();
  let hash = FNV_OFFSET;
  for (const id of ids) {
    const hlc = entityMap.get(id)!;
    hash = fnv1aAppend(hash, `${id}:${hlc.timestamp}:${hlc.counter}:${hlc.nodeId}`);
  }
  return hash;
}
```

- No deep key sorting needed (hash is decoupled from blob)
- HLC includes `nodeId` — catches version collisions across devices
- Tombstones included in hash (deleted entity's HLC)

### Partition Index

All partition indexes are stored inside the `__strata` marker blob under `__system.marker.indexes` (not as separate blobs). One index per entity type:

```json
{
  "__system": {
    "marker": {
      "version": 1,
      "createdAt": "2026-03-28T00:00:00.000Z",
      "entityTypes": ["transaction"],
      "indexes": {
        "transaction": {
          "2026-01": { "hash": 3847291, "count": 847, "deletedCount": 12, "updatedAt": 1711100000000 },
          "2026-02": { "hash": 9182736, "count": 923, "deletedCount": 5, "updatedAt": 1711200000000 },
          "2026-03": { "hash": 1928374, "count": 412, "deletedCount": 0, "updatedAt": 1711300000000 }
        }
      }
    }
  },
  "deleted": {}
}
```

Each entry has `hash`, `count`, `deletedCount` (tombstone count), and `updatedAt`.

Used for:
- Partition discovery on cold start (which partitions exist for `query()` without partition key)
- Sync hash comparison (compare local index vs cloud index without downloading blobs)

Updated on every flush.

## Flush Timing

- **Periodic**: every 2 seconds (configurable via `localFlushIntervalMs`), the sync scheduler runs `syncBetween(store → localAdapter)` to persist dirty partitions
- **Dispose**: forces immediate flush
- **`save()`** is sync (Map only) — flush is async background I/O

Multiple rapid saves → one serialization + one adapter write at the next interval tick.

## HLC (Hybrid Logical Clock)

```typescript
type Hlc = {
  readonly timestamp: number;   // max(wall clock, last known timestamp)
  readonly counter: number;     // disambiguates same-timestamp events
  readonly nodeId: string;      // device identifier
};
```

### Initial State

`createHlc(nodeId)` returns `{ timestamp: 0, counter: 0, nodeId }`. The timestamp starts at `0`, not the current wall clock. The first call to `tick()` advances it to `Date.now()`.

### Usage

- `tick(hlc)` — called on every `save()`. Advances timestamp to `max(Date.now(), hlc.timestamp)` and resets or increments counter. When called with a second argument `tick(local, remote)`, merges the remote HLC into the local clock.
- `compareHlc(a, b)` — compares timestamp, then counter, then nodeId (string tiebreaker). Guarantees total deterministic ordering. Returns `-1 | 0 | 1`.

The `tick()` function is called by the framework during sync (`syncBetween`) to advance the local HLC when remote data has a higher timestamp. Apps may also call `tick(local, remote)` to advance their local clock when receiving external data outside the sync engine.

### Post-Merge Semantics

When two versions of an entity conflict during sync, the winner (determined by `compareHlc`) keeps its **original HLC unchanged**. No new timestamp is generated on merge — the winning entity is stored as-is on both sides.

## Sync Engine

### Three-Phase Model

```
Phase 1 — Hydrate (app load):
  cloud ↔ local   then   local ↔ memory
  If cloud unreachable: load from local only, fire event

Phase 2 — Periodic (background):
  memory ↔ local   every 2s (configurable)
  local  ↔ cloud   every 5m (configurable)

Phase 3 — Manual (strata.sync()):
  memory ↔ local ↔ cloud   (immediate, sequential)
```

Each arrow represents a `syncBetween(adapterA, adapterB)` call. All sync is **bidirectional merge** — changes flow both ways. The ordering controls which side is checked for staleness (adapter A is re-checked before writing back).

### Global Sync Lock

One sync operation at a time — across all tenants, all directions. Dedup queue: if the same operation is already queued or running, returns the existing promise.

```typescript
// Enqueue returns existing promise if duplicate
function enqueue(source, target): Promise<void> {
  const existing = queue.find(item => item.source === source && item.target === target);
  if (existing) return existing.promise;
  // ... create new queue item
}
```

### Sync Implementation — `syncBetween`

All sync directions use a single generic function `syncBetween(adapterA, adapterB, entityNames, tenant, migrations?)` that handles bidirectional merge between any two `BlobAdapter` endpoints (including the in-memory `Store`, which implements `BlobAdapter`). When `migrations` are provided, blobs are migrated lazily on read before merging.

- **Phase 1 (Hydrate)**: `syncBetween(cloudAdapter, localAdapter, ...)` then `syncBetween(localAdapter, store, ...)`
- **Phase 2 (Periodic)**: `syncBetween(store, localAdapter, ...)` + `syncBetween(localAdapter, cloudAdapter, ...)`
- **Phase 3 (Manual)**: same as Phase 2 but immediate

Returns `SyncBetweenResult`:

```typescript
type SyncBetweenResult = {
  readonly changesForA: ReadonlyArray<SyncEntityChange>;  // changes applied to adapter A
  readonly changesForB: ReadonlyArray<SyncEntityChange>;  // changes applied to adapter B
  readonly stale: boolean;     // true if adapter A changed during sync (changes skipped)
  readonly maxHlc: Hlc | undefined;  // highest HLC seen across all synced entities
};
```

### Sync Cycle (local ↔ cloud)

```
1. Load partition index from local and cloud
2. Compare hashes per partition key
3. For partitions only in local → upload to cloud (copy)
4. For partitions only in cloud → download to local (copy)
5. For partitions with hash mismatch → bidirectional merge:
   a. Download both blobs
   b. Deserialize both
   c. Diff entities by ID
   d. Resolve conflicts per-entity via HLC (last writer wins)
   e. Compute merged blob
   f. Write merged to both local and cloud
6. Update partition indexes on both sides
7. Upsert merged entities into in-memory Map
8. Fire entity type subjects → reactive observers update
```

### Conflict Resolution

Per-entity, last-writer-wins via HLC comparison:

```
Entity X on local:  hlc = { timestamp: 1000, counter: 1, nodeId: 'phoneA' }
Entity X on cloud:  hlc = { timestamp: 1001, counter: 0, nodeId: 'phoneB' }

→ Cloud wins (higher timestamp)
→ Both sides updated to cloud version
```

If timestamps match, counter breaks tie. If both match, nodeId string comparison breaks tie. Always deterministic, always produces the same winner on all devices.

### Tombstones

Deleted entities stored as `deleted: { entityId: hlc }` in the partition blob.

Without tombstones: Device A deletes entity X, syncs → cloud removes X. Device B syncs → doesn't see X in cloud → has X locally → re-uploads X. Delete is lost.

With tombstones: Device B sees the tombstone with HLC → compares with its copy → tombstone wins (or local wins if local HLC is newer) → delete propagates correctly.

**Retention**: 90-day default, app-configurable. Tombstones older than retention period purged on flush. A device that hasn't synced in 90+ days may see deleted entities reappear — acceptable edge case.

### Dirty Tracking

`isDirty` / `isDirty$` — tracks whether any data has not yet reached the cloud:

- Covers both memory→local gap AND local→cloud gap
- Clears only after successful cloud sync
- App can show "unsaved changes" indicator

### Sync Events

Framework emits events, app subscribes:

```typescript
type SyncEvent =
  | { type: 'sync-started'; source: SyncLocation; target: SyncLocation }
  | { type: 'sync-completed'; source: SyncLocation; target: SyncLocation; result: SyncResult }
  | { type: 'sync-failed'; source: SyncLocation; target: SyncLocation; error: Error }
  | { type: 'cloud-unreachable' };

type SyncResult = {
  readonly entitiesUpdated: number;     // number of partition changes applied to target (B)
  readonly conflictsResolved: number;   // number of partition changes applied to source (A)
  readonly partitionsSynced: number;    // total partition changes (A + B)
};
```

Note: `entitiesUpdated` and `conflictsResolved` count **partition-level changes**, not individual entities. A partition change may contain multiple entity updates.

### Stale Detection

During a sync cycle, if the user saves data concurrently:
1. Sync reads from in-memory Map (source of truth for push) — no stale local blob risk
2. After applying one side of the merge, re-check metadata
3. If local changed during sync (metadata timestamp advanced), skip remaining ops
4. Next sync cycle picks up the changes

### Graceful Shutdown

`dispose()`:
1. Waits for in-flight sync to complete
2. Forces final memory→local flush (bypasses debounce)
3. Completes all subjects, removes listeners
4. Returns
