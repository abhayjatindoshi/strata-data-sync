# Strata Data Sync — Project Guidelines

## Overview

Strata is an offline-first, reactive data framework for TypeScript/JavaScript applications. It handles schema definition, identity generation, partitioned storage, multi-tier persistence (in-memory → local → cloud), automatic synchronization, HLC-based conflict resolution, and reactive UI bindings via RxJS.

See [README.md](../README.md) for the full architecture specification.

## Code Style

- **Language**: TypeScript with strict mode enabled
- **Module system**: ESM (`import`/`export`)
- **Formatting**: Prettier with default config
- **Linting**: ESLint with TypeScript plugin
- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/classes/interfaces, `UPPER_SNAKE_CASE` for constants
- **File naming**: `kebab-case.ts` for source files, `kebab-case.test.ts` for tests
- **Exports**: Prefer named exports; use barrel files (`index.ts`) per module for public API

## Architecture

The framework is organized into these core modules:

| Module | Responsibility |
|--------|---------------|
| `schema` | Entity schema definitions, validation (Zod), type inference, registry builder |
| `entity` | Base entity fields, ID generation, entity key parsing |
| `store` | In-memory entity store — per-entity CRUD + partition management |
| `persistence` | Blob serialization/deserialization, adapter contracts for local and cloud |
| `sync` | Sync engine, dirty tracking, metadata comparison, scheduling |
| `hlc` | Hybrid Logical Clock implementation, conflict resolution |
| `reactive` | RxJS observables, event system, entity/collection streams |
| `repository` | Repository API — unified read/write interface with lazy loading |
| `tenant` | Multi-tenancy — tenant CRUD, scoped storage, lifecycle |
| `react` | React bindings — context providers, hooks, HOCs, UI components |
| `key-strategy` | Entity key strategies (date-based partitioning, custom strategies) |

Each module should have a clear public API exposed through its `index.ts` barrel file. Internal implementation details should not leak across module boundaries.

## Build and Test

```bash
npm install          # Install dependencies
npm run build        # Build the project
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint the codebase
```

## Conventions

- **Immutability**: Prefer immutable data structures. Use `Readonly<T>` and `ReadonlyArray<T>` for public APIs. Entities returned from the store should be treated as immutable snapshots.
- **Error handling**: Use typed error classes extending a base `StrataError`. Throw at system boundaries, return `Result` types for expected failures in internal APIs.
- **Serialization**: All JSON serialization must produce deterministic output with sorted keys. Use a shared `serialize()` utility.
- **Hashing**: Use a fast, non-cryptographic hash (e.g. FNV-1a or similar) for blob change detection. Consistency across platforms matters more than collision resistance.
- **RxJS**: Use `BehaviorSubject` for stateful streams, `Subject` for events. Always provide `distinctUntilChanged` on entity observables. Clean up subscriptions properly.
- **Testing**: Use Vitest. Co-locate test files with source files (`foo.ts` → `foo.test.ts`). Prefer unit tests for pure logic, integration tests for multi-tier flows.
- **Dependencies**: Minimize external dependencies. Core modules (`schema`, `entity`, `store`, `persistence`, `sync`, `hlc`) should have zero framework dependencies. Only `react` module depends on React.
- **Adapter pattern**: Local and cloud persistence are defined as interfaces. The framework provides no concrete implementations — consumers bring their own (e.g. IndexedDB, SQLite, S3, Firebase).
- **Generics**: Entity repositories and observables should be fully generic, with types inferred from the schema registry. Avoid `any`.
