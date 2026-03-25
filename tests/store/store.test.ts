import { describe, it, expect, vi } from 'vitest';
import { createStore } from '@strata/store';

describe('EntityStore', () => {
  describe('CRUD operations', () => {
    it('get returns undefined for missing entity', () => {
      const store = createStore();
      expect(store.getEntity('transaction._', 'id1')).toBeUndefined();
    });

    it('set and get round-trip', () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', { id: 'id1', amount: 100 });
      expect(store.getEntity('transaction._', 'id1')).toEqual({ id: 'id1', amount: 100 });
    });

    it('set auto-creates partition if missing', () => {
      const store = createStore();
      store.setEntity('transaction.2026-03', 'id1', { id: 'id1' });
      expect(store.getPartition('transaction.2026-03').size).toBe(1);
    });

    it('delete removes entity and returns true', () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', { id: 'id1' });
      expect(store.deleteEntity('transaction._', 'id1')).toBe(true);
      expect(store.getEntity('transaction._', 'id1')).toBeUndefined();
    });

    it('delete returns false for missing entity', () => {
      const store = createStore();
      expect(store.deleteEntity('transaction._', 'id1')).toBe(false);
    });
  });

  describe('partition access', () => {
    it('getPartition returns empty map for missing partition', () => {
      const store = createStore();
      const partition = store.getPartition('transaction._');
      expect(partition.size).toBe(0);
    });

    it('getPartition returns partition data', () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', { id: 'id1' });
      store.setEntity('transaction._', 'id2', { id: 'id2' });
      const partition = store.getPartition('transaction._');
      expect(partition.size).toBe(2);
    });

    it('getAllPartitionKeys filters by entityName prefix', () => {
      const store = createStore();
      store.setEntity('transaction.2026-01', 'id1', {});
      store.setEntity('transaction.2026-02', 'id2', {});
      store.setEntity('account._', 'id3', {});
      const keys = store.getAllPartitionKeys('transaction');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('transaction.2026-01');
      expect(keys).toContain('transaction.2026-02');
    });

    it('getAllPartitionKeys returns empty for no matches', () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', {});
      expect(store.getAllPartitionKeys('account')).toEqual([]);
    });
  });

  describe('dirty tracking', () => {
    it('set marks partition dirty', () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', {});
      expect(store.getDirtyKeys().has('transaction._')).toBe(true);
    });

    it('delete marks partition dirty', () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', {});
      store.clearDirty('transaction._');
      store.deleteEntity('transaction._', 'id1');
      expect(store.getDirtyKeys().has('transaction._')).toBe(true);
    });

    it('clearDirty resets dirty state', () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', {});
      store.clearDirty('transaction._');
      expect(store.getDirtyKeys().has('transaction._')).toBe(false);
    });

    it('getDirtyKeys returns all dirty partitions', () => {
      const store = createStore();
      store.setEntity('transaction.2026-01', 'id1', {});
      store.setEntity('account._', 'id2', {});
      expect(store.getDirtyKeys().size).toBe(2);
    });
  });

  describe('lazy loading', () => {
    it('loadPartition invokes loader on first call', async () => {
      const store = createStore();
      const loader = vi.fn().mockResolvedValue(new Map([['id1', { id: 'id1' }]]));
      const partition = await store.loadPartition('transaction._', loader);
      expect(loader).toHaveBeenCalledOnce();
      expect(partition.get('id1')).toEqual({ id: 'id1' });
    });

    it('loadPartition returns cached data on subsequent calls', async () => {
      const store = createStore();
      const loader = vi.fn().mockResolvedValue(new Map([['id1', { id: 'id1' }]]));
      await store.loadPartition('transaction._', loader);
      await store.loadPartition('transaction._', loader);
      expect(loader).toHaveBeenCalledOnce();
    });

    it('loadPartition skips loader if partition already exists from set', async () => {
      const store = createStore();
      store.setEntity('transaction._', 'id1', { id: 'id1' });
      const loader = vi.fn().mockResolvedValue(new Map());
      await store.loadPartition('transaction._', loader);
      expect(loader).not.toHaveBeenCalled();
    });
  });
});
