# Sprint 004

## Goal
Complete the Sync Engine (remaining items) and implement the full Tenant Manager module.

## Tasks

### Sync Engine — Remaining Items

- [x] TASK-001: Tombstone support & retention — deleted entities stored with HLC in partition blob; 90-day default retention (configurable); purged on flush [status: done]
- [x] TASK-002: Full sync lifecycle — hydrate on load (cloud → local → memory), local ↔ cloud periodic sync (configurable default 5m), manual `sync()` (memory → local → cloud immediate), cloud unreachable on load (load from local, fire event) [status: done]
- [x] TASK-003: Copy optimization & stale detection — one-sided partitions copied without per-entity diff; re-check metadata after partial apply to detect concurrent changes [status: done]
- [x] TASK-004: Sync observability & shutdown — dirty tracking (`isDirty` / `isDirty$`, data not yet in cloud), sync events (started, completed, failed, cloud-unreachable), graceful shutdown (wait for in-flight sync, force flush, complete subjects) [status: done]

### Tenant Manager — New Module

- [x] TASK-005: Tenant types & storage format — `Tenant` type (`id`, `name`, `icon?`, `color?`, `cloudMeta`, `createdAt`, `updatedAt`), `deriveTenantId(cloudMeta)` configurable deterministic ID, `__tenants` blob format, `__strata` marker blob format [status: done]
- [x] TASK-006: Tenant CRUD operations — `list()` read from local adapter, `create({ name, cloudMeta, id? })` write to local + cloud, `setup({ cloudMeta })` open shared location and read marker blob, `load(tenantId)` set active tenant and resolve cloudMeta, `delink(tenantId)` remove from list keep data, `delete(tenantId)` remove from list and destroy all data [status: done]
- [x] TASK-007: Tenant list persistence — `__tenants` blob with local primary and cloud backup, union-merge on sync, marker blob `__strata` written at each tenant cloudMeta location [status: done]
- [x] TASK-008: Tenant reactive — `activeTenant$` Observable of current tenant [status: done]

## Bugs Carried Over

_(none)_

## Notes

- Sync and Tenant modules are independent — tasks can be worked in parallel across the two tracks.
- TASK-001 (tombstones) should be completed before TASK-002 (sync lifecycle) since hydrate/merge must handle tombstones.
- TASK-005 (tenant types) must be completed before TASK-006/007/008.
- TASK-003 copy optimization may already be partially addressed in `partition-diff.ts` — verify before implementing.
