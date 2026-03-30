# Full Repository Review — Claude Sonnet 4.6

## Executive Summary

The `strata-data-sync-v3` codebase is a well-structured TypeScript library for offline-first, multi-tenant data synchronization. The overall architecture — HLC-based conflict resolution, transform pipelines, a clean adapter abstraction, and a reactive observable layer — is sound and consistent. The most significant concerns are concentrated in three areas: (1) cryptographic weaknesses that reduce the security guarantees of the encryption feature, (2) a pair of bugs in `Repository.saveMany`/`deleteMany` that silently skip dirty-tracking, causing mutations to go unsynced until an unrelated event, and (3) the HLC implementation lacking drift protection, which allows a rogue node to permanently corrupt timestamp ordering across the cluster.

---

## Security Findings

- **[src/adapter/crypto.ts:38–41] PBKDF2 uses `appId` as salt — severity: high**  
  The PBKDF2 salt is the application-wide `appId` constant, not a random per-user value. All users of the same application who choose the same password will derive the **identical key-encryption key**. This invalidates the primary purpose of a PBKDF2 salt (resistance to offline dictionary attacks and cross-user rainbow tables). The fix is to generate a random 16-byte salt per tenant/credential, store it alongside the encrypted DEK, and pass it to `deriveKey`.

- **[src/strata.ts:258] `changePassword` never verifies the old password — severity: high**  
  The `oldPassword` parameter is accepted but never used to re-derive or verify the current key. Any caller holding a reference to an already-unlocked `Strata` instance can change the encryption password without proving knowledge of the old one. The current marker blob is re-encrypted with the new key without any authentication of the caller's identity.

- **[src/adapter/encryption.ts:44–47] Silent encryption bypass when DEK is null — severity: high**  
  When `this.dek === null`, `toTransform().encode` returns plaintext data silently. Entity partition blobs written while the DEK is unset are persisted unencrypted. `isConfigured` checks only for `markerKey`, not `dek`, giving false confidence to calling code.

- **[src/adapter/local-storage.ts:7–9] `btoa(String.fromCharCode(...data))` — stack overflow for large blobs — severity: medium**  
  Spreading a large `Uint8Array` as function arguments exceeds V8's call-stack argument limit (~65 536). For large partition blobs this causes a `RangeError` at runtime. The same pattern in `crypto.ts` is safe only because it is applied to a fixed 32-byte key.

- **[src/tenant/tenant-manager.ts:22–27] `Math.random()` used for tenant ID generation — severity: medium**  
  Tenant IDs are used as storage namespace prefixes. In applications that use tenant IDs as shareable capability tokens (e.g., shared workspace URLs), `Math.random()` IDs are predictable and enumerable. Should use `crypto.getRandomValues()`.

- **[src/schema/id.ts:4–9] `Math.random()` used for entity ID generation — severity: medium**  
  Same issue as tenant IDs. Applications treating entity IDs as access tokens (shareable document IDs) are vulnerable to guessing. Use `crypto.getRandomValues()`.

- **[src/persistence/serialize.ts:31–33] No schema validation on deserialization — severity: medium**  
  `deserialize<T>` casts the result of `JSON.parse` directly to `T` without runtime validation. Malformed or attacker-controlled storage data can produce unexpected object shapes that propagate as valid `T` instances, causing type-confusion errors deep in the call stack (OWASP A08 — Software and Data Integrity Failures).

- **[src/adapter/crypto.ts:92–107] `decrypt` lacks minimum buffer length guard — severity: low**  
  Calling `decrypt` with fewer than 13 bytes (`1` version byte + `12` IV bytes) produces an opaque WebCrypto error rather than a clear `InvalidEncryptionKeyError`. A length guard upfront would improve debuggability.

---

## Critical Issues

- **[src/repo/repository.ts:107–111] `saveMany` bypasses the event bus — dirty tracking not triggered**  
  `save()` calls `this.eventBus.emit(...)`, which notifies `Strata.dirtyFlushListener` to mark the store dirty. `saveMany()` calls `this.changeSignal.next()` directly, bypassing the event bus completely. After a `saveMany()` call, `Strata.isDirty` remains `false`, the automatic flush scheduler is not triggered and data accumulates in memory without being persisted. Internally-facing reactive subscribers receive the signal, but the `DirtyTracker` does not.

- **[src/repo/repository.ts:129–135] `deleteMany` has the same event bus bypass**  
  Bulk deletes written as tombstones via `deleteMany()` do not mark the store dirty, for the exact same reason as `saveMany`. Tombstones from bulk deletes will not be persisted until an unrelated event triggers a flush.

- **[src/store/store.ts:154–161] `list()` omits tombstone-only partitions**  
  A partition with all entities deleted exists only in `this.tombstones`, not `this.partitions`. `list()` iterates only `this.partitions.keys()`, so tombstone-only partitions are invisible to the sync engine's index-building step and their tombstones are **never pushed to remote peers**. Remote nodes will never receive delete notifications for those entities.

---

## Warnings

- **[src/hlc/hlc.ts] No HLC clock-drift detection or capping**  
  Standard HLC implementations (Kulkarni & Demirbas 2014) enforce a maximum drift bound: if a received remote timestamp exceeds `Date.now()` by more than a configurable threshold, the node rejects or warns. Without this, a single misconfigured or malicious node can push the HLC timestamp arbitrarily far into the future, permanently corrupting chronological ordering for all nodes that subsequently sync with it.

- **[src/strata.ts:160] `loadTenant` has no concurrency guard**  
  Concurrent calls to `loadTenant` will both run `unloadCurrentTenant()`, then both proceed to set up their respective tenant contexts, set `syncScheduler`, and call `this.tenants.activeTenant$.next(...)`. The final active tenant is whichever call resolved last, with the loser's scheduler running orphaned in the background. A mutex or load-lock is needed.

- **[src/tenant/tenant-manager.ts:170–182] `delete` is non-atomic: data can be deleted while tenant remains listed**  
  If all `adapter.delete` calls succeed but the subsequent `persistList` fails, the tenant's data is wiped but the tenant still appears in the list — a dangling reference with no recoverable data. The tenant list entry should be marked for deletion before cleaning up data.

- **[src/strata.ts:172] Magic-byte encryption detection `rawBytes[0] !== 0x7B`**  
  Relying on `{` as the sole indicator of unencrypted JSON is an undocumented implicit contract. A format version byte in the serialized output would be more robust and easier to evolve.

- **[src/store/store.ts:122–123] `storedMarkerBlob` is dead code**  
  Written in `write(STRATA_MARKER_KEY, ...)` but never read. The in-memory store always rebuilds the marker blob dynamically in `buildMarkerBlob()`. The field and the write path create the false impression of round-trippable marker state.

- **[src/tenant/marker-blob.ts:26] `writeMarkerBlob` resets `createdAt` on every call**  
  Every invocation writes `createdAt: new Date()`, discarding the original workspace creation timestamp. Subsequent writes (e.g., to update entity types) silently reset the workspace age.

- **[src/sync/sync-engine.ts:155–162] `drain()` polling busy-wait under pathological conditions**  
  The `setTimeout(r, 0)` fallback in `drain()` can repeatedly reschedule while `this.running` is `true` and the queue is momentarily empty, spinning across multiple microtask cycles before the queue runner sets `running = false`.

- **[src/adapter/encryption.ts:60–64] Silent `decode` bypass when DEK is null returns ciphertext as plaintext**  
  When `!this.dek` and encrypted partition data arrives during decoding, the raw ciphertext bytes are returned instead of decrypted plaintext. The deserializer will then receive garbage bytes and throw an opaque error rather than `InvalidEncryptionKeyError`.

- **[src/sync/unified.ts:~220] `buildHlcMap` makes an unguarded HLC field assumption**  
  `(entity as SyncEntity).hlc` is accessed without checking whether the field exists. A malformed or migrated entity missing an `hlc` field causes `undefined` to be stored in the HLC map, producing hash values computed against `"undefined:undefined:undefined"` strings and causing incorrect change detection.

---

## Suggestions

- **[src/repo/repository.ts:14–17] `parseEntityKey` with no dot should throw, not silently return `""`**  
  A malformed entity ID (no dot) causes `substring(0, -1)` = `""`, and `store.getEntity("", id)` silently returns `undefined`. Throwing a clear error on invalid input would surface bugs earlier.

- **[src/schema/define-entity.ts:31–35] `deriveId` should also reject colons and null bytes**  
  The colon character (`:`) is used as the tenant prefix separator in `LocalStorageAdapter` and `MemoryStorageAdapter`. An entity ID containing `:` would collide with another tenant's namespace. The validation should be expanded.

- **[src/adapter/local-storage.ts:52–60] `list()` O(n) over all localStorage keys**  
  Every call scans the entire localStorage, including keys from unrelated libraries. This degrades over time in heavily-loaded localStorage environments. Documented or mitigated with a note in the README.

- **[src/persistence/hash.ts:5–20] DRY: `fnv1a` can delegate to `fnv1aAppend`**  
  `fnv1a(input)` is identical to `fnv1aAppend(FNV_OFFSET, input)`. The duplication is minor but unnecessary.

- **[src/store/store.ts:190] `buildMarkerBlob` sets `updatedAt: Date.now()` on every read**  
  The timestamp changes on every `read(_, STRATA_MARKER_KEY)` even when no data changed. This makes index timestamps non-meaningful for debugging and diagnostics.

- **[src/strata.ts:244–248] `partitionsSynced` double-counts merged partitions**  
  `changesForA.length + changesForB.length` counts diverged (merged) partitions twice, inflating the metric.

- **[src/store/flush.ts:18,30] `partitionBlobKey` called twice with identical arguments**  
  `key` and `entityKey` are the same value; the second call is redundant.

- **[src/repo/repository.ts:137–155] `query()` collects all entities before applying `limit`**  
  For entities with many partitions, an early termination once `limit` entities are collected would significantly reduce allocations and iteration cost.

- **[src/sync/unified.ts] `planCopies` and `planMerges` read blobs sequentially**  
  Partition blob reads within each entity's plan phase are sequential `await`-in-loop. Batching with `Promise.all` would reduce sync latency against network-backed adapters.

- **[src/index.ts] Barrel re-export exposes all internal types as public API**  
  `SyncQueueItem`, `EntityStore`, `PartitionBlob`, and other implementation-internal types are part of the published surface. Consider explicit public-API re-exports.

- **[src/adapter/crypto.ts:92] `decrypt` should validate minimum buffer length**  
  A length guard before accessing `data[0]` and slicing would provide a clear `InvalidEncryptionKeyError` instead of an opaque WebCrypto failure.

---

## Positive Observations

- **Clean layered architecture**: The separation of adapter, persistence, store, sync, repo, schema, and tenant layers is clear and consistent. Each layer has a well-defined responsibility and depends only on the layers below it.
- **HLC-based last-write-wins is correctly implemented**: `tick`, `compareHlc`, `resolveConflict`, and `resolveEntityTombstone` are all correct and match the theoretical model. The entity-vs-tombstone resolution handles all four edge cases properly.
- **Defensive cloning in memory adapters**: `MemoryBlobAdapter` uses `structuredClone` and `MemoryStorageAdapter` uses `slice()` — both prevent accidental reference sharing across the store boundary.
- **Snapshot iteration in `EventBus.emit`**: `[...this.listeners]` spreads a snapshot before iterating, correctly handling listeners that remove themselves during dispatch.
- **Queue deduplication in `SyncEngine.sync`**: The `existing.promise` await-and-return pattern efficiently prevents redundant in-flight sync operations.
- **Two-phase sync with stale detection in `syncBetween`**: Writing to B before A and gating the A-write on a staleness check implements an optimistic concurrency pattern that is both correct and efficient.
- **AES-256-GCM with a fresh random IV per encryption**: The `encrypt` function generates a new IV per call and prepends it to the ciphertext — correct and standard.
- **Migration versioning**: `migrateBlob` correctly filters and sorts by version, applies migrations in order, and stamps the blob with `__v` to prevent re-applying.
- **DirtyTracker with `distinctUntilChanged`**: Using `BehaviorSubject` with `distinctUntilChanged` avoids redundant dirty signals while still propagating every true state transition.
- **TypeScript type discipline**: The codebase avoids `any` except in well-documented pragmatic locations (heterogeneous entity arrays), and uses `ReadonlyArray`, `Readonly<T>`, and `as const` idioms consistently.
