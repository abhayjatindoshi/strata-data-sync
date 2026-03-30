# Review: schema, repo, reactive

### src/schema/types.ts
No issues found.

### src/schema/migration.ts
No issues found.

### src/schema/key-strategy.ts
No issues found.

### src/schema/index.ts
No issues found.

### src/schema/id.ts
- Warning: `generateId()` uses `Math.random()` with only 8 base62 characters and no collision check. In a replicated store, an ID collision is not just unlikely noise; it overwrites another entity in the same partition namespace.

### src/schema/define-entity.ts
No issues found.

### src/repo/types.ts
No issues found.

### src/repo/query.ts
- Correctness: `compareValues()` returns `0` for unsupported or mismatched types, and the range predicates interpret `0` as a valid comparison result. That means records with missing or wrong-typed fields can slip through `gte`/`lte` filters or sort as if they were equal instead of being excluded or rejected.

### src/repo/repository.ts
- High: `saveMany()` and `deleteMany()` only nudge the repository-local `changeSignal`; they do not emit through the shared `eventBus`. As a result, higher-level listeners such as Strata's dirty tracker are not notified for batch mutations, so `isDirty` can stay false after real writes.
- Warning: when `save()` receives a caller-supplied `id`, it trusts the embedded entity key without checking that it belongs to the current repository definition. A malformed id can therefore write data into another entity namespace while this repository emits events under its own name.

### src/repo/singleton-repository.ts
No issues found.

### src/repo/index.ts
No issues found.

### src/reactive/types.ts
No issues found.

### src/reactive/index.ts
No issues found.

### src/reactive/event-bus.ts
- Warning: `emit()` invokes listeners synchronously with no isolation. A single throwing listener aborts later listeners and bubbles back into the caller, which means application-level observers can break repository saves or sync event delivery.
