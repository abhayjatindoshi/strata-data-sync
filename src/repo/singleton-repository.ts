import debug from 'debug';
import type { Hlc } from '@strata/hlc';
import type { EntityDefinition, BaseEntity } from '@strata/schema';
import { formatEntityId } from '@strata/schema';
import type { EntityEventBus } from '@strata/reactive';
import type { EntityStore } from '@strata/store';
import type { SingletonRepository } from './types';
import { createRepository } from './repository';

const log = debug('strata:repo');

export function createSingletonRepository<T>(
  definition: EntityDefinition<T>,
  store: EntityStore,
  hlc: { current: Hlc },
  eventBus: EntityEventBus,
): SingletonRepository<T> {
  const repo = createRepository(definition, store, hlc, eventBus);
  const deterministicId = formatEntityId(definition.name, '_', definition.name);

  return {
    get() {
      return repo.get(deterministicId);
    },
    save(entity: T & Partial<BaseEntity>) {
      repo.save({ ...entity, id: deterministicId } as T & Partial<BaseEntity>);
    },
    delete() {
      return repo.delete(deterministicId);
    },
    observe() {
      return repo.observe(deterministicId);
    },
  };
}
