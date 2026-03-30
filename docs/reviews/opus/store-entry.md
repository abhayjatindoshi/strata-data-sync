# Review: store/, strata.ts, index.ts

## src/store/types.ts

### [types.ts:4] EntityStore extends BlobAdapter — tight coupling (low)
`EntityStore` extends `BlobAdapter`, making the in-memory store also serve as a blob adapter for the sync engine. While pragmatic, this couples the storage abstraction tightly with the sync mechanism and means any changes to `BlobAdapter` force changes to `EntityStore`.

## src/store/flush-scheduler.ts
No issues found. File contains only a comment indicating removal — dead code file that could be deleted.

## src/store/flush.ts
No issues found. Clean partition loading with migration support.

## src/store/store.ts

### [store.ts:159] `list()` omits partition keys that have only tombstones (medium)
```ts
async list(_tenant: Tenant | undefined, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  for (const key of this.partitions.keys()) {
    if (key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}
```
Only iterates `this.partitions`, not `this.tombstones`. If a partition has all entities deleted (only tombstones remain), it won't appear in `list()`. This could cause sync to miss deleted partitions, failing to propagate deletes to the cloud.

### [store.ts:130-135] `write()` through BlobAdapter interface doesn't mark dirty (medium)
When partitions are written through the BlobAdapter `write()` method (e.g., during sync), `dirtyKeys` is not updated. This is likely intentional (sync shouldn't trigger re-sync), but it means external code writing through the BlobAdapter interface gets no dirty tracking.

### [store.ts:173-195] `buildMarkerBlob` relies on entity having `.hlc` property (low)
```ts
const hlc = (entity as { hlc?: Hlc }).hlc;
```
Unsafe type assertion. If entities don't have an `hlc` field (which shouldn't happen in practice given the schema), the hash computation will include `undefined` values.

### [store.ts:99-100] `read()` returns null for marker key when partitions are empty (low)
When called with `STRATA_MARKER_KEY`, `buildMarkerBlob` returns the blob even if there are no partitions. But for regular keys, it returns `null` when both partition and tombstones are empty. This asymmetry is correct but worth noting.

## src/strata.ts

### [strata.ts:168-169] Encryption detection via magic byte is brittle (high)
```ts
if (rawBytes && rawBytes.length > 0 && rawBytes[0] !== 0x7B) {
```
Detecting encryption by checking if the first byte is not `{` (0x7B) is fragile. If the serialization format changes to use binary encoding, CBOR, or MessagePack, this check will incorrectly report unencrypted data as encrypted, or vice versa.

### [strata.ts:57] `tombstoneRetentionMs` option accepted but never used (medium)
The `StrataOptions` type defines `tombstoneRetentionMs` but it is never read or implemented anywhere in the codebase. Tombstones accumulate indefinitely, which will cause unbounded storage growth over time.

### [strata.ts:219-225] `sync()` return value reports misleading metrics (medium)
```ts
return {
  entitiesUpdated: result.changesForB.length,
  conflictsResolved: result.changesForA.length,
  partitionsSynced: result.changesForA.length + result.changesForB.length,
};
```
This only reports the `local→cloud` sync result. The preceding `memory→local` and subsequent `local→memory` syncs also produce changes, which are not reflected. The `conflictsResolved` field counts `changesForA` which are changes from cloud back to local, not necessarily conflicts.

### [strata.ts:252-256] `changePassword` doesn't verify old password first (medium)
```ts
async changePassword(oldPassword: string, newPassword: string): Promise<void> {
```
The `oldPassword` parameter is never used to verify the caller's identity. The method trusts that the current encryption service is already set up with the correct key. A malicious caller who has a reference to the Strata instance could change the password without knowing the old one.

### [strata.ts:189-191] Cloud sync failure silently swallowed during loadTenant (medium)
```ts
} catch {
  this.syncEngine.emit({ type: 'cloud-unreachable' });
}
```
When cloud sync fails during tenant load, the error is caught and replaced with an event. The user gets no indication of which error occurred (network, auth, corrupt data, etc.).

## src/index.ts
No issues found. Clean barrel re-exports.
