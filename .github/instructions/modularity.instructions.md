---
description: "Use when creating new files or modules under src/. Covers module boundaries, folder structure, single responsibility, and import direction."
applyTo: "src/**"
---
# Modularity

- Each module gets its own folder: `src/{module}/index.ts` is the public API.
- Internal files must never be imported across module boundaries. Only import from `index.ts`.
- Dependencies between modules flow one way — no circular imports.
- New functionality goes in the module it belongs to. If it doesn't fit, create a new module.
- Each file has a single responsibility. If you're naming it `utils.ts` or `helpers.ts`, it's too broad — name it after what it does.
- Shared types used across modules go in `src/types/`.
- Keep module `index.ts` files thin — only re-export the public API, no logic.
