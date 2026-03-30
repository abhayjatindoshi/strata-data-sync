# Schema + Repo + Reactive Review

### src/schema/define-entity.ts
No issues found.

### src/schema/id.ts
- [low] `generateId()` uses `Math.random`, which is predictable and unsuitable if IDs are ever used in externally visible or security-sensitive contexts.

### src/schema/index.ts
No issues found.

### src/schema/key-strategy.ts
No issues found.

### src/schema/migration.ts
No issues found.

### src/schema/types.ts
No issues found.

### src/repo/index.ts
No issues found.

### src/repo/query.ts
- [warning] `compareValues` returns `0` for unsupported value types, which can silently disable range/order predicates instead of surfacing invalid query input.

### src/repo/repository.ts
- [high] `saveMany()` and `deleteMany()` emit only `changeSignal` and skip `eventBus.emit`, so dirty tracking and cross-component listeners miss bulk writes/deletes.
- [medium] `parseEntityKey()` accepts malformed IDs (no dot) and returns an empty key, allowing operations against an invalid partition key rather than failing fast.

### src/repo/singleton-repository.ts
No issues found.

### src/repo/types.ts
No issues found.

### src/reactive/event-bus.ts
No issues found.

### src/reactive/index.ts
No issues found.

### src/reactive/types.ts
No issues found.

