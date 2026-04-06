# Migrations

## Overview

When your entity schema changes (add a field, rename a field, restructure data), blob migrations transform stored data to the new format. Migrations run lazily — blobs are migrated when read during sync, not eagerly in bulk.

## Defining Migrations

```typescript
import { Strata, defineEntity } from 'strata-data-sync';
import type { BlobMigration } from 'strata-data-sync';

type Task = { title: string; done: boolean; priority: string };
const taskDef = defineEntity<Task>('task');

const migrations: BlobMigration[] = [
  {
    version: 1,
    entities: [taskDef],  // only applies to task blobs
    migrate: (blob) => {
      // v0 → v1: add "priority" field with default
      const tasks = (blob.task ?? {}) as Record<string, Record<string, unknown>>;
      const migrated: Record<string, unknown> = {};
      for (const [id, entity] of Object.entries(tasks)) {
        migrated[id] = { ...entity, priority: entity.priority ?? 'medium' };
      }
      return { ...blob, task: migrated };
    },
  },
];

const strata = new Strata({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: storage,
  deviceId: 'device-1',
  migrations,
});
```

## `BlobMigration` Type

```typescript
type BlobMigration = {
  readonly version: number;
  readonly entities?: ReadonlyArray<EntityDefinition<any>>;  // scope filter
  readonly migrate: (blob: PartitionBlob) => PartitionBlob;
};
```

- **`version`** — contiguous integer starting at 1 (i.e. 1, 2, 3, …). Gaps and duplicates are rejected at startup. Migrations with `version > blob.__v` are applied.
- **`entities`** — optional. If provided, only blobs matching these entity types are migrated. If omitted, the migration applies to all blobs.
- **`migrate`** — receives the raw `PartitionBlob`, returns the transformed blob.

## How It Works

Each partition blob has an optional `__v` field (defaults to 0):

```json
{
  "__v": 1,
  "task": { ... },
  "deleted": { "task": {} }
}
```

When a blob is read during sync:
1. Check `blob.__v` (default 0)
2. Filter migrations where `version > __v` and entity scope matches
3. Sort by version ascending
4. Apply each migration in order
5. Set `__v` to the highest applied version
6. Write migrated blob back to the adapter

## Entity Scoping

Scope migrations to specific entity types:

```typescript
const migrations: BlobMigration[] = [
  {
    version: 1,
    entities: [taskDef],  // only task blobs
    migrate: (blob) => { /* transform task data */ },
  },
  {
    version: 2,
    entities: [noteDef],  // only note blobs
    migrate: (blob) => { /* transform note data */ },
  },
  {
    version: 3,
    // no entities — applies to ALL blobs
    migrate: (blob) => { /* global transform */ },
  },
];
```

Without `entities`, the migration applies to every blob regardless of type.

## Sequential Migrations

Migration versions **must** be contiguous integers starting at 1 — no gaps, no duplicates. Strata validates this at startup and throws if the sequence is broken:

```typescript
// ✅ valid
const migrations: BlobMigration[] = [
  { version: 1, migrate: (b) => { /* v0→v1 */ return b; } },
  { version: 2, migrate: (b) => { /* v1→v2 */ return b; } },
  { version: 3, migrate: (b) => { /* v2→v3 */ return b; } },
];

// ❌ throws — gap between 2 and 5
const bad: BlobMigration[] = [
  { version: 1, migrate: (b) => b },
  { version: 2, migrate: (b) => b },
  { version: 5, migrate: (b) => b },
];
```

A blob already at version 2 will only have migration 3 applied.

## Lazy Execution

Migrations do **not** run eagerly on all blobs at startup. They're applied when a blob is read during sync:

- Only touched blobs get migrated
- Untouched blobs on cloud remain at their old version until accessed
- Cost is amortized — each blob migrated once on first access
- No full-scan migration pass needed

## Tips

- **Always add new migrations, never modify old ones** — existing blobs may have already been migrated with the old version
- **Test migrations** — the `migrateBlob(blob, migrations)` function is exported for unit testing
- **Keep migrations simple** — add defaults for new fields, reshape data structures
- **Version numbers must be unique and increasing** — gaps are OK (1, 3, 5)
