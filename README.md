# Strata
`strata-data-sync`

An offline-first, reactive data framework for TypeScript applications that need to store data locally and optionally synchronize it to the cloud. It handles the full lifecycle: entity definition, identity generation, partitioned storage, multi-tier persistence, automatic synchronization, conflict resolution, and reactive UI bindings.

---

## What It Does

The framework lets an application define domain entities as lightweight TypeScript type tokens, persist them across three storage tiers (in-memory, local, cloud), and keep all tiers in sync automatically. The application interacts with a single repository API for reads and writes. Everything else — lazy loading from lower tiers, dirty tracking, sync scheduling, conflict resolution, and reactive change propagation — happens behind the scenes.

## Quick Start

```typescript
import { defineEntity, createStrata } from "strata-data-sync";

// 1. Define entities — lightweight type tokens, no schema library needed
const Transaction = defineEntity<{
  amount: number;
  date: Date;
  accountId: string;
}>("Transaction");

const Account = defineEntity<{
  name: string;
  balance: number;
}>("Account");

// 2. Create the framework instance
const strata = createStrata({
  entities: [Transaction, Account],
  localAdapter: myLocalAdapter,        // app-implemented blob storage
  keyStrategy: dateKeyStrategy({ period: "year" }),
  deviceId: "phone_1",
});

// 3. Load a tenant and start working
await strata.load("default");

// 4. Use type-safe repositories — zero casts
const txnRepo = strata.repo(Transaction);

const id = await txnRepo.save({ amount: 50, date: new Date(), accountId: "acct_1" });
const txn = await txnRepo.get(id);    // fully typed: { id, createdAt, ..., amount, date, accountId }

txnRepo.observe(id).subscribe(t => {
  console.log(t?.amount);             // ✅ number, no cast
});
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | Three-tier storage (in-memory → local → cloud), lazy loading |
| [Entities & Type System](docs/entities.md) | `defineEntity`, base fields, framework entities, type inference deep dive |
| [Partitioning](docs/partitioning.md) | Entity keys, partition strategies, identity format, blob persistence format |
| [Sync & Conflict Resolution](docs/sync.md) | Dirty tracking, metadata-first sync, HLC clocks, resolution rules |
| [Multi-Tenancy](docs/tenancy.md) | Tenant isolation, lifecycle, extending tenant shape |
| [API Reference](docs/api.md) | Initialization, repository API, tenant manager, query options, adapters, React integration |

## Design Principles

- **Offline-first** — the app works fully without a network. Cloud sync is opportunistic.
- **Zero-cast type safety** — entity types flow from definition tokens through repositories, queries, and observables without any manual casting.
- **Deterministic serialization** — all blobs serialize with sorted keys so identical data always produces the same hash.
- **Metadata-driven sync** — never load entity data unless metadata proves something has changed.
- **Event-driven reactivity** — every mutation emits an event. Observers are always consistent with the latest state.
- **Partition isolation** — operations on one partition never affect another. Sync, loading, and hashing are all per-partition.
- **Delete tracking** — deletions are recorded, not erased, allowing sync to propagate deletes correctly.
- **Global adapters** — storage adapters are stateless singletons, key-based, with no awareness of tenants or entity types.
