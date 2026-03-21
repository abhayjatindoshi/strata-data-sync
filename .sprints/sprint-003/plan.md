# Sprint 003

## Goal
Establish the persistence adapter contract, partition-level load/store operations, HLC-based timestamps, and partition metadata hashing to prepare for sync.

## Tasks

### Module: `persistence` (extends existing)
- [x] TASK-001: Define `BlobAdapter` interface — `read(key): Promise<Uint8Array | null>`, `write(key, data): Promise<void>`, `delete(key): Promise<void>`, `list(prefix): Promise<string[]>` [status: done]
- [x] TASK-002: Implement `loadPartition(adapter, entityDef, partitionKey)` — read blob via adapter, deserialize, return entity array [status: done]
- [x] TASK-003: Implement `storePartition(adapter, entityDef, partitionKey, entities)` — serialize entity array, write blob via adapter [status: done]
- [x] TASK-004: Create in-memory `BlobAdapter` reference implementation for testing [status: done]

### Module: `hlc` (new module)
- [x] TASK-005: Implement `HLC` type and `createHlc(nodeId)` — initialize clock with wall time, counter, node ID [status: done]
- [x] TASK-006: Implement `tickLocal(hlc)` (tick on save) and `tickRemote(hlc, remote)` (tick on receive) — advance clock per HLC algorithm [status: done]
- [x] TASK-007: Implement `compareHlc(a, b)` — total ordering by timestamp, counter, then node ID; return -1 | 0 | 1 [status: done]

### Module: `persistence` — metadata
- [x] TASK-008: Implement partition metadata — compute content hash (FNV-1a) over serialized blob, store alongside latest HLC timestamp per partition [status: done]

## Bugs Carried Over

_None_
