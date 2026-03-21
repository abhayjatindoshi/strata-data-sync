import { describe, it, expect } from 'vitest';
import { createEntityStore } from '../../../src/store/index.js';
import { createEntityEventBus, type EntityEvent } from '../../../src/reactive/index.js';
import { defineEntity } from '../../../src/schema/index.js';
import { dateKeyStrategy } from '../../../src/key-strategy/index.js';
import {
  createMemoryBlobAdapter,
  storePartition,
} from '../../../src/persistence/index.js';
import { createRepository } from '../../../src/repository/repository.js';

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

describe('Integration: Lazy Loading (store → local → cloud)', () => {
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

    // Pre-populate store directly
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

    // Store entity in local adapter blob
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
    const localAdapter = createMemoryBlobAdapter(); // empty
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

    // First get loads from local
    const first = await repo.get('Item.2025.cache1');
    expect(first).toBeDefined();

    // Delete from adapter to prove we don't re-read
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
