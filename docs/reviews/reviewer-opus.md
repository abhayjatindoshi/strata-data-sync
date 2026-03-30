# Full Repository Review — Claude Opus 4.6

## Executive Summary

Strata Data Sync V3 is a well-structured offline-first data synchronization library with clean module separation, proper TypeScript usage, and a solid HLC-based conflict resolution system. The codebase demonstrates good architectural decisions — the adapter bridge pattern, 2-level encryption (marker key + DEK), and 3-phase sync engine are well-designed. However, there are two high-severity bugs in `Repository.saveMany()`/`deleteMany()` that bypass the EventBus, a sync queue deduplication bug that ignores tenant context, and several medium-severity issues around crash safety, encryption detection brittleness, and unbounded tombstone growth. Overall code quality is high with relatively few but substantive issues.

## Security Findings

- [src/adapter/crypto.ts:11] PBKDF2 iteration count of 100,000 is below OWASP-recommended 600,000+ for SHA-256 (severity: medium)
- [src/adapter/crypto.ts:36] PBKDF2 salt derived solely from appId — no randomness; enables precomputed dictionary attacks across users of the same app (severity: medium)
- [src/adapter/encryption.ts:48-50] Silent fallback to no encryption when DEK is null — data may be written in plaintext without any warning if encryption setup is incomplete (severity: high)
- [src/adapter/encryption.ts:43] Tenant list (`__tenants`) is explicitly unencrypted, potentially leaking tenant metadata (severity: low)
- [src/strata.ts:252-256] `changePassword()` does not verify the old password — caller with a Strata instance reference can change the password without authentication (severity: medium)
- [src/schema/id.ts:4-9] Entity ID generation uses `Math.random()` — not cryptographically secure; collision could silently overwrite data (severity: low)
- [src/tenant/tenant-manager.ts:25-30] Tenant ID generation uses `Math.random()` — same issue; collision could cause cross-tenant data corruption (severity: medium)

## Critical Issues

- [src/repo/repository.ts:113-117] **`saveMany()` bypasses EventBus**: Calls `this.changeSignal.next()` instead of `this.eventBus.emit()`. The DirtyTracker is never notified, so batch-saved data won't be flagged for sync. Other cross-component listeners also miss the notification.
- [src/repo/repository.ts:133-142] **`deleteMany()` bypasses EventBus**: Same bug as `saveMany()` — uses local signal instead of EventBus, so batch deletes won't trigger dirty tracking or sync.
- [src/sync/sync-engine.ts:55-60] **Queue deduplication ignores tenant**: Dedup check only matches `source`+`target`, not tenant. If two different tenants request the same sync direction, the second sync is incorrectly skipped and receives `EMPTY_RESULT`.

## Warnings

- [src/adapter/local-storage.ts:8] `toBase64()` uses spread operator on arbitrarily large `Uint8Array` — will throw `RangeError: Maximum call stack size exceeded` for blobs larger than ~100KB
- [src/adapter/local-storage.ts:34] No error handling for `localStorage.setItem()` when quota is exceeded
- [src/strata.ts:168-169] Encryption detection via magic byte `0x7B` (`{`) is brittle — will break if serialization format changes
- [src/strata.ts:57] `tombstoneRetentionMs` option is accepted in config but never implemented — tombstones grow unboundedly
- [src/strata.ts:219-225] `sync()` return value only reports `local→cloud` results, not the full `memory→local→cloud→memory` round-trip
- [src/strata.ts:189-191] Cloud sync failure during `loadTenant()` is silently swallowed — only emits a generic `cloud-unreachable` event
- [src/store/store.ts:159] `list()` only iterates `partitions`, missing keys that have only tombstones — could prevent tombstone propagation during sync
- [src/sync/unified.ts:250-261] Index updates are not atomic with data writes — crash between write and index update causes stale indexes
- [src/sync/sync-scheduler.ts:28-47] `setInterval` doesn't account for operation duration — sync operations can pile up if I/O is slow
- [src/persistence/partition-index.ts:21-39] `saveAllIndexes` has read-modify-write race condition under concurrent access
- [src/tenant/tenant-sync.ts:29-34] `pushTenantList()` overwrites cloud tenant list without merging — potential data loss
- [src/tenant/marker-blob.ts:19-36] `writeMarkerBlob()` creates fresh marker with `indexes: {}`, discarding existing index data
- [src/tenant/tenant-manager.ts:169-177] `delete()` is not crash-safe — partial data deletion leaves orphaned tenant in list
- [src/tenant/tenant-sync.ts:21] Date comparison in `mergeTenantLists` may fail after deserialization if reviver doesn't restore Date objects consistently

## Suggestions

- [src/adapter/crypto.ts] Consider using `crypto.getRandomValues()` for generating a random salt, storing it alongside the encrypted marker blob
- [src/sync/unified.ts:76-98] Parallelize blob reads in `planCopies` for high-latency adapters (cloud)
- [src/store/flush-scheduler.ts] File is empty except for a comment — consider removing
- [src/store/store.ts:130-135] Consider documenting that `write()` via BlobAdapter interface intentionally doesn't track dirty state
- [src/repo/query.ts:1-12] `compareValues` should log a warning or handle boolean types explicitly rather than silently returning 0
- [src/tenant/tenant-manager.ts:52] Consider cache invalidation strategy for multi-tab browser scenarios

## Positive Observations

- **Clean module architecture**: Each module has clear boundaries with `types.ts`, implementation files, and `index.ts` barrel exports
- **Consistent readonly annotations**: Types use `readonly` and `ReadonlyArray` consistently, preventing accidental mutation
- **Defensive copying**: Both `MemoryBlobAdapter` (`structuredClone`) and `MemoryStorageAdapter` (`.slice()`) properly copy data to prevent aliasing bugs
- **HLC implementation**: Correct hybrid logical clock with proper total ordering, tie-breaking by nodeId
- **2-level encryption**: The marker-key + DEK scheme allows password changes without re-encrypting all data
- **Adapter bridge pattern**: Clean separation between storage adapters and blob adapters with composable transforms
- **Event bus safety**: Spreading listeners before iteration in `emit()` prevents modification-during-iteration bugs
- **Sync engine queue**: Serial processing with deduplication prevents concurrent conflicting writes
- **Migration system**: Version-ordered, entity-filtered blob migrations with proper `__v` tracking
