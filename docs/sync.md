# Synchronization & Conflict Resolution

## When Sync Happens

The framework uses a **dirty tracking** system. When any write occurs in the store, the store's version counter increments. A scheduler periodically checks whether the store version has diverged from the local or cloud versions. If so, it queues a sync operation.

Syncs are **batched and deduplicated** — if multiple writes happen in quick succession, only one sync runs. The same source→target pair is never queued more than once simultaneously.

Sync direction: `Store → Local` and `Local ↔ Cloud` (bidirectional).

## How Sync Works

The sync engine uses a **metadata-first** approach to minimize data transfer:

1. **Compare metadata timestamps** — if both sides have the same `updatedAt` timestamp, they're identical. Stop.

2. **Partition entity keys** into three buckets:
   - Keys only on side A → copy entirely to side B
   - Keys only on side B → copy entirely to side A
   - Keys on both sides with **different hashes** → deep diff required

3. **Deep diff** for mismatched partitions:
   - Load the full blob from both sides
   - Compare entity by entity within the partition
   - For entities that exist on both sides, apply conflict resolution

4. **Apply changes** to both sides and recompute metadata hashes

## Metadata

Each tier maintains a metadata record that summarizes its contents without storing the actual data. Metadata operates at two levels:

### Partition-Level

A hash and timestamp per entity key, used to quickly determine which partitions have changed:

```jsonc
{
  "updatedAt": "2025-09-28T14:30:00.000Z",
  "entityKeys": {
    "Transaction.2025": {
      "hash": 918237461,
      "updatedAt": "2025-09-28T...",
      "entities": {
        "Transaction": { "count": 142, "deletedCount": 3 }
      }
    }
  }
}
```

If the partition hash matches on both sides, the data is identical — no blob needs to be loaded.

### Entity-Level

An HLC (Hybrid Logical Clock) per entity within each partition, used to determine exactly which entities diverge before loading full blob data:

```jsonc
{
  "Transaction.2025": {
    "Transaction": {
      "txn.2025.abc": { "updatedAt": 1700000101000, "version": 1, "device": "phone_1" },
      "txn.2025.def": { "updatedAt": 1700000050000, "version": 0, "device": "laptop_1" }
    }
  }
}
```

When a partition hash mismatches, the engine compares entity-level HLCs from both sides' metadata before loading any blob data. This tells it:

- Which specific entities have changed (and in which direction)
- Whether it's a one-way copy (all HLCs on one side are ≥ the other) — in which case the "behind" side's blob doesn't need to be loaded at all, just overwritten
- Whether true conflicts exist (both sides have entities newer than the other)

This makes sync cost proportional to the number of changed entities, not the partition size. A single edit in a 500-entity partition no longer requires diffing all 500.

---

## Conflict Resolution

When the same entity has been modified on both sides since the last sync, the framework resolves the conflict using a **last-writer-wins** policy based on **Hybrid Logical Clocks (HLCs)**.

### Hybrid Logical Clocks

Each entity's HLC is composed of three base entity fields:

```
updatedAt  — the wall clock component (milliseconds at the time of the edit)
version    — the counter component (tie-breaker when wall clock hasn't advanced)
device     — a stable unique identifier for the device (final deterministic tie-breaker)
```

These are standard fields on every entity — no separate HLC object is needed. Together they form a totally ordered logical timestamp.

Comparison is lexicographic: compare `updatedAt` first, then `version`, then `device`.

### Why Not Plain Timestamps

Wall clocks drift between devices. If a phone's clock is 3 seconds ahead of a laptop, the phone always wins conflicts regardless of which edit was actually more recent. Worse: if the laptop syncs an edit to the phone, and the phone then edits the same entity, the phone's HLC is guaranteed to be higher than the laptop's — because the phone ratchets its clock forward to at least match any HLC it has seen. Plain `Date` comparison can't express this causality.

### How the Clock Ticks

On every local save:
```
updatedAt = max(Date.now(), lastSeenHLC.updatedAt)
version   = (updatedAt === lastSeenHLC.updatedAt) ? lastSeenHLC.version + 1 : 0
device    = thisDeviceId
```

On receiving a synced entity:
```
lastSeenHLC = max(lastSeenHLC, { updatedAt, version, device } from received entity)
```

The `version` (counter) ensures that multiple operations at the same wall-clock millisecond (or when the wall clock is behind a previously seen HLC) are still totally ordered. The `device` ID ensures that two devices producing the same updatedAt+version always resolve to the same winner, regardless of sync order.

### Resolution Rules

| Side A | Side B | Resolution |
|--------|--------|------------|
| Higher HLC | Lower HLC | A wins everywhere |
| Lower HLC | Higher HLC | B wins everywhere |
| Equal HLC | Equal HLC | No action needed (same state) |
| Active | Deleted (equal HLC) | **Delete wins** |
| Deleted | Active (equal HLC) | **Delete wins** |
| Active (higher HLC) | Deleted (lower HLC) | Active wins — entity is restored |
| Deleted (higher HLC) | Active (lower HLC) | Delete wins — entity is removed |

The key design choice: **deletes dominate on equal HLCs**. This prevents "zombie" entities from being accidentally resurrected.

### Stale Write Protection

After applying changes to side B, the engine re-checks side A's metadata. If A has changed during the sync (e.g. the user saved something mid-sync), the engine skips writing back to A to avoid overwriting fresh data. The next sync cycle will pick up the remaining differences.
