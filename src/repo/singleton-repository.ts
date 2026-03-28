import debug from 'debug';
import type { Hlc } from '@strata/hlc';
import type { EntityDefinition, BaseEntity } from '@strata/schema';
import { formatEntityId } from '@strata/schema';
import type { EntityEventBus } from '@strata/reactive';
import type { EntityStore } from '@strata/store';
import type { SingletonRepository as SingletonRepositoryType } from './types';
import { Repository } from './repository';

const log = debug('strata:repo');

export class SingletonRepository<T> {
  private readonly repo: Repository<T>;
  private readonly deterministicId: string;

  constructor(
    definition: EntityDefinition<T>,
    store: EntityStore,
    hlc: { current: Hlc },
    eventBus: EntityEventBus,
  ) {
    this.repo = new Repository(definition, store, hlc, eventBus);
    this.deterministicId = formatEntityId(definition.name, '_', definition.name);
  }

  get(): (T & BaseEntity) | undefined {
    return this.repo.get(this.deterministicId);
  }

  save(entity: T & Partial<BaseEntity>): void {
    this.repo.save({ ...entity, id: this.deterministicId } as T & Partial<BaseEntity>);
  }

  delete(): boolean {
    return this.repo.delete(this.deterministicId);
  }

  observe() {
    return this.repo.observe(this.deterministicId);
  }

  dispose(): void {
    this.repo.dispose();
  }
}
