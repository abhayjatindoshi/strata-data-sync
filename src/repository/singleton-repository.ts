import type { BaseEntity } from '@strata/entity';
import type { EntityStore } from '@strata/store';
import type { ChangeSignal } from '@strata/reactive';
import {
  observe as reactiveObserve,
  entityEquals,
} from '@strata/reactive';
import type { EntityDefinition } from '@strata/schema';
import type { SingletonRepository } from './types.js';

export function createSingletonRepository<T extends BaseEntity>(
  definition: EntityDefinition<T>,
  store: EntityStore,
  signal: ChangeSignal,
): SingletonRepository<T> {
  const entityKey = `${definition.name}._`;

  const get = (): T | undefined => {
    const all = store.getAll(entityKey);
    // Cast justified: entities in this partition are of type T
    return all[0] as T | undefined;
  };

  const save = (entity: T): void => {
    store.save(entityKey, entity);
    signal.notify();
  };

  const del = (): void => {
    const all = store.getAll(entityKey);
    for (const e of all) {
      store.delete(entityKey, e.id);
    }
    signal.notify();
  };

  const observe = () => {
    return reactiveObserve(signal, get, entityEquals);
  };

  return { get, save, delete: del, observe };
}
