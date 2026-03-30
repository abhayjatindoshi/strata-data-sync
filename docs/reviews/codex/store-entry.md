# Store + Entrypoints Review

### src/store/types.ts
No issues found.

### src/store/index.ts
No issues found.

### src/store/flush-scheduler.ts
No issues found.

### src/store/store.ts
No issues found.

### src/store/flush.ts
- [critical] `loadPartitionFromAdapter` calls `migrateBlob(blob, migrations)` without passing the current `entityName`, so entity-scoped migrations can run against unrelated blobs and corrupt partition data.

### src/strata.ts
- [high] `changePassword(oldPassword, newPassword)` never validates or uses `oldPassword`; callers can rotate password without proving knowledge of the current secret, violating expected authentication semantics.

### src/index.ts
No issues found.

