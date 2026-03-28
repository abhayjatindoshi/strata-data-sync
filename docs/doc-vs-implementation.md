# Doc vs Implementation Analysis

Generated: 2026-03-27T03:10:00Z
Updated: 2026-03-27T12:00:00Z

Issue codes: `DM` = Design Mismatch, `MD` = Missing Documentation, `DO` = Doc-Only (not implemented)

---

## Design Mismatches (doc says X, implementation does Y)

### HIGH severity

| Code | Module | Doc | Doc says | Implementation does | Status |
|---|---|---|---|---|---|
| DM-1 | Adapter | [adapter.md](adapter.md) | Transform example uses `compress()` function | Actual function is `gzipTransform()` in `src/adapter/gzip.ts` | **FIXED** |
| DM-2 | Schema | [schema-repository.md](schema-repository.md) | `Repository<T>` return types are `T \| undefined` | Returns `(T & BaseEntity) \| undefined` | **FIXED** |
| DM-3 | Schema | [schema-repository.md](schema-repository.md) | `SingletonRepository<T>` return types are `T \| undefined` | Returns `(T & BaseEntity) \| undefined` | **FIXED** |
| DM-4 | Schema | [schema-repository.md](schema-repository.md) | `SingletonRepository.save(entity: T): void` | Signature is `save(entity: T & Partial<BaseEntity>): void` | **FIXED** |
| DM-5 | Schema | [schema-repository.md](schema-repository.md) | Entity migration via `defineEntity({ version: 2, migrations: {...} })` | Migration is blob-level via `BlobMigration` | **FIXED** |
| DM-6 | Sync | [persistence-sync.md](persistence-sync.md) | Stale detection: re-check metadata after merge, skip ops if local changed during sync | Not implemented — `syncBetween` has no re-check logic | Open |
| DM-7 | HLC | [persistence-sync.md](persistence-sync.md) | `tickRemote()` called on merge with remote data | `tick()` now called during `syncBetween` merge to advance local HLC | **FIXED** |

### MEDIUM severity

| Code | Module | Doc | Doc says | Implementation does | Status |
|---|---|---|---|---|---|
| DM-8 | Adapter | [adapter.md](adapter.md) | `EncryptionHeader` type implies single serialized blob `{ salt, encryptedDek, version }` | Salt and DEK stored as separate keys (`__strata_salt`, `__strata_dek`); `version` field never persisted | Open |
| DM-9 | Sync | [persistence-sync.md](persistence-sync.md) | `SyncResult.entitiesUpdated` — name implies entity count | Value is `partitionsCopied` count — different unit than name suggests | Open |
| DM-10 | Sync | [persistence-sync.md](persistence-sync.md) | `SyncResult.conflictsResolved` — implies count of actual conflicts | Counts all entities in merged partitions, including non-conflicted entities from localOnly/cloudOnly | Open |
| DM-11 | Sync | [persistence-sync.md](persistence-sync.md) | Directional flows: cloud→local→memory, memory→local, local→cloud | `syncBetween()` always does bidirectional merge; the directional distinction is lost | Open |
| DM-12 | Sync | [persistence-sync.md](persistence-sync.md) | Store described as separate from adapters | `EntityStore` implements `BlobAdapter` interface — store is a full adapter peer, not documented as such | Open |
| DM-13 | Strata | [lifecycle.md](lifecycle.md) | `BlobMigration` support in `StrataConfig.migrations` | Field defined but never passed to `loadPartitionFromAdapter()` — dead code, migrations never execute | Open |
| DM-14 | HLC | [persistence-sync.md](persistence-sync.md) | `createHlc()` type comment: `timestamp: number // max(wall clock, last known timestamp)` | Initial timestamp is `0`, not wall clock. Comment describes runtime principle, not initial state | **FIXED** (documented) |

### MINOR severity

| Code | Module | Doc | Doc says | Implementation does | Status |
|---|---|---|---|---|---|
| DM-15 | Lifecycle | [lifecycle.md](lifecycle.md), [decisions.md](decisions.md) | Flush is "debounced 2s idle" / "1s idle" | `SyncScheduler` uses `setInterval(2000)` — periodic, not debounced | **FIXED** |
| DM-16 | Tenant | [tenant.md](tenant.md) | Marker blob indexes shown populated with partition data | `writeMarkerBlob()` initializes `indexes: {}` as empty object | **FIXED** |
| DM-17 | Sync | [persistence-sync.md](persistence-sync.md) | Sync lock dedup checks `source === source && target === target` | All `enqueue()` calls pass identical source/target — `target` parameter serves no purpose | **FIXED** — `SyncEngine` now uses `SyncLocation` (`'memory' \| 'local' \| 'cloud'`) as distinct `source` and `target` params |

---

## Missing Documentation (features exist but are undocumented)

| Code | Feature | Source file | Relevant doc | Description | Status |
|---|---|---|---|---|---|
| MD-1 | `gzipTransform()` | `src/adapter/gzip.ts` | [adapter.md](adapter.md) | Exported gzip transform using Compression Streams API | **FIXED** |
| MD-2 | Low-level crypto functions | `src/adapter/crypto.ts` | [adapter.md](adapter.md) | `deriveKek`, `generateDek`, `wrapDek`, `unwrapDek`, `encrypt`, `decrypt`, `InvalidEncryptionKeyError` | **FIXED** |
| MD-3 | `EncryptionContext` type properties | `src/adapter/encryption.ts` | [adapter.md](adapter.md) | Type has `dek`, `salt`, `encrypt`, `decrypt` fields | **FIXED** |
| MD-4 | `EncryptionHeader` type | `src/adapter/crypto.ts` | [adapter.md](adapter.md) | Exported public type but never mentioned in docs | **FIXED** (covered in key storage section) |
| MD-5 | Query helper functions | `src/repo/query.ts` | [schema-repository.md](schema-repository.md) | `applyWhere`, `applyRange`, `applyOrderBy`, `applyPagination` | **FIXED** |
| MD-6 | `saveMany`/`deleteMany` event semantics | `src/repo/repository.ts` | [schema-repository.md](schema-repository.md) | Batch signal emission behavior | **FIXED** |
| MD-7 | `TenantManagerOptions.entityTypes` | `src/tenant/types.ts` | [tenant.md](tenant.md) | Optional field passed to `writeMarkerBlob()` on create | **FIXED** |
| MD-8 | Tenant list caching | `src/tenant/tenant-manager.ts` | [tenant.md](tenant.md) | Cache invalidation strategy | **FIXED** |
| MD-9 | `saveTenantPrefs`/`loadTenantPrefs` | `src/tenant/tenant-prefs.ts` | [tenant.md](tenant.md) | Functions for updating tenant prefs | **FIXED** |
| MD-10 | Tenant sync functions | `src/tenant/tenant-sync.ts` | [tenant.md](tenant.md) | `mergeTenantLists`, `pushTenantList`, `pullTenantList` | **FIXED** |
| MD-11 | `validateMarkerBlob` | `src/tenant/marker-blob.ts` | [tenant.md](tenant.md) | Public validation function | **FIXED** |
| MD-12 | `SyncBetweenResult` type | `src/sync/unified.ts` | [persistence-sync.md](persistence-sync.md) | Result type fields documented | **FIXED** |
| MD-13 | `tickRemote()` usage guidance | `src/hlc/hlc.ts` | [persistence-sync.md](persistence-sync.md) | Guidance on when apps should use it | **FIXED** |
| MD-14 | HLC post-merge semantics | `src/sync/merge.ts` | [persistence-sync.md](persistence-sync.md) | Winner keeps original HLC, no new timestamp on merge | **FIXED** |
| MD-15 | `createHlc()` initial state | `src/hlc/hlc.ts` | [persistence-sync.md](persistence-sync.md) | Starts at timestamp 0, first `tickLocal()` advances to wall clock | **FIXED** |

---

## Doc-only Concepts (documented but not implemented)

| Code | Feature | Doc | Status |
|---|---|---|---|
| DO-1 | `compress()` transform function | [adapter.md](adapter.md) | **FIXED** — replaced with `gzipTransform()` |
| DO-2 | Entity-level `version` + `migrations` on `defineEntity` | [schema-repository.md](schema-repository.md) | **FIXED** — replaced with `BlobMigration` docs |
| DO-3 | `migrateEntity(entity, storedVersion, targetVersion, migrations)` | [schema-repository.md](schema-repository.md) | **FIXED** — replaced with `migrateBlob()` docs |
| DO-4 | Stale detection (re-check metadata after merge) | [persistence-sync.md](persistence-sync.md) | Open — not implemented in `syncBetween` or `syncMergePhase` |
| DO-5 | `tickRemote()` in framework merge flow | [persistence-sync.md](persistence-sync.md) | **FIXED** — merged into `tick()`, wired into `syncBetween` |
| DO-6 | Background/scheduled tenant list sync | [tenant.md](tenant.md) | **FIXED** — doc updated to state manual invocation required |

---

## Open Design Questions

Items to review and resolve. Each may result in code changes, doc updates, or acceptance as-is.

| # | Topic | Related issues | Status |
|---|---|---|---|
| Q-1 | HLC: `tickLocal`/`tickRemote` merged into `tick()`, wired into sync merge flow | DM-7, DM-14, DO-5, MD-13, MD-15 | **Resolved** |
| Q-2 | Sync workflow: `syncBetween` is always bidirectional, directional model in docs is misleading | DM-11 | Pending |
| Q-3 | SyncResult: field names (`entitiesUpdated`, `conflictsResolved`) don't match their actual values | DM-9, DM-10 | Pending |
| Q-4 | Sync lock: `target` parameter is vestigial, all calls pass `source === target` | DM-17 | **Resolved** — `SyncEngine` replaces `SyncLock` with proper `source`/`target` locations |
| Q-5 | Encryption: doc implies single header blob, implementation uses two separate keys; no `version` persisted | DM-8 | Pending |
| Q-6 | Migrations: `StrataConfig.migrations` exists but is dead code — never wired to `loadPartitionFromAdapter` | DM-13 | Pending |
| Q-7 | Tenant manager: no auto-reload, no cloud sync, no freshness check on `load()` | DO-6 (partially fixed) | Pending |
