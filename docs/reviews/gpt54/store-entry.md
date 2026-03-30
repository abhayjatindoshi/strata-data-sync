# Review: store and entrypoints

### src/store/types.ts
No issues found.

### src/store/store.ts
- Critical: `setEntity()` never clears an existing tombstone for the same id. If an entity is deleted and then recreated, the store can hold both a live record and a tombstone simultaneously, and the merge layer will propagate both. That makes resurrection non-deterministic and can cause the recreated record to be deleted again during later sync.
- Warning: marker writes are stored in `storedMarkerBlob`, but `read(__strata)` ignores that cached blob and always synthesizes a new marker with empty `entityTypes` and no `dek`. Any metadata written into the in-memory marker is therefore lost on read-back.

### src/store/index.ts
No issues found.

### src/store/flush.ts
- Correctness: `loadPartitionFromAdapter()` calls `migrateBlob(blob, migrations)` without the current `entityName`, so entity-scoped migrations are not actually scoped during hydration. A migration intended for one entity can therefore rewrite unrelated partitions when they are loaded into memory.

### src/store/flush-scheduler.ts
No issues found.

### src/strata.ts
- High: `unloadCurrentTenant()` clears the in-memory store and encryption state, but it never clears `tenants.activeTenant$`. Calling `loadTenant(undefined)` or disposing after unload leaves the instance reporting a tenant as active even though its data has been torn down, which can route later syncs and repository operations against a stale tenant id.
- Warning: `changePassword(oldPassword, newPassword)` never reads or validates `oldPassword`. The API suggests re-authentication, but any caller with a loaded encrypted tenant can rotate the password without proving knowledge of the current one.

### src/index.ts
No issues found.
