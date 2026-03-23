import debug from 'debug';
import { Subject } from 'rxjs';
import { startWith, map, distinctUntilChanged } from 'rxjs/operators';
import type { Hlc } from '@strata/hlc';
import { tickLocal } from '@strata/hlc';
import type { EntityDefinition, BaseEntity } from '@strata/schema';
import { generateId, formatEntityId } from '@strata/schema';
import type { EntityEventBus, EntityEventListener } from '@strata/reactive';
import type { EntityStore } from '@strata/store';
import type { Repository, QueryOptions } from './types';
import { applyWhere, applyRange, applyOrderBy, applyPagination } from './query';

const log = debug('strata:repo');

function parseEntityKey(id: string): string {
  const lastDot = id.lastIndexOf('.');
  return id.substring(0, lastDot);
}

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

export function createRepository<T>(
  definition: EntityDefinition<T>,
  store: EntityStore,
  hlc: { current: Hlc },
  eventBus: EntityEventBus,
): Repository<T> {
  const changeSignal = new Subject<void>();

  const listener: EntityEventListener = (event) => {
    if (event.entityName === definition.name) {
      changeSignal.next();
    }
  };
  eventBus.on(listener);

  function get(id: string): (T & BaseEntity) | undefined {
    const entityKey = parseEntityKey(id);
    return store.get(entityKey, id) as (T & BaseEntity) | undefined;
  }

  function save(partial: T & Partial<BaseEntity>): string {
    let id: string;
    let entityKey: string;

    if (partial.id) {
      id = partial.id;
      entityKey = parseEntityKey(id);
    } else {
      const uniqueId = definition.deriveId
        ? definition.deriveId(partial)
        : generateId();
      const partitionKey = definition.keyStrategy.partitionFn(partial);
      id = formatEntityId(definition.name, partitionKey, uniqueId);
      entityKey = `${definition.name}.${partitionKey}`;
    }

    const existing = store.get(entityKey, id) as (T & BaseEntity) | undefined;

    hlc.current = tickLocal(hlc.current);
    const now = new Date();

    const entity = {
      ...partial,
      id,
      createdAt: existing?.createdAt ?? partial.createdAt ?? now,
      updatedAt: now,
      version: (existing?.version ?? 0) + 1,
      device: hlc.current.nodeId,
      hlc: hlc.current,
    };

    store.set(entityKey, id, entity);
    eventBus.emit({ entityName: definition.name });
    log('saved %s', id);

    return id;
  }

  function saveMany(
    entities: ReadonlyArray<T & Partial<BaseEntity>>,
  ): ReadonlyArray<string> {
    return entities.map(entity => save(entity));
  }

  function deleteEntity(id: string): boolean {
    const entityKey = parseEntityKey(id);
    const deleted = store.delete(entityKey, id);
    if (deleted) {
      eventBus.emit({ entityName: definition.name });
      log('deleted %s', id);
    }
    return deleted;
  }

  function deleteMany(ids: ReadonlyArray<string>): void {
    for (const id of ids) {
      deleteEntity(id);
    }
  }

  function query(opts?: QueryOptions<T>): ReadonlyArray<T & BaseEntity> {
    const partitionKeys = store.getAllPartitionKeys(definition.name);
    let entities: ReadonlyArray<T & BaseEntity> = [];

    const collected: (T & BaseEntity)[] = [];
    for (const key of partitionKeys) {
      const partition = store.getPartition(key);
      for (const entity of partition.values()) {
        collected.push(entity as T & BaseEntity);
      }
    }
    entities = collected;

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

  function observe(id: string) {
    return changeSignal.pipe(
      startWith(undefined as void),
      map(() => get(id)),
      distinctUntilChanged(entityComparator),
    );
  }

  function observeQuery(opts?: QueryOptions<T>) {
    return changeSignal.pipe(
      startWith(undefined as void),
      map(() => query(opts)),
      distinctUntilChanged((prev, next) => !resultsChanged(prev, next)),
    );
  }

  return { get, query, save, saveMany, delete: deleteEntity, deleteMany, observe, observeQuery };
}
