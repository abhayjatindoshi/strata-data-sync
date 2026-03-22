export type { BaseEntity, Entity, EntityIdParts } from './entity';
export { generateId, parseEntityId, buildEntityId, getEntityKey, buildEntityKey, composeEntityId } from './entity';

export type { EntityDef } from './schema';
export { defineEntity } from './schema';

export type { KeyStrategy, DatePeriod, DateKeyStrategyOptions } from './key-strategy';
export { dateKeyStrategy } from './key-strategy';

export type { EntityStore, StoreEntry, PartitionMap, StoreOptions } from './store';
export { createEntityStore } from './store';

export type { PartitionBlob, BlobAdapter, PartitionMetadata } from './persistence';
export { serialize, deserialize, createMemoryBlobAdapter, loadPartition, storePartition, fnv1a, computePartitionMetadata } from './persistence';

export type { Hlc } from './hlc';
export { createHlc, tickLocal, tickRemote, compareHlc } from './hlc';

export type {
  SyncDirection, PartitionMeta, EntityHlc, EntityMetadataMap,
  MetadataDiffResult, EntityDiffEntry, DeepDiffResult, MergeResult,
  SyncEntity, ApplyResult, SyncResult, DirtyTracker, SyncTask, SyncScheduler,
} from './sync';
export {
  compareEntityHlc, resolveConflict, metadataDiff, deepDiff,
  mergePartitionEntities, recomputeMetadata, isStale,
  createDirtyTracker, createSyncScheduler,
} from './sync';

export type {
  EntityEventType, EntityEvent, EntityEventListener,
  EntityEventBus, EntityObservable, CollectionObservable,
} from './reactive';
export {
  createEntityEventBus, observeEntity, observeCollection,
} from './reactive';

export type { GetAllOptions, Repository, RepositoryOptions } from './repository';
export { createRepository } from './repository';

export type { BaseTenant, TenantDef, TenantManager, TenantManagerOptions } from './tenant';
export {
  defineTenant, createTenantManager,
  TENANT_LIST_KEY, scopeEntityKey, scopeMetadataKey, unscopeEntityKey, scopePrefix,
  scopeStore,
} from './tenant';

export type { Strata, StrataConfig } from './strata';
export { createStrata } from './strata';
