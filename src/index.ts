export { createHlc, tickLocal, tickRemote, compareHlc } from '@strata/hlc';
export type { Hlc } from '@strata/hlc';

export { TENANTS_KEY, STRATA_MARKER_KEY, indexKey, partitionBlobKey, createMemoryBlobAdapter, applyTransforms, reverseTransforms } from '@strata/adapter';
export type { BlobAdapter, CloudMeta, BlobTransform } from '@strata/adapter';

export { generateId, formatEntityId, partitioned, defineEntity } from '@strata/schema';
export type { BaseEntity, KeyStrategy, EntityDefinition, EntityDefinitionOptions } from '@strata/schema';

export { createEventBus } from '@strata/reactive';
export type { EntityEvent, EntityEventListener, EntityEventBus } from '@strata/reactive';

export { serialize, deserialize, FNV_OFFSET, FNV_PRIME, fnv1a, fnv1aAppend, partitionHash, loadPartitionIndex, savePartitionIndex, updatePartitionIndexEntry } from '@strata/persistence';
export type { PartitionIndexEntry, PartitionIndex } from '@strata/persistence';

export { createStore, flushPartition, flushAll, createFlushScheduler } from '@strata/store';
export type { EntityStore, FlushScheduler, FlushSchedulerOptions } from '@strata/store';

export { createRepository, createSingletonRepository, applyWhere, applyRange, applyOrderBy, applyPagination } from '@strata/repo';
export type { Repository, QueryOptions, SingletonRepository } from '@strata/repo';

export { loadTenantList, saveTenantList, createTenantManager, mergeTenantLists, pushTenantList, pullTenantList, saveTenantPrefs, loadTenantPrefs, writeMarkerBlob, readMarkerBlob, validateMarkerBlob } from '@strata/tenant';
export type { Tenant, CreateTenantOptions, SetupTenantOptions, TenantManagerOptions, Subscribable, TenantManager, TenantPrefs, MarkerBlob } from '@strata/tenant';

export { loadIndexPair, diffPartitions, copyPartitionToCloud, copyPartitionToLocal, syncCopyPhase, resolveConflict, resolveEntityTombstone, diffEntityMaps, mergePartition, syncMergePhase, updateIndexesAfterSync, applyMergedToStore } from '@strata/sync';
export type { PartitionDiffResult, EntityDiffResult, MergeResult, MergedPartitionResult, SyncEntity } from '@strata/sync';
