import { describe, it, expect } from 'vitest';
import { createEntityStore } from '@strata/store';
import { createEntityEventBus } from '@strata/reactive';
import { defineEntity } from '@strata/schema';
import { dateKeyStrategy } from '@strata/key-strategy';
import { createRepository } from './repository';
import { createMemoryBlobAdapter, storePartition } from '@strata/persistence';
import type { EntityEvent } from '@strata/reactive';

const Account = defineEntity<{ name: string; balance: number }>('Account');

function makeKeyStrategy() {
  return dateKeyStrategy({ period: 'year' });
}

function makeEventBusWithCallbacks() {
  const bus = createEntityEventBus();
  const events: EntityEvent[] = [];
  bus.on((e) => events.push(e));
  return { bus, events };
}

function setup() {
  const { bus, events } = makeEventBusWithCallbacks();
  const store = createEntityStore({
    onEntitySaved(entityKey, entity, isNew) {
      const dotIndex = entityKey.indexOf('.');
      bus.emit({
        type: isNew ? 'created' : 'updated',
        entityName: entityKey.substring(0, dotIndex),
        partitionKey: entityKey.substring(dotIndex + 1),
        entityId: entity.id,
        entity: entity as Readonly<Record<string, unknown>>,
      });
    },
    onEntityDeleted(entityKey, id) {
      const dotIndex = entityKey.indexOf('.');
      bus.emit({
        type: 'deleted',
        entityName: entityKey.substring(0, dotIndex),
        partitionKey: entityKey.substring(dotIndex + 1),
        entityId: id,
        entity: undefined,
      });
    },
  });

  const repo = createRepository({
    entityDef: Account,
    store,
    eventBus: bus,
    keyStrategy: makeKeyStrategy(),
    deviceId: 'device-1',
  });

  return { repo, store, bus, events };
}

describe('createRepository', () => {
  describe('save', () => {
    it('saves a new entity and returns its ID', async () => {
      const { repo } = setup();
      const id = await repo.save({ name: 'Checking', balance: 100 });

      expect(id).toBeDefined();
      expect(id).toContain('Account.');
    });

    it('assigns base entity fields on create', async () => {
      const { repo } = setup();
      const id = await repo.save({ name: 'Savings', balance: 500 });
      const entity = await repo.get(id);

      expect(entity).toBeDefined();
      expect(entity!.id).toBe(id);
      expect(entity!.version).toBe(1);
      expect(entity!.device).toBe('device-1');
      expect(entity!.createdAt).toBeInstanceOf(Date);
      expect(entity!.updatedAt).toBeInstanceOf(Date);
    });

    it('increments version on update', async () => {
      const { repo } = setup();
      const id = await repo.save({ name: 'Checking', balance: 100 });
      await repo.save({ id, name: 'Checking', balance: 200 } as never);
      const entity = await repo.get(id);

      expect(entity!.version).toBe(2);
    });

    it('emits created event on new entity', async () => {
      const { repo, events } = setup();
      await repo.save({ name: 'Test', balance: 0 });

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('created');
    });

    it('emits updated event on existing entity', async () => {
      const { repo, events } = setup();
      const id = await repo.save({ name: 'Test', balance: 0 });
      await repo.save({ id, name: 'Test', balance: 10 } as never);

      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe('updated');
    });
  });

  describe('get', () => {
    it('returns saved entity by ID', async () => {
      const { repo } = setup();
      const id = await repo.save({ name: 'Found', balance: 42 });
      const entity = await repo.get(id);

      expect(entity).toBeDefined();
      expect(entity!.name).toBe('Found');
      expect(entity!.balance).toBe(42);
    });

    it('returns undefined for non-existent ID', async () => {
      const { repo } = setup();
      const entity = await repo.get('Account.2026.nonexistent');
      expect(entity).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all entities', async () => {
      const { repo } = setup();
      await repo.save({ name: 'A', balance: 1 });
      await repo.save({ name: 'B', balance: 2 });
      const all = await repo.getAll();

      expect(all).toHaveLength(2);
    });

    it('returns empty array when no entities', async () => {
      const { repo } = setup();
      const all = await repo.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete', () => {
    it('removes entity from store', async () => {
      const { repo } = setup();
      const id = await repo.save({ name: 'ToDelete', balance: 0 });
      const deleted = await repo.delete(id);

      expect(deleted).toBe(true);
      const entity = await repo.get(id);
      expect(entity).toBeUndefined();
    });

    it('returns false for non-existent entity', async () => {
      const { repo } = setup();
      const deleted = await repo.delete('Account.2026.nonexistent');
      expect(deleted).toBe(false);
    });

    it('emits deleted event', async () => {
      const { repo, events } = setup();
      const id = await repo.save({ name: 'Del', balance: 0 });
      events.length = 0;
      await repo.delete(id);

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('deleted');
    });
  });

  describe('observe', () => {
    it('returns observable for a single entity', async () => {
      const { repo } = setup();
      const id = await repo.save({ name: 'Watched', balance: 10 });
      const obs = repo.observe(id);

      expect(obs.getValue()).toBeDefined();
      expect(obs.getValue()!.name).toBe('Watched');
    });

    it('updates when entity changes', async () => {
      const { repo } = setup();
      const id = await repo.save({ name: 'Before', balance: 1 });
      const obs = repo.observe(id);

      await repo.save({ id, name: 'After', balance: 2 } as never);
      expect(obs.getValue()!.name).toBe('After');
    });
  });

  describe('observeAll', () => {
    it('returns observable for entity collection', async () => {
      const { repo } = setup();
      await repo.save({ name: 'X', balance: 1 });
      const obs = repo.observeAll();

      expect(obs.getValue()).toHaveLength(1);
    });

    it('updates when collection changes', async () => {
      const { repo } = setup();
      const obs = repo.observeAll();
      expect(obs.getValue()).toHaveLength(0);

      await repo.save({ name: 'Y', balance: 2 });
      expect(obs.getValue()).toHaveLength(1);
    });
  });

  describe('lazy loading', () => {
    it('loads partition from local adapter on store miss', async () => {
      const localAdapter = createMemoryBlobAdapter();
      const entities = [
        { id: 'Account.2025.lazy1', name: 'Lazy', balance: 99,
          createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
          version: 1, device: 'other' },
      ];
      await storePartition(localAdapter, Account, '2025', entities);

      const { bus } = makeEventBusWithCallbacks();
      const store = createEntityStore();
      const repo = createRepository({
        entityDef: Account,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'device-1',
        localAdapter,
      });

      const entity = await repo.get('Account.2025.lazy1');
      expect(entity).toBeDefined();
      expect(entity!.name).toBe('Lazy');
      expect(entity!.balance).toBe(99);
    });

    it('falls back to cloud adapter when local misses', async () => {
      const cloudAdapter = createMemoryBlobAdapter();
      const entities = [
        { id: 'Account.2025.cloud1', name: 'Cloud', balance: 77,
          createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
          version: 1, device: 'remote' },
      ];
      await storePartition(cloudAdapter, Account, '2025', entities);

      const localAdapter = createMemoryBlobAdapter(); // empty
      const { bus } = makeEventBusWithCallbacks();
      const store = createEntityStore();
      const repo = createRepository({
        entityDef: Account,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'device-1',
        localAdapter,
        cloudAdapter,
      });

      const entity = await repo.get('Account.2025.cloud1');
      expect(entity).toBeDefined();
      expect(entity!.name).toBe('Cloud');
    });

    it('returns undefined when entity not in any tier', async () => {
      const localAdapter = createMemoryBlobAdapter();
      const { bus } = makeEventBusWithCallbacks();
      const store = createEntityStore();
      const repo = createRepository({
        entityDef: Account,
        store,
        eventBus: bus,
        keyStrategy: makeKeyStrategy(),
        deviceId: 'device-1',
        localAdapter,
      });

      const entity = await repo.get('Account.2025.missing');
      expect(entity).toBeUndefined();
    });
  });
});
