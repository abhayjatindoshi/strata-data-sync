import { describe, it, expect, vi } from 'vitest';
import { Store } from '@strata/store';
import { EventBus } from '@strata/reactive';
import { defineEntity, partitioned } from '@strata/schema';
import { Repository } from '@strata/repo';
import type { Hlc } from '@strata/hlc';

type Item = { name: string; category: string; price: number };

function makeHlcRef(): { current: Hlc } {
  return { current: { timestamp: 0, counter: 0, nodeId: 'test-device' } };
}

const ItemDef = defineEntity<Item>('item');

const PartitionedDef = defineEntity<Item>('product', {
  keyStrategy: partitioned<Item>(e => e.category),
});

const DerivedDef = defineEntity<{ provider: string; token: string }>('auth', {
  deriveId: e => `${e.provider}`,
});

describe('Repository', () => {
  describe('get', () => {
    it('returns undefined for missing entity', () => {
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      expect(repo.get('item._.nonexistent')).toBeUndefined();
    });

    it('returns saved entity by ID', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ name: 'Widget', category: 'tools', price: 10 });
      const entity = repo.get(id);
      expect(entity).toBeDefined();
      expect(entity!.name).toBe('Widget');
      expect(entity!.price).toBe(10);
      vi.restoreAllMocks();
    });
  });

  describe('save', () => {
    it('generates an ID and returns it', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ name: 'A', category: 'c', price: 1 });
      expect(id).toMatch(/^item\._\..{8}$/);
      vi.restoreAllMocks();
    });

    it('stamps BaseEntity fields', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ name: 'A', category: 'c', price: 1 });
      const entity = repo.get(id)!;
      expect(entity.version).toBe(1);
      expect(entity.device).toBe('test-device');
      expect(entity.hlc).toBeDefined();
      expect(entity.createdAt).toBeInstanceOf(Date);
      expect(entity.updatedAt).toBeInstanceOf(Date);
      vi.restoreAllMocks();
    });

    it('increments version on update', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ name: 'A', category: 'c', price: 1 });
      repo.save({ id, name: 'A Updated', category: 'c', price: 2 });
      const entity = repo.get(id)!;
      expect(entity.version).toBe(2);
      expect(entity.name).toBe('A Updated');
      vi.restoreAllMocks();
    });

    it('preserves createdAt on update', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ name: 'A', category: 'c', price: 1 });
      const original = repo.get(id)!;
      repo.save({ id, name: 'B', category: 'c', price: 2 });
      const updated = repo.get(id)!;
      expect(updated.createdAt).toEqual(original.createdAt);
      vi.restoreAllMocks();
    });

    it('uses partitioned key strategy for partition key', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(PartitionedDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ name: 'Wrench', category: 'tools', price: 15 });
      expect(id).toMatch(/^product\.tools\..{8}$/);
      vi.restoreAllMocks();
    });

    it('uses deriveId for deterministic IDs', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(DerivedDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ provider: 'google', token: 'abc' });
      expect(id).toBe('auth._.google');
      vi.restoreAllMocks();
    });

    it('emits event on save', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const bus = new EventBus();
      const listener = vi.fn();
      bus.on(listener);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
      repo.save({ name: 'A', category: 'c', price: 1 });
      expect(listener).toHaveBeenCalledWith({ entityName: 'item' });
      vi.restoreAllMocks();
    });
  });

  describe('saveMany', () => {
    it('returns array of IDs', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const ids = repo.saveMany([
        { name: 'A', category: 'c', price: 1 },
        { name: 'B', category: 'c', price: 2 },
      ]);
      expect(ids).toHaveLength(2);
      expect(repo.get(ids[0])).toBeDefined();
      expect(repo.get(ids[1])).toBeDefined();
      vi.restoreAllMocks();
    });
  });

  describe('delete', () => {
    it('removes entity and returns true', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const id = repo.save({ name: 'A', category: 'c', price: 1 });
      expect(repo.delete(id)).toBe(true);
      expect(repo.get(id)).toBeUndefined();
      vi.restoreAllMocks();
    });

    it('returns false for missing entity', () => {
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      expect(repo.delete('item._.missing')).toBe(false);
    });

    it('emits event on successful delete', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const bus = new EventBus();
      const listener = vi.fn();
      bus.on(listener);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
      const id = repo.save({ name: 'A', category: 'c', price: 1 });
      listener.mockClear();
      repo.delete(id);
      expect(listener).toHaveBeenCalledWith({ entityName: 'item' });
      vi.restoreAllMocks();
    });
  });

  describe('deleteMany', () => {
    it('removes multiple entities', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      const id1 = repo.save({ name: 'A', category: 'c', price: 1 });
      const id2 = repo.save({ name: 'B', category: 'c', price: 2 });
      repo.deleteMany([id1, id2]);
      expect(repo.get(id1)).toBeUndefined();
      expect(repo.get(id2)).toBeUndefined();
      vi.restoreAllMocks();
    });
  });

  describe('query', () => {
    it('returns all entities when no options', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'A', category: 'c', price: 1 });
      repo.save({ name: 'B', category: 'c', price: 2 });
      const results = repo.query();
      expect(results).toHaveLength(2);
      vi.restoreAllMocks();
    });

    it('filters by where clause', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'A', category: 'tools', price: 1 });
      repo.save({ name: 'B', category: 'toys', price: 2 });
      const results = repo.query({ where: { category: 'tools' } });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('A');
      vi.restoreAllMocks();
    });

    it('filters by range', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'Cheap', category: 'c', price: 5 });
      repo.save({ name: 'Mid', category: 'c', price: 50 });
      repo.save({ name: 'Expensive', category: 'c', price: 200 });
      const results = repo.query({ range: { field: 'price', gte: 10, lt: 100 } });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Mid');
      vi.restoreAllMocks();
    });

    it('sorts by orderBy', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'B', category: 'c', price: 20 });
      repo.save({ name: 'A', category: 'c', price: 10 });
      repo.save({ name: 'C', category: 'c', price: 30 });
      const results = repo.query({ orderBy: [{ field: 'price', direction: 'asc' }] });
      expect(results.map(r => r.name)).toEqual(['A', 'B', 'C']);
      vi.restoreAllMocks();
    });

    it('sorts descending', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'A', category: 'c', price: 10 });
      repo.save({ name: 'B', category: 'c', price: 20 });
      const results = repo.query({ orderBy: [{ field: 'price', direction: 'desc' }] });
      expect(results[0].name).toBe('B');
      vi.restoreAllMocks();
    });

    it('paginates with offset and limit', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'A', category: 'c', price: 10 });
      repo.save({ name: 'B', category: 'c', price: 20 });
      repo.save({ name: 'C', category: 'c', price: 30 });
      const results = repo.query({
        orderBy: [{ field: 'price', direction: 'asc' }],
        offset: 1,
        limit: 1,
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('B');
      vi.restoreAllMocks();
    });

    it('collects entities across partitions', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(PartitionedDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'Wrench', category: 'tools', price: 15 });
      repo.save({ name: 'Doll', category: 'toys', price: 10 });
      const results = repo.query();
      expect(results).toHaveLength(2);
      vi.restoreAllMocks();
    });

    it('applies full pipeline: where → range → orderBy → pagination', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const store = new Store();
      const repo = new Repository(ItemDef, store, makeHlcRef(), new EventBus());
      repo.save({ name: 'A', category: 'tools', price: 5 });
      repo.save({ name: 'B', category: 'tools', price: 15 });
      repo.save({ name: 'C', category: 'tools', price: 25 });
      repo.save({ name: 'D', category: 'toys', price: 20 });
      const results = repo.query({
        where: { category: 'tools' },
        range: { field: 'price', gte: 10 },
        orderBy: [{ field: 'price', direction: 'desc' }],
        limit: 1,
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('C');
      vi.restoreAllMocks();
    });
  });
});
