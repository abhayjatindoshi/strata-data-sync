import { describe, it, expect } from 'vitest';
import { createEntityStore } from './entity-store';
import type { StoreEntry } from './store-types';

function makeEntry(id: string, extra: Record<string, unknown> = {}): StoreEntry {
  return {
    id,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    version: 1,
    device: 'test',
    ...extra,
  };
}

describe('createEntityStore', () => {
  describe('partition management', () => {
    it('creates and checks a partition', () => {
      const store = createEntityStore();
      store.createPartition('Account.global');
      expect(store.hasPartition('Account.global')).toBe(true);
    });

    it('returns false for non-existent partition', () => {
      const store = createEntityStore();
      expect(store.hasPartition('Account.global')).toBe(false);
    });

    it('getPartition returns the partition map', () => {
      const store = createEntityStore();
      store.createPartition('Account.global');
      const partition = store.getPartition('Account.global');
      expect(partition).toBeDefined();
      expect(partition!.size).toBe(0);
    });

    it('getPartition returns undefined for missing partition', () => {
      const store = createEntityStore();
      expect(store.getPartition('Account.global')).toBeUndefined();
    });

    it('listPartitions returns keys for an entity name', () => {
      const store = createEntityStore();
      store.createPartition('Transaction.2024');
      store.createPartition('Transaction.2025');
      store.createPartition('Account.global');

      const txnKeys = store.listPartitions('Transaction');
      expect(txnKeys).toHaveLength(2);
      expect(txnKeys).toContain('Transaction.2024');
      expect(txnKeys).toContain('Transaction.2025');

      const acctKeys = store.listPartitions('Account');
      expect(acctKeys).toEqual(['Account.global']);
    });

    it('listPartitions returns empty for unknown entity', () => {
      const store = createEntityStore();
      expect(store.listPartitions('Unknown')).toEqual([]);
    });

    it('deletePartition removes the partition', () => {
      const store = createEntityStore();
      store.createPartition('Account.global');
      expect(store.deletePartition('Account.global')).toBe(true);
      expect(store.hasPartition('Account.global')).toBe(false);
      expect(store.listPartitions('Account')).toEqual([]);
    });

    it('deletePartition returns false for non-existent', () => {
      const store = createEntityStore();
      expect(store.deletePartition('Account.global')).toBe(false);
    });

    it('createPartition is idempotent', () => {
      const store = createEntityStore();
      store.createPartition('Account.global');
      store.save('Account.global', makeEntry('Account.global.abc'));
      store.createPartition('Account.global');
      expect(store.get('Account.global', 'Account.global.abc')).toBeDefined();
    });

    it('calls onPartitionCreated callback', () => {
      const created: string[] = [];
      const store = createEntityStore({ onPartitionCreated: (key) => created.push(key) });
      store.createPartition('Account.global');
      expect(created).toEqual(['Account.global']);
    });
  });

  describe('per-partition CRUD', () => {
    it('saves and retrieves an entity', () => {
      const store = createEntityStore();
      const entry = makeEntry('Account.global.abc', { name: 'Checking' });
      store.save('Account.global', entry);
      expect(store.get('Account.global', 'Account.global.abc')).toEqual(entry);
    });

    it('save auto-creates partition', () => {
      const store = createEntityStore();
      const entry = makeEntry('Account.global.abc');
      store.save('Account.global', entry);
      expect(store.hasPartition('Account.global')).toBe(true);
    });

    it('getAll returns all entities in partition', () => {
      const store = createEntityStore();
      const e1 = makeEntry('Account.global.abc', { name: 'Checking' });
      const e2 = makeEntry('Account.global.def', { name: 'Savings' });
      store.save('Account.global', e1);
      store.save('Account.global', e2);

      const all = store.getAll('Account.global');
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(e1);
      expect(all).toContainEqual(e2);
    });

    it('getAll returns empty for non-existent partition', () => {
      const store = createEntityStore();
      expect(store.getAll('Account.global')).toEqual([]);
    });

    it('get returns undefined for missing entity', () => {
      const store = createEntityStore();
      store.createPartition('Account.global');
      expect(store.get('Account.global', 'Account.global.xyz')).toBeUndefined();
    });

    it('delete removes an entity', () => {
      const store = createEntityStore();
      const entry = makeEntry('Account.global.abc');
      store.save('Account.global', entry);
      expect(store.delete('Account.global', 'Account.global.abc')).toBe(true);
      expect(store.get('Account.global', 'Account.global.abc')).toBeUndefined();
    });

    it('delete returns false for missing entity', () => {
      const store = createEntityStore();
      store.createPartition('Account.global');
      expect(store.delete('Account.global', 'Account.global.xyz')).toBe(false);
    });

    it('delete returns false for missing partition', () => {
      const store = createEntityStore();
      expect(store.delete('Account.global', 'Account.global.abc')).toBe(false);
    });

    it('save overwrites existing entity', () => {
      const store = createEntityStore();
      const v1 = makeEntry('Account.global.abc', { name: 'Old' });
      const v2 = makeEntry('Account.global.abc', { name: 'New' });
      store.save('Account.global', v1);
      store.save('Account.global', v2);
      expect(store.get('Account.global', 'Account.global.abc')).toEqual(v2);
    });
  });

  describe('cross-partition lookup', () => {
    it('resolves entity by full composite ID', () => {
      const store = createEntityStore();
      const entry = makeEntry('Transaction.2025.xYz12345', { amount: 100 });
      store.save('Transaction.2025', entry);
      expect(store.getById('Transaction.2025.xYz12345')).toEqual(entry);
    });

    it('returns undefined for missing entity', () => {
      const store = createEntityStore();
      expect(store.getById('Transaction.2025.missing')).toBeUndefined();
    });

    it('resolves across different partitions', () => {
      const store = createEntityStore();
      const e1 = makeEntry('Transaction.2024.aaa', { amount: 50 });
      const e2 = makeEntry('Transaction.2025.bbb', { amount: 75 });
      store.save('Transaction.2024', e1);
      store.save('Transaction.2025', e2);

      expect(store.getById('Transaction.2024.aaa')).toEqual(e1);
      expect(store.getById('Transaction.2025.bbb')).toEqual(e2);
    });
  });
});
