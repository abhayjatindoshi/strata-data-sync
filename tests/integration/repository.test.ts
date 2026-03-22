import { describe, it, expect } from 'vitest';
import { createEntityStore } from '@strata/store';
import { createEntityEventBus } from '@strata/reactive';
import type { EntityEvent } from '@strata/reactive';
import { defineEntity } from '@strata/schema';
import { dateKeyStrategy } from '@strata/key-strategy';
import { createRepository } from '@strata/repository/repository';
import { createMemoryBlobAdapter, storePartition } from '@strata/persistence';

// ── Repository CRUD ─────────────────────────────────────────────────
type TodoFields = { title: string; done: boolean };
const Todo = defineEntity<TodoFields>('Todo');

function setupCrud() {
  const bus = createEntityEventBus();
  const events: EntityEvent[] = [];
  bus.on((e) => events.push(e));

  const store = createEntityStore({
    onEntitySaved(entityKey, entity, isNew) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: isNew ? 'created' : 'updated',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: entity.id,
        entity: entity as Readonly<Record<string, unknown>>,
      });
    },
    onEntityDeleted(entityKey, id) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: 'deleted',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: id,
        entity: undefined,
      });
    },
  });

  const repo = createRepository({
    entityDef: Todo,
    store,
    eventBus: bus,
    keyStrategy: dateKeyStrategy({ period: 'year' }),
    deviceId: 'test-device',
  });

  return { repo, store, bus, events };
}

describe('Repository CRUD', () => {
  describe('save + get', () => {
    it('saves a new entity and retrieves it by id', async () => {
      const { repo } = setupCrud();
      const id = await repo.save({ title: 'Buy groceries', done: false });

      expect(id).toContain('Todo.');

      const entity = await repo.get(id);
      expect(entity).toBeDefined();
      expect(entity!.title).toBe('Buy groceries');
      expect(entity!.done).toBe(false);
      expect(entity!.id).toBe(id);
    });

    it('assigns base entity fields automatically', async () => {
      const { repo } = setupCrud();
      const id = await repo.save({ title: 'Test', done: false });
      const entity = await repo.get(id);

      expect(entity!.version).toBe(1);
      expect(entity!.device).toBe('test-device');
      expect(entity!.createdAt).toBeInstanceOf(Date);
      expect(entity!.updatedAt).toBeInstanceOf(Date);
    });

    it('increments version on re-save', async () => {
      const { repo } = setupCrud();
      const id = await repo.save({ title: 'V1', done: false });
      await repo.save({ id, title: 'V2', done: true } as never);

      const entity = await repo.get(id);
      expect(entity!.version).toBe(2);
      expect(entity!.title).toBe('V2');
    });
  });

  describe('getAll', () => {
    it('returns all saved entities', async () => {
      const { repo } = setupCrud();
      await repo.save({ title: 'A', done: false });
      await repo.save({ title: 'B', done: true });

      const all = await repo.getAll();
      expect(all).toHaveLength(2);
    });

    it('returns empty array when nothing saved', async () => {
      const { repo } = setupCrud();
      const all = await repo.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete', () => {
    it('removes an entity and get returns undefined', async () => {
      const { repo } = setupCrud();
      const id = await repo.save({ title: 'Remove me', done: false });
      const deleted = await repo.delete(id);

      expect(deleted).toBe(true);
      expect(await repo.get(id)).toBeUndefined();
    });

    it('returns false when deleting a non-existent entity', async () => {
      const { repo } = setupCrud();
      const deleted = await repo.delete('Todo.2026.nonexistent');
      expect(deleted).toBe(false);
    });

    it('getAll reflects delete', async () => {
      const { repo } = setupCrud();
      const id = await repo.save({ title: 'Gone', done: false });
      await repo.save({ title: 'Stays', done: false });

      await repo.delete(id);
      const all = await repo.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.title).toBe('Stays');
    });
  });

  describe('events from CRUD', () => {
    it('save emits created event for new entity', async () => {
      const { repo, events } = setupCrud();
      await repo.save({ title: 'New', done: false });

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('created');
      expect(events[0]!.entityName).toBe('Todo');
    });

    it('save emits updated event for existing entity', async () => {
      const { repo, events } = setupCrud();
      const id = await repo.save({ title: 'First', done: false });
      await repo.save({ id, title: 'Second', done: true } as never);

      expect(events[1]!.type).toBe('updated');
    });

    it('delete emits deleted event', async () => {
      const { repo, events } = setupCrud();
      const id = await repo.save({ title: 'Del', done: false });
      events.length = 0;

      await repo.delete(id);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('deleted');
      expect(events[0]!.entityId).toBe(id);
    });
  });
});

// ── Repository observe / observeAll ─────────────────────────────────
type NoteFields = { text: string };
const Note = defineEntity<NoteFields>('Note');

function setupObserve() {
  const bus = createEntityEventBus();
  const events: EntityEvent[] = [];
  bus.on((e) => events.push(e));

  const store = createEntityStore({
    onEntitySaved(entityKey, entity, isNew) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: isNew ? 'created' : 'updated',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: entity.id,
        entity: entity as Readonly<Record<string, unknown>>,
      });
    },
    onEntityDeleted(entityKey, id) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: 'deleted',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: id,
        entity: undefined,
      });
    },
  });

  const repo = createRepository({
    entityDef: Note,
    store,
    eventBus: bus,
    keyStrategy: dateKeyStrategy({ period: 'year' }),
    deviceId: 'dev-obs',
  });

  return { repo, store, bus, events };
}

describe('Repository observe / observeAll', () => {
  describe('observe (single entity)', () => {
    it('returns BehaviorSubject with current value after save', async () => {
      const { repo } = setupObserve();
      const id = await repo.save({ text: 'Initial' });

      const obs = repo.observe(id);
      expect(obs.getValue()).toBeDefined();
      expect(obs.getValue()!.text).toBe('Initial');
    });

    it('observable updates when entity is saved again', async () => {
      const { repo } = setupObserve();
      const id = await repo.save({ text: 'Before' });
      const obs = repo.observe(id);

      await repo.save({ id, text: 'After' } as never);
      expect(obs.getValue()!.text).toBe('After');
    });

    it('observable becomes undefined when entity is deleted', async () => {
      const { repo } = setupObserve();
      const id = await repo.save({ text: 'Ephemeral' });
      const obs = repo.observe(id);

      await repo.delete(id);
      expect(obs.getValue()).toBeUndefined();
    });

    it('observable for non-existent entity starts undefined', () => {
      const { repo } = setupObserve();
      const obs = repo.observe('Note.2026.nope');
      expect(obs.getValue()).toBeUndefined();
    });
  });

  describe('observeAll (collection)', () => {
    it('returns BehaviorSubject with current collection', async () => {
      const { repo } = setupObserve();
      await repo.save({ text: 'One' });

      const obs = repo.observeAll();
      expect(obs.getValue()).toHaveLength(1);
    });

    it('collection grows when new entities are saved', async () => {
      const { repo } = setupObserve();
      const obs = repo.observeAll();
      expect(obs.getValue()).toHaveLength(0);

      await repo.save({ text: 'A' });
      expect(obs.getValue()).toHaveLength(1);

      await repo.save({ text: 'B' });
      expect(obs.getValue()).toHaveLength(2);
    });

    it('collection shrinks when entity is deleted', async () => {
      const { repo } = setupObserve();
      const id = await repo.save({ text: 'Remove' });
      await repo.save({ text: 'Keep' });

      const obs = repo.observeAll();
      expect(obs.getValue()).toHaveLength(2);

      await repo.delete(id);
      expect(obs.getValue()).toHaveLength(1);
    });

    it('collection reflects updates without changing length', async () => {
      const { repo } = setupObserve();
      const id = await repo.save({ text: 'V1' });
      const obs = repo.observeAll();

      await repo.save({ id, text: 'V2' } as never);
      const items = obs.getValue();
      expect(items).toHaveLength(1);
      expect((items[0] as Record<string, unknown>).text).toBe('V2');
    });
  });
});

// ── Lazy Loading (store → local → cloud) ────────────────────────────
type ItemFields = { name: string; qty: number };
const Item = defineEntity<ItemFields>('Item');

function wireStoreToEventBus() {
  const bus = createEntityEventBus();
  const events: EntityEvent[] = [];
  bus.on((e) => events.push(e));

  const store = createEntityStore({
    onEntitySaved(entityKey, entity, isNew) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: isNew ? 'created' : 'updated',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: entity.id,
        entity: entity as Readonly<Record<string, unknown>>,
      });
    },
    onEntityDeleted(entityKey, id) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: 'deleted',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: id,
        entity: undefined,
      });
    },
  });

  return { bus, store, events };
}

describe('Lazy Loading (store → local → cloud)', () => {
  it('returns entity from in-memory store without touching adapters', async () => {
    const { bus, store } = wireStoreToEventBus();
    const localAdapter = createMemoryBlobAdapter();

    const repo = createRepository({
      entityDef: Item,
      store,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'dev',
      localAdapter,
    });

    store.save('Item.2026', {
      id: 'Item.2026.mem1',
      name: 'InMemory',
      qty: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      device: 'dev',
    });

    const entity = await repo.get('Item.2026.mem1');
    expect(entity).toBeDefined();
    expect(entity!.name).toBe('InMemory');
  });

  it('loads from local adapter on store miss', async () => {
    const { bus, store } = wireStoreToEventBus();
    const localAdapter = createMemoryBlobAdapter();

    await storePartition(localAdapter, Item, '2025', [
      {
        id: 'Item.2025.local1',
        name: 'FromLocal',
        qty: 10,
        createdAt: '2025-06-01T00:00:00.000Z',
        updatedAt: '2025-06-01T00:00:00.000Z',
        version: 1,
        device: 'other',
      },
    ]);

    const repo = createRepository({
      entityDef: Item,
      store,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'dev',
      localAdapter,
    });

    const entity = await repo.get('Item.2025.local1');
    expect(entity).toBeDefined();
    expect(entity!.name).toBe('FromLocal');
    expect(entity!.qty).toBe(10);
  });

  it('falls back to cloud adapter when local has no data', async () => {
    const { bus, store } = wireStoreToEventBus();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();

    await storePartition(cloudAdapter, Item, '2024', [
      {
        id: 'Item.2024.cloud1',
        name: 'FromCloud',
        qty: 42,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        version: 1,
        device: 'remote',
      },
    ]);

    const repo = createRepository({
      entityDef: Item,
      store,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'dev',
      localAdapter,
      cloudAdapter,
    });

    const entity = await repo.get('Item.2024.cloud1');
    expect(entity).toBeDefined();
    expect(entity!.name).toBe('FromCloud');
    expect(entity!.qty).toBe(42);
  });

  it('returns undefined when entity not in any tier', async () => {
    const { bus, store } = wireStoreToEventBus();
    const localAdapter = createMemoryBlobAdapter();
    const cloudAdapter = createMemoryBlobAdapter();

    const repo = createRepository({
      entityDef: Item,
      store,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'dev',
      localAdapter,
      cloudAdapter,
    });

    const entity = await repo.get('Item.2026.ghost');
    expect(entity).toBeUndefined();
  });

  it('caches loaded partition — second get does not reload', async () => {
    const { bus, store } = wireStoreToEventBus();
    const localAdapter = createMemoryBlobAdapter();

    await storePartition(localAdapter, Item, '2025', [
      {
        id: 'Item.2025.cache1',
        name: 'Cached',
        qty: 7,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        version: 1,
        device: 'other',
      },
    ]);

    const repo = createRepository({
      entityDef: Item,
      store,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'dev',
      localAdapter,
    });

    const first = await repo.get('Item.2025.cache1');
    expect(first).toBeDefined();

    await localAdapter.delete('Item.2025');

    const second = await repo.get('Item.2025.cache1');
    expect(second).toBeDefined();
    expect(second!.name).toBe('Cached');
  });

  it('getAll with partitionKey triggers lazy load for that partition', async () => {
    const { bus, store } = wireStoreToEventBus();
    const localAdapter = createMemoryBlobAdapter();

    await storePartition(localAdapter, Item, '2023', [
      {
        id: 'Item.2023.la1',
        name: 'LazyAll',
        qty: 3,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        version: 1,
        device: 'other',
      },
    ]);

    const repo = createRepository({
      entityDef: Item,
      store,
      eventBus: bus,
      keyStrategy: dateKeyStrategy({ period: 'year' }),
      deviceId: 'dev',
      localAdapter,
    });

    const all = await repo.getAll({ partitionKey: '2023' });
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('LazyAll');
  });
});

// ── Repository with Queries ─────────────────────────────────────────
type TaskFields = { title: string; status: string; priority: number };
const Task = defineEntity<TaskFields>('Task');

function setupQueries() {
  const bus = createEntityEventBus();
  const events: EntityEvent[] = [];
  bus.on((e) => events.push(e));

  const store = createEntityStore({
    onEntitySaved(entityKey, entity, isNew) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: isNew ? 'created' : 'updated',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: entity.id,
        entity: entity as Readonly<Record<string, unknown>>,
      });
    },
    onEntityDeleted(entityKey, id) {
      const dot = entityKey.indexOf('.');
      bus.emit({
        type: 'deleted',
        entityName: entityKey.substring(0, dot),
        partitionKey: entityKey.substring(dot + 1),
        entityId: id,
        entity: undefined,
      });
    },
  });

  const repo = createRepository({
    entityDef: Task,
    store,
    eventBus: bus,
    keyStrategy: dateKeyStrategy({ period: 'year' }),
    deviceId: 'dev-1',
  });

  return { repo, store, bus, events };
}

describe('Repository with Queries', () => {
  describe('getAll with filters', () => {
    it('returns all entities when no filter given', async () => {
      const { repo } = setupQueries();
      await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });
      await repo.save({ title: 'C', status: 'open', priority: 3 });

      const all = await repo.getAll();
      expect(all).toHaveLength(3);
    });

    it('filters by field matching (where)', async () => {
      const { repo } = setupQueries();
      await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });
      await repo.save({ title: 'C', status: 'open', priority: 3 });

      const open = await repo.getAll({ where: { status: 'open' } });
      expect(open).toHaveLength(2);
      expect(open.every((t) => t.status === 'open')).toBe(true);
    });

    it('filters by id list', async () => {
      const { repo } = setupQueries();
      const id1 = await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });
      const id3 = await repo.save({ title: 'C', status: 'open', priority: 3 });

      const subset = await repo.getAll({ ids: [id1, id3] });
      expect(subset).toHaveLength(2);
      expect(subset.map((t) => t.id)).toContain(id1);
      expect(subset.map((t) => t.id)).toContain(id3);
    });

    it('sorts results by priority ascending', async () => {
      const { repo } = setupQueries();
      await repo.save({ title: 'High', status: 'open', priority: 3 });
      await repo.save({ title: 'Low', status: 'open', priority: 1 });
      await repo.save({ title: 'Mid', status: 'open', priority: 2 });

      const sorted = await repo.getAll({
        orderBy: [{ field: 'priority', direction: 'asc' }],
      });
      expect(sorted.map((t) => t.priority)).toEqual([1, 2, 3]);
    });

    it('combines where + orderBy', async () => {
      const { repo } = setupQueries();
      await repo.save({ title: 'A', status: 'open', priority: 3 });
      await repo.save({ title: 'B', status: 'closed', priority: 1 });
      await repo.save({ title: 'C', status: 'open', priority: 1 });

      const result = await repo.getAll({
        where: { status: 'open' },
        orderBy: [{ field: 'priority', direction: 'asc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0].priority).toBe(1);
      expect(result[1].priority).toBe(3);
    });
  });

  describe('observeAll with queries', () => {
    it('observable returns filtered results', async () => {
      const { repo } = setupQueries();
      await repo.save({ title: 'A', status: 'open', priority: 1 });
      await repo.save({ title: 'B', status: 'closed', priority: 2 });

      const obs$ = repo.observeAll({ where: { status: 'open' } });
      const snapshot = obs$.getValue();
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0].status).toBe('open');
    });

    it('observable returns sorted results', async () => {
      const { repo } = setupQueries();
      await repo.save({ title: 'Z', status: 'open', priority: 3 });
      await repo.save({ title: 'A', status: 'open', priority: 1 });

      const obs$ = repo.observeAll({
        orderBy: [{ field: 'title', direction: 'asc' }],
      });
      const snapshot = obs$.getValue();
      expect(snapshot[0].title).toBe('A');
      expect(snapshot[1].title).toBe('Z');
    });

    it('observable updates when matching entity is added', async () => {
      const { repo } = setupQueries();
      await repo.save({ title: 'A', status: 'open', priority: 1 });

      const obs$ = repo.observeAll({ where: { status: 'open' } });
      expect(obs$.getValue()).toHaveLength(1);

      await repo.save({ title: 'B', status: 'open', priority: 2 });
      expect(obs$.getValue()).toHaveLength(2);
    });
  });
});
