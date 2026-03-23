<!-- No active sprint -->

<!-- Task columns: # | Task | Epic | Assigned | Status | Source | Created | Completed -->
<!-- Status values: not-started, in-progress, done, known-issue, skipped -->
<!-- Source values: plan, review, test-fix, test -->
<!-- Assigned values: developer, unit-tester, integration-tester -->

## Sprint 1 — Foundation Layer (HLC, Adapter, Schema, Reactive)
Started: 2026-03-23T20:30:00Z

Epics: E1 (HLC), E3 (Adapter types), E4 (MemoryAdapter), E2 (Schema), E6 (Reactive event bus)

### E1 — HLC (types, tick, compare)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Define `Hlc` type (`timestamp: number`, `counter: number`, `nodeId: string`) and `createHlc()` factory in `src/hlc/` | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 2 | Implement `tickLocal(hlc)` — advances timestamp to `max(wallClock, hlc.timestamp)`, increments counter if timestamp unchanged, resets counter if timestamp advanced | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 3 | Implement `tickRemote(local, remote)` — merges local HLC with received remote HLC per HLC algorithm | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 4 | Implement `compareHlc(a, b)` — total ordering: compare timestamp first, then counter, then nodeId string comparison as tiebreaker; return -1/0/1 | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 5 | Write unit tests for HLC module — createHlc, tickLocal (timestamp advance, counter increment), tickRemote (merge scenarios), compareHlc (all tiebreaker levels) | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E3 — Adapter types (BlobAdapter interface)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 6 | Define `BlobAdapter` type with 4 async methods (`read`, `write`, `delete`, `list`) accepting `cloudMeta: Readonly<Record<string, unknown>> \| undefined` as first param in `src/adapter/` | E3 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 7 | Define framework blob key constants/helpers — `__tenants`, `__strata`, `__index.{entityName}`, `{entityName}.{partitionKey}` patterns | E3 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E4 — MemoryBlobAdapter

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 8 | Implement `createMemoryBlobAdapter()` — `Map<string, Uint8Array>` backing store with defensive copy on write, null return on missing read, key prefix filtering for list | E4 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 9 | Write unit tests for MemoryBlobAdapter — read/write round-trip, read returns null for missing key, write stores defensive copy (mutation isolation), delete returns true/false, list filters by prefix, list returns empty for no matches | E4 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E2 — Schema (defineEntity, ID gen, key strategies)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 10 | Define `BaseEntity` type (id, createdAt, updatedAt, version, device, hlc) and `EntityDefinition<T>` type in `src/schema/` | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 11 | Implement `generateId()` — 8-char random alphanumeric unique ID, and `formatEntityId(entityName, partitionKey, uniqueId)` to produce `entityName.partitionKey.uniqueId` format | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 12 | Implement key strategy functions — `partitioned(fn)` derives partition key from entity data, `'global'` always returns `'_'`, `'singleton'` returns `'_'` with deterministic ID | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 13 | Implement `defineEntity<T>(name, options?)` — creates `EntityDefinition` with name, key strategy (default global), and optional `deriveId` function; validate deriveId output contains no dots | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 14 | Write unit tests for schema module — defineEntity returns correct definition, generateId format/uniqueness, partitioned/global/singleton key strategies, deriveId validation rejects dots | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E6 — Reactive event bus

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 15 | Define `EntityEvent` type (with entityName field), `EntityEventListener` callback type, and `EntityEventBus` type (on/off/emit) in `src/reactive/` | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 16 | Implement `createEventBus()` — maintains listener array, `on()` registers listener, `off()` removes listener, `emit()` calls all listeners synchronously | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 17 | Write unit tests for event bus — on/emit delivers events, off removes listener, multiple listeners all fire, emit with no listeners is safe, same listener registered twice | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
