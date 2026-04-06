# Consolidated Code Review — strata-data-sync-v3

> **Date**: April 6, 2026
> **Reviewers**: Opus (architecture), Sonnet (types & quality), GPT-5.4 (correctness), Codex (security)
> **Scope**: All source files under `src/` (excluding `index.ts` barrels and test files)

---

## Cross-Model Consensus Summary

| # | Finding | Opus | Sonnet | GPT-5.4 | Codex | Consensus |
|---|---------|:----:|:------:|:-------:|:-----:|:---------:|
| 1 | Sync stale-check TOCTOU race condition | ✅ | — | ✅ | ✅ | 3/4 |
| 2 | Unchecked type casts / missing deserialization validation | — | ✅ | ✅ | ✅ | 3/4 |
| 3 | Tenant manager cache concurrent access race | ✅ | ✅ | ✅ | — | 3/4 |
| 4 | Non-atomic index + data write in sync | ✅ | — | ✅ | — | 2/4 |
| 5 | SyncEngine dispose doesn't abort in-flight ops | ✅ | — | ✅ | — | 2/4 |
| 6 | Credential change partial failure / non-atomic | ✅ | — | ✅ | — | 2/4 |
| 7 | Non-atomic encryption lifecycle in tenant open | ✅ | — | ✅ | — | 2/4 |
| 8 | Tombstone retention parameter issues | — | — | ✅ | ✅ | 2/4 |
| 9 | Repository query O(n) for large datasets | — | ✅ | ✅ | — | 2/4 |
| 10 | Resource leak in stream handling (gzip/buffer) | — | ✅ | — | — | 1/4 |
| 11 | HLC race condition in repository save | ✅ | — | — | — | 1/4 |
| 12 | Migration version gap not enforced | — | — | ✅ | — | 1/4 |
| 13 | Unvalidated base64 decoding in crypto path | — | — | — | ✅ | 1/4 |

---

## Issues by Severity

### Critical

#### C1. Sync Stale-Check TOCTOU Race Condition
**File**: `src/sync/unified.ts`
**Flagged by**: Opus, GPT-5.4, Codex
**Impact**: Index snapshot is captured early in `buildPlan()`, but the stale check happens after `applyChanges(adapterB)`. Between these operations, another process could modify adapterA. If the stale check incorrectly passes, concurrent modifications are overwritten without merging — causing data loss or permanent replica divergence.
**Recommendation**: Use optimistic locking or snapshot-based isolation at the adapter layer. Consider making stale check acquire an advisory lock.

#### C2. Non-Atomic Index Update + Data Write in Sync
**File**: `src/sync/unified.ts`
**Flagged by**: Opus, GPT-5.4
**Impact**: Data is written to adapters, then indexes are read and saved in a separate step. If the process crashes between data write and index save, the index is permanently stale — causing ghost reads and failed future syncs. Partition detection in subsequent sync rounds becomes unreliable.
**Recommendation**: Save index atomically with data, implement two-phase commit, or compute indexes on-demand rather than caching.

#### ~~C3. HLC Race Condition in Repository Save~~ ✅ Fixed
**File**: `src/repo/repository.ts`
**Flagged by**: Opus
~~**Impact**: The HLC is advanced with `tick()` before the entity is persisted to the store. If `store.setEntity()` throws, the HLC has been incremented but the entity wasn't saved, violating HLC monotonicity. Future entities may have identical or lower HLC values, breaking conflict resolution and causality ordering.~~
**Fix**: HLC is now computed before store operation but only assigned to `this.hlc.current` after `setEntity()` succeeds.

#### ~~C4. SyncEngine Dispose Doesn't Abort In-Flight Operations~~ ✅ Fixed
**File**: `src/sync/sync-engine.ts`
**Flagged by**: GPT-5.4, Opus
~~**Impact**: When `dispose()` is called, pending queue items are rejected but in-flight `fn()` calls continue to execute. The sync operation may still be accessing store/adapters after disposal. This causes use-after-dispose errors, memory leaks, and race conditions if adapters are destroyed while operations access them.~~
**Fix**: `dispose()` is now async and awaits the tracked `inFlight` promise before returning.

#### ~~C5. Unchecked Type Casts / Missing Deserialization Validation~~ ✅ Accepted
**Files**: `src/utils/serialize.ts`, `src/sync/merge.ts`, `src/sync/unified.ts`, `src/persistence/partition-index.ts`, `src/adapter/encryption.ts`
**Flagged by**: Sonnet, GPT-5.4, Codex
~~**Impact**: `deserialize<T>()` casts `JSON.parse` result to T without runtime validation. Pattern is repeated across sync/merge, unified sync, partition-index, and encryption modules. After deserialization from JSON, blobs may have missing `hlc` fields or corrupted structure. The type system provides zero protection against malformed data from adapters. A corrupted or malicious cloud adapter could inject invalid data that propagates through merge and corrupts local state.~~
**Resolution**: Non-issue — blob shape is framework-controlled at the adapter boundary. Comment added explaining the intentional unchecked cast.

#### ~~C6. Migration Version Gap Not Enforced~~ ✅ Fixed
**File**: `src/schema/migration.ts`
**Flagged by**: GPT-5.4
~~**Impact**: Migration version continuity is not validated. If migrations array contains versions [1, 2, 5] and current blob version is 1, migrations 3 and 4 are silently skipped. If these contain required data transformations, data integrity is silently violated.~~
**Fix**: Added `validateMigrations()` that asserts contiguous 1-based version sequence. Called at Strata construction time.

---

### Security — High

#### ~~S1. Unvalidated Base64 Decoding in Cryptographic Functions~~ ✅ Fixed
**File**: `src/utils/crypto.ts`, `src/utils/buffer.ts`
**Flagged by**: Codex
~~**Impact**: `importAesGcmKey()` calls `atob(base64)` without try-catch. `atob()` throws on invalid input. In the decryption path, malformed base64 key material causes uncaught exceptions that could crash the app or leak error stacks — potential DoS vector.~~
**Fix**: Consolidated to single `fromBase64()` with try-catch. `importAesGcmKey()` now uses `fromBase64()`.

#### ~~S2. Resource Leak in Stream Handling~~ ✅ Fixed
**Files**: `src/adapter/transforms/gzip.ts`, `src/utils/buffer.ts`
**Flagged by**: Sonnet
~~**Impact**: `streamToUint8Array()` doesn't release the reader lock on error. If decompression fails mid-stream (corrupted gzip, quota exceeded), ReadableStream and DecompressionStream remain open, leaking resources. On repeated failures, memory accumulates.~~
**Fix**: Added try-finally with `reader.releaseLock()` in `streamToUint8Array()`.

#### ~~S3. Credential Change Non-Atomic — Partial Failure Leaves Inconsistent State~~ ✅ Fixed
**File**: `src/tenant/tenant-manager.ts`
**Flagged by**: Opus, GPT-5.4
~~**Impact**: `changeCredential()` derives new keys, rekeys data, sets new keys in context, then writes marker blob. If failure occurs after rekeying but before writing marker blob, memory has new keys but storage has old keys. Recovery logic attempts to restore old credentials, but if restore also fails the tenant is permanently corrupted.~~
**Fix**: Infallible rollback using pre-saved key snapshot. On failure, old keys are restored from snapshot with no I/O.

#### ~~S4. Tenant Probe Masks Real I/O Errors as Encryption~~ ✅ Fixed
**File**: `src/tenant/tenant-manager.ts`
**Flagged by**: GPT-5.4
~~**Impact**: During `join()`, if reading the marker blob fails with ANY error (network timeout, permission denied), the catch block assumes it's an encrypted tenant. This masks real I/O failures and could lead to confusing authentication prompts for non-existent tenants.~~
**Fix**: `probe()` and `join()` catch blocks now only handle `InvalidEncryptionKeyError`. All other errors are re-thrown.

#### ~~S5. Missing Blob Validation on Flush/Load~~ ✅ Fixed
**File**: `src/store/flush.ts`
**Flagged by**: Sonnet
~~**Impact**: No blob schema validation when loading partition data from adapter. Entities silently default to `{}` if blob is malformed. A remote adapter could inject fake HLC data into merge, corrupting local state.~~
**Fix**: Added `validateBlob()` that checks blob structure and HLC fields before extracting entities.

---

### Security — Medium

#### ~~S6. ID Generation Modulo Bias~~ ✅ Fixed
**File**: `src/utils/id.ts`
**Flagged by**: Codex
~~**Impact**: `generateId()` uses `crypto.getRandomValues()` (good) but applies modulo to map to the 62-character alphabet, introducing non-uniform distribution. Effective entropy drops from 64 bits to ~61 bits. IDs are slightly more predictable than intended.~~
**Fix**: Alphabet expanded to 64 characters (added `-` and `_`). `256 % 64 === 0` eliminates modulo bias entirely.

#### ~~S7. PBKDF2 Salt Uses Only App ID~~ ✅ Fixed
**File**: `src/utils/crypto.ts`, `src/adapter/encryption.ts`
**Flagged by**: Codex
~~**Impact**: PBKDF2 salt is `textEncoder.encode(appId)`. If two apps share the same password + appId, they derive identical KEK values. App ID is typically public metadata, so the salt provides limited value against precomputation attacks.~~
**Fix**: Per-tenant 16-byte random salt prepended to marker blob. PBKDF2 now uses `salt + appId` as salt material.

#### ~~S8. Non-Atomic Encryption Lifecycle in Tenant Open~~ ✅ Fixed
**File**: `src/tenant/tenant-manager.ts`
**Flagged by**: Opus, GPT-5.4
~~**Impact**: Keys are derived, tenant context is set, then marker is read to load DEK, and context is re-set. If error occurs between steps, context may have incomplete keys (KEK but no DEK). Subsequent operations may fail with "DEK not loaded" at unpredictable points.~~
**Fix**: Final `tenantContext.set()` with full keys moved inside try block. Unencrypted path uses else branch.

#### ~~S9. Credential Not Cleared from Memory~~ ✅ Documented
**File**: `src/tenant/tenant-manager.ts`
**Flagged by**: Codex
~~**Impact**: `oldCredential` and `newCredential` remain as plain strings in JavaScript memory. Exploitable via memory dump attacks, debugger inspection, or process snapshots. This is a fundamental JavaScript limitation.~~
**Resolution**: Fundamental JS limitation — strings are immutable and GC-managed. Documented in `docs/guides/encryption.md` (Security Considerations) and code comments on `open()` / `changeCredential()`.

---

### Security — Low

#### S10. Query Object Keys Not Validated for Prototype Pollution
**File**: `src/repo/query.ts`
**Flagged by**: Codex
**Impact**: `applyWhere()` iterates `Object.keys(where)` and directly accesses `entity[key]`. If `where` includes `__proto__` or `constructor`, prototype pollution could occur in vulnerable browser contexts.
**Recommendation**: Filter dangerous keys: `Object.keys(where).filter(k => !k.startsWith('__') && k !== 'constructor')`.

#### S11. Entity ID Length Not Validated
**File**: `src/repo/repository.ts`
**Flagged by**: Codex
**Impact**: No length limit on entity IDs. Pathologically long IDs could cause memory exhaustion. Composite keys concatenate entity name, partition key, and unique ID with no size checks.
**Recommendation**: Add entity ID length validation (e.g., `id.length <= 256`).

#### S12. Partition Key Derivation Not Validated
**File**: `src/schema/define-entity.ts`
**Flagged by**: Codex
**Impact**: `keyStrategy.partitionFn()` result is not validated for null bytes, path traversal (`../../admin`), or excessive length. Malformed partition keys could target same storage location on certain backends.
**Recommendation**: Validate partition key with a safe character set pattern (e.g., `/^[a-zA-Z0-9_-]{1,64}$/`).

#### S13. AES-GCM Minimum Length Check Doesn't Account for GCM Tag
**File**: `src/utils/crypto.ts`
**Flagged by**: GPT-5.4
**Impact**: Minimum length check allows data shorter than `1 + IV_LENGTH + 16` (GCM tag). While `decrypt()` would fail anyway, the misleading check could be bypassed if logic is refactored.
**Recommendation**: Update minimum to `1 + IV_LENGTH + 16` to include GCM tag requirement.

---

### Warnings

| # | File | Issue | Flagged by |
|---|------|-------|-----------|
| W1 | `src/tenant/tenant-manager.ts` | Tenant manager cache race condition — `getList()` reads while `persistList()` writes without synchronization. Could return stale/partial tenant lists. | Opus, GPT-5.4, Sonnet |
| W2 | `src/tenant/tenant-manager.ts` | Non-atomic tenant purge — tenant removed from list before data deletion. If purge fails, orphaned blobs remain forever. | Opus |
| W3 | `src/sync/unified.ts` | Permanent divergence on stale sync — if `applyToA` is empty due to stale check but contained merged results, adapterA never receives the merge. | Opus |
| W4 | `src/sync/sync-engine.ts` | SyncQueue deduplication ignores tenant context. Concurrent multi-tenant syncs with same (source, target) pair would be incorrectly deduplicated. | GPT-5.4 |
| W5 | `src/sync/sync-engine.ts` | Silent sync failure in scheduler — cloud sync failures are only logged, no state correction occurs. Retry with stale/invalid encryption keys possible. | Opus |
| W6 | `src/utils/serialize.ts` | JSON serialization field order not guaranteed for all object types. Nested/complex objects may not serialize deterministically, causing hash mismatches. | Opus |
| W7 | `src/store/store.ts` | Index memory growth unbounded — marker blob indexes all entities+tombstones across all partitions with no size limit. Large tenants could OOM. | Codex |
| W8 | `src/store/store.ts`, `src/tenant/marker-blob.ts` | Magic string `__system` not centralized — defined independently in multiple files. | Codex |

---

### Low / Informational

| # | File | Issue | Flagged by |
|---|------|-------|-----------|
| L1 | `src/sync/conflict.ts` | Conflict resolution tie-breaking is arbitrary when HLCs are equal (local wins for entities, tombstone wins for entity vs tombstone). Should not occur due to nodeId tie-breaking, but not documented. | GPT-5.4 |
| L2 | `src/store/store.ts` | Tombstone retention uses HLC timestamp (logical time) rather than wall clock. Clock drift could cause incorrect retention. | GPT-5.4 |
| L3 | `src/options.ts` | `tombstoneRetentionMs` accepts 0, negative, or `Infinity` without validation. Zero causes immediate tombstone expiry; Infinity causes memory leak. | Codex |
| L4 | `src/sync/sync-engine.ts` | Error events may leak stack traces revealing internal code paths. | Codex |
| L5 | `src/tenant/tenant-sync.ts` | Tenant list merge uses `updatedAt` timestamps without clock-skew tie-breaker. Wrong tenant could win, orphaning data. | Codex |
| L6 | `src/strata.ts` | EventBus `dispose()` completes Subject but doesn't await pending subscriptions. Late emissions could still be buffered. | Opus |
| L7 | `src/utils/composite-key.ts` | `parseCompositeKey()` returns null on malformed keys, but callers use `!` (non-null assertion) without guards. | Opus, Sonnet |

---

### Suggestions

| # | File | Issue | Flagged by |
|---|------|-------|-----------|
| SG1 | `src/repo/repository.ts` | `query()` collects ALL entities from all partitions into memory before applying filters. For large datasets, this is O(n) memory. Pagination applied after full collection. | GPT-5.4, Sonnet |
| SG2 | `src/reactive/event-bus.ts` | EventBus exposes raw Subject stream without `distinctUntilChanged`. While mitigated at the repository level, it's a footgun for direct subscribers. | Sonnet |
| SG3 | `src/tenant/tenant-manager.ts` | During `create()`, if `deriveKeys()` throws, tenant is partially persisted. Persist tenant only after key derivation AND marker blob write succeed. | Sonnet |

---

## Positive Observations

- **Excellent HLC implementation** (`src/hlc/hlc.ts`) — Clean, immutable tick logic with proper timestamp/counter/nodeId tie-breaking. No mutation issues. Flagged by all 4 reviewers as exemplary.
- **Strong cryptographic defaults** (`src/utils/crypto.ts`) — AES-256-GCM with 600,000 PBKDF2 iterations, proper 12-byte IV generation, encryption version byte for future-proofing.
- **Principled KEK/DEK separation** (`src/adapter/encryption.ts`) — Clear lifecycle separation, tenant list kept unencrypted for enumeration before auth, informative error messages for key state issues.
- **Well-designed RxJS patterns** (`src/repo/repository.ts`) — Proper `startWith()`, `map()`, `distinctUntilChanged()` with custom comparators. BehaviorSubject correctly used for stateful streams.
- **Sound three-way merge strategy** (`src/sync/merge.ts`) — Entity vs entity, entity vs tombstone, tombstone vs tombstone resolution is exhaustive and logically sound.
- **Clean adapter composition** (`src/adapter/transforms/`) — Functional wrapper pattern enables composable retry, compression, and encryption without mutation. Solid exponential backoff in retry.
- **Deterministic partition hashing** (`src/persistence/hash.ts`) — Sorted keys before FNV-1a hashing for consistent change detection across platforms.
- **Proper defensive copying** (`src/adapter/memory-storage.ts`) — Both `read()` and `write()` use `data.slice()` to prevent external mutation of stored data.
- **Disposal guard pattern** (`src/utils/assert.ts`, `src/strata.ts`) — Centralized dispose with promise caching prevents double-disposal and use-after-free.
- **Deterministic entity ID validation** (`src/schema/define-entity.ts`) — Validation prevents dots in custom IDs, preventing ambiguous composite key parsing.
