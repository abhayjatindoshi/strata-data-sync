# Consolidated Code Review — strata-data-sync-v3

> **Date**: March 30, 2026  
> **Reviewers**: Claude Opus 4.6, Claude Sonnet 4.6, GPT-5.4, GPT-5.3 Codex  
> **Scope**: All source files under `src/`  
> **Total unique issues**: 73 (5 critical, 3 security-high, 5 security-medium, 3 security-low, 38 warnings, 26 low/informational, + 16 suggestions)

---

## Table of Contents

- [Cross-Model Consensus Summary](#cross-model-consensus-summary)
- [Issues by Severity](#issues-by-severity)
  - [Critical](#critical)
  - [Security — High](#security--high)
  - [Security — Medium](#security--medium)
  - [Security — Low](#security--low)
  - [Warnings](#warnings)
  - [Low / Informational](#low--informational)
  - [Suggestions](#suggestions)
- [Positive Observations](#positive-observations)
- [Individual Model Reports](#individual-model-reports)

---

## Cross-Model Consensus Summary

All four models independently converged on these findings (ordered by consensus count):

| # | Finding | Opus | Sonnet | GPT-5.4 | Codex | Consensus |
|---|---------|:----:|:------:|:-------:|:-----:|:---------:|
| 1 | `saveMany()`/`deleteMany()` bypass EventBus — dirty tracking missed | ✅ | ✅ | ✅ | ✅ | **4/4** |
| 2 | `changePassword()` never validates old password | ✅ | ✅ | ✅ | ✅ | **4/4** |
| 3 | `Math.random()` for ID generation (entity + tenant) | ✅ | ✅ | ✅ | ✅ | **4/4** |
| 4 | `localStorage` base64 encoding stack overflow on large blobs | ✅ | ✅ | ✅ | ✅ | **4/4** |
| 5 | Encryption silently fails open when DEK is null | ✅ | ✅ | ✅ | — | **3/4** |
| 6 | PBKDF2 salt is static `appId`, not random per-user | ✅ | ✅ | ✅ | — | **3/4** |
| 7 | `buildHlcMap` assumes `.hlc` exists — undefined if missing | — | ✅ | ✅ | ✅ | **3/4** |
| 8 | Deduped sync returns `EMPTY_RESULT` not real result | — | ✅ | ✅ | ✅ | **3/4** |
| 9 | `compareValues` returns 0 for unsupported types — silent no-op | — | ✅ | ✅ | ✅ | **3/4** |
| 10 | `list()` omits tombstone-only partitions | ✅ | ✅ | — | — | **2/4** |
| 11 | Tenant create allows duplicate IDs | — | ✅ | ✅ | ✅ | **3/4** |
| 12 | Migration scoping bug (entity name not passed) | — | — | ✅ | ✅ | **2/4** |
| 13 | `setInterval` without in-flight guard; operations pile up | ✅ | — | — | ✅ | **2/4** |
| 14 | Magic byte `0x7B` encryption detection is brittle | ✅ | ✅ | — | — | **2/4** |
| 15 | `writeMarkerBlob` resets `createdAt` on every call | ✅ | ✅ | — | — | **2/4** |
| 16 | `delete()` non-atomic; data wiped but tenant stays listed on crash | ✅ | ✅ | — | — | **2/4** |
| 17 | `__t:'D'` serialization marker collides with user data shapes | — | ✅ | ✅ | — | **2/4** |
| 18 | `parseEntityKey` silently returns `""` for malformed IDs | — | ✅ | — | ✅ | **2/4** |
| 19 | No schema validation on deserialization | — | ✅ | — | — | **1/4** |
| 20 | No HLC clock-drift detection or capping | — | ✅ | — | — | **1/4** |
| 21 | Tombstone + entity resurrection inconsistency | — | — | ✅ | — | **1/4** |
| 22 | Stale index advancement without data write | — | — | ✅ | — | **1/4** |
| 23 | Queue dedup ignores tenant context | ✅ | — | — | — | **1/4** |
| 24 | `emit()` no listener isolation; one throw aborts all | — | — | ✅ | — | **1/4** |
| 25 | Caller-supplied IDs not validated against current repo | — | — | ✅ | — | **1/4** |
| 26 | `pushTenantList` overwrites cloud without merging | ✅ | — | — | — | **1/4** |
| 27 | 32-bit FNV-1a collisions can hide real divergence | — | — | ✅ | — | **1/4** |
| 28 | PBKDF2 iteration count below OWASP recommendation | ✅ | — | — | — | **1/4** |

---

## Issues by Severity

### Critical

#### C1. `saveMany()`/`deleteMany()` bypass EventBus — dirty tracking broken
**File**: `src/repo/repository.ts` ~L108-142  
**Flagged by**: All 4 models  
**Impact**: Batch mutations call `this.changeSignal.next()` instead of `this.eventBus.emit()`. The `DirtyTracker` is never notified, so batch-saved/deleted data won't be flagged for sync. Data accumulates in memory without being persisted until an unrelated single `save()`/`delete()` triggers a flush.

#### C2. Stale index advancement without data application
**File**: `src/sync/unified.ts` ~L257-283  
**Flagged by**: GPT-5.4  
**Impact**: `syncBetween()` skips writing `applyToA` when adapter A is stale, but still advances indexes on both sides. A stale replica advertises hashes for data it never received, permanently suppressing later reconciliation.

#### C3. Tombstone resurrection inconsistency
**Files**: `src/store/store.ts` ~L19, `src/sync/merge.ts` ~L89  
**Flagged by**: GPT-5.4  
**Impact**: `setEntity()` doesn't clear pre-existing tombstones. `mergePartition()` copies both entity and tombstone for `localOnly`/`cloudOnly` IDs instead of resolving via HLC. Can re-delete legitimately recreated records.

#### C4. `list()` omits tombstone-only partitions
**File**: `src/store/store.ts` ~L154-161  
**Flagged by**: Opus, Sonnet  
**Impact**: Partitions with all entities deleted exist only in `this.tombstones`. `list()` iterates only `this.partitions.keys()`, so tombstone-only partitions are invisible to sync — deletions are never pushed to remote peers.

#### C5. Migration scoping bug — entity name not passed
**File**: `src/store/flush.ts` ~L23  
**Flagged by**: GPT-5.4, Codex  
**Impact**: `loadPartitionFromAdapter()` calls `migrateBlob()` without the current `entityName`, so entity-specific migrations may apply to unrelated blobs, corrupting data during hydration.

---

### Security — High

#### SH1. `changePassword()` never validates old password
**File**: `src/strata.ts` ~L258  
**Flagged by**: All 4 models  
**Impact**: `oldPassword` is accepted but never used. Any caller with a reference to an unlocked `Strata` instance can rotate the encryption password without proving knowledge of the current one.

#### SH2. Encryption silently fails open when DEK is null (encode)
**File**: `src/adapter/encryption.ts` ~L44-50  
**Flagged by**: Opus, Sonnet, GPT-5.4  
**Impact**: When `this.dek === null`, `encode` returns plaintext silently. Partition blobs written while the DEK is unset are persisted unencrypted with no warning or error. `isConfigured` checks only `markerKey`, not `dek`.

#### SH3. Silent decode bypass when DEK null returns ciphertext as plaintext
**File**: `src/adapter/encryption.ts` ~L60-64  
**Flagged by**: Sonnet  
**Impact**: When `!this.dek` and encrypted data arrives during decoding, raw ciphertext bytes are returned. The deserializer receives garbage bytes and throws an opaque error rather than `InvalidEncryptionKeyError`.

---

### Security — Medium

#### SM1. PBKDF2 uses static `appId` as salt
**File**: `src/adapter/crypto.ts` ~L36-41  
**Flagged by**: Opus, Sonnet, GPT-5.4  
**Impact**: All users of the same app sharing a password derive identical keys. Enables precomputed dictionary attacks and cross-user rainbow tables.

#### SM2. `Math.random()` for ID generation
**Files**: `src/schema/id.ts` ~L4-9, `src/tenant/tenant-manager.ts` ~L22-27  
**Flagged by**: All 4 models  
**Impact**: Entity and tenant IDs are predictable. Collision could silently overwrite data; enumerable IDs in shared-workspace scenarios.

#### SM3. No schema validation on deserialization
**File**: `src/persistence/serialize.ts` ~L31-33  
**Flagged by**: Sonnet  
**Impact**: `JSON.parse` result cast directly to `T` without runtime validation. Malformed or attacker-controlled storage data propagates as valid typed objects (OWASP A08).

#### SM4. PBKDF2 iteration count below OWASP recommendation
**File**: `src/adapter/crypto.ts` ~L11  
**Flagged by**: Opus  
**Impact**: 100,000 iterations is below the OWASP-recommended 600,000+ for SHA-256, reducing resistance to brute-force key derivation.

#### SM5. Tenant create TOCTOU window for duplicate ID detection
**File**: `src/tenant/tenant-manager.ts` ~L65-75  
**Flagged by**: Sonnet  
**Impact**: Between `getList()` and `persistList()`, a concurrent `create` with the same derived ID could pass the duplicate check, creating two entries.

---

### Security — Low

#### SL1. Tenant list `__tenants` explicitly unencrypted
**File**: `src/adapter/encryption.ts` ~L43  
**Flagged by**: Opus  
**Impact**: Tenant metadata (names, meta fields) may contain sensitive information. Intentional for pre-auth listing but undocumented.

#### SL2. `decrypt` lacks minimum buffer length guard
**File**: `src/adapter/crypto.ts` ~L92-107  
**Flagged by**: Sonnet  
**Impact**: Calling with fewer than 13 bytes produces an opaque WebCrypto error rather than a clear `InvalidEncryptionKeyError`.

#### SL3. `exportDek` spread pattern fragile for larger keys
**File**: `src/adapter/crypto.ts` ~L62  
**Flagged by**: Opus (sub-agent)  
**Impact**: `btoa(String.fromCharCode(...new Uint8Array(raw)))` is safe for 32-byte AES keys, but the pattern is replicated in `local-storage.ts` where it's a real bug.

---

### Warnings

| # | File | Issue | Flagged by |
|---|------|-------|-----------|
| W1 | `src/adapter/local-storage.ts:8` | `String.fromCharCode(...data)` stack overflow for large blobs | All 4 |
| W2 | `src/adapter/local-storage.ts:34` | No error handling for `localStorage.setItem()` when quota exceeded | Opus |
| W3 | `src/strata.ts:168` | Magic byte `0x7B` encryption detection is brittle | Opus, Sonnet |
| W4 | `src/strata.ts:57` | `tombstoneRetentionMs` accepted but never implemented — unbounded growth | Opus |
| W5 | `src/strata.ts:148` | `unloadCurrentTenant()` leaves `activeTenant$` stale | GPT-5.4 |
| W6 | `src/strata.ts:160` | `loadTenant` has no concurrency guard — orphaned schedulers possible | Sonnet |
| W7 | `src/strata.ts:219-225` | `sync()` return value only reports `local→cloud`, not full round-trip | Opus |
| W8 | `src/strata.ts:189-191` | Cloud sync failure during `loadTenant()` silently swallowed | Opus |
| W9 | `src/strata.ts:244-248` | `partitionsSynced` double-counts merged partitions | Sonnet |
| W10 | `src/store/store.ts:122-123` | `storedMarkerBlob` is dead code — written but never read | Sonnet |
| W11 | `src/store/store.ts:96` | Marker reads ignore `storedMarkerBlob`, synthesize fresh, drop persisted metadata | GPT-5.4 |
| W12 | `src/sync/sync-engine.ts:55-60` | Queue deduplication ignores tenant context | Opus |
| W13 | `src/sync/sync-engine.ts:58` | Deduped sync returns `EMPTY_RESULT` not real result | Sonnet, GPT-5.4, Codex |
| W14 | `src/sync/sync-engine.ts:155-162` | `drain()` can busy-wait with `setTimeout(r, 0)` | Sonnet |
| W15 | `src/sync/sync-engine.ts` | `processQueue` is fire-and-forget — errors not propagated | Sonnet |
| W16 | `src/sync/sync-scheduler.ts:26-47` | `setInterval` without in-flight guard; operations pile up | Opus, Codex |
| W17 | `src/sync/sync-scheduler.ts:38` | Cloud timer clears dirty before memory flush | GPT-5.4 |
| W18 | `src/sync/sync-scheduler.ts:35-44` | Cloud sync scheduler errors only logged via debug, not propagated | Opus (sub-agent) |
| W19 | `src/sync/unified.ts:~220` | `buildHlcMap` assumes `.hlc` exists — undefined if missing | Sonnet, GPT-5.4, Codex |
| W20 | `src/sync/unified.ts:250-261` | Index updates not atomic with data writes — crash causes stale indexes | Opus |
| W21 | `src/sync/unified.ts:146` | `isStale()` misses concurrent first-partition creation for new entities | GPT-5.4 |
| W22 | `src/persistence/partition-index.ts:21-39` | `saveAllIndexes` read-modify-write race condition | Opus |
| W23 | `src/persistence/partition-index.ts:13-15` | Multiple unchecked runtime casts to `Record<string, unknown>` | Sonnet (sub-agent) |
| W24 | `src/persistence/serialize.ts:8` | `{ __t: 'D', v: string }` marker collides with user data shapes | Sonnet, GPT-5.4 |
| W25 | `src/persistence/hash.ts:24` | 32-bit FNV-1a collisions can hide real divergence | GPT-5.4 |
| W26 | `src/tenant/tenant-sync.ts:29-34` | `pushTenantList` overwrites cloud list without merging | Opus |
| W27 | `src/tenant/tenant-sync.ts:21` | Date comparison in `mergeTenantLists` may fail after deserialization | Opus |
| W28 | `src/tenant/tenant-manager.ts:63` | `create()` doesn't reject duplicate tenant IDs | GPT-5.4, Codex |
| W29 | `src/tenant/tenant-manager.ts:100` | Persist path `[...tenants, tenant]` lacks duplicate-ID guard | Codex |
| W30 | `src/tenant/tenant-manager.ts:170-182` | `delete()` non-atomic; data wiped but tenant stays listed on crash | Opus, Sonnet |
| W31 | `src/tenant/marker-blob.ts:26` | `writeMarkerBlob` resets `createdAt` on every call | Opus, Sonnet |
| W32 | `src/tenant/marker-blob.ts:19-36` | `writeMarkerBlob` creates fresh marker with `indexes: {}`, discarding existing index data | Opus |
| W33 | `src/repo/repository.ts:74` | Caller-supplied IDs trusted without verifying they belong to current repository | GPT-5.4 |
| W34 | `src/repo/query.ts:1-12` | `compareValues` returns 0 for unsupported types — silent no-op sorting | GPT-5.4, Codex |
| W35 | `src/repo/query.ts:53` | `applyOrderBy` inherits `compareValues` silent no-op for unsupported types | Codex |
| W36 | `src/reactive/event-bus.ts:17` | `emit()` no listener isolation; one throwing listener aborts all and bubbles into caller | GPT-5.4 |
| W37 | `src/hlc/hlc.ts` | No drift detection or capping — rogue node can corrupt all timestamps | Sonnet |
| W38 | `src/store/store.ts:130-135` | `write()` through BlobAdapter interface doesn't mark dirty — intentional but undocumented | Opus (sub-agent) |

---

### Low / Informational

| # | File | Issue | Flagged by |
|---|------|-------|-----------|
| L1 | `src/persistence/types.ts:14-18` | `PartitionBlob` index signature creates type ambiguity with fixed fields | Opus, Sonnet (sub-agents) |
| L2 | `src/persistence/serialize.ts:4-6` | Limited custom type serialization — only `Date` handled; `Map`, `Set`, `RegExp` silently lost | Opus (sub-agent) |
| L3 | `src/persistence/partition-index.ts:29` | Marker defaults `createdAt: new Date()` on every save when existing is empty | Opus (sub-agent) |
| L4 | `src/persistence/hash.ts` | `charCodeAt` hashes surrogate pairs (UCS-2), diverges from other FNV-1a implementations | Sonnet (sub-agent) |
| L5 | `src/store/types.ts:4` | `EntityStore extends BlobAdapter` — tight coupling between store and sync abstractions | Opus (sub-agent) |
| L6 | `src/store/store.ts:173-195` | `buildMarkerBlob` relies on entities having `.hlc` — unsafe type assertion | Opus (sub-agent) |
| L7 | `src/store/store.ts:190` | `buildMarkerBlob` sets `updatedAt: Date.now()` on every read even when no data changed | Sonnet (sub-agent) |
| L8 | `src/store/store.ts` | `count: hlcMap.size` includes tombstones — differs from expected "live entity count" semantics | Sonnet (sub-agent) |
| L9 | `src/store/store.ts:179-181` | `buildMarkerBlob` skips entities without `hlc` — hash diverges from `unified.ts:buildHlcMap` | Sonnet (sub-agent) |
| L10 | `src/store/store.ts:99-100` | `read()` returns null for regular keys when empty, but returns blob for marker key — asymmetry | Opus (sub-agent) |
| L11 | `src/store/flush.ts:18,30` | `partitionBlobKey` called twice with identical arguments — redundant | Sonnet (sub-agent) |
| L12 | `src/strata.ts:284` | Non-null assertion `marker.dek!` — if undefined, `importDek(undefined!)` throws opaque error | Sonnet (sub-agent) |
| L13 | `src/strata.ts` | `StrataConfig.entities` typed as `EntityDefinition<any>[]` — pragmatic but weakens type safety | Sonnet (sub-agent) |
| L14 | `src/adapter/local-storage.ts:52-60` | `list()` O(n) over all `localStorage` keys including unrelated libraries | Sonnet (sub-agent) |
| L15 | `src/adapter/local-storage.ts` | No guard for environments without `localStorage` (SSR/worker contexts) | Sonnet (sub-agent) |
| L16 | `src/hlc/hlc.ts` | Counter unbounded growth in rapid-event scenarios — can bloat HLC string representation | Sonnet (sub-agent) |
| L17 | `src/sync/sync-engine.ts:82-87` | Sync result captured via closure mutation — fragile pattern | Opus (sub-agent) |
| L18 | `src/sync/sync-engine.ts:178` | `emitEntityChanges` assumes key contains a dot — returns `""` if not | Sonnet (sub-agent) |
| L19 | `src/sync/unified.ts:143-156` | Stale check re-reads all indexes from adapter A — expensive for large index sets | Sonnet (sub-agent) |
| L20 | `src/tenant/marker-blob.ts:46` | `readMarkerBlob` performs unchecked cast — no schema validation on stored data | Sonnet (sub-agent) |
| L21 | `src/tenant/tenant-list.ts:15` | `loadTenantList` unchecked cast `as Tenant[]` — no validation of stored fields | Opus, Sonnet (sub-agents) |
| L22 | `src/tenant/tenant-manager.ts:52` | Cached tenant list can become stale across tabs/instances | Opus, Sonnet (sub-agents) |
| L23 | `src/repo/repository.ts:14-17` | `parseEntityKey` silently returns `""` for malformed IDs (no dot) instead of throwing | Sonnet, Codex |
| L24 | `src/repo/query.ts:17` | `applyWhere` uses strict `===` — breaks for `Date` and object field comparisons | Sonnet (sub-agent) |
| L25 | `src/repo/repository.ts` | `observeQuery` re-executes full query on every entity change signal | Sonnet (sub-agent) |
| L26 | `src/index.ts` | Barrel re-export exposes all internal types as public API surface | Sonnet (sub-agent) |

---

### Suggestions

| # | File | Suggestion | Flagged by |
|---|------|-----------|-----------|
| S1 | `src/adapter/crypto.ts` | Use `crypto.getRandomValues()` for random salt, stored alongside encrypted DEK | Opus, Sonnet |
| S2 | `src/adapter/crypto.ts:92` | Add minimum buffer length guard in `decrypt` | Sonnet |
| S3 | `src/adapter/local-storage.ts:8` | Replace spread-based base64 with chunked conversion | All 4 |
| S4 | `src/sync/unified.ts:76-98` | Parallelize blob reads in `planCopies`/`planMerges` for high-latency adapters | Opus, Sonnet |
| S5 | `src/store/flush-scheduler.ts` | File is empty except for a comment — consider removing | Opus |
| S6 | `src/store/store.ts:130-135` | Document that `write()` via BlobAdapter intentionally doesn't track dirty state | Opus |
| S7 | `src/store/flush.ts:23` | Pass `entityName` to `migrateBlob` during partition load | GPT-5.4, Codex |
| S8 | `src/persistence/hash.ts:5-20` | DRY: `fnv1a()` can delegate to `fnv1aAppend(FNV_OFFSET, input)` | Sonnet |
| S9 | `src/repo/repository.ts:137-155` | `query()` collects all entities before applying `limit` — add early termination | Sonnet |
| S10 | `src/repo/repository.ts:114` | Emit through `eventBus` in `saveMany`/`deleteMany` — batched event is sufficient | Codex |
| S11 | `src/schema/define-entity.ts:31-35` | `deriveId` should also reject colons and null bytes (namespace collision risk) | Sonnet |
| S12 | `src/index.ts` | Restrict barrel exports to consumer-facing types only | Sonnet |
| S13 | `src/strata.ts:258` | Validate `oldPassword` explicitly before accepting password rotation | Codex |
| S14 | `src/sync/sync-scheduler.ts:26` | Add in-flight guards or switch to self-scheduling await loops | Codex |
| S15 | `src/tenant/tenant-manager.ts:63` | Add duplicate ID detection before create persists tenants | Codex |
| S16 | `src/tenant/tenant-manager.ts:52` | Consider cache invalidation strategy for multi-tab scenarios | Opus |

---

## Positive Observations

These patterns were called out across multiple models as **well-done**:

- **Clean layered architecture**: Clear module boundaries with `types.ts` + implementation + `index.ts` barrel exports. Each layer has well-defined responsibility. *(All 4)*
- **HLC implementation**: Correct hybrid logical clock with proper total ordering and nodeId tie-breaking. *(All 4)*
- **Clean sync layering**: diff/merge/plan/apply separation is easier to reason about than monolithic sync. *(GPT-5.4, Codex)*
- **Defensive cloning**: `MemoryBlobAdapter` uses `structuredClone`, `MemoryStorageAdapter` uses `.slice()` — prevents reference aliasing. *(Opus, Sonnet)*
- **Snapshot iteration in EventBus**: `[...this.listeners]` spread before iteration prevents modification-during-iteration bugs. *(Opus, Sonnet)*
- **Two-level encryption scheme**: Marker-key + DEK design allows password changes without re-encrypting all data. *(Opus)*
- **AES-256-GCM with fresh IV per encryption call**: Correct and standard. *(Sonnet)*
- **Two-phase sync with stale detection**: Writing to B before A and gating A-write on staleness check is correct optimistic concurrency. *(Sonnet)*
- **Migration versioning**: `migrateBlob` correctly filters, sorts by version, applies in order, and stamps `__v`. *(Sonnet)*
- **DirtyTracker with `distinctUntilChanged`**: Avoids redundant signals while preserving every real state transition. *(Sonnet)*
- **Consistent `readonly` annotations**: Types use `readonly` and `ReadonlyArray` throughout. *(Opus)*
- **TypeScript type discipline**: Avoids `any` except in well-documented pragmatic locations. Uses `Readonly<T>` and `as const` idioms. *(Sonnet)*
- **Queue deduplication in SyncEngine**: The `existing.promise` await-and-return pattern efficiently prevents redundant in-flight sync operations. *(Opus, Sonnet)*
- **Adapter bridge pattern**: Clean separation between storage adapters and blob adapters with composable transforms. *(Opus)*

---

## Individual Model Reports

### Claude Opus 4.6
Full report: [reviewer-opus.md](reviewer-opus.md)  
Sub-agent files: [opus/](opus/)

### Claude Sonnet 4.6
Full report: [reviewer-sonnet.md](reviewer-sonnet.md)  
Sub-agent files: [sonnet/](sonnet/)

### GPT-5.4
Full report: [reviewer-gpt54.md](reviewer-gpt54.md)  
Sub-agent files: [gpt54/](gpt54/)

### GPT-5.3 Codex
Full report: [reviewer-codex.md](reviewer-codex.md)  
Sub-agent files: [codex/](codex/)
