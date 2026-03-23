---
description: "Use when creating new files or modules under src/. Covers module boundaries, folder structure, single responsibility, and import direction."
applyTo: "src/**"
---

# Modularity

## Module Structure
- Each component gets its own folder under `src/`: `hlc/`, `schema/`, `adapter/`, `store/`, `repo/`, `reactive/`, `persistence/`, `sync/`, `tenant/`
- Each module folder has an `index.ts` barrel that re-exports the public API
- Types for a module go in `types.ts` within that module folder
- No shared/common `types.ts` at the `src/` root — each module owns its types

## Single Responsibility
- Each file does one thing: `serialize.ts`, `hash.ts`, `transform.ts` — not `utils.ts`
- No catch-all utility files

## Import Direction
Dependencies flow inward. Allowed directions:
- `repo` → `store`, `schema`, `reactive`
- `sync` → `persistence`, `store`, `adapter`
- `persistence` → `hlc`
- `store` → `adapter`, `reactive`
- `tenant` → `adapter`
- `reactive` → (standalone, no framework deps)
- `hlc` → (standalone, no deps)
- `schema` → `hlc`
- `adapter` → (standalone, no framework deps)

Circular imports are **never** allowed.

## Barrel Exports
- External code imports from the barrel: `import { Hlc } from '@strata/hlc'`
- Internal files within a module may import each other directly
- No cross-module imports of non-exported (internal) files

## Root Barrel
- `src/index.ts` re-exports the public API from all modules
- This is what consumers of the library import from
