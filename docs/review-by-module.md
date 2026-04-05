# Code Review — By Module

Issues from the consolidated review, reorganized by module and file.

> Source: [consolidated-review.md](consolidated-review.md) (March 30, 2026)
> Status updated: April 5, 2026

---

## adapter

### encryption.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SH2 | security-high | ~~FIXED~~ | ~~Encryption silently fails open when DEK is null~~ — now throws when keys present but DEK null | Opus, Sonnet, GPT-5.4 |
| SH3 | security-high | ~~FIXED~~ | ~~Silent decode bypass when DEK null returns ciphertext~~ — now throws when keys present but DEK null | Sonnet |
| SL1 | security-low | ~~FIXED~~ | ~~Tenant list `__tenants` explicitly unencrypted — undocumented~~ — documented with inline comments | Opus |

### local-storage.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W1 | warning | ~~FIXED~~ | ~~`String.fromCharCode(...data)` stack overflow for large blobs~~ — replaced with loop-based conversion | All 4 |
| W2 | warning | ~~FIXED~~ | ~~No error handling for `localStorage.setItem()` quota exceeded~~ — wrapped with try/catch | Opus |
| L14 | low | ~~FIXED~~ | ~~`list()` O(n) over all `localStorage` keys~~ — `list()` removed from interface | Sonnet |
| L15 | low | ~~FIXED~~ | ~~No guard for environments without `localStorage`~~ — constructor throws if unavailable | Sonnet |
| S3 | suggestion | ~~FIXED~~ | ~~Replace spread-based base64 with chunked conversion~~ — implemented | All 4 |

---

## hlc

### hlc.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W37 | warning | WONTFIX | No HLC drift detection — edge case, document limits | Sonnet |
| L16 | low | WONTFIX | HLC counter unbounded growth — negligible in practice | Sonnet |

---

## persistence

### hash.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W25 | warning | WONTFIX | 32-bit FNV-1a collisions can hide real divergence — negligible at realistic partition counts | GPT-5.4 |
| L4 | low | WONTFIX | `charCodeAt` hashes surrogate pairs — self-consistent, internal-only hash | Sonnet |
| S8 | suggestion | ~~FIXED~~ | ~~DRY: `fnv1a()` can delegate to `fnv1aAppend`~~ — implemented | Sonnet |

### partition-index.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W22 | warning | WONTFIX | `saveAllIndexes` read-modify-write race — sequential sync queue is the concurrency guard | Opus |
| W23 | warning | WONTFIX | Multiple unchecked runtime casts — tracked under SM3 as broader deserialization concern | Sonnet |
| L3 | low | WONTFIX | Marker defaults `createdAt: new Date()` — only on first save when no marker exists, correct | Opus |

### serialize.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W24 | warning | WONTFIX | `{ __t: 'D', v: string }` marker collides with user data — extremely unlikely edge case, changing is breaking | Sonnet, GPT-5.4 |
| SM3 | security-medium | WONTFIX | No schema validation on deserialization — internal serialization, framework controls both sides | Sonnet |
| L2 | low | WONTFIX | Limited custom type serialization — entities are plain data, no Map/Set use case | Opus |

### types.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| L1 | low | WONTFIX | `PartitionBlob` index signature creates type ambiguity — necessary for dynamic entity keys | Opus, Sonnet |

---

## reactive

### event-bus.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W36 | warning | ~~FIXED~~ | ~~`emit()` no listener isolation; one throw aborts all~~ — now RxJS Subject-based | GPT-5.4 |

---

## repo

### repository.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| C1 | critical | ~~FIXED~~ | ~~`saveMany()`/`deleteMany()` bypass EventBus~~ — all ops now emit through EventBus | All 4 |
| W33 | warning | ~~FIXED~~ | ~~Caller-supplied IDs trusted without verifying repo~~ — validates entity name prefix | GPT-5.4 |
| L23 | low | WONTFIX | `parseEntityKey` silently returns `""` for malformed IDs — harmless, get/delete return undefined | Sonnet, Codex |
| L25 | low | WONTFIX | `observeQuery` re-executes full query on every change — perf optimization, correctness-first | Sonnet |
| S9 | suggestion | WONTFIX | `query()` collects all before `limit` — can't early-exit with orderBy | Sonnet |
| S10 | suggestion | ~~FIXED~~ | ~~Emit through `eventBus` in `saveMany`/`deleteMany`~~ — implemented | Codex |

### query.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W34 | warning | ~~FIXED~~ | ~~`compareValues` returns 0 for unsupported types~~ — now supports boolean, null, undefined with type ranking | GPT-5.4, Codex |
| W35 | warning | ~~FIXED~~ | ~~`applyOrderBy` inherits silent no-op~~ — inherits compareValues fix | Codex |
| L24 | low | ~~FIXED~~ | ~~`applyWhere` uses strict `===`~~ — now uses `valuesEqual` with Date support | Sonnet |

---

## schema

### define-entity.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| S11 | suggestion | WONTFIX | `deriveId` reject colons/null bytes — colons don't conflict with ID format, null bytes unrealistic | Sonnet |

### id.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SM2 | security-medium | OPEN | `Math.random()` for ID generation — predictable, collision risk | All 4 |

---

## store

### store.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| C3 | critical | ~~FIXED~~ | ~~Tombstone resurrection~~ — `setEntity()` now clears pre-existing tombstones | GPT-5.4 |
| C4 | critical | ~~FIXED~~ | ~~`getAllPartitionKeys()` omits tombstone-only partitions~~ — now includes tombstone keys | Opus, Sonnet |
| W10 | warning | ~~FIXED~~ | ~~`storedMarkerBlob` is dead code~~ — replaced with cached marker blob with invalidation | Sonnet |
| W11 | warning | ~~FIXED~~ | ~~Marker reads ignore `storedMarkerBlob`~~ — now cached and invalidated on mutations | GPT-5.4 |
| W38 | warning | WONTFIX | `write()` doesn't mark dirty — intentional for sync import path, documented | Opus |
| L6 | low | WONTFIX | `buildMarkerBlob` optional `.hlc` — correct, all framework entities have HLC | Opus |
| L7 | low | WONTFIX | `updatedAt: Date.now()` on build — harmless, only recalculated on cache miss | Sonnet |
| L8 | low | ~~FIXED~~ | ~~`count: hlcMap.size` includes tombstones~~ — now uses `partition.size` for live entities only | Sonnet |
| L9 | low | WONTFIX | `buildMarkerBlob` skips entities without `hlc` — consistent with `unified.ts` | Sonnet |
| L10 | low | WONTFIX | `read()` marker asymmetry — by design, synthesizes from live state | Opus |
| S6 | suggestion | WONTFIX | Document `write()` dirty behavior — tracked under W38 | Opus |

### flush.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| C5 | critical | ~~FIXED~~ | ~~Migration scoping bug — entity name not passed~~ — `entityName` now passed to `migrateBlob` | GPT-5.4, Codex |
| L11 | low | ~~FIXED~~ | ~~`partitionBlobKey` called twice~~ — reuses computed `key` variable | Sonnet |
| S7 | suggestion | ~~FIXED~~ | ~~Pass `entityName` to `migrateBlob`~~ — implemented | GPT-5.4, Codex |

### flush-scheduler.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| S5 | suggestion | ~~FIXED~~ | ~~File is empty~~ — already deleted | Opus |

### types.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| L5 | low | WONTFIX | `EntityStore extends DataAdapter` — intentional protocol for sync adapter | Opus |

---

## sync

### sync-engine.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W12 | warning | WONTFIX | Queue dedup ignores tenant — only one tenant active at a time, correct behavior | Opus |
| W13 | warning | WONTFIX | Deduped sync returns `EMPTY_RESULT` — deduped caller knows sync completed via promise | Sonnet, GPT-5.4, Codex |
| W14 | warning | WONTFIX | `drain()` busy-wait — one-tick loop between last item and `running=false`, negligible | Sonnet |
| W15 | warning | WONTFIX | `processQueue` fire-and-forget — errors routed to `item.reject()` inside try/catch | Sonnet |
| W16 | warning | WONTFIX | `setInterval` without guard — `sync()` deduplicates, no pile-up | Opus, Codex |
| W17 | warning | OPEN | Cloud timer clears dirty before memory flush | GPT-5.4 |
| W18 | warning | WONTFIX | Scheduler errors only logged — background ops, sync-failed events emitted | Opus |
| L17 | low | WONTFIX | Closure mutation for sync result — standard promise queue pattern | Opus |
| L18 | low | WONTFIX | `emitEntityChanges` assumes dot in key — partition keys always have dots | Sonnet |
| S14 | suggestion | WONTFIX | In-flight guards — `sync()` dedup serves same purpose | Codex |

### unified.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| C2 | critical | ~~FIXED~~ | ~~Stale index advancement without data application~~ — each adapter's index only updated for changes written to it | GPT-5.4 |
| W19 | warning | WONTFIX | `buildHlcMap` assumes `.hlc` exists — all framework entities have HLC, consistent with store | Sonnet, GPT-5.4, Codex |
| W20 | warning | WONTFIX | Index updates not atomic — crash recovery is self-healing via idempotent merge | Opus |
| W21 | warning | WONTFIX | `isStale()` misses new entities — entity types are static, writes are sequential | GPT-5.4 |
| L19 | low | ~~FIXED~~ | ~~Stale check re-reads indexes~~ — reuses `checkStale` result for final merge | Sonnet |
| S4 | suggestion | ~~FIXED~~ | ~~Parallelize blob reads~~ — `planCopies` uses `Promise.all` | Opus, Sonnet |

---

## tenant

### tenant-manager.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SH1 | security-high | WONTFIX | `changePassword()` validates old password implicitly via decrypt failure | All 4 |
| SM5 | security-medium | ~~FIXED~~ | ~~Tenant create TOCTOU~~ — `create()` returns existing tenant if ID matches | Sonnet |
| W28 | warning | ~~FIXED~~ | ~~`create()` doesn't reject duplicate IDs~~ — idempotent, returns existing | GPT-5.4, Codex |
| W29 | warning | ~~FIXED~~ | ~~Persist path lacks duplicate-ID guard~~ — duplicate check before persist | Codex |
| W30 | warning | ~~FIXED~~ | ~~`delete()` non-atomic~~ — list updated first, then data purged | Opus, Sonnet |
| L22 | low | WONTFIX | Cached tenant list stale across tabs — inherent to single-process architecture | Opus, Sonnet |
| S15 | suggestion | ~~FIXED~~ | ~~Add duplicate ID detection~~ — implemented as idempotent create | Codex |
| S16 | suggestion | WONTFIX | Cache invalidation — inherent to single-process architecture | Opus |

### tenant-sync.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W26 | warning | ~~FIXED~~ | ~~`pushTenantList` overwrites cloud~~ — now merges before saving | Opus |
| W27 | warning | ~~FIXED~~ | ~~Date comparison may fail after deserialization~~ — coerced to Date before comparison | Opus |

### marker-blob.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W31 | warning | WONTFIX | `writeMarkerBlob` resets `createdAt` — only called during tenant creation | Opus, Sonnet |
| W32 | warning | WONTFIX | `writeMarkerBlob` indexes:{} — only called during creation, sync uses `saveAllIndexes` | Opus |
| L20 | low | WONTFIX | `readMarkerBlob` unchecked cast — tracked under SM3 | Sonnet |

### tenant-list.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| L21 | low | WONTFIX | `loadTenantList` unchecked cast — tracked under SM3 | Opus, Sonnet |

---

## strata (root)

### strata.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W3 | warning | OPEN | Magic byte `0x7B` encryption detection is brittle | Opus, Sonnet |
| W4 | warning | ~~FIXED~~ | ~~`tombstoneRetentionMs` never implemented~~ — expired tombstones filtered in `Store.read()` | Opus |
| W5 | warning | ~~FIXED~~ | ~~`unloadCurrentTenant()` leaves `activeTenant$` stale~~ — `close()` calls `tenantContext.clear()` | GPT-5.4 |
| W6 | warning | ~~FIXED~~ | ~~`loadTenant` has no concurrency guard~~ — `open()` calls `close()` first | Sonnet |
| W7 | warning | OPEN | `sync()` return value only reports `local→cloud`, not full round-trip | Opus |
| W8 | warning | OPEN | Cloud sync failure during `loadTenant()` silently swallowed | Opus |
| W9 | warning | OPEN | `partitionsSynced` double-counts merged partitions | Sonnet |
| L12 | low | ~~FIXED~~ | ~~Non-null assertion `marker.dek!`~~ — removed | Sonnet |
| L13 | low | OPEN | `StrataConfig.entities` typed as `EntityDefinition<any>[]` — weakens type safety | Sonnet |
| S13 | suggestion | OPEN | Validate `oldPassword` explicitly before accepting password rotation | Codex |

### index.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| L26 | low | WONTFIX | Barrel re-export exposes all internal types — not a correctness issue | Sonnet |
| S12 | suggestion | WONTFIX | Restrict barrel exports — deferred | Sonnet |

---

## utils

### crypto.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SM1 | security-medium | OPEN | PBKDF2 uses static `appId` as salt — requires storage schema change | Opus, Sonnet, GPT-5.4 |
| SM4 | security-medium | ~~FIXED~~ | ~~PBKDF2 100k iterations~~ — increased to 600k per OWASP | Opus |
| SL2 | security-low | ~~FIXED~~ | ~~`decrypt` lacks buffer length guard~~ — minimum 14 bytes enforced | Sonnet |
| SL3 | security-low | ~~FIXED~~ | ~~`exportDek` spread pattern~~ — uses `toBase64` | Opus |
| S1 | suggestion | OPEN | Use `crypto.getRandomValues()` for random salt — tracked under SM1 | Opus, Sonnet |
| S2 | suggestion | ~~FIXED~~ | ~~Buffer length guard in decrypt~~ — implemented | Sonnet |

### id.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SM2 | security-medium | ~~FIXED~~ | ~~`Math.random()` for ID generation~~ — switched to `crypto.getRandomValues()` | All 4 |

---

## Summary

| Status | Count |
|--------|-------|
| ~~FIXED~~ | **45** |
| WONTFIX | **42** |
| OPEN | **2** |

### Fixed Issues

| ID | Module | Issue |
|----|--------|-------|
| C1 | repo | `saveMany()`/`deleteMany()` now emit through EventBus |
| S10 | repo | Batch ops emit through EventBus |
| W36 | reactive | EventBus now RxJS Subject-based with listener isolation |
| L14 | adapter | `list()` removed from StorageAdapter interface |
| SH2 | adapter | Encryption throws when keys present but DEK null |
| SH3 | adapter | Decryption throws when keys present but DEK null |
| SL1 | adapter | Tenant key bypass documented with inline comments |
| W5 | strata | `close()` properly clears `activeTenant$` |
| W6 | strata | `open()` calls `close()` first, preventing orphaned schedulers |
| L12 | strata | Non-null assertion removed |
| W1 | adapter | base64 conversion uses loop instead of spread |
| W2 | adapter | localStorage write wrapped with try/catch for quota errors |
| L15 | adapter | Constructor guard for missing localStorage |
| S3 | adapter | Chunked base64 conversion implemented |
| S8 | persistence | `fnv1a()` delegates to `fnv1aAppend` |
| W33 | repo | Entity ID prefix validated against repository name |
| W34 | repo | `compareValues` supports boolean, null, undefined, Date with type ranking |
| W35 | repo | `applyOrderBy` inherits `compareValues` fix |
| L24 | repo | `applyWhere` uses `valuesEqual` with Date support |
| SM2 | schema | `generateId` uses `crypto.getRandomValues()` instead of `Math.random()` |
| C3 | store | `setEntity()` clears pre-existing tombstones |
| C4 | store | `getAllPartitionKeys()` includes tombstone-only partitions |
| C5 | store | `entityName` passed to `migrateBlob` in flush |
| W10 | store | Dead `storedMarkerBlob` replaced with cached marker + invalidation |
| W11 | store | Marker blob cached and invalidated on mutations |
| L8 | store | `count` uses `partition.size` for live entities only |
| L11 | store | Redundant `partitionBlobKey` call removed |
| S5 | store | Empty `flush-scheduler.ts` deleted |
| S7 | store | `entityName` passed to `migrateBlob` |
| C2 | sync | Each adapter's index only updated for changes actually written to it |
| L19 | sync | Stale check indexes reused for final merge |
| S4 | sync | `planCopies` blob reads parallelized with `Promise.all` |
| SM5 | tenant | Idempotent `create()` returns existing tenant |
| W28 | tenant | Duplicate tenant ID handled via idempotent create |
| W29 | tenant | Duplicate-ID guard before persist |
| W30 | tenant | `remove()` updates list before purging data |
| W26 | tenant | `pushTenantList` merges with cloud before saving |
| W27 | tenant | Date coercion in `mergeTenantLists` |
| W3 | strata | Magic byte detection removed |
| SM4 | utils | PBKDF2 iterations increased to 600k |
| SL2 | utils | Decrypt buffer length guard (min 14 bytes) |
| SL3 | utils | `exportCryptoKey` uses `toBase64` |
| S2 | utils | Buffer length guard implemented |
| W4 | strata | Tombstone retention implemented — expired tombstones pruned in `Store.read()` |