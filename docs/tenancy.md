# Multi-Tenancy

The framework supports isolating data into independent **tenants**. Each tenant has its own storage namespace across all three tiers — store, local, and cloud are scoped per tenant via key prefixes.

## How Tenants Work

Adapters are **global, stateless singletons** — instantiated once at app startup. They are not tenant-aware in their lifecycle. They are plain key-value stores. The framework constructs keys that encode the tenant scope:

```
Entity data:    tenant:{tenantId}:entity:{entityKey}
Metadata:       tenant:{tenantId}:__metadata
Tenant list:    __tenants
```

The adapter doesn't know or care about tenants — it stores blobs by key. The framework handles the namespace convention. This means:

- The adapter can read/write any key regardless of which tenant is "loaded"
- The tenant list is available before any tenant is selected (it's at a key outside any tenant namespace)
- Switching tenants requires no adapter re-initialization

## Tenant Lifecycle

```
App startup:
  1. Adapters instantiated (global, static)
  2. Entity definitions provided (global, static)
  3. Framework reads tenant list from local adapter at "__tenants" key
  4. App picks a tenant (hardcoded ID or user-selected)
  5. Framework scopes all store/sync/reactive operations to that tenant's key prefix
```

Operations:
1. **Create** a tenant with a name and optional custom fields
2. **Load** a tenant — scopes the three-tier stack to this tenant's key prefix and starts sync
3. **Switch** tenants — flushes pending syncs, clears in-memory store, re-scopes to new tenant
4. **List** all tenants — reads from reserved key, always available

## Single-Tenant vs Multi-Tenant

Both use the same code path:

```typescript
// Single-tenant — hardcode a name/id
await strata.load("default");

// Multi-tenant — user selects
const tenants = await strata.tenants.list();
await strata.load(tenants[0].id);
```

## Extending the Tenant Shape

Tenants are themselves entities with base fields (`id`, `createdAt`, `updatedAt`, `version`, `device`) plus at minimum a `name`. The application can extend the tenant shape with custom fields (e.g. `provider`, `region`, `currency`) via `defineTenant<T>()`.

```typescript
const strata = createStrata({
  entities: { Transaction, Account },
  tenant: defineTenant<{
    storageLocation: string;
    provider: "s3" | "firebase" | "azure";
    currency: string;
  }>(),
  localAdapter: myLocalAdapter,
  deviceId: "phone_1",
});

// Tenant manager returns the extended type
const tenant = await strata.tenants.create({
  name: "Household",
  storageLocation: "us-east-1",
  provider: "s3",
  currency: "USD",
});
// tenant type: BaseEntity & { name, storageLocation, provider, currency }
```
