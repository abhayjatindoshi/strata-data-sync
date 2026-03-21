---
description: "Use when writing or editing TypeScript source code. Covers naming, function size, file length, type safety, and export conventions."
applyTo: "**/*.ts"
---
# Code Style

- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/classes/interfaces, `UPPER_SNAKE_CASE` for constants
- **File naming**: `kebab-case.ts` for source, `kebab-case.test.ts` for tests
- **Max function length**: ~30 lines. Extract helpers when exceeding this.
- **Max file length**: ~200 lines. Split into sub-modules when exceeding this.
- **One export per concept**. Don't bundle unrelated exports in a single file.
- **No `any`**. Use `unknown` + type narrowing.
- **No `as` casts** unless absolutely required with a comment explaining why.
- **Prefer `type` over `interface`** unless the type needs to be extended or implemented.
- **Use `readonly`** on all properties in types/interfaces returned to consumers.
- **Prefer named exports**. Use barrel files (`index.ts`) per module for public API only.
- **No barrel re-exports of internal implementation** — only public API surfaces in `index.ts`.
- **Imports**: Use `type` imports for type-only references (`import type { Foo } from ...`).
