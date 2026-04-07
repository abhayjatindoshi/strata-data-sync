# API Inventory

Auto-generated inventory of all symbols.

---

## root

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| options.ts | `StrataOptions` | type | yes | Configuration with optional sync/flush intervals, tombstone retention, and storage keys |
| options.ts | `ResolvedStrataOptions` | type | yes | Resolved options with all fields required |
| options.ts | `resolveOptions` | function | yes | Merges partial StrataOptions with defaults |
| strata.ts | `StrataConfig` | type | yes | Configuration for Strata setup: appId, entities, adapters, deviceId, encryption, migrations |
| strata.ts | `Strata` | class | yes | Main framework class managing tenants, event buses, sync engine, repos, and dirty tracking |
| strata.ts | `validateEntityDefinitions` | function | yes | Validates entity definitions for non-empty length and duplicate names |
| strata.ts | `log` | constant | no | Debug logger for 'strata:core' |

---

## adapter

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| keys.ts | `partitionBlobKey` | function | yes | Generates composite blob key from entity name and partition |
| memory-storage.ts | `MemoryStorageAdapter` | class | yes | In-memory adapter implementing StorageAdapter for testing |
| types.ts | `StorageAdapter` | type | yes | Adapter interface for read/write/delete blob storage operations |
| types.ts | `EncryptionStrategy` | type | yes | Generic encryption/decryption interface for cipher implementations |
| types.ts | `EncryptionKeys` | type | yes | Opaque type representing encryption keys |
| types.ts | `EncryptionService` | type | yes | Service interface for encryption lifecycle, key derivation, and rekeying |
| types.ts | `noopEncryptionService` | const | yes | No-op encryption service passthrough |
| types.ts | `InvalidEncryptionKeyError` | class | yes | Error thrown when decryption fails with invalid key |
| types.ts | `Tenant` | type | yes | Re-export of Tenant type from @strata/tenant |
| types.ts | `noopEncryptionService` | constant | yes | No-op encryption service that passes data through unchanged |

---

## hlc

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| hlc.ts | `createHlc` | function | yes | Creates a new HLC with the given nodeId |
| hlc.ts | `tick` | function | yes | Advances HLC based on local and optional remote HLC values |
| hlc.ts | `compareHlc` | function | yes | Compares two HLC values returning -1, 0, or 1 |
| types.ts | `Hlc` | type | yes | Hybrid Logical Clock with timestamp, counter, and nodeId |

---

## persistence

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| blob-io.ts | `DataAdapter` | type | yes | Adapter interface for read/write/delete/list on partition blobs |
| blob-io.ts | `EncryptedDataAdapter` | class | yes | Wraps StorageAdapter with transparent encryption/decryption |
| hash.ts | `partitionHash` | function | yes | Computes FNV-1a hash of entity map entries for change detection |
| partition-index.ts | `MARKER_ENTITY_KEY` | constant | no | Internal constant `__system` for marker entity identification |
| partition-index.ts | `loadAllIndexes` | function | yes | Loads all partition indexes from adapter's marker blob |
| partition-index.ts | `saveAllIndexes` | function | yes | Persists partition indexes to adapter's marker blob |
| partition-index.ts | `updatePartitionIndexEntry` | function | yes | Creates updated PartitionIndex with new entry hash, count, and timestamp |
| types.ts | `PartitionIndexEntry` | type | yes | Partition metadata: hash, entity count, deleted count, update timestamp |
| types.ts | `PartitionIndex` | type | yes | Maps partition keys to PartitionIndexEntry |
| types.ts | `AllIndexes` | type | yes | Maps entity type names to PartitionIndex |
| types.ts | `PartitionBlob` | type | yes | Serialized partition with entity data, deleted records, and optional version |

---

## reactive

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| event-bus.ts | `EventBus` | class | yes | Generic event bus wrapping RxJS Subject with emit, all$, and dispose |
| types.ts | `EntityEventSource` | type | yes | Union type: `'user' \| 'sync'` indicating event origin |
| types.ts | `EntityEvent` | type | yes | Entity change event with entityName, source, updates array, and deletes array |

---

## repo

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| query.ts | `applyWhere` | function | yes | Filters entities by equality matching on field values |
| query.ts | `applyRange` | function | yes | Filters entities by range conditions (gt, gte, lt, lte) |
| query.ts | `applyOrderBy` | function | yes | Sorts entities by one or more fields with direction |
| query.ts | `applyPagination` | function | yes | Applies offset and limit for pagination |
| repository.ts | `log` | constant | no | Debug logger for strata:repo |
| repository.ts | `entityComparator` | function | no | Compares two entities by id and version for equality |
| repository.ts | `resultsChanged` | function | no | Detects if entity collection changed by id/version comparison |
| repository.ts | `Repository` | class | yes | Generic repository for CRUD, reactive queries, and HLC versioning |
| singleton-repository.ts | `log` | constant | no | Debug logger for strata:repo |
| singleton-repository.ts | `SingletonRepository` | class | yes | Repository for storing and observing a single entity instance |
| types.ts | `QueryOptions` | type | yes | Configuration for query filters, ordering, and pagination |
| types.ts | `Repository` | type | yes | Type contract for repository with CRUD and observable query methods |
| types.ts | `SingletonRepository` | type | yes | Type contract for singleton repository with single-entity operations |

---

## schema

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| define-entity.ts | `defineEntity` | function | yes | Creates entity definition with optional key strategy and ID derivation |
| define-entity.ts | `wrapDeriveId` | function | no | Validates derived IDs to ensure they don't contain dots |
| key-strategy.ts | `partitioned` | function | yes | Creates partitioned key strategy using a partition function |
| key-strategy.ts | `globalStrategy` | function | yes | Creates global key strategy mapping all entities to single partition |
| key-strategy.ts | `singletonStrategy` | function | yes | Creates singleton key strategy for single-instance entities |
| migration.ts | `BlobMigration` | type | yes | Versioned blob migration with optional entity filter and transform function |
| migration.ts | `migrateBlob` | function | yes | Applies sequential migrations to a partition blob |
| types.ts | `BaseEntity` | type | yes | Base entity fields: id, timestamps, version, device, HLC metadata |
| types.ts | `KeyStrategy` | type | yes | Entity partitioning logic with kind and partition function |
| types.ts | `EntityDefinitionOptions` | type | yes | Configuration for entity definition (key strategy, deriveId) |
| types.ts | `EntityDefinition` | type | yes | Complete entity schema with name, key strategy, and optional deriveId |

---

## store

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| flush.ts | `log` | constant | no | Debug logger for strata:store |
| flush.ts | `loadPartitionFromAdapter` | function | yes | Loads partition data from DataAdapter into EntityStore with migrations |
| store.ts | `Store` | class | yes | In-memory entity store with partition, tombstone, and dirty tracking |
| types.ts | `EntityStore` | type | yes | Extended DataAdapter interface for entity CRUD, partitions, tombstones, dirty tracking |

---

## sync

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| conflict.ts | `resolveConflict` | function | yes | Resolves entity conflict using HLC comparison |
| conflict.ts | `resolveEntityTombstone` | function | yes | Determines winner between entity and tombstone by HLC |
| diff.ts | `log` | constant | no | Debug logger for sync module |
| diff.ts | `loadAllIndexPairs` | function | yes | Loads partition indexes from local and cloud adapters in parallel |
| diff.ts | `diffPartitions` | function | yes | Compares partition indexes, categorizes as local-only/cloud-only/diverged/unchanged |
| merge.ts | `diffEntityMaps` | function | yes | Diffs entity maps between local and cloud by ID |
| merge.ts | `resolveBothEntry` | function | no | Resolves conflict for entities existing in both adapters |
| merge.ts | `mergePartition` | function | yes | Merges two partition blobs by diffing and resolving conflicts |
| sync-engine.ts | `log` | constant | no | Debug logger for sync module |
| sync-engine.ts | `SyncEngine` | class | yes | Manages sync queue, scheduling, and orchestration between adapters |
| sync-engine.ts | `EMPTY_RESULT` | constant | no | Default empty sync result object |
| types.ts | `PartitionDiffResult` | type | yes | Categorized partition keys: localOnly, cloudOnly, diverged, unchanged |
| types.ts | `EntityDiffResult` | type | yes | Categorized entity IDs: localOnly, cloudOnly, both |
| types.ts | `MergeResult` | type | yes | Merged entity map and tombstone map |
| types.ts | `MergedPartitionResult` | type | yes | MergeResult extended with partitionKey |
| types.ts | `SyncEntity` | type | yes | Entity with required hlc field for conflict resolution |
| types.ts | `SyncEntityChange` | type | yes | Change record with partition key, updated IDs, deleted IDs |
| types.ts | `SyncBetweenResult` | type | yes | Sync result with changes for both adapters, stale flag, max HLC |
| types.ts | `SyncLocation` | type | yes | Union: `'memory' \| 'local' \| 'cloud'` |
| types.ts | `SyncQueueItem` | type | yes | Queued sync task with source, target, promise resolvers |
| types.ts | `SyncResult` | type | yes | Sync stats: entitiesUpdated, conflictsResolved, partitionsSynced |
| types.ts | `SyncEvent` | type | yes | Sync lifecycle event with type, source, target, optional result/error |
| types.ts | `SyncEnqueueResult` | type | yes | Enqueue result with payload and deduplicated flag |
| types.ts | `SyncEngine` | type | yes | Interface for sync engine: sync, run, scheduler, drain, dispose |
| unified.ts | `log` | constant | no | Debug logger for sync module |
| unified.ts | `SyncChange` | type | no | Internal type for partition blob change |
| unified.ts | `SyncPlan` | type | no | Internal execution plan with indexed snapshots and changes |
| unified.ts | `buildPlan` | function | no | Builds sync plan by loading indexes and diffing partitions |
| unified.ts | `planCopies` | function | no | Plans copying partitions existing in only one adapter |
| unified.ts | `planMerges` | function | no | Plans merging diverged partitions using blob merging |
| unified.ts | `applyChanges` | function | no | Writes planned sync changes to target adapter |
| unified.ts | `isStale` | function | no | Checks if adapter's index changed since snapshot |
| unified.ts | `computeIndexUpdates` | function | no | Computes updated partition index entries from applied changes |
| unified.ts | `mergeIndexes` | function | no | Merges partition index updates into existing indexes |
| unified.ts | `deduplicateChanges` | function | no | Removes duplicate sync changes keeping first occurrence |
| unified.ts | `buildHlcMap` | function | no | Builds HLC map from entities and tombstones for hashing |
| unified.ts | `toEntityChanges` | function | no | Converts sync changes to entity change records |
| unified.ts | `findMaxHlc` | function | no | Finds maximum HLC across all entities and tombstones |
| unified.ts | `syncBetween` | function | yes | Main three-phase sync orchestration between two adapters |

---

## tenant

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| marker-blob.ts | `MarkerData` | type | yes | Marker metadata: version, creation, entity types, indexes, optional key data |
| marker-blob.ts | `log` | constant | no | Debug logger for strata:tenant |
| marker-blob.ts | `MARKER_ENTITY_KEY` | constant | no | System key `__system` for marker storage |
| marker-blob.ts | `writeMarkerBlob` | function | yes | Writes marker blob with entity types and optional key data |
| marker-blob.ts | `readMarkerBlob` | function | yes | Reads marker blob, returns MarkerData or undefined |
| marker-blob.ts | `validateMarkerBlob` | function | yes | Validates marker blob version compatibility |
| tenant-context.ts | `TenantSession` | type | yes | Active tenant and associated encryption keys |
| tenant-context.ts | `TenantContext` | class | yes | RxJS-backed context manager for active tenant session state |
| tenant-list.ts | `TENANTS_ENTITY_KEY` | constant | no | System key `__tenants` for tenant list storage |
| tenant-list.ts | `loadTenantList` | function | yes | Loads tenant list from adapter blob |
| tenant-list.ts | `saveTenantList` | function | yes | Persists tenant list to adapter blob |
| tenant-manager.ts | `TenantManagerDeps` | type | yes | Dependencies object for TenantManager construction |
| tenant-manager.ts | `TenantManager` | class | yes | Tenant lifecycle: list, probe, create, join, remove, open, close, sync, credentials |
| tenant-manager.ts | `log` | constant | no | Debug logger for strata:tenant |
| tenant-prefs.ts | `TenantPrefs` | type | yes | Tenant preferences containing name |
| tenant-prefs.ts | `log` | constant | no | Debug logger for strata:tenant |
| tenant-prefs.ts | `TENANT_PREFS_KEY` | constant | no | System key `__tenant_prefs` for preferences storage |
| tenant-prefs.ts | `PREFS_ENTITY_KEY` | constant | no | System key `__prefs` for preferences entity |
| tenant-prefs.ts | `saveTenantPrefs` | function | yes | Persists tenant preferences to storage |
| tenant-prefs.ts | `loadTenantPrefs` | function | yes | Loads tenant preferences from storage |
| tenant-sync.ts | `log` | constant | no | Debug logger for strata:tenant |
| tenant-sync.ts | `mergeTenantLists` | function | yes | Merges local and remote tenant lists by ID with timestamp comparison |
| tenant-sync.ts | `pushTenantList` | function | yes | Pushes local tenant list to cloud adapter |
| tenant-sync.ts | `pullTenantList` | function | yes | Pulls remote tenant list and merges into local |
| types.ts | `Tenant` | type | yes | Core tenant: id, name, encryption flag, metadata, timestamps |
| types.ts | `ProbeResult` | type | yes | Discriminated union for tenant existence and encryption status |
| types.ts | `CreateTenantOptions` | type | yes | Tenant creation params: name, meta, optional id and encryption |
| types.ts | `JoinTenantOptions` | type | yes | Tenant join params: metadata and optional name |
| types.ts | `TenantManager` | type | yes | Interface for tenant CRUD, lifecycle, sync, and credential operations |

---

## utils

| File | Name | Kind | Exported | Description |
|------|------|------|----------|-------------|
| assert.ts | `assertNotDisposed` | function | yes | Throws error if instance is disposed |
| buffer.ts | `toArrayBuffer` | function | yes | Converts Uint8Array to ArrayBuffer with correct byte offset |
| buffer.ts | `toBase64` | function | yes | Encodes Uint8Array to base64 string |
| buffer.ts | `fromBase64` | function | yes | Decodes base64 string to Uint8Array |
| buffer.ts | `streamToUint8Array` | function | yes | Reads ReadableStream into single Uint8Array |
| compare.ts | `compareValues` | function | yes | Compares two values (Date, number, string) returning -1/0/1 |
| composite-key.ts | `compositeKey` | function | yes | Combines tenant ID and key into composite key |
| composite-key.ts | `parseCompositeKey` | function | yes | Parses composite key into entityName and rest |
| composite-key.ts | `formatEntityId` | function | yes | Formats entity ID as entityName.partitionKey.uniqueId |
| composite-key.ts | `parseEntityKey` | function | yes | Extracts entity key from full entity ID |
| crypto.ts | `PBKDF2_ITERATIONS` | constant | no | PBKDF2 iteration count: 100,000 |
| crypto.ts | `IV_LENGTH` | constant | no | AES-GCM IV length: 12 bytes |
| crypto.ts | `ENCRYPTION_VERSION` | constant | no | Encryption version marker: 1 |
| crypto.ts | `textEncoder` | constant | no | TextEncoder instance for string-to-bytes |
| crypto.ts | `pbkdf2DeriveKey` | function | yes | Derives AES-GCM key from password and salt using PBKDF2 |
| crypto.ts | `aesGcmGenerateKey` | function | yes | Generates new AES-GCM 256-bit key |
| crypto.ts | `exportCryptoKey` | function | yes | Exports CryptoKey to base64 string |
| crypto.ts | `importAesGcmKey` | function | yes | Imports base64-encoded key to AES-GCM CryptoKey |
| crypto.ts | `aesGcmEncrypt` | function | yes | Encrypts data with AES-GCM, prepends version and IV |
| crypto.ts | `aesGcmDecrypt` | function | yes | Decrypts AES-GCM data with version validation |
| fnv.ts | `FNV_OFFSET` | constant | yes | FNV-1a offset basis (2166136261) |
| fnv.ts | `FNV_PRIME` | constant | yes | FNV-1a prime (16777619) |
| fnv.ts | `fnv1a` | function | yes | Computes FNV-1a hash of string |
| fnv.ts | `fnv1aAppend` | function | yes | Appends string to existing FNV-1a hash |
| id.ts | `CHARS` | constant | no | Character set for ID generation (alphanumeric) |
| id.ts | `generateId` | function | yes | Generates random alphanumeric ID (default 8 chars) |
| reactive-flag.ts | `ReactiveFlag` | class | yes | Reactive boolean flag with RxJS observable, set(), and clear() |
| serialize.ts | `encoder` | constant | no | TextEncoder instance for serialization |
| serialize.ts | `decoder` | constant | no | TextDecoder instance for deserialization |
| serialize.ts | `replacer` | function | no | JSON.stringify replacer handling Date serialization |
| serialize.ts | `reviver` | function | no | JSON.parse reviver handling Date deserialization |
| serialize.ts | `serialize` | function | yes | Serializes data to Uint8Array with Date support |
| serialize.ts | `deserialize` | function | yes | Deserializes Uint8Array to typed object with Date restoration |
