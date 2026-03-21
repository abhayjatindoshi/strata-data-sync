# Product Backlog

Items are moved to sprint plans by the Scrum Master. Completed items are marked with ~~strikethrough~~.

## Features

- ~~Entity definition system (`defineEntity<T>`, `EntityDef`, `BaseEntity` types)~~
- ~~Entity key and ID generation (partition key encoding, unique ID suffix)~~
- ~~Key strategy interface and date-based strategy implementation~~
- ~~In-memory store (per-entity CRUD, partition management)~~
- ~~Blob serialization/deserialization (deterministic sorted-key JSON)~~
- ~~Blob adapter interface (`BlobAdapter`)~~
- ~~Persistence layer (load/store partitions via adapters)~~
- ~~Metadata system (partition-level hashes, entity-level HLCs)~~
- ~~HLC implementation (tick on save, tick on receive, comparison)~~
- ~~Sync engine (metadata-first diff, three-bucket partitioning, deep diff)~~
- ~~Conflict resolution (last-writer-wins via HLC, delete-wins-on-equal)~~
- ~~Dirty tracking and sync scheduling (batched, deduplicated)~~
- ~~Stale write protection~~
- ~~Reactive event system (entity events on mutation)~~
- ~~Entity observables (`observe`, `observeAll` with `distinctUntilChanged`)~~
- ~~Repository API (`get`, `getAll`, `save`, `delete`, `observe`, `observeAll`)~~
- ~~Lazy loading (store miss → local → cloud)~~
- Query options (ID filtering, field matching, multi-field sorting)
- Tenant entity (base + extendable via `defineTenant<T>`)
- Tenant manager (`list`, `create`, `load`, `switch`)
- Tenant key namespacing (framework constructs scoped keys)
- ~~`createStrata` factory function (initialization, wiring)~~
- React context providers
- React hooks (`useRepo`, `useTenant`)
- React HOCs (auto-subscribe observables)
- React UI components (tenant picker, creation wizard)
