# Sync + Tenant Review

### src/sync/conflict.ts
No issues found.

### src/sync/diff.ts
No issues found.

### src/sync/dirty-tracker.ts
No issues found.

### src/sync/index.ts
No issues found.

### src/sync/merge.ts
No issues found.

### src/sync/sync-engine.ts
- [warning] On deduplicated sync requests, `sync()` returns `EMPTY_RESULT` after waiting for the in-flight task instead of returning the actual completed result; callers can observe false zero-change metrics.

### src/sync/sync-scheduler.ts
- [medium] Uses `setInterval` with async work and no in-flight guard; if sync duration exceeds interval, overlapping ticks enqueue additional work and can cause backlog under degraded network conditions.

### src/sync/types.ts
No issues found.

### src/sync/unified.ts
- [medium] `buildHlcMap` blindly casts every entity to `SyncEntity` and stores `entity.hlc`; malformed/migrated entities without `hlc` can propagate `undefined` and break downstream HLC comparison logic at runtime.

### src/tenant/index.ts
No issues found.

### src/tenant/marker-blob.ts
No issues found.

### src/tenant/tenant-list.ts
No issues found.

### src/tenant/tenant-manager.ts
- [critical] `create()` does not enforce ID uniqueness when `opts.id` or `deriveTenantId` produces an existing ID, allowing duplicate tenant records and ambiguous load/delete behavior.
- [low] Tenant IDs are generated with `Math.random`, which is predictable and weak for identifiers that may be externally visible or relied on for isolation assumptions.

### src/tenant/tenant-prefs.ts
No issues found.

### src/tenant/tenant-sync.ts
No issues found.

### src/tenant/types.ts
No issues found.

