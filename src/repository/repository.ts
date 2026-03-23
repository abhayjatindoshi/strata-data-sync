import type { BaseEntity } from '@strata/entity';
import { getEntityKey } from '@strata/entity';
import type { EntityStore } from '@strata/store';
import type { ChangeSignal } from '@strata/reactive';
import {
  observe as reactiveObserve,
  observeQuery as reactiveObserveQuery,
  entityEquals,
  entityArrayEquals,
} from '@strata/reactive';
import type { EntityDefinition } from '@strata/schema';
import type { Repository, QueryOptions } from './types.js';
import { executeQuery } from './query-engine.js';

function getAllEntities<T extends BaseEntity>(
  store: EntityStore,
  entityName: string,
): ReadonlyArray<T> {
  const keys = store.listPartitions(entityName);
  const all: T[] = [];
  for (const key of keys) {
    // Cast justified: entities stored under this name are of type T
    const entities = store.getAll(key) as unknown as ReadonlyArray<T>;
    all.push(...entities);
  }
  return all;
}

export function createRepository<T extends BaseEntity>(
  definition: EntityDefinition<T>,
  store: EntityStore,
  signal: ChangeSignal,
): Repository<T> {
  const { name, keyStrategy } = definition;

  const get = (id: string): T | undefined => {
    // Cast justified: store returns BaseEntity, we know it's T
    return store.get(getEntityKey(id), id) as T | undefined;
  };

  const query = (opts?: QueryOptions<T>): ReadonlyArray<T> => {
    return executeQuery(getAllEntities<T>(store, name), opts);
  };

  const save = (entity: T): void => {
    store.save(`${name}.${keyStrategy.getPartitionKey(entity)}`, entity);
    signal.notify();
  };

  const saveMany = (entities: ReadonlyArray<T>): void => {
    for (const entity of entities) {
      store.save(`${name}.${keyStrategy.getPartitionKey(entity)}`, entity);
    }
    signal.notify();
  };

  const del = (id: string): void => {
    store.delete(getEntityKey(id), id);
    signal.notify();
  };

  const deleteMany = (ids: ReadonlyArray<string>): void => {
    for (const id of ids) {
      store.delete(getEntityKey(id), id);
    }
    signal.notify();
  };

  const observe = (id: string) => {
    return reactiveObserve(signal, () => get(id), entityEquals);
  };

  const observeQueryFn = (opts?: QueryOptions<T>) => {
    return reactiveObserveQuery(signal, () => query(opts), entityArrayEquals);
  };

  return {
    get,
    query,
    save,
    saveMany,
    delete: del,
    deleteMany,
    observe,
    observeQuery: observeQueryFn,
  };
}
