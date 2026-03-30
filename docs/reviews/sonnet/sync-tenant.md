# Review: src/sync/, src/tenant/

---

## src/sync/conflict.ts

No issues. Clean last-write-wins resolution using HLC ordering. Both entity-vs-entity and entity-vs-tombstone cases are handled correctly.

---

## src/sync/diff.ts

No issues. Set-based partition diff is correct and readable.

---

## src/sync/dirty-tracker.ts

No issues. `BehaviorSubject` with `distinctUntilChanged` is appropriate for this use case.

---

## src/sync/merge.ts

No issues. Merge correctly handles all four cases: local-only, cloud-only, both-live, and tombstone combinations. Uses `resolveConflict` and `resolveEntityTombstone` for tie-breaking.

---

## src/sync/sync-engine.ts

### [Medium] `drain()` contains a polling busy-wait (lines 155–162)
```ts
async drain(): Promise<void> {
  while (this.queue.length > 0 || this.running) {
    await this.queue[this.queue.length - 1]?.promise.catch(() => {});
    if (this.running && this.queue.length === 0) {
      await new Promise<void>(r => setTimeout(r, 0));
    }
  }
}
```
When `this.running` is `true` but the queue is momentarily empty (between `shift()` and the next item being pushed), the fallback `setTimeout(r, 0)` re-schedules the loop. This can spin in multiple microtask cycles before `running` is set to `false`. A cleaner solution is a `drainPromise` that resolves when `processQueue` finishes.

### [Medium] `processQueue` is fire-and-forget — errors inside the runner body are not propagated (line in `sync()`)
```ts
this.queue.push({ ... });
this.processQueue();   // ← not awaited, no .catch()
```
`processQueue` is an `async` function. If it throws outside the `try/catch` around `item.fn()` (e.g., during queue management), the error becomes an unhandled promise rejection. In practice the inner `try/catch` covers the only failure path, but the outer `async` return value is silently discarded.

### [Low] `emitEntityChanges` assumes key always contains a dot (line 178)
```ts
names.add(c.key.substring(0, c.key.indexOf('.')));
```
If `c.key.indexOf('.')` returns `-1`, `substring(0, -1)` returns `c.key.slice(0, 0)` = `""`. This would emit an event for the empty-string entity name. In practice, all partition blob keys are `entityName.partitionKey`, so this never triggers.

### [Low] Listener array mutated during `emitEvent` iteration is guarded with a snapshot
```ts
for (const listener of [...this.listeners]) {
```
The spread snapshot is correct and safe.

---

## src/sync/sync-scheduler.ts

### [Low] Cloud sync timer does not clear `dirtyTracker` on partial failure
```ts
await this.engine.sync('local', 'cloud', this.tenant);
await this.engine.sync('local', 'memory', this.tenant);
this.dirtyTracker?.clearDirty();
```
If the second sync succeeds but the first fails (caught in the outer `catch`), `clearDirty` is never called. This is correct behavior—the data is still dirty. If only the first sync fails, the catch block fires and `clearDirty` is not reached; that is also correct. The current implementation is fine but the order of operations is worth documenting.

---

## src/sync/types.ts

No issues.

---

## src/sync/unified.ts

### [Medium] `buildHlcMap` makes an unchecked assumption that every entity has an `hlc` field (line ~220)
```ts
function buildHlcMap(...): Map<string, Hlc> {
  for (const [id, entity] of Object.entries(entities)) {
    hlcMap.set(id, (entity as SyncEntity).hlc);   // ← no guard
  }
```
If an entity stored in a partition is malformed (missing `hlc`), `hlcMap` will map the ID to `undefined` as the HLC value. When `partitionHash` later calls `${hlc.timestamp}:${hlc.counter}:${hlc.nodeId}` on an `undefined` HLC, it will produce `"undefined:undefined:undefined"` and the hash will be computed against garbage, causing incorrect change detection.

### [Medium] `planCopies` and `planMerges` await blobs sequentially in a loop
```ts
for (const partitionKey of aOnly) {
  const blob = await adapterA.read(tenant, key);
```
All partition reads within a single entity's plan phase are sequential. For entities with many partitions, all reads to the remote adapter could be parallelized with `Promise.all`. This is a performance concern for cloud-backed adapters with network latency.

### [Low] Stale check re-reads all indexes from adapterA (lines 143–156)
After writing to B, `isStale` loads **all** indexes from A to check if anything changed since the plan was built. This triggers another round-trip to the adapter and re-reads the full `__strata` marker blob. For large index sets over a slow network adapter this is expensive. A lighter check (e.g., compare only the partitions being modified) would reduce latency.

### [Low] `deduplicateChanges` uses first-wins for duplicate keys
```ts
if (!seen.has(change.key)) {
  seen.add(change.key);
  deduped.push(change);
}
```
This is only used for index-update computation (`allChanges`), not for the actual writes. Since merges go to both A and B with the same blob, deduplication is correct here—the first occurrence already contains the merged result.

---

## src/tenant/marker-blob.ts

### [Medium] `writeMarkerBlob` overwrites `createdAt` on every call (line 26)
```ts
const marker: MarkerData = {
  version: 1,
  createdAt: new Date(),   // ← always writes current time
  entityTypes,
```
If `writeMarkerBlob` is called to update only `entityTypes` or `dekBase64`, the original `createdAt` timestamp of the workspace is lost. The function should accept `createdAt` as a parameter or read the existing value before overwriting.

### [Low] `readMarkerBlob` performs unchecked cast (line 46)
```ts
return systemEntities['marker'] as MarkerData | undefined;
```
No schema validation. Corrupted or version-mismatched blobs silently pass through as `MarkerData`, potentially causing property access `undefined` errors at call sites.

---

## src/tenant/tenant-list.ts

### [Low] `loadTenantList` relies on unchecked cast (line 15)
```ts
return Object.values(tenantEntities) as Tenant[];
```
If stored tenant entries are malformed (missing required fields like `id`, `createdAt`), they are returned as valid `Tenant` objects and cause failures at call sites. Minimal validation (check for `id` and `name`) would improve resilience.

---

## src/tenant/tenant-manager.ts

### [High] `generateTenantId` uses `Math.random()` — not cryptographically secure (lines 20–27)
```ts
function generateTenantId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}
```
`Math.random()` is not a CSPRNG. Tenant IDs form part of storage namespace keys. The 8-character base-62 space (~218 trillion) offers reasonable collision resistance but not unpredictability. In applications where the tenant ID is used as an access control token (shared workspace URLs), a predictable ID could allow enumeration. Should use `crypto.getRandomValues()`.

### [Medium] `create` has a TOCTOU window for duplicate ID detection (lines 65–75)
Between `getList()` and `persistList()`, a concurrent call to `create` with the same derived ID could also pass the duplicate check and create two entries. In single-threaded browser environments this is low likelihood, but the lack of any atomic compare-and-set is an architectural gap.

### [Medium] `delete` has no transactional rollback (lines 170–182)
```ts
const keys = await this.adapter.list(tenant, '');
for (const key of keys) {
  await this.adapter.delete(tenant, key);   // ← if this fails mid-way...
}
const filtered = tenants.filter(t => t.id !== tenantId);
await this.persistList(filtered);   // ← tenant removed from list
```
If `adapter.delete` fails partway, the tenant is not removed from the list (the function throws before `persistList`). However, if all deletes succeed but `persistList` fails, the data is deleted but the tenant remains in the list—a dangling reference. Consider deleting the list entry first (marking as deleted) and then cleaning up data.

### [Low] Tenant list cache (`cachedList`) can become stale across Strata instances
If two `TenantManager` instances share the same underlying storage (e.g., two iframes or tabs), one instance's cache will not reflect changes the other makes. For a library targeting browsers this is a documented limitation, but it should be noted.

---

## src/tenant/tenant-prefs.ts

No issues.

---

## src/tenant/tenant-sync.ts

### [Low] `mergeTenantLists` uses `Date` `>` comparison (line 18)
```ts
if (!existing || tenant.updatedAt > existing.updatedAt) {
```
`Date` objects returned from the JSON reviver support `>` comparison via `valueOf()`. This is correct, but only works if both values are proper `Date` objects (i.e., the reviver was applied during deserialization). If a tenant entry arrived without the custom reviver being applied, `updatedAt` could be a string, and string comparison would produce incorrect results.

---

## src/tenant/types.ts

No issues.
