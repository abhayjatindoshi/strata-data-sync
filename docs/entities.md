# Entity Definitions & Type System

## Overview

Entities are defined as lightweight TypeScript type tokens using `defineEntity`. No schema library (Zod, etc.) is required — the framework relies purely on TypeScript's type system for inference. Validation is the application's concern if desired.

## Defining Entities

```typescript
const Transaction = defineEntity<{
  amount: number;
  date: Date;
  accountId: string;
}>("Transaction");

const Account = defineEntity<{
  name: string;
  balance: number;
}>("Account");
```

`defineEntity<T>(name)` produces a token that carries:
- The entity **name** (string, used for persistence keys)
- The entity **shape** (TypeScript generic, used for type inference across the entire stack)

These tokens are passed to the framework at initialization and used to access type-safe repositories. No builder pattern, no registration ceremony, no separate registry.

## Base Entity Fields

All entities — including framework entities like tenants — share these framework-managed fields:

| Field | Type | Purpose |
|-------|------|--------|
| `id` | string | Unique identifier (encodes partition key) |
| `createdAt` | Date | When the entity was first created |
| `updatedAt` | Date | HLC wall clock — the physical time of the last edit |
| `version` | number | HLC counter — tie-breaker for edits at the same millisecond |
| `device` | string | HLC device — identifies which device made the last edit |

`updatedAt`, `version`, and `device` together form the entity's Hybrid Logical Clock. The framework manages all five fields automatically — applications only define their domain-specific fields.

When the app defines `Transaction` with `{ amount, date, accountId }`, what the repository actually returns is `BaseEntity & { amount: number; date: Date; accountId: string }`. The base fields are always present.

## Framework Entities

The framework defines two internal entity types:

**Metadata** — framework-only, not extendable by the application. Stores partition-level hashes, entity-level HLCs, and sync state per tier per tenant. Persisted at a reserved key (e.g. `__strata_metadata`) in the same adapters. The app never interacts with metadata directly.

**Tenant** — extendable by the application. The framework requires only a `name` field (plus standard base entity fields). The application can extend the tenant shape with custom fields:

```typescript
// Simple — uses BaseTenant (id, name, createdAt, updatedAt, version, device)
const strata = createStrata({
  entities: { Transaction, Account },
  localAdapter: myLocalAdapter,
  deviceId: "phone_1",
});

// Extended — app adds custom fields to tenant
const strata = createStrata({
  entities: { Transaction, Account },
  tenant: defineTenant<{
    storageLocation: string;
    provider: "s3" | "firebase" | "azure";
    currency: string;
  }>(),
  localAdapter: myLocalAdapter,
  cloudAdapter: myCloudAdapter,
  deviceId: "phone_1",
});
```

## Type Inference — How It Works

The framework uses **token-based generics** to provide full type safety with zero casts. The entity definition token carries a phantom type that TypeScript tracks through the entire call chain.

### The Token

```typescript
declare const FieldsBrand: unique symbol;

interface EntityDef<TName extends string, TFields> {
  readonly name: TName;
  readonly [FieldsBrand]: TFields;  // phantom — exists only at compile time
}

function defineEntity<TFields>(name: string): EntityDef<string, TFields> {
  return { name } as EntityDef<string, TFields>;
}
```

At runtime, this is just `{ name: "Transaction" }`. But at compile time, `TFields` is permanently attached via the branded symbol.

### Repository Inference

The `repo()` method infers `TFields` directly from the token's generic:

```typescript
interface Strata {
  repo<TName extends string, TFields>(
    def: EntityDef<TName, TFields>
  ): Repository<TFields>;
}
```

When you write `strata.repo(Transaction)`, TypeScript resolves `TFields` = `{ amount: number; date: Date; accountId: string }` and returns `Repository<{ amount: number; date: Date; accountId: string }>`. Every method on the repository is then fully typed:

```typescript
const txnRepo = strata.repo(Transaction);

const txn = await txnRepo.get("some-id");
// Type: Entity<{ amount: number; date: Date; accountId: string }> | undefined
// Which is: { id, createdAt, updatedAt, version, device, amount, date, accountId } | undefined

txn?.amount;      // ✅ number
txn?.createdAt;   // ✅ Date
txn?.foo;         // ❌ compile error
```

### Save — Domain Fields Required, Base Fields Optional

```typescript
save(entity: TFields & Partial<BaseEntity>): Promise<string>;
```

- **All domain fields required** — `amount`, `date`, `accountId`
- **All base fields optional** — `id`, `createdAt`, etc. (framework fills them)
- On create: omit `id`, framework generates it
- On update: include `id`, framework reads existing base fields and advances HLC

```typescript
// Create — no cast needed
await txnRepo.save({ amount: 50, date: new Date(), accountId: "acct_1" });

// Update — id is Partial<BaseEntity>
await txnRepo.save({ id: existingId, amount: 75, date: new Date(), accountId: "acct_1" });

// Missing field — compile error, not a runtime surprise
await txnRepo.save({ amount: 50, date: new Date() }); // ❌ 'accountId' missing
```

### Query Options Are Type-Safe

```typescript
interface QueryOptions<TFields> {
  ids?: string[];
  where?: Partial<Entity<TFields>>;
  orderBy?: Array<{ field: keyof Entity<TFields>; direction: "asc" | "desc" }>;
}

await txnRepo.getAll({
  where: { accountId: "acct_1" },                        // ✅ valid field
  orderBy: [{ field: "date", direction: "desc" }],       // ✅ valid field
});

await txnRepo.getAll({ where: { foo: "bar" } });         // ❌ compile error
```

### Observables Carry the Type

```typescript
txnRepo.observe(id).subscribe(txn => {
  // txn: Entity<{ amount, date, accountId }> | undefined — no cast
  txn?.amount;    // ✅ number
});

txnRepo.observeAll({ where: { accountId: "acct_1" } }).subscribe(list => {
  // list: Entity<{ amount, date, accountId }>[] — no cast
  list.forEach(t => t.date);  // ✅ Date
});
```

### Tenant Manager Is Typed Too

```typescript
interface TenantManager<TTenant> {
  list(): Promise<Entity<{ name: string } & TTenant>[]>;
  create(data: { name: string } & TTenant): Promise<string>;
}

const tenant = (await strata.tenants.list())[0];
tenant.name;       // ✅ string
tenant.provider;   // ✅ string (from TTenant extension)
tenant.id;         // ✅ string (from BaseEntity)
```

### Why No Casts Are Needed

| Problem | Traditional approach | Token approach |
|---------|---------------------|----------------|
| Registry stores entities | `Map<string, unknown>` — type erased | Tokens passed directly — types preserved |
| Repo lookup | `getRepo("Transaction")` → `Repository<unknown>` | `repo(Transaction)` — inferred from token generic |
| Save input | `save(data: Record<string, any>)` | `save(data: TFields & Partial<BaseEntity>)` — only valid fields |
| Query filters | `where: Record<string, any>` | `where: Partial<Entity<TFields>>` — only valid fields |
| Deserialization | Returns `unknown`, needs `as Transaction` | Framework applies `Entity<TFields>` from token |

The key insight: **the token IS the type**. You never look up a type by string name. You pass the same object you defined, and TypeScript follows the generic.
