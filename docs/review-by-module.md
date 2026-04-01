# Code Review Issues — Grouped by Module

> Reorganized from [consolidated-review.md](consolidated-review.md)  
> Severity key: **C** = Critical, **SH** = Security-High, **SM** = Security-Medium, **SL** = Security-Low, **W** = Warning, **L** = Low/Info, **S** = Suggestion

---

## `src/strata.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| ~~SH1~~ | ~~Security-High~~ | ~~`changePassword()` never validates old password~~ | ~~All 4~~ |
| ~~W3~~ | ~~Warning~~ | ~~Magic byte `0x7B` encryption detection is brittle — no longer exists in code~~ | ~~Opus, Sonnet~~ |
| W4 | Warning | `tombstoneRetentionMs` accepted but never implemented — unbounded growth | Opus |
| ~~W5~~ | ~~Warning~~ | ~~`unloadCurrentTenant()` leaves `activeTenant$` stale — renamed to `close()`, properly clears~~ | ~~GPT-5.4~~ |
| ~~W6~~ | ~~Warning~~ | ~~`loadTenant` has no concurrency guard — `open()` now calls `close()` first~~ | ~~Sonnet~~ |
| W7 | Warning | `sync()` return value only reports `local→cloud`, not full round-trip | Opus |
| W8 | Warning | Cloud sync failure during `loadTenant()` silently swallowed | Opus |
| W9 | Warning | `partitionsSynced` double-counts merged partitions | Sonnet |
| L12 | Low | Non-null assertion `marker.dek!` — opaque error if undefined | Sonnet |
| L13 | Low | `StrataConfig.entities` typed as `EntityDefinition<any>[]` — weakens type safety | Sonnet |
| ~~S13~~ | ~~Suggestion~~ | ~~Validate `oldPassword` explicitly before accepting password rotation — now validated via AES-GCM decryption~~ | ~~Codex~~ |

---

## `src/adapter/`

### `encryption.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| SH2 | Security-High | Encryption silently fails open when DEK is null (encode) | Opus, Sonnet, GPT-5.4 |
| SH3 | Security-High | Silent decode bypass when DEK null returns ciphertext as plaintext | Sonnet |
| SL1 | Security-Low | Tenant list `__tenants` explicitly unencrypted | Opus |

### `crypto.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| SM1 | Security-Medium | PBKDF2 uses static `appId` as salt | Opus, Sonnet, GPT-5.4 |
| SM4 | Security-Medium | PBKDF2 iteration count below OWASP recommendation | Opus |
| SL2 | Security-Low | `decrypt` lacks minimum buffer length guard | Sonnet |
| SL3 | Security-Low | `exportDek` spread pattern fragile for larger keys | Opus |
| S1 | Suggestion | Use `crypto.getRandomValues()` for random salt | Opus, Sonnet |
| S2 | Suggestion | Add minimum buffer length guard in `decrypt` | Sonnet |

### `local-storage.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W1 | Warning | `String.fromCharCode(...data)` stack overflow for large blobs | All 4 |
| W2 | Warning | No error handling for `localStorage.setItem()` when quota exceeded | Opus |
| L14 | Low | `list()` O(n) over all `localStorage` keys including unrelated libraries | Sonnet |
| L15 | Low | No guard for environments without `localStorage` (SSR/worker contexts) | Sonnet |
| S3 | Suggestion | Replace spread-based base64 with chunked conversion | All 4 |

---

## `src/repo/`

### `repository.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| C1 | **Critical** | `saveMany()`/`deleteMany()` bypass EventBus — dirty tracking broken | All 4 |
| W33 | Warning | Caller-supplied IDs trusted without verifying they belong to current repository | GPT-5.4 |
| L23 | Low | `parseEntityKey` silently returns `""` for malformed IDs instead of throwing | Sonnet, Codex |
| L25 | Low | `observeQuery` re-executes full query on every entity change signal | Sonnet |
| S9 | Suggestion | `query()` collects all entities before applying `limit` — add early termination | Sonnet |
| S10 | Suggestion | Emit through `eventBus` in `saveMany`/`deleteMany` — batched event is sufficient | Codex |

### `query.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W34 | Warning | `compareValues` returns 0 for unsupported types — silent no-op sorting | GPT-5.4, Codex |
| W35 | Warning | `applyOrderBy` inherits `compareValues` silent no-op for unsupported types | Codex |
| L24 | Low | `applyWhere` uses strict `===` — breaks for `Date` and object field comparisons | Sonnet |

---

## `src/store/`

### `store.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| C3 | **Critical** | Tombstone resurrection inconsistency — `setEntity()` doesn't clear pre-existing tombstones | GPT-5.4 |
| C4 | **Critical** | `list()` omits tombstone-only partitions — deletions never pushed to remote | Opus, Sonnet |
| W10 | Warning | `storedMarkerBlob` is dead code — written but never read | Sonnet |
| W11 | Warning | Marker reads ignore `storedMarkerBlob`, synthesize fresh, drop persisted metadata | GPT-5.4 |
| W38 | Warning | `write()` through BlobAdapter interface doesn't mark dirty — intentional but undocumented | Opus |
| L5 | Low | `EntityStore extends BlobAdapter` — tight coupling between store and sync abstractions | Opus |
| L6 | Low | `buildMarkerBlob` relies on entities having `.hlc` — unsafe type assertion | Opus |
| L7 | Low | `buildMarkerBlob` sets `updatedAt: Date.now()` on every read even when no data changed | Sonnet |
| L8 | Low | `count: hlcMap.size` includes tombstones — differs from expected "live entity count" semantics | Sonnet |
| L9 | Low | `buildMarkerBlob` skips entities without `hlc` — hash diverges from `unified.ts:buildHlcMap` | Sonnet |
| L10 | Low | `read()` returns null for regular keys when empty, but returns blob for marker key — asymmetry | Opus |
| S6 | Suggestion | Document that `write()` via BlobAdapter intentionally doesn't track dirty state | Opus |

### `flush.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| C5 | **Critical** | Migration scoping bug — entity name not passed to `migrateBlob()` | GPT-5.4, Codex |
| L11 | Low | `partitionBlobKey` called twice with identical arguments — redundant | Sonnet |
| S7 | Suggestion | Pass `entityName` to `migrateBlob` during partition load | GPT-5.4, Codex |

### `flush-scheduler.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| ~~S5~~ | ~~Suggestion~~ | ~~File is empty except for a comment — intentionally cleared, documents removal reason~~ | ~~Opus~~ |

---

## `src/sync/`

### `unified.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| C2 | **Critical** | Stale index advancement without data application | GPT-5.4 |
| W19 | Warning | `buildHlcMap` assumes `.hlc` exists — undefined if missing | Sonnet, GPT-5.4, Codex |
| W20 | Warning | Index updates not atomic with data writes — crash causes stale indexes | Opus |
| W21 | Warning | `isStale()` misses concurrent first-partition creation for new entities | GPT-5.4 |
| L19 | Low | Stale check re-reads all indexes from adapter A — expensive for large index sets | Sonnet |
| S4 | Suggestion | Parallelize blob reads in `planCopies`/`planMerges` for high-latency adapters | Opus, Sonnet |

### `sync-engine.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W12 | Warning | Queue deduplication ignores tenant context | Opus |
| W13 | Warning | Deduped sync returns `EMPTY_RESULT` not real result | Sonnet, GPT-5.4, Codex |
| W14 | Warning | `drain()` can busy-wait with `setTimeout(r, 0)` | Sonnet |
| W15 | Warning | `processQueue` is fire-and-forget — errors not propagated | Sonnet |
| L17 | Low | Sync result captured via closure mutation — fragile pattern | Opus |
| L18 | Low | `emitEntityChanges` assumes key contains a dot — returns `""` if not | Sonnet |

### `sync-scheduler.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W16 | Warning | `setInterval` without in-flight guard; operations pile up | Opus, Codex |
| W17 | Warning | Cloud timer clears dirty before memory flush | GPT-5.4 |
| W18 | Warning | Cloud sync scheduler errors only logged via debug, not propagated | Opus |
| S14 | Suggestion | Add in-flight guards or switch to self-scheduling await loops | Codex |

### `merge.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| C3 | **Critical** | `mergePartition()` copies both entity and tombstone for `localOnly`/`cloudOnly` IDs instead of resolving via HLC | GPT-5.4 |

### `conflict.ts` / `diff.ts` / `dirty-tracker.ts`

No issues flagged.

---

## `src/persistence/`

### `serialize.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| SM3 | Security-Medium | No schema validation on deserialization — `JSON.parse` cast directly to `T` | Sonnet |
| W24 | Warning | `{ __t: 'D', v: string }` marker collides with user data shapes | Sonnet, GPT-5.4 |
| L2 | Low | Limited custom type serialization — only `Date` handled; `Map`, `Set`, `RegExp` silently lost | Opus |

### `partition-index.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W22 | Warning | `saveAllIndexes` read-modify-write race condition | Opus |
| W23 | Warning | Multiple unchecked runtime casts to `Record<string, unknown>` | Sonnet |
| L3 | Low | Marker defaults `createdAt: new Date()` on every save when existing is empty | Opus |

### `hash.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W25 | Warning | 32-bit FNV-1a collisions can hide real divergence | GPT-5.4 |
| L4 | Low | `charCodeAt` hashes surrogate pairs (UCS-2), diverges from other FNV-1a implementations | Sonnet |
| S8 | Suggestion | DRY: `fnv1a()` can delegate to `fnv1aAppend(FNV_OFFSET, input)` | Sonnet |

### `types.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| L1 | Low | `PartitionBlob` index signature creates type ambiguity with fixed fields | Opus, Sonnet |

---

## `src/tenant/`

### `tenant-manager.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| SM2 | Security-Medium | `Math.random()` for tenant ID generation (predictable, collisions) | All 4 |
| SM5 | Security-Medium | TOCTOU window for duplicate ID detection during `create()` | Sonnet |
| W28 | Warning | `create()` doesn't reject duplicate tenant IDs | GPT-5.4, Codex |
| W29 | Warning | Persist path `[...tenants, tenant]` lacks duplicate-ID guard | Codex |
| W30 | Warning | `delete()` non-atomic; data wiped but tenant stays listed on crash | Opus, Sonnet |
| L22 | Low | Cached tenant list can become stale across tabs/instances | Opus, Sonnet |
| S15 | Suggestion | Add duplicate ID detection before create persists tenants | Codex |
| S16 | Suggestion | Consider cache invalidation strategy for multi-tab scenarios | Opus |

### `tenant-sync.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W26 | Warning | `pushTenantList` overwrites cloud list without merging | Opus |
| ~~W27~~ | ~~Warning~~ | ~~Date comparison in `mergeTenantLists` may fail after deserialization — works correctly, `>` operator on Date objects is valid~~ | ~~Opus~~ |

### `marker-blob.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W31 | Warning | `writeMarkerBlob` resets `createdAt` on every call | Opus, Sonnet |
| W32 | Warning | `writeMarkerBlob` creates fresh marker with `indexes: {}`, discarding existing index data | Opus |
| L20 | Low | `readMarkerBlob` performs unchecked cast — no schema validation on stored data | Sonnet |

### `tenant-list.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| L21 | Low | `loadTenantList` unchecked cast `as Tenant[]` — no validation of stored fields | Opus, Sonnet |

---

## `src/schema/`

### `id.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| SM2 | Security-Medium | `Math.random()` for entity ID generation (predictable, collisions) | All 4 |

### `define-entity.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| S11 | Suggestion | `deriveId` should also reject colons and null bytes (namespace collision risk) | Sonnet |

---

## `src/hlc/`

### `hlc.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W37 | Warning | No drift detection or capping — rogue node can corrupt all timestamps | Sonnet |
| L16 | Low | Counter unbounded growth in rapid-event scenarios — can bloat HLC string | Sonnet |

---

## `src/reactive/`

### `event-bus.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| W36 | Warning | `emit()` no listener isolation; one throwing listener aborts all and bubbles into caller | GPT-5.4 |

---

## `src/index.ts`

| ID | Severity | Issue | Flagged by |
|----|----------|-------|-----------|
| L26 | Low | Barrel re-export exposes all internal types as public API surface | Sonnet |
| S12 | Suggestion | Restrict barrel exports to consumer-facing types only | Sonnet |

---

## Summary by Module

| Module | Critical | Sec-High | Sec-Med | Sec-Low | Warnings | Low | Suggestions | **Total** |
|--------|:--------:|:--------:|:-------:|:-------:|:--------:|:---:|:-----------:|:---------:|
| `strata.ts` | — | 1 | — | — | 7 | 2 | 1 | **11** |
| `adapter/` | — | 2 | 2 | 3 | 2 | 2 | 3 | **14** |
| `repo/` | 1 | — | — | — | 3 | 3 | 2 | **9** |
| `store/` | 2 | — | — | — | 3 | 7 | 3 | **15** |
| `sync/` | 1 | — | — | — | 10 | 3 | 2 | **16** |
| `persistence/` | — | — | 1 | — | 4 | 4 | 1 | **10** |
| `tenant/` | — | — | 2 | — | 7 | 3 | 2 | **14** |
| `schema/` | — | — | 1 | — | — | — | 1 | **2** |
| `hlc/` | — | — | — | — | 1 | 1 | — | **2** |
| `reactive/` | — | — | — | — | 1 | — | — | **1** |
| `index.ts` | — | — | — | — | — | 1 | 1 | **2** |
| **Total** | **4** | **3** | **6** | **3** | **38** | **26** | **16** | **96** |

> Note: Some issues (e.g. C3, SM2) span multiple modules and appear under each relevant module, so the per-module total (96) exceeds the deduplicated count (73 unique + 16 suggestions = 89).
