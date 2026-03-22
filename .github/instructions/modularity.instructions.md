---
description: "Use when creating new files or modules under src/. Covers module boundaries, folder structure, single responsibility, and import direction."
applyTo: "src/**"
---
# Modularity

## Module Structure
- Each module gets its own folder: `src/{module}/index.ts` is the public API.
- Internal files must never be imported across module boundaries. Only import from `index.ts`.
- Dependencies between modules flow one way — no circular imports.
- New functionality goes in the module it belongs to. If it doesn't fit, create a new module.
- Each file has a single responsibility. If you're naming it `utils.ts` or `helpers.ts`, it's too broad — name it after what it does.
- Shared types used across modules go in `src/types/`.
- Keep module `index.ts` files thin — only re-export the public API, no logic.

## Module Dependency Direction
```
adapter (no deps) ← persistence ← store ← repository ← strata
                   ← hlc         ← sync  ↗             ↗
                                 ← tenant ←────────────┘
entity (no deps) ← schema ← key-strategy
reactive (rxjs only) ← repository
react (React dep) ← repository, reactive, tenant
```

## Key Boundaries
- **`adapter`** has zero internal dependencies — it's the consumer-facing contract.
- **`tenant`** does NOT depend on `repository` — uses `BlobAdapter` directly (avoids circular dependency).
- **`store`** is the in-memory Map — no adapter dependency. Persistence is handled by `sync` and `strata`.
- **`reactive`** depends only on RxJS. Does not import from `store` — the repo wires them together.
- **`react`** is the only module with a React dependency. All others are framework-agnostic.
