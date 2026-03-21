# Sprint 004

## Goal
Implement the sync engine with metadata-first diffing, HLC-based conflict resolution, dirty tracking with batched scheduling, and stale write protection.

## Tasks

### Module: `sync` (new module)
- [x] TASK-001: Define core sync types — `SyncDirection` (store→local, local↔cloud), `SyncBucket` (a-only, b-only, mismatched), `SyncResult`, `DirtyTracker` interface, `SyncScheduler` interface [status: done]
- [x] TASK-002: Implement metadata-first diff — compare partition-level metadata timestamps and hashes between two tiers, return list of changed partition keys categorized into three buckets (a-only, b-only, mismatched) [status: done]
- [x] TASK-003: Implement deep diff for mismatched partitions — compare entity-level HLCs from both sides' metadata, identify per-entity changes and direction, detect one-way-copy optimization (skip loading the behind side's blob) [status: done]
- [x] TASK-004: Implement conflict resolution — last-writer-wins via HLC comparison (`updatedAt` → `version` → `device`), delete-wins-on-equal-HLC rule, produce merged entity list per partition [status: done]
- [x] TASK-005: Implement sync apply — copy a-only entities to B, b-only entities to A, apply conflict-resolved merges to both sides, recompute partition metadata hashes after apply [status: done]
- [x] TASK-006: Implement stale write protection — re-check source metadata after applying changes to target; if source changed during sync, skip writing back to source and defer to next cycle [status: done]
- [x] TASK-007: Implement dirty tracking — version counter on store mutations, detect divergence from local/cloud versions, mark partitions dirty on write [status: done]
- [x] TASK-008: Implement sync scheduler — batched and deduplicated sync queue, coalesce rapid writes into single sync, prevent duplicate source→target pairs from being queued simultaneously [status: done]

## Bugs Carried Over

_None_
