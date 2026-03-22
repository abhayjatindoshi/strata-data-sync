// entity
export type { BaseEntity, ParsedEntityId } from './entity/index.js';
export { buildEntityId, parseEntityId, getEntityKey } from './entity/index.js';

// schema
export type { EntityDefinition } from './schema/index.js';
export { defineEntity } from './schema/index.js';

// key-strategy
export type { KeyStrategy } from './key-strategy/index.js';
export { singleton, global, partitioned, monthlyPartition } from './key-strategy/index.js';

// hlc
export type { Hlc } from './hlc/index.js';
export { createHlc, tickLocal, tickRemote, compareHlc } from './hlc/index.js';

// adapter
export type { BlobAdapter } from './adapter/index.js';
export { MemoryBlobAdapter } from './adapter/index.js';

// store
export type { EntityStore } from './store/index.js';
export { createEntityStore } from './store/index.js';

// repository
export type { Repository, SingletonRepository, QueryOptions } from './repository/index.js';

// reactive
export type { ChangeSignal } from './reactive/index.js';
export { createChangeSignal, observe, observeQuery } from './reactive/index.js';

// persistence
export type { PartitionIndex, Tombstone, PartitionBlob } from './persistence/index.js';
export { serialize, deserialize, fnvHash, computePartitionHash } from './persistence/index.js';

// sync
export type { SyncEngine, SyncEngineConfig, SyncEventType } from './sync/index.js';

// tenant
export type { Tenant, TenantManager } from './tenant/index.js';

// strata
export type { StrataConfig, Strata } from './strata/index.js';
export { createStrata } from './strata/index.js';
