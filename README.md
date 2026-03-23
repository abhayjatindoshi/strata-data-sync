# Strata v2 — Technical Design

Strata is an offline-first, reactive data framework for TypeScript/JavaScript. It handles entity storage, multi-device sync via cloud blob storage, HLC-based conflict resolution, multi-tenancy, and reactive UI bindings.

## Design Documents

| Document | Description |
|---|---|
| [Architecture Overview](docs/architecture.md) | High-level component diagram, design principles, data flow summary |
| [Schema & Repository](docs/schema-repository.md) | Entity definitions, ID generation, key strategies, repository API surface |
| [Adapter Contract](docs/adapter.md) | `BlobAdapter` interface, `cloudMeta` per-call, transform pipeline |
| [Tenant System](docs/tenant.md) | Multi-tenancy, `cloudMeta`, tenant lifecycle, sharing, tenant list storage |
| [Persistence & Sync](docs/persistence-sync.md) | Serialization, hashing, flush timing, sync phases, conflict resolution, tombstones |
| [Reactive Layer](docs/reactive.md) | Event bus, shared subjects, observables, change detection, batch writes |
| [App Lifecycle](docs/lifecycle.md) | Full lifecycle sequence diagram (init → tenant → query → save → sync → dispose) |
| [Decisions Tracker](docs/decisions.md) | All accepted, rejected, and future decisions with rationale |

## Key Design Choices

- **In-memory Map is source of truth** — all reads are sync. Adapters are persistence only.
- **One `BlobAdapter` interface** — 4 methods, same for local and cloud. No query delegation.
- **One `Subject<void>` per entity type** — all observers pipe off it with `distinctUntilChanged`.
- **Three-phase sync** — hydrate on load, periodic persist, manual full sync. One sync at a time globally.
- **`cloudMeta` per-call** — adapters receive opaque tenant location info. No generics. No tenant type pollution.
- **JSON with type markers** — `Date` wrapped as `{ __t: 'D', v: iso }`. No sorted keys needed.
- **ID+HLC partition hash** — FNV-1a. No blob content hashing. Catches cross-device version collisions.

## Status

React bindings design is pending. All other components have finalized designs.

```mermaid
flowchart TD
    CEO["🎯 CEO\nKick off sprint cycle"]
    SM["🗂 Scrum Master\nCreate sprint plan"]
    VP["⚡ VP\nExecute tasks sequentially"]
    DEV["👨‍💻 Developer\nImplement one task"]
    REV["🔍 Reviewer\nCheck code vs design"]
    TEST["🧪 Testing Lead\nRun unit tests, write missing ones"]
    IT["🔗 Integration Tester\nWrite & run integration tests"]
    DOC["📝 Documenter\nUpdate progress log & backlog"]

    CEO -->|"start sprint"| SM
    SM -->|"sprint plan ready"| VP
    VP -->|"pick task"| DEV
    DEV -->|"task done"| REV
    REV -->|"approved"| VP
    REV -->|"issues found"| DEV
    VP -->|"all tasks done"| TEST
    TEST -->|"tests pass"| IT
    TEST -->|"code bug"| DEV
    IT -->|"all pass"| DOC
    IT -->|"code bug"| DEV
    IT -->|"test bug"| IT
    DOC -->|"sprint logged"| CEO
    CEO -->|"next sprint"| SM

    style CEO fill:#FFEBEE,stroke:#B71C1C
    style SM fill:#E3F2FD,stroke:#1565C0
    style VP fill:#F3E5F5,stroke:#7B1FA2
    style DEV fill:#EDE7F6,stroke:#4527A0
    style REV fill:#FFF3E0,stroke:#E65100
    style TEST fill:#E8F5E9,stroke:#2E7D32
    style IT fill:#E8F5E9,stroke:#2E7D32
    style DOC fill:#F5F5F5,stroke:#616161
```
