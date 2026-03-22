# Sprint 003

## Goal
Build the Repository module (full API, query engine, singleton) and lay the Sync Engine foundation (scheduler, flush, diff, merge).

## Tasks

- [x] TASK-001: Repository types — `QueryOptions<T>` (`where`, `range`, `orderBy`, `limit`, `offset`) and return type inference from entity def key strategy [status: done]
- [x] TASK-002: In-memory query engine — filter → sort → offset/limit on Map values, driven by `QueryOptions<T>` [status: done]
- [x] TASK-003: `Repository<T>` — `get`, `query`, `save`, `saveMany`, `delete`, `deleteMany`, `observe`, `observeQuery`; wires store reads/writes, reactive signals, and query engine [status: done]
- [x] TASK-004: `SingletonRepository<T>` — `get`, `save`, `delete`, `observe`; no IDs, no query; derives entity key from singleton strategy [status: done]
- [x] TASK-005: Sync scheduler — one sync at a time globally, dedup queue, concurrent callers receive same promise [status: done]
- [x] TASK-006: Memory → local flush mechanism — periodic flush from in-memory store to local adapter (configurable interval, default 2s), coordinates with debounced flush [status: done]
- [x] TASK-007: Partition index comparison — hash diff to find changed partitions; copy optimization for one-sided partitions (copied without per-entity diff) [status: done]
- [x] TASK-008: Bidirectional merge — bucket-based diff, per-entity HLC resolution, tombstone-aware merge of two partition blobs [status: done]

## Task Dependencies

```
TASK-001 (query types)       ← TASK-002 (query engine)
TASK-002 (query engine)      ← TASK-003 (Repository<T>)
TASK-001 (query types)       ← TASK-003 (Repository<T>)
TASK-001 (query types)       ← TASK-004 (SingletonRepository<T>)
TASK-005 (sync scheduler)    — independent
TASK-006 (flush mechanism)   — independent (builds on persistence flush from Sprint 002)
TASK-007 (partition diff)    ← TASK-008 (bidirectional merge)
TASK-008 (merge)             — depends on TASK-007
```

## Module Mapping

| Task | Module | Dependencies (prior sprints) |
|------|--------|------------------------------|
| TASK-001 | `repository` | `schema`, `key-strategy` |
| TASK-002 | `repository` | `store` |
| TASK-003 | `repository` | `store`, `reactive`, `schema` |
| TASK-004 | `repository` | `store`, `reactive`, `schema` |
| TASK-005 | `sync` | — |
| TASK-006 | `sync` | `persistence`, `store`, `adapter` |
| TASK-007 | `sync` | `persistence` (partition hash) |
| TASK-008 | `sync` | `hlc`, `persistence` |

## Bugs Carried Over

_(none)_
