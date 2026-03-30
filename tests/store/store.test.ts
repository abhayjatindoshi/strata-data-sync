import { describe, it, expect, vi } from 'vitest';
import { Store } from '@strata/store';

describe('EntityStore', () => {
  describe('CRUD operations', () => {
    it('get returns undefined for missing entity', () => {
      const store = new Store();
      expect(store.getEntity('transaction._', 'id1')).toBeUndefined();
    });

    it('set and get round-trip', () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', { id: 'id1', amount: 100 });
      expect(store.getEntity('transaction._', 'id1')).toEqual({ id: 'id1', amount: 100 });
    });

    it('set auto-creates partition if missing', () => {
      const store = new Store();
      store.setEntity('transaction.2026-03', 'id1', { id: 'id1' });
      expect(store.getPartition('transaction.2026-03').size).toBe(1);
    });

    it('delete removes entity and returns true', () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', { id: 'id1' });
      expect(store.deleteEntity('transaction._', 'id1')).toBe(true);
      expect(store.getEntity('transaction._', 'id1')).toBeUndefined();
    });

    it('delete returns false for missing entity', () => {
      const store = new Store();
      expect(store.deleteEntity('transaction._', 'id1')).toBe(false);
    });
  });

  describe('partition access', () => {
    it('getPartition returns empty map for missing partition', () => {
      const store = new Store();
      const partition = store.getPartition('transaction._');
      expect(partition.size).toBe(0);
    });

    it('getPartition returns partition data', () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', { id: 'id1' });
      store.setEntity('transaction._', 'id2', { id: 'id2' });
      const partition = store.getPartition('transaction._');
      expect(partition.size).toBe(2);
    });

    it('getAllPartitionKeys filters by entityName prefix', () => {
      const store = new Store();
      store.setEntity('transaction.2026-01', 'id1', {});
      store.setEntity('transaction.2026-02', 'id2', {});
      store.setEntity('account._', 'id3', {});
      const keys = store.getAllPartitionKeys('transaction');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('transaction.2026-01');
      expect(keys).toContain('transaction.2026-02');
    });

    it('getAllPartitionKeys returns empty for no matches', () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', {});
      expect(store.getAllPartitionKeys('account')).toEqual([]);
    });
  });

  describe('dirty tracking', () => {
    it('set marks partition dirty', () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', {});
      expect(store.getDirtyKeys().has('transaction._')).toBe(true);
    });

    it('delete marks partition dirty', () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', {});
      store.clearDirty('transaction._');
      store.deleteEntity('transaction._', 'id1');
      expect(store.getDirtyKeys().has('transaction._')).toBe(true);
    });

    it('clearDirty resets dirty state', () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', {});
      store.clearDirty('transaction._');
      expect(store.getDirtyKeys().has('transaction._')).toBe(false);
    });

    it('getDirtyKeys returns all dirty partitions', () => {
      const store = new Store();
      store.setEntity('transaction.2026-01', 'id1', {});
      store.setEntity('account._', 'id2', {});
      expect(store.getDirtyKeys().size).toBe(2);
    });
  });

  describe('lazy loading', () => {
    it('loadPartition invokes loader on first call', async () => {
      const store = new Store();
      const loader = vi.fn().mockResolvedValue(new Map([['id1', { id: 'id1' }]]));
      const partition = await store.loadPartition('transaction._', loader);
      expect(loader).toHaveBeenCalledOnce();
      expect(partition.get('id1')).toEqual({ id: 'id1' });
    });

    it('loadPartition returns cached data on subsequent calls', async () => {
      const store = new Store();
      const loader = vi.fn().mockResolvedValue(new Map([['id1', { id: 'id1' }]]));
      await store.loadPartition('transaction._', loader);
      await store.loadPartition('transaction._', loader);
      expect(loader).toHaveBeenCalledOnce();
    });

    it('loadPartition skips loader if partition already exists from set', async () => {
      const store = new Store();
      store.setEntity('transaction._', 'id1', { id: 'id1' });
      const loader = vi.fn().mockResolvedValue(new Map());
      await store.loadPartition('transaction._', loader);
      expect(loader).not.toHaveBeenCalled();
    });
  });

  describe('BlobAdapter interface', () => {
    it('read returns null for key without dot separator', async () => {
      const store = new Store();
      const result = await store.read(undefined, 'nodot');
      expect(result).toBeNull();
    });

    it('read returns partition blob for populated partition', async () => {
      const store = new Store();
      store.setEntity('task._', 'id1', { id: 'id1', title: 'Test' });
      const blob = await store.read(undefined, 'task._');
      expect(blob).not.toBeNull();
      expect((blob as Record<string, unknown>)['task']).toBeDefined();
    });

    it('read returns null for empty partition with no tombstones', async () => {
      const store = new Store();
      const blob = await store.read(undefined, 'task._');
      expect(blob).toBeNull();
    });

    it('read includes tombstones in blob', async () => {
      const store = new Store();
      const hlc = { timestamp: 1000, counter: 0, nodeId: 'n1' };
      store.setTombstone('task._', 'id1', hlc);
      const blob = await store.read(undefined, 'task._');
      expect(blob).not.toBeNull();
      const deleted = (blob as Record<string, unknown>)['deleted'] as Record<string, unknown>;
      expect(deleted['task']).toBeDefined();
    });

    it('write stores partition blob data', async () => {
      const store = new Store();
      const blob = {
        task: { id1: { id: 'id1', title: 'Written' } },
        deleted: { task: {} },
      };
      await store.write(undefined, 'task._', blob);
      expect(store.getEntity('task._', 'id1')).toEqual({ id: 'id1', title: 'Written' });
    });

    it('write ignores key without dot separator', async () => {
      const store = new Store();
      await store.write(undefined, 'nodot', { task: {} });
      // No error, no side effects
      expect(store.getPartition('nodot').size).toBe(0);
    });

    it('write stores marker blob with __strata key', async () => {
      const store = new Store();
      const markerBlob = { __system: { marker: { version: 1 } }, deleted: {} };
      await store.write(undefined, '__strata', markerBlob);
      const read = await store.read(undefined, '__strata');
      expect(read).toBeDefined();
    });

    it('write stores tombstone data from blob', async () => {
      const store = new Store();
      const hlc = { timestamp: 2000, counter: 1, nodeId: 'n2' };
      const blob = {
        task: {},
        deleted: { task: { id1: hlc } },
      };
      await store.write(undefined, 'task._', blob);
      const tombstones = store.getTombstones('task._');
      expect(tombstones.get('id1')).toEqual(hlc);
    });

    it('delete returns true when partition existed', async () => {
      const store = new Store();
      store.setEntity('task._', 'id1', { id: 'id1' });
      const result = await store.delete(undefined, 'task._');
      expect(result).toBe(true);
    });

    it('delete returns false when partition did not exist', async () => {
      const store = new Store();
      const result = await store.delete(undefined, 'task._');
      expect(result).toBe(false);
    });

    it('delete removes partition and tombstones', async () => {
      const store = new Store();
      store.setEntity('task._', 'id1', { id: 'id1' });
      store.setTombstone('task._', 'id2', { timestamp: 100, counter: 0, nodeId: 'n1' });
      await store.delete(undefined, 'task._');
      expect(store.getPartition('task._').size).toBe(0);
      expect(store.getTombstones('task._').size).toBe(0);
    });

    it('delete returns true when only tombstones existed', async () => {
      const store = new Store();
      store.setTombstone('task._', 'id1', { timestamp: 100, counter: 0, nodeId: 'n1' });
      const result = await store.delete(undefined, 'task._');
      expect(result).toBe(true);
    });

    it('list returns keys matching prefix', async () => {
      const store = new Store();
      store.setEntity('task._', 'id1', {});
      store.setEntity('task.2026-01', 'id2', {});
      store.setEntity('note._', 'id3', {});
      const keys = await store.list(undefined, 'task');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('task._');
      expect(keys).toContain('task.2026-01');
    });

    it('list returns empty for no matches', async () => {
      const store = new Store();
      const keys = await store.list(undefined, 'missing');
      expect(keys).toEqual([]);
    });
  });
});
