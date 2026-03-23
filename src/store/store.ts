import type { EntityStore } from './types';

export function createStore(): EntityStore {
  const partitions = new Map<string, Map<string, unknown>>();
  const dirtyKeys = new Set<string>();

  return {
    get(entityKey, id) {
      return partitions.get(entityKey)?.get(id);
    },

    set(entityKey, id, entity) {
      let partition = partitions.get(entityKey);
      if (!partition) {
        partition = new Map();
        partitions.set(entityKey, partition);
      }
      partition.set(id, entity);
      dirtyKeys.add(entityKey);
    },

    delete(entityKey, id) {
      const partition = partitions.get(entityKey);
      if (!partition) return false;
      const deleted = partition.delete(id);
      if (deleted) {
        dirtyKeys.add(entityKey);
      }
      return deleted;
    },

    getPartition(entityKey) {
      return partitions.get(entityKey) ?? new Map<string, unknown>();
    },

    getAllPartitionKeys(entityName) {
      const prefix = `${entityName}.`;
      const keys: string[] = [];
      for (const key of partitions.keys()) {
        if (key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    },

    getDirtyKeys() {
      return dirtyKeys;
    },

    clearDirty(entityKey) {
      dirtyKeys.delete(entityKey);
    },

    async loadPartition(entityKey, loader) {
      if (!partitions.has(entityKey)) {
        const data = await loader();
        partitions.set(entityKey, data);
      }
      return partitions.get(entityKey)!;
    },
  };
}
