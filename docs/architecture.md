# Storage Architecture

Data lives across three tiers, each serving a different purpose:

```
┌─────────────────────────────────────────────────────────┐
│                      Application                        │
│                    (Repository API)                      │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  Store   │    │  Local   │    │  Cloud   │
   │(in-memory)│   │(on-disk) │    │(remote)  │
   └──────────┘    └──────────┘    └──────────┘
     fastest         durable        shared/backup
     volatile        offline        optional
```

## Store (In-Memory)

The primary read/write tier. All application reads and writes go here first. It provides per-entity CRUD access — get by ID, list by type, save, delete. Because it's in-memory, access is instantaneous with no serialization overhead.

The store is **volatile** — it starts empty on each app session and is populated on-demand.

## Local (On-Disk)

Durable persistence that survives app restarts. Data is stored as **blobs** — each blob corresponds to an entity key partition containing all entities (active and deleted) for that partition. The local tier acts as the source of truth for offline scenarios.

When the store needs data it doesn't have, it lazily loads the relevant partition from local.

## Cloud (Remote)

An optional remote tier for backup and cross-device synchronization. It uses the same blob-based persistence contract as local. When present, the framework automatically syncs between local and cloud on a scheduled interval.

Cloud is entirely optional — the framework works fully offline with just store + local.

## Lazy Loading

Data flows upward through the tiers on demand:

1. **Read request** → check store (in-memory)
2. **Miss** → load partition from local into store
3. **Miss** → load partition from cloud into local, then into store

Once a partition is loaded into the store, subsequent reads for any entity in that partition are instant. The framework tracks which partitions are loaded at each tier via metadata, so it never makes redundant loads.
