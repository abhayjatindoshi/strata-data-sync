import type { EntityDef } from '../schema/index.js';
import type { EntityStore, StoreEntry } from '../store/index.js';
import type { KeyStrategy } from '../key-strategy/index.js';
import type { BlobAdapter } from '../persistence/index.js';
import type { EntityEventBus } from '../reactive/index.js';
import type { BaseEntity } from '../entity/index.js';
import type { GetAllOptions, Repository } from './repository-types.js';
import { composeEntityId, getEntityKey, buildEntityKey } from '../entity/index.js';
import { loadPartition } from '../persistence/index.js';
import { observeEntity } from '../reactive/observe-entity.js';
import { observeCollection } from '../reactive/observe-collection.js';

export type RepositoryOptions<TName extends string, TFields> = {
  readonly entityDef: EntityDef<TName, TFields>;
  readonly store: EntityStore;
  readonly eventBus: EntityEventBus;
  readonly keyStrategy: KeyStrategy;
  readonly deviceId: string;
  readonly localAdapter?: BlobAdapter;
  readonly cloudAdapter?: BlobAdapter;
};

type FullEntity<T> = BaseEntity & T;

export function createRepository<TName extends string, TFields>(
  options: RepositoryOptions<TName, TFields>,
): Repository<TFields> {
  const { entityDef, store, eventBus, keyStrategy, deviceId } = options;
  const loadedPartitions = new Set<string>();

  async function ensurePartitionLoaded(entityKey: string): Promise<void> {
    if (loadedPartitions.has(entityKey) || store.hasPartition(entityKey)) {
      loadedPartitions.add(entityKey);
      return;
    }

    const parts = entityKey.split('.');
    const partitionKey = parts.slice(1).join('.');

    // Try local adapter first, then cloud
    for (const adapter of [options.localAdapter, options.cloudAdapter]) {
      if (!adapter) continue;
      const entities = await loadPartition(adapter, entityDef, partitionKey);
      if (entities.length > 0) {
        for (const entity of entities) {
          store.save(entityKey, entity as StoreEntry);
        }
        loadedPartitions.add(entityKey);
        return;
      }
    }

    loadedPartitions.add(entityKey);
  }

  function getAllFromStore(opts?: GetAllOptions): ReadonlyArray<Readonly<FullEntity<TFields>>> {
    const partitionKeys = store.listPartitions(entityDef.name);
    const results: Readonly<FullEntity<TFields>>[] = [];

    for (const key of partitionKeys) {
      if (opts?.partitionKey) {
        const pk = key.substring(key.indexOf('.') + 1);
        if (pk !== opts.partitionKey) continue;
      }
      const entries = store.getAll(key);
      for (const entry of entries) {
        results.push(entry as unknown as Readonly<FullEntity<TFields>>);
      }
    }

    return results;
  }

  return {
    async get(id: string): Promise<Readonly<FullEntity<TFields>> | undefined> {
      const entityKey = getEntityKey(id);
      await ensurePartitionLoaded(entityKey);
      const entry = store.get(entityKey, id);
      return entry as unknown as Readonly<FullEntity<TFields>> | undefined;
    },

    async getAll(opts?: GetAllOptions): Promise<ReadonlyArray<Readonly<FullEntity<TFields>>>> {
      if (opts?.partitionKey) {
        const entityKey = buildEntityKey(entityDef.name, opts.partitionKey);
        await ensurePartitionLoaded(entityKey);
      } else {
        const partitionKeys = store.listPartitions(entityDef.name);
        for (const key of partitionKeys) {
          await ensurePartitionLoaded(key);
        }
      }
      return getAllFromStore(opts);
    },

    async save(entity: TFields & Partial<BaseEntity>): Promise<string> {
      const now = new Date();
      const entityRecord = entity as Record<string, unknown>;

      const id = entityRecord.id as string | undefined
        ?? composeEntityId(keyStrategy, entityDef.name, entityRecord);

      const entityKey = getEntityKey(id);
      const existing = store.get(entityKey, id);

      const full: StoreEntry = {
        ...entityRecord,
        id,
        createdAt: existing?.createdAt ?? (entityRecord.createdAt as Date | undefined) ?? now,
        updatedAt: now,
        version: (existing?.version ?? 0) + 1,
        device: deviceId,
      } as StoreEntry;

      store.save(entityKey, full);
      return id;
    },

    async delete(id: string): Promise<boolean> {
      const entityKey = getEntityKey(id);
      return store.delete(entityKey, id);
    },

    observe(id: string) {
      const entityKey = getEntityKey(id);
      const { observable } = observeEntity<FullEntity<TFields>>(
        eventBus,
        id,
        () => store.get(entityKey, id) as unknown as Readonly<FullEntity<TFields>> | undefined,
      );
      return observable;
    },

    observeAll(opts?: GetAllOptions) {
      const { observable } = observeCollection<FullEntity<TFields>>(
        eventBus,
        entityDef.name,
        () => getAllFromStore(opts),
        opts?.partitionKey,
      );
      return observable;
    },
  };
}
