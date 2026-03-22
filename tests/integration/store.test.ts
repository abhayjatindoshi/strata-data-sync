import { describe, it, expect } from 'vitest';
import { createEntityStore, applyQuery } from '@strata/store';
import type { StoreEntry } from '@strata/store';
import { buildEntityKey, buildEntityId, generateId } from '@strata/entity';

function makeEntity(id: string): StoreEntry {
  const now = new Date('2025-06-15T10:00:00Z');
  return { id, createdAt: now, updatedAt: now, version: 1, device: 'test-device' };
}

// ── EntityStore ─────────────────────────────────────────────────────
describe('EntityStore', () => {
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
    expect(all.map((e: StoreEntry) => e.id)).toContain(id1);
    expect(all.map((e: StoreEntry) => e.id)).toContain(id2);
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
    const store = createEntityStore({ onPartitionCreated: (k: string) => created.push(k) });
    const key = buildEntityKey('event', '2025-08');

    store.createPartition(key);
    store.createPartition(key); // duplicate — should not fire again

    expect(created).toEqual([key]);
  });
});

// ── Query Options ───────────────────────────────────────────────────
type Item = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly priority: number;
  readonly done: boolean;
};

const items: ReadonlyArray<Item> = [
  { id: 'i1', name: 'Alpha', category: 'work', priority: 3, done: false },
  { id: 'i2', name: 'Bravo', category: 'home', priority: 1, done: true },
  { id: 'i3', name: 'Charlie', category: 'work', priority: 2, done: false },
  { id: 'i4', name: 'Delta', category: 'home', priority: 4, done: false },
  { id: 'i5', name: 'Echo', category: 'work', priority: 1, done: true },
];

describe('Query Options', () => {
  describe('filter by IDs', () => {
    it('returns only entities matching the given ids', () => {
      const result = applyQuery(items, { ids: ['i2', 'i4'] });
      expect(result).toHaveLength(2);
      expect(result.map((r: Item) => r.id)).toEqual(['i2', 'i4']);
    });

    it('returns empty array when no ids match', () => {
      const result = applyQuery(items, { ids: ['nonexistent'] });
      expect(result).toHaveLength(0);
    });

    it('returns all when ids is empty array', () => {
      const result = applyQuery(items, { ids: [] });
      expect(result).toHaveLength(5);
    });
  });

  describe('field matching (where)', () => {
    it('filters by a single field', () => {
      const result = applyQuery(items, { where: { category: 'work' } });
      expect(result).toHaveLength(3);
      expect(result.every((r: Item) => r.category === 'work')).toBe(true);
    });

    it('filters by boolean field', () => {
      const result = applyQuery(items, { where: { done: true } });
      expect(result).toHaveLength(2);
      expect(result.map((r: Item) => r.id)).toEqual(['i2', 'i5']);
    });

    it('filters by multiple fields (AND logic)', () => {
      const result = applyQuery(items, { where: { category: 'work', done: false } });
      expect(result).toHaveLength(2);
      expect(result.map((r: Item) => r.id)).toEqual(['i1', 'i3']);
    });

    it('returns empty when no entities match where clause', () => {
      const result = applyQuery(items, { where: { category: 'personal' as string } });
      expect(result).toHaveLength(0);
    });
  });

  describe('multi-field sorting', () => {
    it('sorts ascending by a single field', () => {
      const result = applyQuery(items, { orderBy: [{ field: 'priority', direction: 'asc' }] });
      const priorities = result.map((r: Item) => r.priority);
      expect(priorities).toEqual([1, 1, 2, 3, 4]);
    });

    it('sorts descending by a single field', () => {
      const result = applyQuery(items, { orderBy: [{ field: 'priority', direction: 'desc' }] });
      const priorities = result.map((r: Item) => r.priority);
      expect(priorities).toEqual([4, 3, 2, 1, 1]);
    });

    it('sorts by multiple fields', () => {
      const result = applyQuery(items, {
        orderBy: [
          { field: 'category', direction: 'asc' },
          { field: 'priority', direction: 'desc' },
        ],
      });
      expect(result[0].category).toBe('home');
      expect(result[0].priority).toBe(4);
      expect(result[1].category).toBe('home');
      expect(result[1].priority).toBe(1);
      expect(result[2].category).toBe('work');
    });

    it('sorts strings alphabetically', () => {
      const result = applyQuery(items, { orderBy: [{ field: 'name', direction: 'asc' }] });
      expect(result.map((r: Item) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']);
    });
  });

  describe('combined queries', () => {
    it('applies ids + where together', () => {
      const result = applyQuery(items, { ids: ['i1', 'i2', 'i3'], where: { category: 'work' } });
      expect(result).toHaveLength(2);
      expect(result.map((r: Item) => r.id)).toEqual(['i1', 'i3']);
    });

    it('applies where + orderBy together', () => {
      const result = applyQuery(items, {
        where: { category: 'work' },
        orderBy: [{ field: 'priority', direction: 'asc' }],
      });
      expect(result).toHaveLength(3);
      expect(result.map((r: Item) => r.priority)).toEqual([1, 2, 3]);
    });

    it('applies ids + where + orderBy together', () => {
      const result = applyQuery(items, {
        ids: ['i1', 'i3', 'i5'],
        where: { done: false },
        orderBy: [{ field: 'priority', direction: 'desc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('i1');
      expect(result[1].id).toBe('i3');
    });

    it('returns all entities unchanged when no options are provided', () => {
      const result = applyQuery(items);
      expect(result).toEqual(items);
    });
  });
});
