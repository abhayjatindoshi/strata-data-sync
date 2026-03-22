# Strata Data Sync — Project Guidelines

## Overview

Strata is an offline-first, reactive data framework for TypeScript/JavaScript applications. It handles entity definition, identity generation, partitioned storage, in-memory querying, multi-tier persistence (memory → local → cloud), automatic synchronization, HLC-based conflict resolution, multi-tenancy, and reactive UI bindings via RxJS.

See [design/README.md](../design/README.md) for the full v2 technical design and [design/v2-decisions.md](../design/v2-decisions.md) for design rationale.

## Architecture

The framework has these core modules:

| Module | Responsibility |
|--------|---------------|
| `schema` | Entity definitions (TypeScript generics, no Zod), `defineEntity`, `deriveId` |
| `entity` | Base entity fields, ID generation, entity key parsing |
| `store` | In-memory entity store — source of truth for all reads. `Map<entityKey, Map<id, entity>>` |
| `persistence` | JSON serialization (type markers for Date), FNV-1a hashing (ID+HLC), partition index, debounced flush, transform pipeline (gzip/encrypt) |
| `sync` | Sync engine — three-phase (hydrate/periodic/manual), bidirectional merge, HLC conflict resolution, tombstones, dirty tracking |
| `hlc` | Hybrid Logical Clock — `{ timestamp, counter, nodeId }`, total ordering across devices |
| `reactive` | One `Subject<void>` per entity type. Observers pipe with `distinctUntilChanged`. Change detection via ID+version. |
| `repository` | Repository API — `Repository<T>` and `SingletonRepository<T>`. Sync reads from Map, sync writes to Map. |
| `tenant` | Multi-tenancy — `cloudMeta`-based, not a repo. Tenant list via direct `BlobAdapter` I/O. |
| `adapter` | `BlobAdapter` interface — 4 methods (`read`/`write`/`delete`/`list`), `cloudMeta` per-call. Same interface for local and cloud. |
| `react` | React bindings — hooks for repos, observers, tenant (pending design) |
| `key-strategy` | Key strategies — `singleton`, `global`, `partitioned(fn)` |

Each module has a public API in `index.ts`. Internal files must not be imported across module boundaries.

## Key Design Principles

1. **In-memory Map is source of truth** — all reads are sync. Adapters are blob persistence only.
2. **Writes are instant** — `save()` is sync to Map. Flush to adapter is async (debounced 2s).
3. **One `BlobAdapter` interface** — 4 methods, same for local and cloud. No query delegation. No generics.
4. **`cloudMeta` per-call** — adapters receive opaque tenant location info. Framework never interprets it.
5. **One `Subject<void>` per entity type** — observers pipe off it with `distinctUntilChanged`.
6. **Three-phase sync** — hydrate on load, periodic background, manual trigger. One sync at a time globally.
7. **JSON with type markers** — `Date` → `{ __t: 'D', v: iso }`. No sorted keys needed (hash uses ID+HLC).
8. **Offline-first** — local is always available. Cloud sync is best-effort. Load never fails due to cloud.

## Build and Test

```bash
npm install          # Install dependencies
npm run build        # Build the project
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint the codebase
```

## Conventions

- **Immutability**: Use `Readonly<T>` and `ReadonlyArray<T>` for public APIs. Entities from the store are immutable snapshots.
- **Error handling**: Use typed error classes extending `StrataError`. Throw at system boundaries.
- **Serialization**: JSON with type marker replacer/reviver. No sorted keys.
- **Hashing**: FNV-1a on sorted entity `id:hlcTimestamp:hlcCounter:hlcNodeId` pairs. Not on blob content.
- **RxJS**: One `Subject<void>` per entity type. Return `Observable` (not `BehaviorSubject`). Always `distinctUntilChanged`.
- **Testing**: Vitest. Co-locate test files (`foo.ts` → `foo.test.ts`). Use `MemoryBlobAdapter` for tests.
- **Dependencies**: Core modules have zero framework dependencies. Only `react` module depends on React.
- **Adapter pattern**: `BlobAdapter` is the only adapter interface. 4 methods. Consumers implement for their storage (IDB, Drive, S3).
- **No generics in app code**: No `TTenant`, no `<AppTenant>`. Types inferred from entity definitions.
- **No Zod runtime schema**: `defineEntity` uses TypeScript generics only. Type markers handle serialization.
