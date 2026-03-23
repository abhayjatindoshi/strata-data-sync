# Strata Framework — Workspace Instructions

Strata is an offline-first, reactive data framework for TypeScript/JavaScript. It handles entity storage, multi-device sync via cloud blob storage, HLC-based conflict resolution, multi-tenancy, and reactive UI bindings.

## Source Modules (`src/`)

| Module | Responsibility |
|---|---|
| `hlc/` | Hybrid Logical Clock — tick, compare, create |
| `schema/` | `defineEntity`, ID generation, key strategies |
| `adapter/` | `BlobAdapter` interface, `MemoryBlobAdapter`, transforms |
| `store/` | In-memory `Map` store, lazy loading, dirty tracking, flush |
| `repo/` | `Repository<T>`, `SingletonRepository<T>`, `QueryOptions` |
| `reactive/` | `Subject<void>` per entity type, observe, event bus |
| `persistence/` | JSON serialization, type markers, FNV-1a hashing, partition index |
| `sync/` | Three-phase sync, HLC conflict resolution, tombstones |
| `tenant/` | Tenant CRUD, cloudMeta, tenant list, sharing |

## Design Documents

All design docs live in `docs/`. They are the **specification** — sprint agents treat them as read-only.

## Sprint Workflow

The project follows a sprint model orchestrated by agents:

1. **CEO** starts a sprint cycle
2. **Scrum Master** picks epics from backlog, creates tasks
3. **VP** executes: Developer → Reviewer → Unit Tester → Integration Tester
4. **Documenter** updates tracking files and commits

Sprint artifacts live in `.sprints/` (backlog, tasks, reviews, newsletter).

## Key Rules

- Design docs (`docs/`) are frozen — read for spec, never edit
- All timestamps use ISO 8601: `2026-03-23T18:45:00Z`
- Use `@strata/*` path alias for imports, no `.js` extensions
- Use `debug` package for logging, namespace `strata:<module>`
- No `console.*` calls anywhere
- No runtime dependencies except `debug` and `rxjs`
- Build: `npm run build` | Test: `npm test`
