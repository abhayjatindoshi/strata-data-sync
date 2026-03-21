export type { BaseEntity, Entity, EntityIdParts } from './entity/index.js';
export { generateId, parseEntityId, buildEntityId, getEntityKey, buildEntityKey, composeEntityId } from './entity/index.js';

export type { EntityDef } from './schema/index.js';
export { defineEntity } from './schema/index.js';

export type { KeyStrategy, DatePeriod, DateKeyStrategyOptions } from './key-strategy/index.js';
export { dateKeyStrategy } from './key-strategy/index.js';

export type { EntityStore, StoreEntry, PartitionMap, StoreOptions } from './store/index.js';
export { createEntityStore } from './store/index.js';

export type { PartitionBlob, BlobAdapter, PartitionMetadata } from './persistence/index.js';
export { serialize, deserialize, createMemoryBlobAdapter, loadPartition, storePartition, fnv1a, computePartitionMetadata } from './persistence/index.js';

export type { Hlc } from './hlc/index.js';
export { createHlc, tickLocal, tickRemote, compareHlc } from './hlc/index.js';

export type {
  SyncDirection, PartitionMeta, EntityHlc, EntityMetadataMap,
  MetadataDiffResult, EntityDiffEntry, DeepDiffResult, MergeResult,
  SyncEntity, ApplyResult, SyncResult, DirtyTracker, SyncTask, SyncScheduler,
} from './sync/index.js';
export {
  compareEntityHlc, resolveConflict, metadataDiff, deepDiff,
  mergePartitionEntities, recomputeMetadata, isStale,
  createDirtyTracker, createSyncScheduler,
} from './sync/index.js';

export type {
  EntityEventType, EntityEvent, EntityEventListener,
  EntityEventBus, EntityObservable, CollectionObservable,
} from './reactive/index.js';
export {
  createEntityEventBus, observeEntity, observeCollection,
} from './reactive/index.js';

export type { GetAllOptions, Repository, RepositoryOptions } from './repository/index.js';
export { createRepository } from './repository/index.js';

export type { BaseTenant, TenantDef, TenantManager, TenantManagerOptions } from './tenant/index.js';
export {
  defineTenant, createTenantManager,
  TENANT_LIST_KEY, scopeEntityKey, scopeMetadataKey, unscopeEntityKey, scopePrefix,
  scopeStore,
} from './tenant/index.js';

export type { Strata, StrataConfig } from './strata/index.js';
export { createStrata } from './strata/index.js';
