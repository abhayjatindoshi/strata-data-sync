import { describe, it, expect } from 'vitest';
import {
  createEntityStore,
  buildEntityKey,
  buildEntityId,
  generateId,
} from '../../../src/index.js';
import type { StoreEntry } from '../../../src/index.js';

function makeEntity(id: string): StoreEntry {
  const now = new Date('2025-06-15T10:00:00Z');
  return { id, createdAt: now, updatedAt: now, version: 1, device: 'test-device' };
}

describe('Sprint 002 Integration: EntityStore', () => {
  it('creates a store, adds entities, retrieves by ID, and deletes', () => {
    const store = createEntityStore();
    const entityKey = buildEntityKey('order', '2025-06');
    const id = buildEntityId('order', '2025-06', generateId());
    const entity = makeEntity(id);

    store.save(entityKey, entity);

    const retrieved = store.get(entityKey, id);
    expect(retrieved).toEqual(entity);

    const deleted = store.delete(entityKey, id);
    expect(deleted).toBe(true);

    expect(store.get(entityKey, id)).toBeUndefined();
  });

  it('lists partitions for an entity type', () => {
    const store = createEntityStore();
    const key1 = buildEntityKey('order', '2025-06');
    const key2 = buildEntityKey('order', '2025-07');
    const key3 = buildEntityKey('invoice', '2025-06');

    store.createPartition(key1);
    store.createPartition(key2);
    store.createPartition(key3);

    const orderPartitions = store.listPartitions('order');
    expect(orderPartitions).toHaveLength(2);
    expect(orderPartitions).toContain(key1);
    expect(orderPartitions).toContain(key2);

    const invoicePartitions = store.listPartitions('invoice');
    expect(invoicePartitions).toHaveLength(1);
    expect(invoicePartitions).toContain(key3);
  });

  it('retrieves entities across partitions with getAll', () => {
    const store = createEntityStore();
    const entityKey = buildEntityKey('task', '2025-03');
    const id1 = buildEntityId('task', '2025-03', 'aaa');
    const id2 = buildEntityId('task', '2025-03', 'bbb');

    store.save(entityKey, makeEntity(id1));
    store.save(entityKey, makeEntity(id2));

    const all = store.getAll(entityKey);
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.id)).toContain(id1);
    expect(all.map((e) => e.id)).toContain(id2);
  });

  it('looks up an entity by full composite ID via getById', () => {
    const store = createEntityStore();
    const entityKey = buildEntityKey('note', '2025-01');
    const id = buildEntityId('note', '2025-01', 'xyz123ab');
    const entity = makeEntity(id);

    store.save(entityKey, entity);

    const found = store.getById(id);
    expect(found).toEqual(entity);
  });

  it('returns undefined for getById when entity does not exist', () => {
    const store = createEntityStore();
    const missing = store.getById(buildEntityId('note', '2025-01', 'missing1'));
    expect(missing).toBeUndefined();
  });

  it('deleting a partition removes it from listings', () => {
    const store = createEntityStore();
    const key = buildEntityKey('log', '2025-12');
    store.createPartition(key);
    expect(store.hasPartition(key)).toBe(true);

    store.deletePartition(key);
    expect(store.hasPartition(key)).toBe(false);
    expect(store.listPartitions('log')).toHaveLength(0);
  });

  it('invokes onPartitionCreated callback', () => {
    const created: string[] = [];
    const store = createEntityStore({ onPartitionCreated: (k) => created.push(k) });
    const key = buildEntityKey('event', '2025-08');

    store.createPartition(key);
    store.createPartition(key); // duplicate — should not fire again

    expect(created).toEqual([key]);
  });
});
