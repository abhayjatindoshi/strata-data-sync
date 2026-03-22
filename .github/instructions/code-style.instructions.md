---
description: "Use when writing or editing TypeScript source code. Covers naming, function size, file length, type safety, and export conventions."
applyTo: "**/*.ts"
---
# Code Style

## Naming & Files
- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/classes/interfaces, `UPPER_SNAKE_CASE` for constants
- **File naming**: `kebab-case.ts` for source, `kebab-case.test.ts` for tests
- **Max function length**: ~30 lines. Extract helpers when exceeding this.
- **Max file length**: ~200 lines. Split into sub-modules when exceeding this.
- **One export per concept**. Don't bundle unrelated exports in a single file.

## Type Safety
- **No `any`**. Use `unknown` + type narrowing.
- **No `as` casts** unless absolutely required with a comment explaining why.
- **Prefer `type` over `interface`** unless the type needs to be extended or implemented.
- **Use `readonly`** on all properties in types/interfaces returned to consumers.
- **No generics in public API** unless typing entity fields (`Repository<T>`, `SingletonRepository<T>`). No `TTenant` or adapter generics.

## Exports & Imports
- **Prefer named exports**. Use barrel files (`index.ts`) per module for public API only.
- **No barrel re-exports of internal implementation** — only public API surfaces in `index.ts`.
- **Imports**: Use `type` imports for type-only references (`import type { Foo } from ...`).

## Framework-Specific
- **`BlobAdapter` methods** always take `cloudMeta` as first param (`Readonly<Record<string, unknown>> | undefined`).
- **Entities are immutable snapshots** — never mutate entities returned from store/repo. Create new objects.
- **RxJS**: Return `Observable` (not `BehaviorSubject`). Use `Subject<void>` for change signals. Always `distinctUntilChanged`.
- **Serialization**: Use JSON type markers for `Date` (`{ __t: 'D', v: iso }`). No sorted keys. No Zod runtime schema.
- **Entity IDs** must follow `entityName.partitionKey.uniqueId` format. `deriveId` output must not contain dots.
