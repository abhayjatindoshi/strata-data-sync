import type { BaseEntity } from '@strata/entity';
import type { EntityStore, PartitionLoader } from './types.js';

function extractEntityName(entityKey: string): string {
  const dotIndex = entityKey.indexOf('.');
  return dotIndex >= 0 ? entityKey.substring(0, dotIndex) : entityKey;
}

export function createEntityStore(loader?: PartitionLoader): EntityStore {
  const partitions = new Map<string, Map<string, BaseEntity>>();
  const loadedKeys = new Set<string>();
  const loadingKeys = new Set<string>();

  function getOrCreate(entityKey: string): Map<string, BaseEntity> {
    let partition = partitions.get(entityKey);
    if (!partition) {
      partition = new Map();
      partitions.set(entityKey, partition);
    }
    return partition;
  }

  function triggerLoad(entityKey: string): void {
    if (!loader) return;
    if (loadedKeys.has(entityKey) || loadingKeys.has(entityKey)) return;
    loadingKeys.add(entityKey);
    void loader(entityKey).then(
      entities => {
        const partition = getOrCreate(entityKey);
        for (const entity of entities) {
          partition.set(entity.id, entity);
        }
        loadedKeys.add(entityKey);
        loadingKeys.delete(entityKey);
      },
      () => {
        loadingKeys.delete(entityKey);
      },
    );
  }

  function save(entityKey: string, entity: BaseEntity): void {
    getOrCreate(entityKey).set(entity.id, entity);
    loadedKeys.add(entityKey);
  }

  function saveMany(
    entityKey: string,
    entities: ReadonlyArray<BaseEntity>,
  ): void {
    const partition = getOrCreate(entityKey);
    for (const entity of entities) {
      partition.set(entity.id, entity);
    }
    loadedKeys.add(entityKey);
  }

  function del(entityKey: string, id: string): void {
    partitions.get(entityKey)?.delete(id);
  }

  function deleteMany(
    entityKey: string,
    ids: ReadonlyArray<string>,
  ): void {
    const partition = partitions.get(entityKey);
    if (!partition) return;
    for (const id of ids) {
      partition.delete(id);
    }
  }

  function get(entityKey: string, id: string): BaseEntity | undefined {
    triggerLoad(entityKey);
    return partitions.get(entityKey)?.get(id);
  }

  function getAll(entityKey: string): ReadonlyArray<BaseEntity> {
    triggerLoad(entityKey);
    const partition = partitions.get(entityKey);
    return partition ? [...partition.values()] : [];
  }

  function listPartitions(entityName: string): ReadonlyArray<string> {
    const keys: string[] = [];
    for (const key of partitions.keys()) {
      if (extractEntityName(key) === entityName) {
        keys.push(key);
      }
    }
    return keys;
  }

  function hasPartition(entityKey: string): boolean {
    return partitions.has(entityKey);
  }

  return {
    save,
    saveMany,
    delete: del,
    deleteMany,
    get,
    getAll,
    listPartitions,
    hasPartition,
  };
}
