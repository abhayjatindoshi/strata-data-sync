# Schema & Repository

## Entity Definition

Entities are defined using TypeScript generics — no runtime schema (Zod) required:

```typescript
const Transaction = defineEntity<{
  amount: number;
  date: Date;
  accountId: string;
}>('transaction');
```

The framework adds `BaseEntity` fields automatically: `id`, `createdAt`, `updatedAt`, `version`, `device`, and `hlc`.

## Entity IDs

Format: `entityName.partitionKey.uniqueId`

- Dots are reserved as separators
- `uniqueId` is 8-character random alphanumeric by default
- `deriveId` option enables deterministic IDs from entity fields (enables implicit upsert):

```typescript
const Auth = defineEntity<{ provider: string; userId: string; token: string }>('auth', {
  keyStrategy: 'global',
  deriveId: (entity) => `${entity.provider}-${entity.userId}`,
});
```

- `deriveId` output must not contain dots — validated at `save()` time

## Key Strategies

Three modes, no others:

| Strategy | Partition key | Use case |
|---|---|---|
| `partitioned(fn)` | Derived from entity data (e.g., month from `createdAt`) | Date-partitioned entities (transactions, events) |
| `'global'` | Always `'_'` | Small collections (auth tokens, categories) |
| `'singleton'` | Always `'_'`, deterministic ID | One-instance entities (settings, config) |

`global` is syntactic sugar — same code path as `partitioned`, key strategy just returns `'_'`.

## Repository Types

### `Repository<T>` — for partitioned and global entities

```typescript
type Repository<T> = {
  get(id: string): (T & BaseEntity) | undefined;
  query(opts?: QueryOptions<T>): ReadonlyArray<T & BaseEntity>;
  save(entity: T & Partial<BaseEntity>): string;
  saveMany(entities: ReadonlyArray<T & Partial<BaseEntity>>): ReadonlyArray<string>;
  delete(id: string): boolean;
  deleteMany(ids: ReadonlyArray<string>): void;
  observe(id: string): Observable<(T & BaseEntity) | undefined>;
  observeQuery(opts?: QueryOptions<T>): Observable<ReadonlyArray<T & BaseEntity>>;
  dispose(): void;
};
```

### `SingletonRepository<T>` — for singleton entities

```typescript
type SingletonRepository<T> = {
  get(): (T & BaseEntity) | undefined;
  save(entity: T & Partial<BaseEntity>): void;
  delete(): boolean;
  observe(): Observable<(T & BaseEntity) | undefined>;
  dispose(): void;
};
```

No IDs, no query, no batch. Thin wrapper over internal partitioned implementation.

### Type inference

Return type is inferred from the entity def's key strategy:

```typescript
const txnRepo = strata.repo(Transaction);    // Repository<TransactionFields>
const settingsRepo = strata.repo(Settings);  // SingletonRepository<SettingsFields>
```

## QueryOptions

All query/filter/sort/paginate logic runs in-memory on the Map:

```typescript
type QueryOptions<T> = {
  readonly where?: Partial<T>;
  readonly range?: {
    readonly field: keyof T;
    readonly gt?: unknown;
    readonly gte?: unknown;
    readonly lt?: unknown;
    readonly lte?: unknown;
  };
  readonly orderBy?: ReadonlyArray<{ readonly field: keyof T; readonly direction: 'asc' | 'desc' }>;
  readonly limit?: number;
  readonly offset?: number;
};
```

Framework applies: filter → sort → offset/limit. All sync, all in-memory.

### Query Helper Functions

The framework exports the individual query stages for advanced use:

| Function | Purpose |
|---|---|
| `applyWhere(entities, where)` | Filters entities by partial field match |
| `applyRange(entities, range)` | Filters by field range (`gt`, `gte`, `lt`, `lte`) |
| `applyOrderBy(entities, orderBy)` | Sorts by one or more fields with direction |
| `applyPagination(entities, offset, limit)` | Applies offset/limit slicing |

### Batch Event Semantics

- `saveMany()` performs all Map writes then emits a **single** change signal
- `deleteMany()` emits a change signal only if **at least one** entity was actually deleted
- Single `save()` / `delete()` each emit one signal immediately

## Blob Migration

Data migrations operate at the blob level via `BlobMigration`, not at the entity definition level:

```typescript
type BlobMigration = {
  readonly version: number;
  readonly entities?: ReadonlyArray<EntityDefinition<any>>;  // optional scope filter
  readonly migrate: (blob: PartitionBlob) => PartitionBlob;
};
```

`migrateBlob(blob, migrations, entityName?)` applies migrations sequentially by version number, skipping any with a version ≤ the blob's stored `__v` field. When `entityName` is provided, only migrations whose `entities` list includes that entity (or have no `entities` filter) are applied.

Blob migrations are passed via `StrataConfig.migrations` and applied when loading partition blobs from adapters.

## In-Memory Store

- Structure: `Map<entityKey, Map<entityId, entity>>`
- `entityKey` = `entityName.partitionKey` (e.g., `transaction.2026-03`)
- All reads are sync Map lookups/scans
- Writes: `Map.set()` sync → emit event → debounced flush to local adapter (2s idle)
- Lazy loading: partitions loaded from local adapter on first access
- Partition index (`__index.entityName`) enables partition discovery without loading all data
