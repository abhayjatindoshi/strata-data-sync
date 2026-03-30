# Review: src/store/, src/strata.ts, src/index.ts

---

## src/store/flush-scheduler.ts

File contains only a comment: `// FlushScheduler removed — all data movement now uses syncBetween via SyncScheduler.`  
Dead file. No issues; could be deleted.

---

## src/store/flush.ts

### [Low] `partitionBlobKey` called twice with identical arguments (lines 18, 30)
```ts
const key = partitionBlobKey(entityName, partitionKey);   // line 18
// ...
const entityKey = partitionBlobKey(entityName, partitionKey); // line 30
```
`key` and `entityKey` are identical values. One variable should be used throughout.

No other issues. Migration logic is applied correctly and tombstones are loaded into the store properly.

---

## src/store/types.ts

No issues. The `EntityStore` interface composing `BlobAdapter` with domain-specific operations is a clean design.

---

## src/store/store.ts

### [Medium] `storedMarkerBlob` field is dead code (lines 13, 122–123)
```ts
private storedMarkerBlob: PartitionBlob | null = null;

async write(..., key: string, data: PartitionBlob): Promise<void> {
  if (key === STRATA_MARKER_KEY) {
    this.storedMarkerBlob = data;   // stored here...
    return;
  }
```
`buildMarkerBlob()` never reads `this.storedMarkerBlob`; it always rebuilds the marker from the current partition data. The field is set in `write()` and cleared in `clear()` but never consumed. This is confusing dead code that implies an incomplete feature.

### [Medium] `list()` omits tombstone-only partitions (lines 154–161)
```ts
async list(_tenant, prefix: string): Promise<string[]> {
  for (const key of this.partitions.keys()) {   // ← only partitions, not tombstones
    if (key.startsWith(prefix)) keys.push(key);
  }
}
```
A partition that has had all its entities deleted (only tombstones remain) exists in `this.tombstones` but not in `this.partitions`. `list()` will not return it, so the sync engine's index-building step will not include it, and tombstones in that partition will never be pushed to the remote. This is a data integrity issue: remote peers will never receive deletes for entities in tombstone-only partitions.

### [Medium] `buildMarkerBlob` recomputes `updatedAt: Date.now()` on every call (line 190)
The marker blob is rebuilt dynamically on every `read(__, STRATA_MARKER_KEY)` call. `updatedAt` is always `Date.now()`, meaning the index timestamp changes on every read even when no data has changed. While the sync engine only compares `hash` values for change detection, this makes the index timestamps meaningless and could cause confusion during debugging.

### [Low] `count` semantics differ between in-memory and persisted index
In `buildMarkerBlob`, `hlcMap` contains both live entities (with HLC) **and** tombstones (prefixed with `\0`), so `count: hlcMap.size` = entities + tombstones. In `unified.ts:buildHlcMap`, the same convention is used for the persisted index. However, `PartitionIndexEntry.count` could mislead readers who expect it to represent only live entity count; only `hash` is actually used for correctness.

### [Low] `buildMarkerBlob` skips entities without `hlc` (lines 179–181)
```ts
const hlc = (entity as { hlc?: Hlc }).hlc;
if (hlc) hlcMap.set(id, hlc);
```
Entities without an `hlc` field are silently excluded from the hash. The hash will be different from the one computed by `unified.ts:buildHlcMap` (which assumes all entities have HLCs). This could cause spurious "diverged" detections during sync if entities with missing HLCs exist.

---

## src/strata.ts

### [High] `changePassword` does not verify the old password (lines 258–265)
```ts
async changePassword(oldPassword: string, newPassword: string): Promise<void> {
  // ...
  const rawBytes = await this.storageAdapter.read(tenant, STRATA_MARKER_KEY);
  if (!rawBytes || rawBytes[0] === 0x7B) {
    throw new Error('Current tenant is not encrypted');
  }
  // ← oldPassword is never used to re-derive or verify the current key
  const newMarkerKey = await deriveKey(newPassword, this.config.appId);
```
`oldPassword` is accepted as a parameter but **never verified**. Any caller with access to a `Strata` instance (the encryption is already unlocked in memory) can call `changePassword('wrong', 'attacker_password')` and successfully re-encrypt the storage. The fix is to verify that `oldPassword` can decrypt the existing marker before proceeding.

### [Medium] Magic-byte encryption detection is fragile (line 172)
```ts
if (rawBytes && rawBytes.length > 0 && rawBytes[0] !== 0x7B) {
```
`0x7B` is `{`, the first byte of a JSON object. This heuristic relies on an implicit contract that unencrypted data always starts with `{`. If the serialization format ever changes (e.g., to MessagePack or CBOR) or a valid JSON array is stored, this check silently fails in either direction. A versioned format header would be more robust.

### [Medium] `loadTenant` has no concurrency guard (lines 160–215)
`loadTenant` is async and performs `unloadCurrentTenant()` then loads a new tenant. If called concurrently, both calls complete `unloadCurrentTenant` and then both proceed to load, potentially overwriting each other's `syncScheduler`, interleaving encryption setup, and setting inconsistent state. A simple mutex (e.g., a `Promise` chain or `_loadingPromise` flag) would prevent this.

### [Medium] `sync()` return metrics double-count merged partitions (lines 244–248)
```ts
partitionsSynced: result.changesForA.length + result.changesForB.length,
```
Diverged partitions that were merged appear in **both** `changesForA` and `changesForB`, so they are counted twice in `partitionsSynced`. The metric value reported to the caller is inflated.

### [Low] Non-null assertion on `marker.dek!` (line 284)
```ts
this.encryptionService.setDek(await importDek(marker.dek!));
```
If `marker.dek` is `undefined` (e.g., a non-encrypted tenant whose `markerKey` still returns data), `importDek(undefined!)` will call `atob(undefined)` and throw a confusing error. There should be a guard here consistent with the `if (!marker?.dek)` check in `loadTenant`.

### [Low] `StrataConfig.entities` typed as `EntityDefinition<any>[]`
This is a pragmatic concession for heterogeneous entity arrays, acknowledged with an eslint comment. It is acceptable but it opens the repo methods to type-unsafe usage via the `repoMap`.

---

## src/index.ts

### [Low] Barrel re-export of all sub-packages
`export * from '@strata/sync'` etc. re-exports every internal symbol. There is no public API boundary: internal implementation types (e.g., `SyncQueueItem`, `EntityStore`, `PartitionBlob`) become part of the public surface. Consider restricting exports to consumer-facing types only.

No other issues.
