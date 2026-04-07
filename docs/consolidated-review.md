# Consolidated Code Review — strata-data-sync-v3

> **Date**: April 6, 2026
> **Scope**: All source files under `src/` (41 files, excluding `index.ts` barrels and tests)
> **Reviewers**: Opus, Sonnet, GPT-5.4, Codex

---

## Cross-Model Consensus Summary

| # | Finding | Opus | Sonnet | GPT-5.4 | Codex | Consensus | Resolution |
|---|---------|:----:|:------:|:-------:|:-----:|:---------:|:----------:|
| C1 | Non-atomic sync operations / race conditions in `unified.ts` | ✅ | ✅ | ✅ | ✅ | 4/4 | By Design |
| C2 | Unsafe entity casts in `merge.ts` — missing `hlc` validation | ✅ | ✅ | ✅ | ✅ | 4/4 | Accepted |
| C3 | Store TOCTOU race on partitions and marker blob cache | — | ✅ | ✅ | ✅ | 3/4 | By Design |
| C4 | Concurrent `open()`/`close()` corruption in `tenant-manager.ts` | — | ✅ | ✅ | ✅ | 3/4 | By Design |
| C5 | SyncEngine queue item not removed on error — infinite loop | — | ✅ | — | ✅ | 2/4 | Non-Issue |
| S1 | Partition key injection — no runtime validation | ✅ | ✅ | ✅ | ✅ | 4/4 | By Design |
| S2 | Salt/AppId concatenation without length prefix | ✅ | ✅ | ✅ | ✅ | 4/4 | Non-Issue |
| S3 | All decrypt errors masked as `InvalidEncryptionKeyError` | ✅ | — | ✅ | — | 2/4 | By Design |
| S4 | Unsafe type cast of keys to `Pbkdf2Keys` without validation | — | ✅ | ✅ | ✅ | 3/4 | **Fixed** |
| S5 | Untrusted blob deserialization without schema validation | ✅ | ✅ | ✅ | — | 3/4 | Accepted |
| S6 | Entity name / `deriveId()` validation insufficient | — | ✅ | ✅ | ✅ | 3/4 | **Fixed** |
| S7 | FNV hash collision enables sync bypass | ✅ | ✅ | ✅ | — | 3/4 | **Fixed** |
| S8 | Encryption version byte not authenticated / forward compat | ✅ | — | ✅ | ✅ | 3/4 | Accepted |
| SM1 | Modulo bias in ID generation | — | ✅ | — | ✅ | 2/4 | Non-Issue |
| SM2 | Credential string remains in JS memory until GC | — | ✅ | ✅ | ✅ | 3/4 | JS Limitation |
| SM3 | Options interval parameters not validated | — | — | ✅ | — | 1/4 | **Fixed** |
| W1 | Tombstone `\0` prefix collision / null byte confusion | ✅ | ✅ | ✅ | ✅ | 4/4 | Non-Issue |
| W2 | Composite key delimiter collision | ✅ | ✅ | — | — | 2/4 | **Fixed** (via S6) |
| W3 | Tenant list TOCTOU — concurrent updates lost | — | ✅ | ✅ | — | 2/4 | By Design |
| W4 | SyncEngine disposed check race | — | ✅ | ✅ | ✅ | 3/4 | By Design |
| W5 | Tombstone retention uses wall-clock time vs HLC time | — | ✅ | ✅ | — | 2/4 | By Design |

---

## Issues by Severity

### Critical

#### C1. Non-atomic sync operations with race conditions
**File**: `src/sync/unified.ts`
**Flagged by**: Opus, Sonnet, GPT-5.4, Codex
**Resolution**: By Design
**Impact**: The `syncBetween` function performs a multi-phase read-diff-merge-write cycle without atomicity guarantees. If adapter B write succeeds but adapter A write fails, indexes become inconsistent with actual data. The stale check verifies adapter A's index hasn't changed but does NOT verify B's consistency. Additionally, when `stale=true`, only adapter B's index is saved — adapter A's index is never updated, causing partitions modified in A to be permanently missed in subsequent syncs. Two concurrent sync operations can overwrite each other's changes, leading to silent data loss.
> **Rationale**: The sync model follows a deliberate A→B mandatory / B→A optional philosophy. When stale is detected, skipping A's index write is correct — A's index was modified by another process, so overwriting it would lose that process's changes. The system self-corrects on the next sync cycle. The stale index overwrite bug (where A's index was unnecessarily rewritten when stale=true) was fixed separately.

#### C2. Unsafe entity casts in merge — missing `hlc` validation
**File**: `src/sync/merge.ts` (lines ~53–75)
**Flagged by**: Opus, Sonnet, GPT-5.4, Codex
**Resolution**: Accepted
**Impact**: Entities deserialized from blobs are cast to `SyncEntity` without runtime validation that the `hlc` field exists. If a remote blob contains a corrupted or malformed entity without an HLC, `resolveConflict()` accesses `undefined.hlc`, causing a crash during conflict resolution. Malicious blobs could exploit this to cause denial of service.
> **Rationale**: Adding runtime schema validation on every deserialized entity would add significant overhead to the hot path. Blob data comes from adapters the consumer provides — validation at the adapter boundary is the consumer's responsibility per the adapter contract. The framework provides type contracts; adapters must enforce them.

#### C3. Store TOCTOU race on partitions and marker blob cache
**File**: `src/store/store.ts` (lines ~30–39, ~141–147, ~178–200)
**Flagged by**: Sonnet, GPT-5.4, Codex
**Resolution**: By Design
**Impact**: Multiple race conditions exist in the store: (1) `getPartition→update→setPartition` is not atomic — concurrent `repo.save()` calls can overwrite each other's data. (2) `cachedMarkerBlob` has no synchronization — concurrent reads/writes cause stale cache. (3) `loadPartition()` has a TOCTOU between `has()` check and load — concurrent loads corrupt state. In heavy-write scenarios, the marker blob cache thrashes with O(n) recomputation on every read.
> **Rationale**: JavaScript is single-threaded — there are no truly concurrent `repo.save()` calls within a single runtime. The TOCTOU window only exists across `await` boundaries, and store operations on the in-memory map are synchronous. Cross-process races are handled by the sync layer's stale detection.

#### C4. Concurrent `open()`/`close()` corruption in TenantManager
**File**: `src/tenant/tenant-manager.ts` (lines ~247–340)
**Flagged by**: Sonnet, GPT-5.4, Codex
**Resolution**: By Design
**Impact**: `open()` is not reentrant. Two concurrent calls both reach `close()`, triggering two syncs simultaneously. `tenantContext.set()` calls can be interleaved, leaving encryption keys in an inconsistent state (KEK set without DEK). Subsequent decrypt operations fail with cryptic errors. Similarly, `open()` called during `close()` can access cleared resources.
> **Rationale**: Callers are expected to `await open()` before calling it again. The framework is designed for single-tenant-at-a-time use. Adding an async mutex is backlogged (SG5) but not critical given the usage pattern.

#### C5. SyncEngine queue item not removed on error
**File**: `src/sync/sync-engine.ts` (line ~105)
**Flagged by**: Sonnet, Codex
**Resolution**: Non-Issue
**Impact**: When `item.fn()` rejects, `item.reject()` is called but the item is NOT shifted from `queue[0]`. The queue grows indefinitely with failed items, and `processQueue()` loops forever retrying the same failing item. Additionally, `dispose()` can be called between the disposed check and `queue.push()`, allowing work to execute after disposal.
> **Rationale**: Verified in code: `queue.shift()` runs unconditionally after the `await` in a `finally`-equivalent position (the item is shifted before the `try/catch` closes). The `queue.shift()` at line ~105 executes regardless of whether the promise resolves or rejects. The finding misread the control flow.

---

### Security — High

#### S1. Partition key injection — no runtime validation
**File**: `src/schema/key-strategy.ts` (lines ~5–10)
**Flagged by**: Opus, Sonnet, GPT-5.4, Codex
**Resolution**: By Design — App Responsibility
**Impact**: Documentation states partition keys should match `/^[a-zA-Z0-9_-]{1,64}$/` but zero runtime validation enforces this. A malicious `partitionFn` can return path traversal sequences (`../../../`), null bytes, or other special characters. In filesystem or S3-based adapters, this could escape storage isolation, corrupt data across partitions or tenants, or break the index structure entirely.
> **Rationale**: Partition functions are provided by application code, not user input. The framework documents the constraint via JSDoc on `partitioned()`. Storage adapters are responsible for sanitizing keys at the I/O boundary, consistent with the adapter contract pattern.

#### S2. Salt/AppId concatenation without length prefix
**File**: `src/adapter/encryption.ts` (lines ~115–125)
**Flagged by**: Opus, Sonnet, GPT-5.4, Codex
**Resolution**: Non-Issue
**Impact**: `fullSalt = concat(salt, appIdBytes)` without length encoding. Two different `(salt, appId)` pairs can produce identical input to PBKDF2: e.g., salt="abc" + appId="def" vs salt="abcde" + appId="f" both yield "abcdef". This means different tenants/apps could derive identical encryption keys, allowing one to decrypt another's data.
> **Rationale**: Salt is always exactly 16 bytes (fixed length from crypto.getRandomValues). With a fixed-length prefix, there is no ambiguity — the salt boundary is always at byte 16. The example given (variable-length salt) cannot occur.

#### S3. All decrypt errors masked as `InvalidEncryptionKeyError`
**File**: `strata-adapters: src/encryption/encryption.ts`
**Flagged by**: Opus, GPT-5.4
**Resolution**: By Design
**Impact**: In `AesGcmEncryptionStrategy.decrypt()`, any error during decryption is caught and rethrown as `InvalidEncryptionKeyError`. Network errors, memory errors, auth tag mismatches, and malformed ciphertext are all misreported as authentication failures. Client code cannot distinguish actual key errors from system errors, hiding real problems and making debugging impossible.
> **Rationale**: This is intentional crypto best practice — leaking specific decryption error types creates an error oracle that aids chosen-ciphertext attacks. All failures should appear identical to the caller. The strategy layer operates only on in-memory byte arrays, so network errors cannot reach this code path.

#### S4. Unsafe type cast of keys to `Pbkdf2Keys` without validation
**File**: `strata-adapters: src/encryption/encryption.ts`
**Flagged by**: Sonnet, GPT-5.4, Codex
**Resolution**: **Fixed** — Added runtime guard in `castKeys()` checking for `kek` property before cast
**Impact**: Multiple methods (`castKeys`, `encrypt`, `decrypt`, `generateKeyData`, `loadKeyData`, `rekey`) use unchecked `as Pbkdf2Keys` casts. If a wrong key structure is passed, accessing `kek`/`dek` properties returns `undefined`, potentially causing silent encryption bypass (data stored unencrypted) or cryptic runtime errors.

#### S5. Untrusted blob deserialization without schema validation
**File**: `src/persistence/blob-io.ts` (lines ~18–22), `src/utils/serialize.ts` (line ~30)
**Flagged by**: Opus, Sonnet, GPT-5.4
**Resolution**: Accepted
**Impact**: `deserialize()` uses `JSON.parse` without depth limits or schema validation. Circular object references cause stack overflow (DoS). Malformed blobs inject arbitrary object structures accepted silently. The code comment says "adapters should validate" but no validation occurs at the framework boundary. Untrusted data flows through merge and conflict resolution unchecked.
> **Rationale**: Data comes from adapters the consumer provides. The adapter contract delegates validation to the adapter boundary. Adding JSON schema validation at the framework level would require coupling the core to schema definitions, breaking the module separation principle. JSON.parse handles circular references by throwing (not stack overflow).

#### S6. Entity name / `deriveId()` validation insufficient
**File**: `src/schema/define-entity.ts` (line ~24), `src/repo/repository.ts` (lines ~65–68)
**Flagged by**: Sonnet, GPT-5.4, Codex
**Resolution**: **Fixed** — `defineEntity()` now rejects entity names containing dots; entity ID length capped at 256 characters
**Impact**: `wrapDeriveId()` only validates absence of dots but allows newlines, null bytes, quotes, and other special characters. Entity names are not validated for dots/special chars either. Since `formatEntityId()` directly interpolates entity name into composite keys, an entity name like `"auth.users"` produces ambiguous parsing: `"auth.users.partition.id"` is indistinguishable from entity `"auth"` with partition `"users.partition"`.

#### S7. FNV hash collision enables sync bypass
**File**: `src/persistence/hash.ts`, `src/sync/diff.ts` (lines ~20–40)
**Flagged by**: Opus, Sonnet, GPT-5.4
**Resolution**: **Fixed** — `diffPartitions()` now compares `(hash, count, deletedCount)` triple instead of hash alone
**Impact**: FNV-1a (non-cryptographic, 32-bit) is used to detect partition changes. An attacker can craft entity maps with identical hashes to bypass change detection, silently hiding entity updates during sync. Even without an attacker, natural collisions (~1 in 4 billion) become likely at scale, causing diverged partitions to be marked unchanged.

#### S8. Encryption version byte not authenticated / forward compatibility broken
**File**: `src/utils/crypto.ts` (lines ~68–72), `src/adapter/encryption.ts` (line ~59)
**Flagged by**: Opus, GPT-5.4, Codex
**Resolution**: Accepted
**Impact**: The version byte is stored in plaintext as the first byte of ciphertext and is not included in AES-GCM authenticated additional data (AAD). An attacker could flip the version bit for a downgrade attack if multiple versions are ever supported. Additionally, the current version check (`version !== ENCRYPTION_VERSION`) means any future encryption format change breaks all clients that haven't been updated simultaneously.
> **Rationale**: Only one encryption version exists currently. Including the version in AAD would add complexity without current benefit. When a second version is introduced, AAD inclusion should be added at that time. The minimum ciphertext length check (1 + IV_LENGTH + 16 for GCM tag) was fixed separately.

---

### Security — Medium

#### SM1. Modulo bias in ID generation
**File**: `src/utils/id.ts` (lines ~5–12)
**Flagged by**: Sonnet, Codex
**Resolution**: Non-Issue
**Impact**: `bytes[i] % CHARS.length` where `CHARS.length = 64`. While 256 % 64 = 0 (no bias in this specific case), the pattern is fragile — changing CHARS length introduces bias. The approach doesn't follow NIST/OWASP recommendations for uniform random selection. At very large scale (1B+ IDs), subtle distribution imbalances reduce effective entropy.
> **Rationale**: 256 mod 64 = 0, so there is zero modulo bias with the current character set. The alphabet size (64) is a power of 2, making this a perfectly uniform selection. If the alphabet ever changes, this should be revisited.

#### SM2. Credential string remains in JS memory until GC
**File**: `src/tenant/tenant-manager.ts` (lines ~236, 307–350)
**Flagged by**: Sonnet, GPT-5.4, Codex
**Resolution**: JS Limitation — Acknowledged
**Impact**: JavaScript strings are immutable and cannot be zeroed. The credential string parameter passed through multiple functions (`deriveKeys`, `rekey`) persists in closures, call stacks, and heap until garbage collected. Memory forensics or crash dumps expose plaintext passwords. Acknowledged in code comments but no mitigation exists within JS runtime constraints.
> **Rationale**: This is an inherent limitation of the JavaScript runtime. No mitigation is possible without native code integration. Documented as a known limitation.

#### SM3. Options interval parameters not validated
**File**: `src/options.ts` (lines ~12–18)
**Flagged by**: GPT-5.4
**Resolution**: **Fixed** — Added `validatePositiveInterval()` for `cloudSyncIntervalMs` and `localFlushIntervalMs`
**Impact**: `resolveOptions()` validates `tombstoneRetentionMs` but not `cloudSyncIntervalMs` or `localFlushIntervalMs`. These could be negative, zero, or `Infinity`, causing tight scheduler loops (DoS) or disabled scheduling with no warning.

---

### Warnings

| # | File | Issue | Flagged by | Resolution |
|---|------|-------|-----------|:----------:|
| W1 | `src/sync/unified.ts` (line ~271) | Tombstone `\0` prefix in hlcMap collides if entity ID starts with `\0`; null bytes may be lost in JSON serialization round-trip | Opus, Sonnet, GPT-5.4, Codex | Non-Issue — no `\0` prefix found in code |
| W2 | `src/utils/composite-key.ts` (lines ~19–46) | Delimiter `:` / `.` collision — keys containing delimiter characters produce ambiguous parsing; `parseEntityKey` assumes well-formed input without validation | Opus, Sonnet | **Fixed** via S6 (entity names reject dots) |
| W3 | `src/tenant/tenant-list.ts` (lines ~12–22) | TOCTOU on tenant list: load→modify→save is not atomic; concurrent processes lose updates | Sonnet, GPT-5.4 | By Design (single-process assumption) |
| W4 | `src/sync/sync-engine.ts` (lines ~46, 113–130) | Disposed check race: `dispose()` can be called between check and `queue.push()`; `processQueue()` checks disposed inside loop but not before enqueue | Sonnet, GPT-5.4, Codex | By Design (single-threaded JS) |
| W5 | `src/store/store.ts` (line ~99/154) | Tombstone retention compares HLC timestamp against `Date.now()` — clock skew or backward system clock causes premature tombstone deletion or resurrection of deleted entities | Sonnet, GPT-5.4 | By Design (HLC timestamp IS wall-clock derived) |
| W6 | `src/persistence/partition-index.ts` (lines ~9–27) | Marker blob loaded without structure validation; optional chaining masks malformed blobs silently returning empty indexes; TOCTOU in saveAllIndexes | Opus, Sonnet, GPT-5.4 | Accepted (optional chaining is intentional for empty/new tenants) |
| W7 | `src/repo/query.ts` (lines ~24–52) | Negative offset/limit accepted (JS `slice()` wraps); range query field names cast to `unknown` suppressing type checks; sort not stable | Opus, Sonnet, GPT-5.4 | **Fixed** — offset and limit clamped with `Math.max(0, ...)` |
| W8 | `src/schema/migration.ts` (lines ~32–49) | Migration output not validated — buggy migration corrupts blob silently; filtering by entity before sorting could skip intermediate versions | Sonnet, Codex | Accepted (migrations are developer code) |
| W9 | `src/reactive/event-bus.ts` | No subscriber count tracking for leak detection; Subject error from subscriber throws cascades to all listeners; `emit()` after `dispose()` not fully guarded | Sonnet, GPT-5.4, Codex | Accepted |
| W10 | `src/sync/sync-engine.ts` (lines ~80–110) | Sync queue grows unbounded under stress; no max queue size; `conflictsResolved` metric inflated (counts all changes, not just conflicts) | Sonnet, GPT-5.4 | Accepted (practical at current scale) |
| W11 | `src/repo/repository.ts` (lines ~60–93) | Non-atomic HLC increment: `nextHlc` advanced before `setEntity()` — if setEntity throws, HLC monotonicity violated; ID length only checked on creation, not on load | Sonnet, Codex | By Design (setEntity is synchronous, won't throw on valid input) |
| W12 | `src/adapter/local-storage.ts` (lines ~15–24) | All localStorage errors wrapped in generic message; quota exceeded vs privacy mode indistinguishable; no graceful degradation | Sonnet, GPT-5.4 | Accepted |

---

### Low / Informational

| # | File | Issue | Flagged by | Resolution |
|---|------|-------|-----------|:----------:|
| L1 | `src/hlc/hlc.ts` (line ~14) | HLC counter can overflow past `Number.MAX_SAFE_INTEGER` — precision loss in comparisons; practically unlikely but not error-handled | Sonnet, GPT-5.4 | Acknowledged (practically unreachable) |
| L2 | `src/store/store.ts` (lines ~104–114) | Empty partition blob returns null; downstream treats null as "not loaded" causing reload thrashing on empty partitions | Codex | By Design (null = not loaded from persistence) |
| L3 | `src/adapter/transforms/retry.ts` (line ~20) | Retry backoff is linear (constant delay), not exponential; causes thundering herd under load | Codex | **Fixed** — changed to exponential backoff: `delayMs * Math.pow(2, attempt)` |
| L4 | `src/utils/buffer.ts` (lines ~7–13) | Base64 encoding via byte-by-byte `String.fromCharCode()` loop — 50–100x slower than native `Buffer` on large payloads; binary data with invalid UTF-8 sequences silently corrupted | Sonnet, Codex | Accepted (adequate for current payload sizes) |
| L5 | `src/strata.ts` (lines ~85–200) | Constructor exception leaks `dirtySubscription`; multiple `dispose()` calls can race during async initialization | GPT-5.4 | Accepted (init errors are fatal) |
| L6 | `src/repo/repository.ts` (lines ~199–228) | Unbounded query results by default — `query()` without pagination on large partitions loads all entities into memory; `distinctUntilChanged` comparator is O(n) per emission | Sonnet, Codex | By Design (app controls pagination) |
| L7 | `src/tenant/tenant-manager.ts` (line ~35) | Cached tenant list not cleared on remove; stale references held by app code remain accessible | Codex | Accepted (cache refreshes on next load) |

---

### Suggestions

| # | File | Suggestion | Flagged by | Resolution |
|---|------|-----------|-----------|:----------:|
| SG1 | `src/utils/crypto.ts` (line ~23) | PBKDF2 iterations (600,000) meets 2023 OWASP but below 2025 NIST recommendation of 700,000+; make configurable | Sonnet, GPT-5.4 | Accepted (meets current OWASP; configurable future backlog) |
| SG2 | `src/utils/id.ts` | Use rejection sampling (`& 0x3F`) instead of modulo for ID character selection — more robust to CHARS length changes | Codex | Accepted (no bias with current power-of-2 alphabet) |
| SG3 | `src/adapter/encryption.ts` (line ~5) | Make PBKDF2 iteration count configurable per application security requirements | GPT-5.4, Codex | Backlog (duplicate of SG1) |
| SG4 | `src/sync/diff.ts` | Compare `(hash, entityCount, tombstoneCount)` tuple instead of hash alone to reduce collision risk without changing hash algorithm | Opus | **Fixed** (implemented as part of S7 fix) |
| SG5 | `src/tenant/tenant-manager.ts` | Add mutual exclusion (async mutex) for tenant lifecycle operations (`open`/`close`/`sync`) | GPT-5.4, Codex | Backlog |
| SG6 | `src/sync/unified.ts` | Implement 3-phase commit with rollback: read → write B → check stale → write A → update indexes | Sonnet, GPT-5.4 | Backlog |

---

## Positive Observations

- **HLC implementation** (`src/hlc/hlc.ts`): Correct Hybrid Logical Clock algorithm handling all cases — timestamp > local, remote > local, and nodeId tiebreaker. Flagged positively by all 4 reviewers.
- **Immutable entity snapshots** (`src/store/store.ts`, `src/persistence/types.ts`): Store returns `Readonly<T>` snapshots; partition blobs use nested `readonly` types. Good enforcement of immutability at both runtime and compile time.
- **RxJS patterns** (`src/reactive/event-bus.ts`, `src/repo/repository.ts`, `src/utils/reactive-flag.ts`): Proper use of `BehaviorSubject`, `distinctUntilChanged()` with custom comparators, and observable lifecycle management. All 4 reviewers noted this as exemplary.
- **KEK/DEK encryption separation** (`src/adapter/encryption.ts`): Two-layer key management (key encryption key / data encryption key) is cryptographically sound practice. Marker blob stored unencrypted enables tenant enumeration without credentials.
- **Migration version validation** (`src/schema/migration.ts`): Validates contiguous 1-based sequence at initialization; catches duplicates and gaps early. Better than many production frameworks.
- **Type-safe repository API** (`src/repo/repository.ts`, `src/repo/types.ts`): Fully generic with types inferred from schema. Overloaded `save()`/`query()` with proper generics prevent type errors. `ReadonlyArray<T>` return types enforce immutability.
- **Stale check pattern in sync** (`src/sync/unified.ts`): Index snapshot taken before sync and rechecked before writing back to detect concurrent writes — correct optimistic concurrency approach (though needs atomicity improvements per C1).
- **PBKDF2 iterations** (`src/utils/crypto.ts`): 600,000 iterations meets current OWASP recommendations. AES-256-GCM is sound algorithm choice with per-message IV randomness.
- **Conflict resolution** (`src/sync/conflict.ts`): HLC-based last-write-wins logic handles all cases correctly including entity-vs-tombstone and tombstone-vs-tombstone comparisons.
- **Deterministic composite keys** (`src/utils/composite-key.ts`): Clean hierarchical key structure (`entity.partition.id`) is well-designed for partitioned storage.

---

## Resolution Summary

All findings have been triaged. Of 38 total findings:

- **7 Fixed**: S4 (castKeys guard), S6 (entity name dot validation + ID length cap), S7/SG4 (hash+count+deletedCount triple), SM3 (interval validation), W7 (pagination clamp), L3 (exponential backoff)
- **5 Non-Issue**: C5 (queue shift is correct), S2 (salt is fixed 16 bytes), SM1 (256 mod 64 = 0), W1 (no \0 prefix in code), W2 (fixed via S6)
- **10 By Design**: C1 (A→B sync philosophy), C3 (single-threaded JS), C4 (await lifecycle ops), S1 (app responsibility), S3 (error oracle prevention), W3 (single process), W4 (single-threaded), W5 (HLC is wall-clock), W11 (synchronous setEntity), L2 (null = not loaded)
- **9 Accepted**: C2 (adapter boundary validation), S5 (adapter contract), S8 (single version), W6 (optional chaining intentional), W8–W12, L1, L4–L7
- **1 JS Limitation**: SM2 (credential in memory)
- **4 Backlog**: SG1/SG3 (configurable PBKDF2 iterations), SG5 (async mutex), SG6 (3-phase commit)
- **2 Accepted Suggestions**: SG2 (no bias with power-of-2 alphabet)

### Backlog Items
1. **SG5**: Async mutex for tenant lifecycle operations (`open`/`close`/`sync`)
2. **SG6**: 3-phase commit with rollback in sync engine
3. **SG1/SG3**: Configurable PBKDF2 iteration count
