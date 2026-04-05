import debug from 'debug';
import { startWith, map, distinctUntilChanged } from 'rxjs/operators';
import type { Hlc } from '@strata/hlc';
import { tick } from '@strata/hlc';
import type { EntityDefinition, BaseEntity } from '@strata/schema';
import { formatEntityId } from '@strata/schema';
import { generateId, parseEntityKey } from '@strata/utils';
import type { EventBus } from '@strata/reactive';
import type { EntityEvent } from '@strata/reactive';
import { filter } from 'rxjs/operators';
import type { EntityStore } from '@strata/store';
import type { Repository as RepositoryType, QueryOptions } from './types';
import { applyWhere, applyRange, applyOrderBy, applyPagination } from './query';
import { assertNotDisposed } from '@strata/utils';

const log = debug('strata:repo');

function entityComparator<T extends BaseEntity>(
  a: (T & BaseEntity) | undefined,
  b: (T & BaseEntity) | undefined,
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a.id === b.id && a.version === b.version;
}

function resultsChanged<T extends BaseEntity>(
  prev: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].version !== next[i].version) return true;
  }
  return false;
}

export class Repository<T> {
  private disposed = false;

  constructor(
    private readonly definition: EntityDefinition<T>,
    private readonly store: EntityStore,
    private readonly hlc: { current: Hlc },
    private readonly eventBus: EventBus<EntityEvent>,
  ) {}

  get(id: string): (T & BaseEntity) | undefined {
    const entityKey = parseEntityKey(id);
    return this.store.getEntity(entityKey, id) as (T & BaseEntity) | undefined;
  }

  private saveToStore(partial: T & Partial<BaseEntity>): string {
    let id: string;
    let entityKey: string;

    if (partial.id) {
      id = partial.id;
      entityKey = parseEntityKey(id);
    } else {
      const uniqueId = this.definition.deriveId
        ? this.definition.deriveId(partial)
        : generateId();
      const partitionKey = this.definition.keyStrategy.partitionFn(partial);
      id = formatEntityId(this.definition.name, partitionKey, uniqueId);
      entityKey = `${this.definition.name}.${partitionKey}`;
    }

    const existing = this.store.getEntity(entityKey, id) as (T & BaseEntity) | undefined;

    this.hlc.current = tick(this.hlc.current);
    const now = new Date();

    const entity = {
      ...partial,
      id,
      createdAt: existing?.createdAt ?? partial.createdAt ?? now,
      updatedAt: now,
      version: (existing?.version ?? 0) + 1,
      device: this.hlc.current.nodeId,
      hlc: this.hlc.current,
    };

    this.store.setEntity(entityKey, id, entity);
    log('saved %s', id);

    return id;
  }

  save(partial: T & Partial<BaseEntity>): string {
    assertNotDisposed(this.disposed, 'Repository');
    const id = this.saveToStore(partial);
    this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [id], deletes: [] });
    return id;
  }

  saveMany(
    entities: ReadonlyArray<T & Partial<BaseEntity>>,
  ): ReadonlyArray<string> {
    assertNotDisposed(this.disposed, 'Repository');
    const ids = entities.map(entity => this.saveToStore(entity));
    if (ids.length > 0) {
      this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [...ids], deletes: [] });
    }
    return ids;
  }

  private deleteFromStore(id: string): boolean {
    const entityKey = parseEntityKey(id);
    const entity = this.store.getEntity(entityKey, id) as (T & BaseEntity) | undefined;
    if (entity) {
      this.store.setTombstone(entityKey, id, entity.hlc);
    }
    const deleted = this.store.deleteEntity(entityKey, id);
    if (deleted) {
      log('deleted %s', id);
    }
    return deleted;
  }

  delete(id: string): boolean {
    assertNotDisposed(this.disposed, 'Repository');
    const deleted = this.deleteFromStore(id);
    if (deleted) {
      this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [], deletes: [id] });
    }
    return deleted;
  }

  deleteMany(ids: ReadonlyArray<string>): void {
    assertNotDisposed(this.disposed, 'Repository');
    const deletedIds: string[] = [];
    for (const id of ids) {
      if (this.deleteFromStore(id)) {
        deletedIds.push(id);
      }
    }
    if (deletedIds.length > 0) {
      this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [], deletes: deletedIds });
    }
  }

  query(opts?: QueryOptions<T>): ReadonlyArray<T & BaseEntity> {
    const partitionKeys = this.store.getAllPartitionKeys(this.definition.name);

    const collected: (T & BaseEntity)[] = [];
    for (const key of partitionKeys) {
      const partition = this.store.getPartition(key);
      for (const entity of partition.values()) {
        collected.push(entity as T & BaseEntity);
      }
    }
    let entities: ReadonlyArray<T & BaseEntity> = collected;

    if (!opts) return entities;

    if (opts.where) {
      entities = applyWhere(entities, opts.where as Partial<T & BaseEntity>);
    }
    if (opts.range) {
      entities = applyRange(entities, opts.range as {
        readonly field: keyof (T & BaseEntity);
        readonly gt?: unknown;
        readonly gte?: unknown;
        readonly lt?: unknown;
        readonly lte?: unknown;
      });
    }
    if (opts.orderBy) {
      entities = applyOrderBy(entities, opts.orderBy as ReadonlyArray<{
        readonly field: keyof (T & BaseEntity);
        readonly direction: 'asc' | 'desc';
      }>);
    }
    entities = applyPagination(entities, opts.offset, opts.limit);

    return entities;
  }

  observe(id: string) {
    assertNotDisposed(this.disposed, 'Repository');
    return this.eventBus.all$.pipe(
      filter((e: EntityEvent) => e.entityName === this.definition.name),
      startWith(undefined as void),
      map(() => this.get(id)),
      distinctUntilChanged(entityComparator),
    );
  }

  observeQuery(opts?: QueryOptions<T>) {
    assertNotDisposed(this.disposed, 'Repository');
    return this.eventBus.all$.pipe(
      filter((e: EntityEvent) => e.entityName === this.definition.name),
      startWith(undefined as void),
      map(() => this.query(opts)),
      distinctUntilChanged((prev, next) => !resultsChanged(prev, next)),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    log('disposed %s repository', this.definition.name);
  }
}
