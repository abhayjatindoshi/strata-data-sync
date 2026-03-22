import type { EntityStore, StoreEntry, PartitionMap } from '@strata/store';
import type { EntityEventBus } from '@strata/reactive';
import { scopeEntityKey, scopePrefix, unscopeEntityKey } from './tenant-keys';
import { getEntityKey } from '@strata/entity';

export function scopeStore(store: EntityStore, tenantId: string, eventBus?: EntityEventBus): EntityStore {
  const prefix = scopePrefix(tenantId);

  function scope(entityKey: string): string {
    return scopeEntityKey(tenantId, entityKey);
  }

  return {
    createPartition(entityKey: string): void {
      store.createPartition(scope(entityKey));
    },

    getPartition(entityKey: string): PartitionMap | undefined {
      return store.getPartition(scope(entityKey));
    },

    listPartitions(entityName: string): readonly string[] {
      const scopedName = prefix + entityName;
      return store.listPartitions(scopedName).map((key) => {
        const unscoped = unscopeEntityKey(key);
        return unscoped ? unscoped.entityKey : key;
      });
    },

    deletePartition(entityKey: string): boolean {
      return store.deletePartition(scope(entityKey));
    },

    hasPartition(entityKey: string): boolean {
      return store.hasPartition(scope(entityKey));
    },

    get(entityKey: string, id: string): StoreEntry | undefined {
      return store.get(scope(entityKey), id);
    },

    getAll(entityKey: string): readonly StoreEntry[] {
      return store.getAll(scope(entityKey));
    },

    save(entityKey: string, entity: StoreEntry): void {
      const isNew = !store.get(scope(entityKey), entity.id);
      store.save(scope(entityKey), entity);
      if (eventBus) {
        const dotIndex = entityKey.indexOf('.');
        eventBus.emit({
          type: isNew ? 'created' : 'updated',
          entityName: entityKey.substring(0, dotIndex),
          partitionKey: entityKey.substring(dotIndex + 1),
          entityId: entity.id,
          entity: entity as Readonly<Record<string, unknown>>,
        });
      }
    },

    delete(entityKey: string, id: string): boolean {
      const deleted = store.delete(scope(entityKey), id);
      if (deleted && eventBus) {
        const dotIndex = entityKey.indexOf('.');
        eventBus.emit({
          type: 'deleted',
          entityName: entityKey.substring(0, dotIndex),
          partitionKey: entityKey.substring(dotIndex + 1),
          entityId: id,
          entity: undefined,
        });
      }
      return deleted;
    },

    getById(id: string): StoreEntry | undefined {
      const entityKey = getEntityKey(id);
      return store.get(scope(entityKey), id);
    },
  };
}
