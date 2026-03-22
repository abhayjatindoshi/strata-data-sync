import type { EntityStore, StoreEntry, StoreOptions } from './store-types';
import { getEntityKey } from '@strata/entity';

function getEntityNameFromKey(entityKey: string): string {
  const dotIndex = entityKey.indexOf('.');
  if (dotIndex === -1) {
    throw new Error(`Invalid entity key format: ${entityKey}`);
  }
  return entityKey.substring(0, dotIndex);
}

export function createEntityStore(options?: StoreOptions): EntityStore {
  const partitions = new Map<string, Map<string, StoreEntry>>();
  const entityIndex = new Map<string, Set<string>>();

  function trackPartition(entityKey: string): void {
    const entityName = getEntityNameFromKey(entityKey);
    let keys = entityIndex.get(entityName);
    if (!keys) {
      keys = new Set();
      entityIndex.set(entityName, keys);
    }
    keys.add(entityKey);
  }

  function untrackPartition(entityKey: string): void {
    const entityName = getEntityNameFromKey(entityKey);
    const keys = entityIndex.get(entityName);
    if (keys) {
      keys.delete(entityKey);
      if (keys.size === 0) {
        entityIndex.delete(entityName);
      }
    }
  }

  return {
    createPartition(entityKey: string): void {
      if (!partitions.has(entityKey)) {
        partitions.set(entityKey, new Map());
        trackPartition(entityKey);
        options?.onPartitionCreated?.(entityKey);
      }
    },

    getPartition(entityKey: string) {
      return partitions.get(entityKey);
    },

    listPartitions(entityName: string): readonly string[] {
      const keys = entityIndex.get(entityName);
      return keys ? [...keys] : [];
    },

    deletePartition(entityKey: string): boolean {
      const existed = partitions.delete(entityKey);
      if (existed) {
        untrackPartition(entityKey);
      }
      return existed;
    },

    hasPartition(entityKey: string): boolean {
      return partitions.has(entityKey);
    },

    get(entityKey: string, id: string): StoreEntry | undefined {
      return partitions.get(entityKey)?.get(id);
    },

    getAll(entityKey: string): readonly StoreEntry[] {
      const partition = partitions.get(entityKey);
      return partition ? [...partition.values()] : [];
    },

    save(entityKey: string, entity: StoreEntry): void {
      let partition = partitions.get(entityKey);
      if (!partition) {
        partition = new Map();
        partitions.set(entityKey, partition);
        trackPartition(entityKey);
        options?.onPartitionCreated?.(entityKey);
      }
      const isNew = !partition.has(entity.id);
      partition.set(entity.id, entity);
      options?.onEntitySaved?.(entityKey, entity, isNew);
    },

    delete(entityKey: string, id: string): boolean {
      const partition = partitions.get(entityKey);
      if (!partition) return false;
      const deleted = partition.delete(id);
      if (deleted) {
        options?.onEntityDeleted?.(entityKey, id);
      }
      return deleted;
    },

    getById(id: string): StoreEntry | undefined {
      const entityKey = getEntityKey(id);
      return partitions.get(entityKey)?.get(id);
    },
  };
}
