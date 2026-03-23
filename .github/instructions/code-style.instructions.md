---
description: "Use when writing or editing TypeScript source code. Covers naming, function size, file length, type safety, and export conventions."
applyTo: "**/*.ts"
---

# Code Style

## Naming
- `camelCase` for functions and variables
- `PascalCase` for types, interfaces, and classes
- `UPPER_SNAKE_CASE` for constants

## Size Limits
- Max ~40 lines per function — extract helpers
- Max ~200 lines per file — split into separate files

## Type Safety
- No `any` — use `unknown` with type narrowing
- No type assertions unless unavoidable (add a comment explaining why)
- Prefer `readonly` on type properties
- Use `ReadonlyArray<T>` for array return types

## Exports & Imports
- Named exports only — no default exports
- One public API per module via `index.ts` barrel
- Use `@strata/*` path alias for cross-module imports
- No relative `../../` imports across module boundaries
- No `.js` extensions in import paths

## Style
- Prefer plain functions for stateless logic
- Use classes for stateful resources (Store, SyncEngine, TenantManager, etc.)
- All async operations return `Promise` — no callbacks

## Logging
- Use the `debug` package for all diagnostic output
- One logger per module: `const log = debug('strata:<module>')`
- Use `log()` for debug-level trace
- Use `log.extend('warn')` for warnings
- Use `log.extend('error')` for errors
- No `console.log`, `console.warn`, `console.error` anywhere

## Error Handling
- Throw typed error objects, never raw strings
- No swallowed errors — always log or rethrow

## Dependencies
- No runtime npm dependencies except `debug` and `rxjs`
- Test dependencies (`vitest`, `@types/*`) are devDeps only
