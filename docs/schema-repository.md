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
  get(id: string): T | undefined;
  query(opts?: QueryOptions<T>): ReadonlyArray<T>;
  save(entity: T & Partial<BaseEntity>): string;
  saveMany(entities: ReadonlyArray<T & Partial<BaseEntity>>): ReadonlyArray<string>;
  delete(id: string): boolean;
  deleteMany(ids: ReadonlyArray<string>): void;
  observe(id: string): Observable<T | undefined>;
  observeQuery(opts?: QueryOptions<T>): Observable<ReadonlyArray<T>>;
  dispose(): void;
};
```

### `SingletonRepository<T>` — for singleton entities

```typescript
type SingletonRepository<T> = {
  get(): T | undefined;
  save(entity: T): void;
  delete(): boolean;
  observe(): Observable<T | undefined>;
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

## Entity Migration

Entity definitions support versioned migrations for evolving entity shapes over time:

```typescript
const TaskDef = defineEntity<Task>('task', {
  version: 2,
  migrations: {
    2: (old: unknown) => {
      const prev = old as { title: string };
      return { ...prev, priority: 'normal' };  // add default priority
    },
  },
});
```

- `version` defaults to `1` if not specified
- `migrations` is a record keyed by target version number
- `migrateEntity(entity, storedVersion, targetVersion, migrations)` steps through sequential migration functions

## In-Memory Store

- Structure: `Map<entityKey, Map<entityId, entity>>`
- `entityKey` = `entityName.partitionKey` (e.g., `transaction.2026-03`)
- All reads are sync Map lookups/scans
- Writes: `Map.set()` sync → emit event → debounced flush to local adapter (2s idle)
- Lazy loading: partitions loaded from local adapter on first access
- Partition index (`__index.entityName`) enables partition discovery without loading all data
