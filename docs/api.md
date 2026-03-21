# API Reference

## Initialization

The application creates a Strata instance by providing entity definitions, adapters, and configuration. All of these are **global and static** — they are set once and do not change per tenant.

```typescript
const Transaction = defineEntity<{ amount: number; date: Date; accountId: string }>("Transaction");
const Account = defineEntity<{ name: string; balance: number }>("Account");

const strata = createStrata({
  entities: [Transaction, Account],                      // Entity definition tokens
  tenant: defineTenant<{ provider: string }>(),          // Optional: extend tenant shape
  localAdapter: myLocalAdapter,                          // App-implemented, key-based blob storage
  cloudAdapter: myCloudAdapter,                          // Optional: remote blob storage
  keyStrategy: dateKeyStrategy({ period: "year" }),      // How entities are partitioned
  deviceId: "phone_1",                                   // Stable device identifier for HLC
});

// Load a tenant to start working
await strata.load("default");
```

| Input | Required | Purpose |
|-------|----------|---------|
| **entities** | Yes | All entity types as an array of `defineEntity` tokens |
| **localAdapter** | Yes | On-disk persistence (app-implemented, key-based) |
| **deviceId** | Yes | Stable unique device identifier for HLC |
| **keyStrategy** | Yes | Partitioning strategy (built-in date-based or custom) |
| **tenant** | No | Extended tenant shape via `defineTenant<T>()` |
| **cloudAdapter** | No | Remote persistence (same contract as local) |
| **logger** | No | Custom log handler |

## Repository API

Once a tenant is loaded, the application accesses data through repositories. The entity definition token is the key — it provides full type safety with zero casts:

```typescript
const txnRepo = strata.repo(Transaction);

const txn = await txnRepo.get(id);           // → Entity<{ amount, date, accountId }> | undefined
const all = await txnRepo.getAll({ ... });    // → Entity<{ amount, date, accountId }>[]
const id  = await txnRepo.save({ amount: 50, date: new Date(), accountId: "..." });
await txnRepo.delete(id);

txnRepo.observe(id).subscribe(txn => { ... });
txnRepo.observeAll({ ... }).subscribe(list => { ... });
```

| Operation | Description |
|-----------|-------------|
| **get(id)** | Fetch a single entity by ID (lazy-loads partition if needed) |
| **getAll(options?)** | Fetch all entities matching filter/sort criteria |
| **save(entity)** | Create or update an entity (returns the assigned ID). All domain fields required, base fields optional. |
| **delete(id)** | Soft-delete an entity (tracked for sync propagation) |
| **observe(id)** | Reactive stream for a single entity |
| **observeAll(options?)** | Reactive stream for a filtered/sorted collection |

## Tenant Manager API

```typescript
const tenants = await strata.tenants.list();
const tenant = await strata.tenants.create({ name: "Household", provider: "s3" });
await strata.load(tenant.id);
await strata.switch(otherTenantId);
```

| Operation | Description |
|-----------|-------------|
| **tenants.list()** | List all tenants (always available, not tenant-scoped) |
| **tenants.create(data)** | Create a new tenant with name + optional custom fields |
| **load(tenantId)** | Scope the framework to a tenant, start sync |
| **switch(tenantId)** | Flush pending syncs, clear store, re-scope to new tenant |

## Query Options

Queries support:

- **ID filtering** — fetch specific entities by ID list
- **Field matching** — shallow equality filter on entity fields (type-safe: only valid field names accepted)
- **Multi-field sorting** — sort by one or more fields, each ascending or descending (type-safe: only valid field names accepted)

```typescript
await txnRepo.getAll({
  ids: ["txn.2025.abc", "txn.2025.def"],
  where: { accountId: "acct_1" },
  orderBy: [{ field: "date", direction: "desc" }],
});
```

Filtering and sorting happen in-memory across all loaded partitions that match the key strategy's filter criteria.

## Implementing Adapters

Applications provide adapter implementations. All adapters are **global, stateless, key-based** — they work regardless of which tenant is loaded. The framework constructs tenant-scoped keys internally.

**Blob Adapter** (same interface for local and cloud):

```typescript
interface BlobAdapter {
  load(key: string): Promise<string | null>;
  store(key: string, data: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
```

The framework constructs keys like `tenant:{tenantId}:entity:{entityKey}` and `__tenants`. The adapter just stores and retrieves data by key — no awareness of tenants, partitions, or entity types.

## Reactive Data Access

The framework provides reactive streams for all data access, built on RxJS:

- **Single entity observation** — subscribe to an entity by ID and receive updates whenever it changes (including deletion)
- **Collection observation** — subscribe to a filtered, sorted collection and receive the updated list whenever any entity in the result set changes

Reactivity flows through an event system:
1. A write or delete occurs in the store
2. An entity event is emitted
3. Observables for the affected entity and any collections containing it are updated
4. React components re-render (if using the provided bindings)

Collections are recomputed by combining the individual entity streams for all entities matching the filter criteria, so adding/removing entities from a filtered set is handled automatically.

## React Integration

The framework provides:

- **Context providers** for the Strata instance and tenant manager
- **Hooks** for accessing repositories and tenant context
- **Higher-order components** that auto-subscribe to reactive streams and inject data as props
- **Pre-built UI components** for tenant selection, multi-step tenant creation wizards, and cloud file browsing
