# Strata v2 — Architecture Overview

## Design Principles

1. **The partition is the unit of sync. The entity is the unit of query.** Partitions exist for efficient blob transfer. Queries run in-memory.
2. **In-memory store is the source of truth for reads.** All queries run against Map. Adapters are persistence only.
3. **Writes are instant.** Sync to Map, async flush to adapter. No loaders needed for saves.
4. **Reactive is event-driven.** One Subject per entity type. Mutation → Map scan → emit if changed. No adapter I/O in reactive path.
5. **One adapter interface.** `BlobAdapter` for both local and cloud — 4 methods, blob I/O only. Framework handles serialization.
6. **No generics in app code.** Zero angle brackets. Types inferred from entity definitions.
7. **Offline-first.** Local is always available. Cloud sync is best-effort. Load never fails due to cloud.

## High-Level Component Architecture

```mermaid
flowchart TD
    %% ═══ SPRINT INITIATION ═══
    CEO["🎯 CEO\nStart sprint cycle"]
    SM["🗂 Scrum Master\nRead backlog → pick epics\nSplit into tasks & sub-tasks\nWrite sprint plan"]
    
    CEO -->|"invoke"| SM
    SM -->|"sprint plan ready"| MGR

    %% ═══ DEVELOPMENT PHASE ═══
    MGR["📋 Manager\nOrchestrate sprint execution"]
    DEV["👨‍💻 Developer\nImplement one task"]
    
    MGR -->|"pick next task"| DEV
    DEV -->|"task done"| MGR_DEV_CHECK{All tasks\nimplemented?}
    MGR_DEV_CHECK -->|"no"| MGR
    MGR_DEV_CHECK -->|"yes"| REV

    %% ═══ REVIEW PHASE ═══
    REV["🔍 Reviewer\nCheck ALL code vs design docs\n& instruction rules"]
    REV_RESULT{Reviewer\nverdict?}
    
    REV --> REV_RESULT
    REV_RESULT -->|"issues found\n(list of fixes)"| DEV_FIX["👨‍💻 Developer\nFix reviewer issues"]
    DEV_FIX --> REV_RECHECK["🔍 Reviewer\nRe-review fixes"]
    REV_RECHECK --> REV_RESULT
    REV_RESULT -->|"✅ approved"| UT_PHASE

    %% ═══ UNIT TESTING PHASE ═══
    UT_PHASE["📋 Manager\nBegin unit testing phase"]
    UT["🧪 Unit Tester\nEvaluate task → decide if tests needed\nWrite tests for max coverage"]
    
    UT_PHASE -->|"pick next task"| UT
    UT -->|"tests written\nor skipped"| UT_ALL_CHECK{All tasks\nevaluated?}
    UT_ALL_CHECK -->|"no"| UT_PHASE
    UT_ALL_CHECK -->|"yes"| RUN_UT

    RUN_UT["📋 Manager\nRun all unit tests"]
    UT_RESULT{Tests\npass?}
    RUN_UT --> UT_RESULT
    UT_RESULT -->|"✅ all pass"| IT_PHASE

    UT_RESULT -->|"❌ failures"| UT_TRIAGE{Manager\ntriages each failure}
    UT_TRIAGE -->|"test was wrong"| UT_FIX["🧪 Unit Tester\nFix test"]
    UT_TRIAGE -->|"code bug"| DEV_UT_FIX["👨‍💻 Developer\nFix code"]
    DEV_UT_FIX -->|"fix done"| REV_UT["🔍 Reviewer\nReview code fix"]
    REV_UT_RESULT{Reviewer\nverdict?}
    REV_UT --> REV_UT_RESULT
    REV_UT_RESULT -->|"issues"| DEV_UT_FIX
    REV_UT_RESULT -->|"✅ approved"| RUN_UT
    UT_FIX --> RUN_UT

    %% ═══ INTEGRATION TESTING PHASE ═══
    IT_PHASE["📋 Manager\nBegin integration testing"]
    IT["🔗 Integration Tester\nWrite tests for ALL sprint tasks\nMax coverage + edge cases"]
    
    IT_PHASE --> IT
    IT -->|"tests written"| RUN_IT

    RUN_IT["📋 Manager\nRun all integration tests"]
    IT_RESULT{Tests\npass?}
    RUN_IT --> IT_RESULT
    IT_RESULT -->|"✅ all pass"| DOC_PHASE

    IT_RESULT -->|"❌ failures"| IT_TRIAGE{Manager\ntriages each failure}
    IT_TRIAGE -->|"test was wrong"| IT_FIX["🔗 Integration Tester\nFix test"]
    IT_TRIAGE -->|"code bug"| DEV_IT_FIX["👨‍💻 Developer\nFix code"]
    DEV_IT_FIX -->|"fix done"| REV_IT["🔍 Reviewer\nReview code fix"]
    REV_IT_RESULT{Reviewer\nverdict?}
    REV_IT --> REV_IT_RESULT
    REV_IT_RESULT -->|"issues"| DEV_IT_FIX
    REV_IT_RESULT -->|"✅ approved"| RUN_IT
    IT_FIX --> RUN_IT

    %% ═══ DOCUMENTATION PHASE ═══
    DOC_PHASE["📋 Manager\nAll tests green"]
    DOC["📝 Documenter\n1. Update sprint task status\n2. Update backlog\n3. Append progress.md newsletter"]
    
    DOC_PHASE --> DOC
    DOC -->|"sprint documented"| CEO_END

    %% ═══ SPRINT COMPLETE ═══
    CEO_END["🎯 CEO\nReview sprint outcome\nDecide: next sprint or stop"]
    CEO_END -->|"next sprint"| CEO

    %% ═══ STYLING ═══
    style CEO fill:#FFEBEE,stroke:#B71C1C
    style CEO_END fill:#FFEBEE,stroke:#B71C1C
    style SM fill:#E3F2FD,stroke:#1565C0
    style MGR fill:#FCE4EC,stroke:#C62828
    style DEV fill:#EDE7F6,stroke:#4527A0
    style DEV_FIX fill:#EDE7F6,stroke:#4527A0
    style DEV_UT_FIX fill:#EDE7F6,stroke:#4527A0
    style DEV_IT_FIX fill:#EDE7F6,stroke:#4527A0
    style REV fill:#FFF3E0,stroke:#E65100
    style REV_RECHECK fill:#FFF3E0,stroke:#E65100
    style REV_UT fill:#FFF3E0,stroke:#E65100
    style REV_IT fill:#FFF3E0,stroke:#E65100
    style UT fill:#E8F5E9,stroke:#2E7D32
    style UT_FIX fill:#E8F5E9,stroke:#2E7D32
    style IT fill:#C8E6C9,stroke:#1B5E20
    style IT_FIX fill:#C8E6C9,stroke:#1B5E20
    style UT_PHASE fill:#FCE4EC,stroke:#C62828
    style IT_PHASE fill:#FCE4EC,stroke:#C62828
    style DOC_PHASE fill:#FCE4EC,stroke:#C62828
    style RUN_UT fill:#FCE4EC,stroke:#C62828
    style RUN_IT fill:#FCE4EC,stroke:#C62828
    style DOC fill:#F5F5F5,stroke:#616161
```

```mermaid
graph TB
    subgraph APP["App Layer"]
        UI["UI Components"]
        REACT["React Bindings"]
    end

    subgraph STRATA["Strata Framework"]
        REPO["Repository"]
        STORE["In-Memory Store"]
        REACTIVE["Reactive Layer"]
        SYNC["Sync Engine"]
        PERSIST["Persistence"]
        SCHEMA["Schema & Identity"]
        TENANT["Tenant Manager"]
    end

    subgraph ADAPTERS["Adapter Layer (consumer-provided)"]
        LOCAL["Local BlobAdapter<br/>(IndexedDB · filesystem)"]
        CLOUD["Cloud BlobAdapter<br/>(Google Drive · S3)"]
    end

    UI --> REACT
    REACT --> REPO

    REPO -->|"query (sync)"| STORE
    REPO -->|"save (sync)"| STORE
    REPO -->|"observe"| REACTIVE

    STORE -->|"debounced flush"| LOCAL
    STORE -->|"lazy load"| LOCAL
    STORE -->|"emit signal"| REACTIVE

    SYNC -->|"push/pull blobs"| LOCAL
    SYNC -->|"push/pull blobs"| CLOUD
    SYNC -->|"upsert"| STORE

    PERSIST -->|"serialize/hash"| SYNC
    SCHEMA -->|"validate · ID gen"| REPO
    TENANT -->|"meta"| LOCAL
    TENANT -->|"meta"| CLOUD

    classDef app fill:#E3F2FD,stroke:#1565C0,color:#0D47A1
    classDef framework fill:#F3E5F5,stroke:#7B1FA2,color:#4A148C
    classDef adapter fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20

    class UI,REACT app
    class REPO,STORE,REACTIVE,SYNC,PERSIST,SCHEMA,TENANT framework
    class LOCAL,CLOUD adapter
```

## Components

| Component | Responsibility | Details |
|---|---|---|
| **Repository** | Public CRUD + observe API | Two types: `Repository<T>` and `SingletonRepository<T>`. See [repository & schema](v2-schema-repository.md). |
| **In-Memory Store** | Source of truth for reads | `Map<entityKey, Map<id, entity>>`. Sync writes, lazy partition loading, debounced flush. |
| **Reactive Layer** | Observable data bindings | One `Subject<void>` per entity type. Observers pipe with `distinctUntilChanged`. See [reactive](v2-reactive.md). |
| **Sync Engine** | Bidirectional local↔cloud sync | Three-phase model. HLC conflict resolution. Tombstones. See [persistence & sync](v2-persistence-sync.md). |
| **Persistence** | Serialize/deserialize/hash | JSON with type markers. FNV-1a hash on ID+HLC pairs. Transform pipeline. See [persistence & sync](v2-persistence-sync.md). |
| **Schema & Identity** | Entity definitions, IDs, partitioning | Three key strategies. `deriveId` for computed keys. See [repository & schema](v2-schema-repository.md). |
| **Tenant Manager** | Multi-tenancy lifecycle | `meta`-based. Not a repo. See [tenant](v2-tenant.md). |
| **Adapter** | Blob I/O (local + cloud) | Single `BlobAdapter` interface. 4 methods. See [adapter](v2-adapter.md). |

## Data Flow Summary

```
WRITE:  repo.save(entity) → Map.set [sync] → emit signal [sync] → flush to local [async, debounced 2s]
READ:   repo.query(opts)  → scan Map [sync] → filter/sort/paginate → return
OBSERVE: repo.observe(id) → Subject.pipe(map(() => Map.get(id)), distinctUntilChanged)
SYNC:   memory → local (2s) → cloud (5m) | cloud → local → memory (on load)
```

## Package Structure

```
@strata/core                     → Framework: store, repo, reactive, sync, persistence, schema, tenant
@strata/cloud-explorer           → CloudExplorer UI + ExplorerDataSource interface (future)
@strata/google-drive-adapter     → BlobAdapter + CloudFileService + explorer source (future)
@strata/s3-adapter               → BlobAdapter + CloudObjectService + explorer source (future)
```
