# Review: sync/, tenant/

## src/sync/types.ts
No issues found. Well-defined types with proper readonly annotations.

## src/sync/conflict.ts
No issues found. Clean LWW conflict resolution. Delete-wins-on-tie semantics in `resolveEntityTombstone` is a deliberate design choice.

## src/sync/diff.ts
No issues found. Correct partition diffing using hash comparison.

## src/sync/dirty-tracker.ts
No issues found. Clean reactive dirty tracking with deduplication.

## src/sync/merge.ts
No issues found. Thorough merge logic handling all four entity/tombstone combinations.

## src/sync/sync-engine.ts

### [sync-engine.ts:55-60] Queue deduplication ignores tenant, returns stale result (high)
```ts
const existing = this.queue.find(
  item => item.source === source && item.target === target,
);
if (existing) {
  log('dedup: %s→%s already queued', source, target);
  await existing.promise;
  return { result: EMPTY_RESULT, deduplicated: true };
}
```
1. **Missing tenant in dedup check**: If two different tenants request `local→cloud` sync, the second will be incorrectly deduplicated against the first.
2. **Returns EMPTY_RESULT on dedup**: The caller receives an empty result instead of the actual sync result, losing information about what changed. If the deduplicated sync failed, the caller also doesn't know.

### [sync-engine.ts:147-153] `drain()` can busy-wait (low)
```ts
if (this.running && this.queue.length === 0) {
  await new Promise<void>(r => setTimeout(r, 0));
}
```
If the queue is empty but `running` is still true (processing the last item), this busy-waits with micro-delays. Low impact since drain is rarely called in hot paths.

### [sync-engine.ts:82-87] Sync result captured via closure mutation (low)
```ts
let syncResult: SyncBetweenResult = EMPTY_RESULT;
// ...
const fn = async () => {
  // ...
  syncResult = await syncBetween(...);
  // ...
};
// ...
await promise;
return { result: syncResult, deduplicated: false };
```
The pattern of mutating `syncResult` from within the closure and reading it after the promise resolves works, but is fragile. If the control flow changes, this could return stale results.

## src/sync/sync-scheduler.ts

### [sync-scheduler.ts:28-47] setInterval doesn't account for operation duration (medium)
```ts
this.localTimer = setInterval(() => {
  this.engine.sync('memory', 'local', this.tenant).catch(...);
}, this.localFlushIntervalMs);
```
If a sync operation takes longer than the interval, multiple operations will stack up in parallel. The SyncEngine queue provides some protection (dedup), but the dedup only matches on source+target and may miss tenant. This could cause resource pressure under slow I/O.

### [sync-scheduler.ts:35-44] Cloud sync swallows errors silently (low)
Errors from cloud sync intervals are only logged via `debug`, not propagated as events. The local flush errors are similarly only logged. Users have no way to detect these failures except through the debug logger.

## src/sync/unified.ts

### [unified.ts:250-261] Index update is not atomic with data writes (medium)
```ts
await applyChanges(adapterB, tenant, plan.applyToB);
// ...
await applyChanges(adapterA, tenant, plan.applyToA);
// ...
await Promise.all([
  saveAllIndexes(adapterA, tenant, mergeIndexes(existingIdxA, indexUpdates)),
  saveAllIndexes(adapterB, tenant, mergeIndexes(existingIdxB, indexUpdates)),
]);
```
If the process crashes after writing data but before updating indexes, the indexes will be stale. On next sync, the hash comparison may miss the written changes, causing them to not be propagated. The stale check on adapter A partially mitigates this but doesn't cover adapter B.

### [unified.ts:76-98] Sequential blob reads in planCopies are not parallelized (low)
Each partition blob is read sequentially within `planCopies` and `planMerges`. For adapters with high latency (cloud), this could be significantly slower than parallel reads. The `planMerges` function does parallelize reads for each diverged partition's A/B pair though.

## src/sync/index.ts
No issues found.

---

## src/tenant/types.ts
No issues found.

## src/tenant/tenant-list.ts

### [tenant-list.ts:13-15] No schema validation on loaded tenant data (low)
```ts
return Object.values(tenantEntities) as Tenant[];
```
Data from the blob is cast to `Tenant[]` without validation. Corrupt or tampered data could cause runtime errors downstream.

## src/tenant/tenant-manager.ts

### [tenant-manager.ts:25-30] Tenant ID generation uses Math.random() (medium)
```ts
function generateTenantId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}
```
`Math.random()` is not cryptographically secure. While tenant IDs may not require crypto-grade randomness, collisions could cause data corruption if two devices independently create tenants with the same ID. With 8 characters of base-62, the birthday paradox gives ~50% collision probability at ~11.7 million IDs.

### [tenant-manager.ts:169-177] delete() is not crash-safe (medium)
```ts
const keys = await this.adapter.list(tenant, '');
for (const key of keys) {
  await this.adapter.delete(tenant, key);
}
const filtered = tenants.filter(t => t.id !== tenantId);
await this.persistList(filtered);
```
If the process crashes after deleting some data keys but before updating the tenant list, the tenant will still appear in the list but with partially deleted data. Additionally, sequential deletion could be slow for tenants with many partitions.

### [tenant-manager.ts:52] Cached tenant list can become stale (low)
```ts
private cachedList: Tenant[] | null = null;
```
The cache is never invalidated externally. In multi-tab browser scenarios, one tab's cache could become outdated when another tab modifies the tenant list.

## src/tenant/tenant-sync.ts

### [tenant-sync.ts:21] Date comparison after deserialization may fail silently (medium)
```ts
if (!existing || tenant.updatedAt > existing.updatedAt) {
```
The `>` operator on `Date` objects works via `valueOf()`. However, after JSON deserialization, `updatedAt` may be a string (ISO 8601) rather than a `Date` object, depending on the reviver. String comparison of ISO dates does work lexicographically, but if the reviver correctly restores Dates on one side but not the other, comparison results could be incorrect.

### [tenant-sync.ts:29-34] pushTenantList overwrites cloud without merging (medium)
```ts
export async function pushTenantList(...): Promise<void> {
  const local = await loadTenantList(localAdapter);
  await saveTenantList(cloudAdapter, local);
}
```
This overwrites the cloud tenant list with the local one, discarding any tenants that exist only in the cloud. This is a data loss risk if called when another device has created tenants that haven't been pulled yet.

## src/tenant/tenant-prefs.ts
No issues found.

## src/tenant/marker-blob.ts

### [marker-blob.ts:19-36] writeMarkerBlob creates fresh marker, discarding existing indexes (medium)
```ts
const marker: MarkerData = {
  version: 1,
  createdAt: new Date(),
  entityTypes,
  indexes: {},
  ...(dekBase64 ? { dek: dekBase64 } : {}),
};
```
When writing a new marker blob, existing indexes are overwritten with `{}`. If called after data has been synced (which updates indexes), all index data is lost, forcing a full re-sync on next load.

## src/tenant/index.ts
No issues found.
