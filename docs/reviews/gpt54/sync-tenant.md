# Review: sync and tenant

### src/sync/types.ts
No issues found.

### src/sync/sync-scheduler.ts
- High: the cloud interval job runs `local -> cloud` and then clears `dirtyTracker`, but it never flushes `memory -> local` first. A write that exists only in memory when the cloud timer fires can be skipped for that cycle and still have the dirty flag cleared, which misreports persistence state and can delay or lose expected cloud propagation.

### src/sync/sync-engine.ts
- Warning: when a sync request is deduplicated against an already queued identical request, `sync()` waits for the original promise but returns `EMPTY_RESULT` instead of the original operation's real `SyncBetweenResult`. Any caller relying on the returned counts or `maxHlc` gets a false no-op result.

### src/sync/merge.ts
- Critical: `mergePartition()` blindly copies both the entity and the tombstone for `localOnly` or `cloudOnly` ids. If one replica contains a resurrected entity alongside a stale tombstone, the merged result preserves both instead of choosing the newer HLC winner, so resurrection can be undone on the next reconciliation.

### src/sync/index.ts
No issues found.

### src/sync/dirty-tracker.ts
No issues found.

### src/sync/diff.ts
No issues found.

### src/sync/conflict.ts
No issues found.

### src/sync/unified.ts
- Critical: `syncBetween()` skips `applyToA` when adapter A is detected as stale, but it still writes merged index updates back to both sides. That lets adapter A advertise hashes for data it never actually received, so later sync planning can treat the stale side as up to date and stop reconciling the missing changes.
- High: `isStale()` only iterates entity names present in the original snapshot. If a concurrent write creates the first partition for an entity that was absent from the snapshot, the stale check misses it entirely.

### src/tenant/types.ts
No issues found.

### src/tenant/tenant-sync.ts
No issues found.

### src/tenant/tenant-prefs.ts
No issues found.

### src/tenant/tenant-manager.ts
- Warning: `create()` does not check whether the chosen tenant id already exists. When `opts.id` or `deriveTenantId()` returns an existing id, the method appends a duplicate entry to the tenant list and reuses the same storage namespace, leaving list metadata inconsistent with the underlying workspace.

### src/tenant/tenant-list.ts
No issues found.

### src/tenant/marker-blob.ts
No issues found.

### src/tenant/index.ts
No issues found.
