# Full Repository Review - GPT 5.4

## Executive Summary
The codebase is modular and generally readable, with clear separation between adapters, storage, sync, schema, and repository concerns. The main risks are not stylistic; they cluster around replication correctness, especially stale-index handling, resurrection semantics, and lifecycle state drift between in-memory and persisted state. Several API surfaces also fail open in ways that can silently weaken encryption or misreport dirty state. The smaller foundational modules are mostly sound, but the sync path needs careful hardening because a few bugs there can mask divergence rather than merely delay it.

## Security Findings
- [src/adapter/crypto.ts:25] `deriveKey()` uses only the global `appId` as its PBKDF2 salt, so tenants sharing the same password under one app derive the same marker key. This weakens cross-tenant resistance to offline guessing and correlates password reuse across tenants. (severity: medium)
- [src/adapter/encryption.ts:46] The encryption transform fails open for non-marker blobs when `dek` is unset, returning plaintext bytes instead of rejecting the operation. If an encrypted tenant is accessed before DEK rehydration completes, partitions can be written back unencrypted. (severity: high)
- [src/strata.ts:258] `changePassword(oldPassword, newPassword)` never validates or even reads `oldPassword`. A caller with an already-loaded encrypted tenant can rotate the password without proving knowledge of the current one. (severity: medium)

## Critical Issues
- [src/store/store.ts:19] `setEntity()` does not clear a pre-existing tombstone for the same id. Once an entity is deleted and then recreated, the store can carry both states at once and feed contradictory data into sync.
- [src/sync/merge.ts:89] `mergePartition()` copies both the entity and the tombstone for `localOnly`/`cloudOnly` ids instead of resolving the newer HLC winner. That makes resurrection non-deterministic and can re-delete a legitimately recreated record.
- [src/sync/unified.ts:257] `syncBetween()` skips writing `applyToA` when adapter A is stale, but it still advances indexes on both sides at [src/sync/unified.ts:283]. That allows a stale replica to advertise hashes for data it never received, which can permanently suppress later reconciliation.

## Warnings
- [src/adapter/local-storage.ts:8] `String.fromCharCode(...data)` spreads the entire payload into one call, which will throw on sufficiently large partitions before storage quota is even reached.
- [src/persistence/serialize.ts:8] The `{ __t: 'D', v: string }` marker is not escaped or namespaced, so ordinary user data with that shape is silently revived as a `Date`.
- [src/persistence/hash.ts:24] Sync planning relies on a 32-bit FNV-1a partition hash as an equality signal; a collision can hide real divergence and skip reconciliation.
- [src/store/store.ts:96] Marker reads ignore `storedMarkerBlob` and synthesize a fresh marker from in-memory partitions, dropping persisted metadata such as `entityTypes` and `dek`.
- [src/store/flush.ts:23] `loadPartitionFromAdapter()` calls `migrateBlob()` without the current `entityName`, so entity-scoped migrations are applied too broadly during hydration.
- [src/strata.ts:148] `unloadCurrentTenant()` clears store and encryption state but leaves `tenants.activeTenant$` unchanged, so later operations can target a tenant that is no longer hydrated.
- [src/sync/sync-scheduler.ts:38] The cloud timer clears dirty state after `local -> cloud` without first flushing `memory -> local`, so memory-only changes can be skipped for that cycle and still be reported clean.
- [src/sync/sync-engine.ts:58] Deduplicated sync requests wait for the original work but return `EMPTY_RESULT`, so callers receive a false no-op result instead of the real sync outcome.
- [src/sync/unified.ts:146] `isStale()` only iterates entity names present in the original snapshot, so concurrent creation of the first partition for a previously absent entity can evade stale detection.
- [src/tenant/tenant-manager.ts:63] `create()` does not reject an already-existing tenant id, so caller-provided or derived ids can duplicate list entries while reusing the same storage namespace.
- [src/schema/id.ts:4] `generateId()` uses short `Math.random()`-based ids with no collision check; a collision overwrites an existing entity rather than failing safely.
- [src/repo/query.ts:1] `compareValues()` returns `0` for unsupported comparisons, causing range filters and ordering to treat missing or wrong-typed values as legitimate equals.
- [src/repo/repository.ts:114] `saveMany()` and `deleteMany()` bypass the shared `eventBus`, so higher-level listeners such as the dirty tracker can miss real batch mutations.
- [src/repo/repository.ts:74] Caller-supplied ids are trusted without verifying that they belong to the current repository definition, allowing cross-entity writes through the wrong repository.
- [src/reactive/event-bus.ts:17] `emit()` runs listeners synchronously with no isolation, so one throwing listener can abort later listeners and bubble failure into save or sync flows.

## Suggestions
- Fix resurrection handling at the source and sink together: clear tombstones when recreating an entity, and make merge logic choose a single HLC winner whenever entity and tombstone coexist.
- Rework stale-sync handling so indexes only advance for writes that actually landed, and make stale detection compare the full entity set, including newly introduced entity namespaces.
- Treat encryption as fail-closed: persist a per-tenant salt in the marker blob, require a configured DEK before non-marker reads or writes, and either validate or drop the unused `oldPassword` parameter.
- Route every repository mutation path through one notification mechanism so dirty tracking, observers, and sync scheduling see consistent mutation semantics.

## Positive Observations
- The repository is split into coherent domains with small files and minimal cross-layer leakage in most modules.
- HLC comparison and basic conflict resolution are compact and easy to audit.
- The tenant marker and partition-index design gives the sync engine a clear metadata channel instead of forcing full partition scans on every cycle.
- The incremental transform pipeline around the adapter bridge is straightforward and keeps storage concerns decoupled from higher layers.