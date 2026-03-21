# Entity Keys & Partitioning

Entities are not stored individually — they are grouped into **partitions** called entity keys. Each entity key maps to a single persisted blob containing all entities (of potentially multiple types) that share that key.

## How Partitioning Works

A **strategy** determines how entities are assigned to partitions. The framework ships with a date-based strategy that partitions by time period (e.g. year), but any custom strategy can be plugged in.

Example with year-based partitioning:
```
Entity Key: "Transaction.2025"
Contains:   All transactions created in 2025

Entity Key: "Transaction.2024"
Contains:   All transactions created in 2024
```

## Identity Format

Entity IDs encode their partition:

```
<entity-key>.<unique-id>

Examples:
  Transaction.2025.a8Kx3mPq    → belongs to partition "Transaction.2025"
  Account.global.Zt9wR2nL      → belongs to partition "Account.global"
```

This design allows the framework to derive the partition from any entity ID without a lookup, and means queries can target only the partitions that are relevant.

## Why Partitions Matter

- **Sync granularity**: Only changed partitions are synced, not the entire dataset
- **Lazy loading**: Only partitions needed for the current view are loaded into memory
- **Scalability**: Data grows across partitions rather than in a single monolithic blob

## Persistence Format

Each partition is persisted as a single JSON blob with the following shape:

```jsonc
{
  "Account": {
    "Account.global.Zt9wR2nL": { "id": "Account.global.Zt9wR2nL", "name": "Checking", "updatedAt": "..." },
    "Account.global.Pm4xQ7vY": { "id": "Account.global.Pm4xQ7vY", "name": "Savings", "updatedAt": "..." }
  },
  "deleted": {
    "Account": {
      "Account.global.OldId123": "2025-06-15T10:30:00.000Z"
    }
  }
}
```

Active entities are keyed by entity name, then by ID. Deleted entities are tracked separately with their deletion timestamp. This structure allows the sync engine to detect and propagate deletions rather than silently losing data.

All blobs are serialized with **sorted keys** to ensure deterministic output — this is critical for hash-based change detection.

## Implementing a Key Strategy

A key strategy tells the framework how to partition entities. It must answer:

1. **Given an entity, what is its partition key?** — Used on save to determine where the entity goes
2. **Given filter criteria, which partition keys could contain matching entities?** — Used on query to limit which partitions are loaded
3. **How are entity IDs structured?** — The strategy controls ID generation, embedding the partition key into the ID

The framework includes a date-based strategy that partitions by time period, which can be extended for year, month, or day granularity.
