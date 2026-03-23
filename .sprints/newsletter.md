# Strata Sprint Newsletter

Append-only log of sprint outcomes. Most recent entry at the bottom.

---

## Sprint 1 — Foundation Layer (HLC, Adapter, Schema, Reactive) — 2026-03-23T20:30:00Z

### What's New
- **HLC module** (`src/hlc/`): `Hlc` type, `createHlc()`, `tickLocal()`, `tickRemote()`, `compareHlc()` — full Hybrid Logical Clock implementation with total ordering
- **Adapter module** (`src/adapter/`): `BlobAdapter` interface with `read`/`write`/`delete`/`list` async methods, `cloudMeta` parameter support, blob key constants/helpers, and `createMemoryBlobAdapter()` with defensive-copy semantics
- **Schema module** (`src/schema/`): `BaseEntity` type, `EntityDefinition<T>`, `generateId()` (8-char alphanumeric), `formatEntityId()`, key strategies (`partitioned`, `global`, `singleton`), `defineEntity<T>()` with `deriveId` validation
- **Reactive module** (`src/reactive/`): `EntityEvent` type, `EntityEventListener` callback, `EntityEventBus` (on/off/emit), `createEventBus()` with synchronous listener dispatch

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications

### Quality
- Unit tests: 39 passing
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- HLC: createHlc, tickLocal (timestamp advance + counter increment), tickRemote (merge scenarios), compareHlc (all tiebreaker levels)
- MemoryBlobAdapter: read/write round-trip, missing key, defensive copy isolation, delete true/false, list prefix filtering
- Schema: defineEntity definition shape, generateId format/uniqueness, all key strategies, deriveId dot rejection
- Event bus: on/emit delivery, off removal, multiple listeners, no-listener safety, duplicate registration
