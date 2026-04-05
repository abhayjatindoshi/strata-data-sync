# Code Review — By Module

Issues from the consolidated review, reorganized by module and file.

> Source: [consolidated-review.md](consolidated-review.md) (March 30, 2026)
> Status updated: April 5, 2026

---

## adapter

### encryption.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SH2 | security-high | OPEN | Encryption silently fails open when DEK is null (encode returns plaintext) | Opus, Sonnet, GPT-5.4 |
| SH3 | security-high | OPEN | Silent decode bypass when DEK null returns ciphertext as plaintext | Sonnet |
| SL1 | security-low | OPEN | Tenant list `__tenants` explicitly unencrypted — undocumented | Opus |

### local-storage.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W1 | warning | OPEN | `String.fromCharCode(...data)` stack overflow for large blobs | All 4 |
| W2 | warning | OPEN | No error handling for `localStorage.setItem()` when quota exceeded | Opus |
| L14 | low | ~~FIXED~~ | ~~`list()` O(n) over all `localStorage` keys~~ — `list()` removed from interface | Sonnet |
| L15 | low | OPEN | No guard for environments without `localStorage` (SSR/worker contexts) | Sonnet |
| S3 | suggestion | OPEN | Replace spread-based base64 with chunked conversion | All 4 |

---

## hlc

### hlc.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W37 | warning | OPEN | No drift detection or capping — rogue node can corrupt all timestamps | Sonnet |
| L16 | low | OPEN | Counter unbounded growth in rapid-event scenarios | Sonnet |

---

## persistence

### hash.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W25 | warning | OPEN | 32-bit FNV-1a collisions can hide real divergence | GPT-5.4 |
| L4 | low | OPEN | `charCodeAt` hashes surrogate pairs (UCS-2), diverges from other implementations | Sonnet |
| S8 | suggestion | OPEN | DRY: `fnv1a()` can delegate to `fnv1aAppend(FNV_OFFSET, input)` | Sonnet |

### partition-index.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W22 | warning | OPEN | `saveAllIndexes` read-modify-write race condition | Opus |
| W23 | warning | OPEN | Multiple unchecked runtime casts to `Record<string, unknown>` | Sonnet |
| L3 | low | OPEN | Marker defaults `createdAt: new Date()` on every save when existing is empty | Opus |

### serialize.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W24 | warning | OPEN | `{ __t: 'D', v: string }` marker collides with user data shapes | Sonnet, GPT-5.4 |
| SM3 | security-medium | OPEN | No schema validation on deserialization — `JSON.parse` result cast directly to `T` | Sonnet |
| L2 | low | OPEN | Limited custom type serialization — only `Date` handled | Opus |

### types.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| L1 | low | OPEN | `PartitionBlob` index signature creates type ambiguity with fixed fields | Opus, Sonnet |

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
| W33 | warning | OPEN | Caller-supplied IDs trusted without verifying they belong to current repository | GPT-5.4 |
| L23 | low | OPEN | `parseEntityKey` silently returns `""` for malformed IDs | Sonnet, Codex |
| L25 | low | OPEN | `observeQuery` re-executes full query on every entity change signal | Sonnet |
| S9 | suggestion | OPEN | `query()` collects all entities before applying `limit` — add early termination | Sonnet |
| S10 | suggestion | ~~FIXED~~ | ~~Emit through `eventBus` in `saveMany`/`deleteMany`~~ — implemented | Codex |

### query.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W34 | warning | OPEN | `compareValues` returns 0 for unsupported types — silent no-op sorting | GPT-5.4, Codex |
| W35 | warning | OPEN | `applyOrderBy` inherits `compareValues` silent no-op for unsupported types | Codex |
| L24 | low | OPEN | `applyWhere` uses strict `===` — breaks for `Date` and object field comparisons | Sonnet |

---

## schema

### define-entity.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| S11 | suggestion | OPEN | `deriveId` should also reject colons and null bytes | Sonnet |

### id.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SM2 | security-medium | OPEN | `Math.random()` for ID generation — predictable, collision risk | All 4 |

---

## store

### store.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| C3 | critical | OPEN | Tombstone resurrection inconsistency — `setEntity()` doesn't clear tombstones | GPT-5.4 |
| C4 | critical | OPEN | `getAllPartitionKeys()` omits tombstone-only partitions — deletions never synced | Opus, Sonnet |
| W10 | warning | OPEN | `storedMarkerBlob` is dead code — written but never read | Sonnet |
| W11 | warning | OPEN | Marker reads ignore `storedMarkerBlob`, synthesize fresh | GPT-5.4 |
| W38 | warning | OPEN | `write()` through BlobAdapter doesn't mark dirty — undocumented | Opus |
| L6 | low | OPEN | `buildMarkerBlob` relies on entities having `.hlc` — unsafe assertion | Opus |
| L7 | low | OPEN | `buildMarkerBlob` sets `updatedAt: Date.now()` on every read even when unchanged | Sonnet |
| L8 | low | OPEN | `count: hlcMap.size` includes tombstones | Sonnet |
| L9 | low | OPEN | `buildMarkerBlob` skips entities without `hlc` — hash diverges from `unified.ts` | Sonnet |
| L10 | low | OPEN | `read()` returns null for regular keys but blob for marker key — asymmetry | Opus |
| S6 | suggestion | OPEN | Document that `write()` via BlobAdapter intentionally doesn't track dirty state | Opus |

### flush.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| C5 | critical | OPEN | Migration scoping bug — entity name not passed to `migrateBlob` | GPT-5.4, Codex |
| L11 | low | OPEN | `partitionBlobKey` called twice with identical arguments — redundant | Sonnet |
| S7 | suggestion | OPEN | Pass `entityName` to `migrateBlob` during partition load | GPT-5.4, Codex |

### flush-scheduler.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| S5 | suggestion | OPEN | File is empty except for a comment — consider removing | Opus |

### types.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| L5 | low | OPEN | `EntityStore extends DataAdapter` — tight coupling | Opus |

---

## sync

### sync-engine.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W12 | warning | OPEN | Queue deduplication ignores tenant context | Opus |
| W13 | warning | OPEN | Deduped sync returns `EMPTY_RESULT` not real result | Sonnet, GPT-5.4, Codex |
| W14 | warning | OPEN | `drain()` can busy-wait with `setTimeout(r, 0)` | Sonnet |
| W15 | warning | OPEN | `processQueue` is fire-and-forget — errors not propagated | Sonnet |
| W16 | warning | OPEN | `setInterval` without in-flight guard; operations pile up | Opus, Codex |
| W17 | warning | OPEN | Cloud timer clears dirty before memory flush | GPT-5.4 |
| W18 | warning | OPEN | Cloud sync scheduler errors only logged via debug, not propagated | Opus |
| L17 | low | OPEN | Sync result captured via closure mutation — fragile pattern | Opus |
| L18 | low | OPEN | `emitEntityChanges` assumes key contains a dot | Sonnet |
| S14 | suggestion | OPEN | Add in-flight guards or switch to self-scheduling await loops | Codex |

### unified.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| C2 | critical | OPEN | Stale index advancement without data application | GPT-5.4 |
| W19 | warning | OPEN | `buildHlcMap` assumes `.hlc` exists — undefined if missing | Sonnet, GPT-5.4, Codex |
| W20 | warning | OPEN | Index updates not atomic with data writes | Opus |
| W21 | warning | OPEN | `isStale()` misses concurrent first-partition creation for new entities | GPT-5.4 |
| L19 | low | OPEN | Stale check re-reads all indexes — expensive for large index sets | Sonnet |
| S4 | suggestion | OPEN | Parallelize blob reads in `planCopies`/`planMerges` | Opus, Sonnet |

---

## tenant

### tenant-manager.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SH1 | security-high | OPEN | `changePassword()` never validates old password | All 4 |
| SM5 | security-medium | OPEN | Tenant create TOCTOU window for duplicate ID detection | Sonnet |
| W28 | warning | OPEN | `create()` doesn't reject duplicate tenant IDs | GPT-5.4, Codex |
| W29 | warning | OPEN | Persist path `[...tenants, tenant]` lacks duplicate-ID guard | Codex |
| W30 | warning | OPEN | `delete()` non-atomic; data wiped but tenant stays listed on crash | Opus, Sonnet |
| L22 | low | OPEN | Cached tenant list can become stale across tabs/instances | Opus, Sonnet |
| S15 | suggestion | OPEN | Add duplicate ID detection before create persists tenants | Codex |
| S16 | suggestion | OPEN | Consider cache invalidation strategy for multi-tab scenarios | Opus |

### tenant-sync.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W26 | warning | OPEN | `pushTenantList` overwrites cloud list without merging | Opus |
| W27 | warning | OPEN | Date comparison in `mergeTenantLists` may fail after deserialization | Opus |

### marker-blob.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W31 | warning | OPEN | `writeMarkerBlob` resets `createdAt` on every call | Opus, Sonnet |
| W32 | warning | OPEN | `writeMarkerBlob` creates marker with `indexes: {}`, discarding existing | Opus |
| L20 | low | OPEN | `readMarkerBlob` performs unchecked cast — no schema validation | Sonnet |

### tenant-list.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| L21 | low | OPEN | `loadTenantList` unchecked cast `as Tenant[]` — no validation | Opus, Sonnet |

---

## strata (root)

### strata.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| W3 | warning | OPEN | Magic byte `0x7B` encryption detection is brittle | Opus, Sonnet |
| W4 | warning | OPEN | `tombstoneRetentionMs` accepted but never implemented — unbounded growth | Opus |
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
| L26 | low | OPEN | Barrel re-export exposes all internal types as public API surface | Sonnet |
| S12 | suggestion | OPEN | Restrict barrel exports to consumer-facing types only | Sonnet |

---

## utils

### crypto.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SM1 | security-medium | OPEN | PBKDF2 uses static `appId` as salt | Opus, Sonnet, GPT-5.4 |
| SM4 | security-medium | OPEN | PBKDF2 iteration count below OWASP recommendation (100k vs 600k+) | Opus |
| SL2 | security-low | OPEN | `decrypt` lacks minimum buffer length guard | Sonnet |
| SL3 | security-low | OPEN | `exportDek` spread pattern fragile for larger keys | Opus |
| S1 | suggestion | OPEN | Use `crypto.getRandomValues()` for random salt | Opus, Sonnet |
| S2 | suggestion | OPEN | Add minimum buffer length guard in `decrypt` | Sonnet |

### id.ts

| ID | Severity | Status | Issue | Flagged by |
|----|----------|--------|-------|-----------|
| SM2 | security-medium | OPEN | `Math.random()` for ID generation — predictable, collision risk | All 4 |

---

## Summary

| Status | Count |
|--------|-------|
| ~~FIXED~~ | **7** |
| OPEN | **82** |

### Fixed Issues

| ID | Module | Issue |
|----|--------|-------|
| C1 | repo | `saveMany()`/`deleteMany()` now emit through EventBus |
| S10 | repo | Batch ops emit through EventBus |
| W36 | reactive | EventBus now RxJS Subject-based with listener isolation |
| L14 | adapter | `list()` removed from StorageAdapter interface |
| W5 | strata | `close()` properly clears `activeTenant$` |
| W6 | strata | `open()` calls `close()` first, preventing orphaned schedulers |
| L12 | strata | Non-null assertion removed |