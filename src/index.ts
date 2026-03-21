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
