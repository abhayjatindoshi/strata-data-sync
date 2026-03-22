# Sprint 002

## Goal
Build the persistence, in-memory store, reactive, and blob-transform layers on top of the Sprint 001 foundation.

## Tasks

- [x] TASK-001: Persistence — JSON serializer with type marker replacer (`Date` → `{ __t: 'D', v: iso }`) and deserializer with type marker reviver [status: done]
- [x] TASK-002: Persistence — FNV-1a hash function and partition hash (FNV-1a on sorted `id:hlcTimestamp:hlcCounter:hlcNodeId` pairs) [status: done]
- [x] TASK-003: Persistence — Partition index (`__index.entityName` blob with `{ hash, count, updatedAt }` per partition), partition blob structure (entities + deleted tombstones), and debounced flush (2s idle default, configurable, flush on dispose) [status: done]
- [x] TASK-004: In-Memory Store — `Map<entityKey, Map<entityId, entity>>` structure with `save()` / `saveMany()`, `delete()` / `deleteMany()`, `get(entityKey, id)`, `getAll(entityKey)` [status: done]
- [x] TASK-005: In-Memory Store — Partition tracking (`listPartitions(entityName)`, `hasPartition(entityKey)`) and lazy partition loading from local adapter on first access [status: done]
- [x] TASK-006: Reactive — `Subject<void>` per entity type (change signal, no payload), `observe(id)` with `distinctUntilChanged`, `observeQuery(opts)` with `distinctUntilChanged`, change detection via ID + version comparison [status: done]
- [x] TASK-007: Reactive — Event bus (`on(listener)`, `off(listener)`) and `dispose()` (complete all subjects, remove all listeners) [status: done]
- [x] TASK-008: BlobAdapter Transforms — Transform pipeline (`transforms: [gzip(), encrypt(key)]` per adapter), `gzip()` transform, `encrypt(key)` transform [status: done]

## Task Dependencies

```
TASK-001 (serialization) ← TASK-003 (partition index/flush)
TASK-002 (hashing)       ← TASK-003 (partition index/flush)
TASK-003 (flush)         ← TASK-005 (lazy loading)
TASK-004 (store CRUD)    ← TASK-005 (partition tracking)
TASK-006 (reactive core) ← TASK-007 (event bus/dispose)
TASK-008 (transforms)    — independent
```

## Bugs Carried Over

_(none)_
