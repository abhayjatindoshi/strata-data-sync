# Backlog

| # | Epic | Component | Design Doc | Status |
|---|------|-----------|------------|--------|
| E1 | HLC — types, tick, compare | `hlc/` | `docs/persistence-sync.md` (HLC section) | done |
| E2 | Schema — defineEntity, ID gen, key strategies | `schema/` | `docs/schema-repository.md` (Entity Definition, Entity IDs, Key Strategies) | done |
| E3 | Adapter — BlobAdapter interface & types | `adapter/` | `docs/adapter.md` (Interface, cloudMeta, keys) | done |
| E4 | Adapter — MemoryBlobAdapter | `adapter/` | `docs/adapter.md` (MemoryBlobAdapter section) | done |
| E5 | Adapter — Transform pipeline | `adapter/` | `docs/adapter.md` (Transform Pipeline section) | done |
| E6 | Reactive — Event bus & Subject signals | `reactive/` | `docs/reactive.md` (Event Bus, Entity Type Subject) | done |
| E7 | Store — In-memory Map, lazy loading, dirty tracking | `store/` | `docs/schema-repository.md` (In-Memory Store) | done |
| E8 | Store — Debounced flush to adapter | `store/` | `docs/persistence-sync.md` (Flush Timing) | done |
| E9 | Persistence — JSON serialization & type markers | `persistence/` | `docs/persistence-sync.md` (Serialization, Type Markers) | done |
| E10 | Persistence — FNV-1a hashing | `persistence/` | `docs/persistence-sync.md` (Hashing section) | done |
| E11 | Persistence — Partition index | `persistence/` | `docs/persistence-sync.md` (Partition Index) | done |
| E12 | Repository — Repository\<T\> CRUD & query | `repo/` | `docs/schema-repository.md` (Repository Types, QueryOptions) | done |
| E13 | Repository — SingletonRepository\<T\> | `repo/` | `docs/schema-repository.md` (SingletonRepository) | done |
| E14 | Reactive — observe, observeQuery, distinctUntilChanged | `reactive/` | `docs/reactive.md` (observe, observeQuery, Change Detection) | done |
| E15 | Reactive — Batch writes & dispose | `reactive/` | `docs/reactive.md` (Batch Writes, Cleanup) | done |
| E16 | Tenant — Tenant model & TenantManager CRUD | `tenant/` | `docs/tenant.md` (Tenant Model, TenantManager API) | done |
| E17 | Tenant — Tenant list storage & sync | `tenant/` | `docs/tenant.md` (Tenant List Storage) | done |
| E18 | Tenant — Sharing, setup, marker blob | `tenant/` | `docs/tenant.md` (Sharing Flow, Marker Blob) | done |
| E19 | Sync — Partition diff & copy optimization | `sync/` | `docs/persistence-sync.md` (Sync Cycle steps 1-4, Copy optimization) | done |
| E20 | Sync — Bidirectional merge & HLC conflict resolution | `sync/` | `docs/persistence-sync.md` (Sync Cycle step 5, Conflict Resolution) | done |
| E21 | Sync — Tombstones & retention | `sync/` | `docs/persistence-sync.md` (Tombstones) | done |
| E22 | Sync — Three-phase model, scheduler & global lock | `sync/` | `docs/persistence-sync.md` (Three-Phase Model, Global Sync Lock) | done |
| E23 | Sync — Dirty tracking & sync events | `sync/` | `docs/persistence-sync.md` (Dirty Tracking, events) | done |
| E24 | Framework Entry Point — createStrata() | `src/` root | `docs/lifecycle.md`, `docs/architecture.md` | pending |
| E25 | Framework — Graceful shutdown & dispose | `src/` root | `docs/persistence-sync.md` (Graceful shutdown), `docs/lifecycle.md` (Phase 9) | pending |

## Dependency Order

```
Layer 0 (no deps):    E1 (HLC), E3 (Adapter types)
Layer 1:              E2 (Schema → HLC), E4 (MemoryAdapter → E3), E6 (Reactive event bus)
Layer 2:              E5 (Transforms → E3), E9 (Serialize → E1), E10 (Hash → E1)
Layer 3:              E7 (Store → E3, E6), E11 (Partition index → E10)
Layer 4:              E8 (Flush → E7, E3), E12 (Repo → E7, E2, E6), E16 (Tenant CRUD → E3)
Layer 5:              E13 (SingletonRepo → E12), E14 (Observe → E6, E12), E17 (Tenant list → E16, E3)
Layer 6:              E15 (Batch/dispose → E14), E18 (Sharing → E17)
Layer 7:              E19 (Sync diff → E11, E7, E3), E20 (Sync merge → E19, E1)
Layer 8:              E21 (Tombstones → E20), E22 (Scheduler → E19), E23 (Dirty/events → E22)
Layer 9:              E24 (createStrata → all), E25 (Dispose → E24)
```
