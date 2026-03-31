import { describe, it, expect, vi } from 'vitest';
import { loadAllIndexes, saveAllIndexes, updatePartitionIndexEntry } from '@strata/persistence';
import { MemoryBlobAdapter } from '@strata/adapter';
import { DEFAULT_OPTIONS } from '../helpers';

describe('Partition Index', () => {
  it('loadAllIndexes returns empty object for missing blob', async () => {
    const adapter = new MemoryBlobAdapter();
    const indexes = await loadAllIndexes(adapter, undefined, DEFAULT_OPTIONS);
    expect(indexes).toEqual({});
  });

  it('save and load round-trip', async () => {
    const adapter = new MemoryBlobAdapter();
    const indexes = {
      transaction: {
        '2026-01': { hash: 12345, count: 10, deletedCount: 0, updatedAt: 1711100000 },
        '2026-02': { hash: 67890, count: 20, deletedCount: 0, updatedAt: 1711200000 },
      },
    };
    await saveAllIndexes(adapter, undefined, indexes, DEFAULT_OPTIONS);
    const loaded = await loadAllIndexes(adapter, undefined, DEFAULT_OPTIONS);
    expect(loaded).toEqual(indexes);
  });

  it('stores indexes inside __strata blob', async () => {
    const adapter = new MemoryBlobAdapter();
    const indexes = {
      transaction: { '2026-01': { hash: 1, count: 1, deletedCount: 0, updatedAt: 1 } },
    };
    await saveAllIndexes(adapter, undefined, indexes, DEFAULT_OPTIONS);
    const keys = await adapter.list(undefined, '__strata');
    expect(keys).toContain('__strata');
  });

  describe('updatePartitionIndexEntry', () => {
    it('creates new entry', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1711300000);
      const index = {};
      const result = updatePartitionIndexEntry(index, '2026-03', 999, 5, 2);
      expect(result['2026-03']).toEqual({ hash: 999, count: 5, deletedCount: 2, updatedAt: 1711300000 });
      vi.restoreAllMocks();
    });

    it('updates existing entry', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1711400000);
      const index = {
        '2026-01': { hash: 100, count: 10, deletedCount: 0, updatedAt: 1711100000 },
      };
      const result = updatePartitionIndexEntry(index, '2026-01', 200, 20, 3);
      expect(result['2026-01']).toEqual({ hash: 200, count: 20, deletedCount: 3, updatedAt: 1711400000 });
      vi.restoreAllMocks();
    });

    it('preserves other entries when updating', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1711400000);
      const index = {
        '2026-01': { hash: 100, count: 10, deletedCount: 0, updatedAt: 1711100000 },
        '2026-02': { hash: 200, count: 20, deletedCount: 0, updatedAt: 1711200000 },
      };
      const result = updatePartitionIndexEntry(index, '2026-01', 300, 30, 0);
      expect(result['2026-02']).toEqual(index['2026-02']);
      vi.restoreAllMocks();
    });
  });
});
